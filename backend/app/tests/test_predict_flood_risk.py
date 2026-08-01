import os
import unittest
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.jobs import predict_flood_risk
from app.routers import info_flood


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


def _hotspot_row(hotspot_id: int, district_code: str, lat: float, lng: float) -> dict:
    return {
        "hotspot_id": hotspot_id,
        "district_code": district_code,
        "street_name": "Test St",
        "lat": lat,
        "lng": lng,
        "avg_depth_level": "knee",
    }


class FloodRiskProviderFailureTest(unittest.IsolatedAsyncioTestCase):
    """F-11: 외부 제공자(OpenWeather) 장애를 0.0(안전)으로 삼키지 않고,
    실패 구역의 기존 snapshot 을 보존해야 한다."""

    async def test_provider_failure_is_not_recorded_as_zero_risk(self):
        # districts: Q1(성공, pop=0.8=위험) / Q7(실패 — non-200/exception)
        hotspots = [
            _hotspot_row(1, "Q1", 10.75, 106.70),
            _hotspot_row(2, "Q7", 10.80, 106.75),
        ]
        hotspots_result = MagicMock()
        hotspots_result.mappings.return_value.all.return_value = hotspots

        session = MagicMock()
        session.execute = AsyncMock(return_value=hotspots_result)
        session.commit = AsyncMock()

        with (
            patch.object(predict_flood_risk, "_max_pop_24h", AsyncMock(side_effect=[0.8, None])),
            patch.object(predict_flood_risk, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.dict(os.environ, {"OPENWEATHER_API_KEY": "test-key"}),
        ):
            result = await predict_flood_risk.run_flood_risk_prediction()

        # 실패 구역이 있었다는 사실이 잡 결과에 명시돼야 한다 (fail-open 아님).
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["failed_districts"], 1)

        sqls = [str(call.args[0]) for call in session.execute.await_args_list]

        # 1) 무조건적 전체 DELETE(FROM flood_risk_daily, WHERE 없음)가 더 이상 없어야 한다.
        self.assertFalse(
            any("delete from flood_risk_daily" in sql.lower() and "where" not in sql.lower() for sql in sqls)
        )
        # 2) 성공 구역(Q1)만 교체 대상이어야 한다.
        delete_sqls = [sql for sql in sqls if "DELETE FROM flood_risk_daily" in sql]
        self.assertTrue(delete_sqls)
        self.assertIn("WHERE district_code IN", delete_sqls[0])

        # 3) 실패 구역(Q7)은 삭제·재삽입 대상이 아니라 is_stale 표시로 보존돼야 한다.
        update_sqls = [sql for sql in sqls if "UPDATE flood_risk_daily" in sql]
        self.assertTrue(update_sqls)
        self.assertIn("is_stale = TRUE", update_sqls[0])

        # 4) 실패 구역 hotspot(Q7) 은 rain_prob=0(=0.0 pop) 으로 INSERT 되지 않아야 한다 —
        #    이게 바로 "실패 → 안전(0.0)으로 기록" fail-open 버그의 재현 포인트.
        insert_sqls = [
            (sql, call.args[1])
            for sql, call in zip(sqls, session.execute.await_args_list, strict=True)
            if "INSERT INTO flood_risk_daily" in sql
        ]
        inserted_districts = {params["dc"] for _, params in insert_sqls}
        self.assertNotIn("Q7", inserted_districts)
        self.assertIn("Q1", inserted_districts)

    async def test_all_districts_succeed_is_ok_status(self):
        hotspots = [_hotspot_row(1, "Q1", 10.75, 106.70)]
        hotspots_result = MagicMock()
        hotspots_result.mappings.return_value.all.return_value = hotspots

        session = MagicMock()
        session.execute = AsyncMock(return_value=hotspots_result)
        session.commit = AsyncMock()

        with (
            patch.object(predict_flood_risk, "_max_pop_24h", AsyncMock(return_value=0.9)),
            patch.object(predict_flood_risk, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.dict(os.environ, {"OPENWEATHER_API_KEY": "test-key"}),
        ):
            result = await predict_flood_risk.run_flood_risk_prediction()

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["failed_districts"], 0)


class FloodMapDataStaleFieldTest(unittest.IsolatedAsyncioTestCase):
    """소비 측(get_map_data) 이 보존된 stale snapshot 을 구분해 내려줘야 한다."""

    async def test_stale_risk_row_surfaces_is_stale_flag(self):
        stale_row = MagicMock()
        stale_row._mapping = {
            "risk_id": 1,
            "hotspot_id": 2,
            "district_code": "Q7",
            "street_name": "Test St",
            "lat": 10.80,
            "lng": 106.75,
            "rain_prob": 80,
            "risk_level": "HIGH",
            "depth_hint": "knee",
            "predicted_date": date.today() - timedelta(days=2),
            "is_stale": True,
        }

        db = MagicMock()
        db.execute = AsyncMock(side_effect=[[], [], [stale_row]])

        result = await info_flood.get_map_data(10.776, 106.7, 5.0, __import__("uuid").uuid4(), db)

        self.assertEqual(len(result["risks"]), 1)
        self.assertTrue(result["risks"][0]["is_stale"])
