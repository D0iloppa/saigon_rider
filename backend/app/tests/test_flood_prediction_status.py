import os
import unittest
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


class FloodPredictionStatusJobTest(unittest.IsolatedAsyncioTestCase):
    """F-11 잔여 갭: 성공한 구역만 마지막 성공 실행 시각을 영속화해야 한다."""

    async def test_succeeded_district_upserts_prediction_status_not_failed(self):
        hotspots = [
            _hotspot_row(1, "Q1", 10.75, 106.70),  # 성공
            _hotspot_row(2, "Q7", 10.80, 106.75),  # 실패
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
            await predict_flood_risk.run_flood_risk_prediction()

        sqls = [str(call.args[0]) for call in session.execute.await_args_list]
        upsert_calls = [
            (sql, call.args[1])
            for sql, call in zip(sqls, session.execute.await_args_list, strict=True)
            if "INSERT INTO flood_prediction_status" in sql
        ]
        upserted_districts = {params["dc"] for _, params in upsert_calls}

        self.assertIn("Q1", upserted_districts)
        self.assertNotIn("Q7", upserted_districts)


class FloodMapDataNeverConfirmedTest(unittest.IsolatedAsyncioTestCase):
    """소비 측(get_map_data) 이 '한 번도 성공한 적 없음'을 additive 필드로 구분해 내려줘야 한다."""

    async def _run(self, hotspot_row: dict):
        row = MagicMock()
        row._mapping = hotspot_row
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[[], [row], []])
        db.commit = AsyncMock()
        return await info_flood.get_map_data(10.776, 106.7, 5.0, __import__("uuid").uuid4(), db)

    async def test_confirmed_district_with_zero_results_is_not_flagged_unavailable(self):
        # ① 성공한 적 있는 구역 — 오늘 위험도가 낮아 risk 행이 없어도(맑은 날) "안전"이 유지돼야
        #    한다. never_confirmed=False 로 내려간다.
        result = await self._run(
            {
                "hotspot_id": 1,
                "district_code": "Q1",
                "street_name": "Test St",
                "centroid_lat": 10.75,
                "centroid_lng": 106.70,
                "flood_count_30d": 0,
                "last_flood_at": None,
                "avg_depth_level": "knee",
                "updated_at": None,
                "never_confirmed": False,
            }
        )
        self.assertEqual(result["hotspots"][0]["never_confirmed"], False)

    async def test_never_succeeded_district_is_flagged_unavailable(self):
        # ② 한 번도 성공한 적 없는 구역은 never_confirmed=True 로 구분돼야 한다.
        result = await self._run(
            {
                "hotspot_id": 2,
                "district_code": "Q_NEW",
                "street_name": "New St",
                "centroid_lat": 10.90,
                "centroid_lng": 106.80,
                "flood_count_30d": 0,
                "last_flood_at": None,
                "avg_depth_level": None,
                "updated_at": None,
                "never_confirmed": True,
            }
        )
        self.assertEqual(result["hotspots"][0]["never_confirmed"], True)

    async def test_missing_never_confirmed_field_preserves_existing_behavior(self):
        # ③ 판정에 필요한 정보(never_confirmed)가 응답에 없으면(예: 구버전 경로) 예외 없이
        #    기존 동작을 유지해야 한다 — 필드 부재는 falsy 로 취급된다.
        result = await self._run(
            {
                "hotspot_id": 3,
                "district_code": "Q3",
                "street_name": "Old St",
                "centroid_lat": 10.77,
                "centroid_lng": 106.72,
                "flood_count_30d": 0,
                "last_flood_at": None,
                "avg_depth_level": None,
                "updated_at": None,
                # "never_confirmed" 키 부재.
            }
        )
        self.assertFalse(result["hotspots"][0].get("never_confirmed"))
