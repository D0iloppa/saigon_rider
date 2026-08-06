"""대표 지시 2026-08-06 — 'gps' 표시범위의 반경 필터 회귀 테스트.

설계도: ai-docs/260806_gps_scope_unification_design.md (D4 — "근처" = 내 좌표 반경 3km,
행정구역 무관). 종전에는 ward_id(행정구역)로 걸러 구 경계에 걸친 매물이 통째로 빠졌다.

이 파일이 고정하는 계약:
 1) radius_km 이 오면 ST_DWithin 조건이 **목록(q)과 총계(count_q) 양쪽에** 걸린다.
    한쪽만 걸면 total 과 실제 항목 수가 어긋나 페이지네이션이 깨진다(V10).
 2) lat/lng 없이 radius_km 만 오면 무시한다 — 기준점이 없으면 반경이 성립하지 않는다.
 3) radius_km 미지정이면 반경 조건이 아예 붙지 않는다('all' 표시범위).
"""

import unittest
import uuid
from unittest.mock import MagicMock

from app.routers import market


class _CapturingDb:
    """db.execute 로 넘어온 SQLAlchemy 문장을 순서대로 붙잡아 둔다."""

    def __init__(self):
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        result = MagicMock()
        result.scalar_one = MagicMock(return_value=0)
        result.all = MagicMock(return_value=[])
        return result

    def compiled_sql(self):
        return [str(s) for s in self.statements]


async def _call(**kwargs):
    db = _CapturingDb()
    params = {
        "category": None,
        "category_id": None,
        "keyword": None,
        "sort": "distance",
        "hide_sold": False,
        "price_min": None,
        "price_max": None,
        "lat": None,
        "lng": None,
        "radius_km": None,
        "min_lat": None,
        "max_lat": None,
        "min_lng": None,
        "max_lng": None,
        "district_id": None,
        "ward_id": None,
        "seller_id": None,
        "viewer_id": None,
        "lang": None,
        "page": 1,
        "size": 20,
        "db": db,
        "session_uid": None,
    }
    params.update(kwargs)
    await market.get_listings(**params)
    return db


# Thạnh Mỹ Tây 근처 — 대표 캡처(2026-08-06)의 실제 GPS 위치 계열 좌표.
THANH_MY_TAY = {"lat": 10.8006, "lng": 106.7295}


class ListingsRadiusFilterTest(unittest.IsolatedAsyncioTestCase):
    async def test_radius_applies_to_both_count_and_page_queries(self):
        db = await _call(**THANH_MY_TAY, radius_km=3)
        sql = db.compiled_sql()
        self.assertGreaterEqual(len(sql), 2, "count_q 와 q 두 문장이 실행돼야 한다")
        count_sql, page_sql = sql[0], sql[1]
        self.assertIn(
            "ST_DWithin",
            count_sql,
            "총계 쿼리에 반경 조건이 빠지면 total 과 실제 항목 수가 어긋난다(V10)",
        )
        self.assertIn("ST_DWithin", page_sql, "목록 쿼리에 반경 조건이 있어야 한다")

    async def test_radius_km_is_converted_to_meters(self):
        db = await _call(**THANH_MY_TAY, radius_km=3)
        page_sql = db.compiled_sql()[1]
        self.assertIn(
            "3000.0",
            page_sql,
            "ST_DWithin 은 geography 미터 단위 — 3km 는 3000m 로 넘어가야 한다",
        )

    async def test_radius_ignored_without_coordinates(self):
        db = await _call(lat=None, lng=None, radius_km=3)
        for sql in db.compiled_sql():
            self.assertNotIn(
                "ST_DWithin",
                sql,
                "기준 좌표가 없으면 반경은 성립하지 않는다 — 조건을 붙이면 전건이 사라진다",
            )

    async def test_no_radius_condition_when_unset(self):
        """'all' 표시범위 — 좌표는 거리 표기용으로 넘어와도 반경으로 거르지 않는다."""
        db = await _call(**THANH_MY_TAY, radius_km=None)
        for sql in db.compiled_sql():
            self.assertNotIn("ST_DWithin", sql)

    async def test_radius_is_independent_of_ward_filter(self):
        """반경 필터는 ward_id 와 무관하게 동작한다 — 구 경계 걸친 매물 누락 방지(D4)."""
        db = await _call(**THANH_MY_TAY, radius_km=3, ward_id=None)
        page_sql = db.compiled_sql()[1]
        self.assertIn("ST_DWithin", page_sql)
        # ward_id 는 SELECT 컬럼 목록에도 등장하므로 WHERE 절만 떼어 본다.
        where_clause = page_sql.split("WHERE", 1)[1]
        self.assertNotIn(
            "ward_id",
            where_clause,
            "ward_id 를 안 넘겼는데 행정구역 조건이 붙으면 안 된다",
        )


class ListingsRadiusSessionScopeTest(unittest.IsolatedAsyncioTestCase):
    async def test_radius_survives_blocked_user_filtering(self):
        """차단 사용자 필터가 걸린 세션에서도 반경 조건이 양쪽에 유지된다."""
        db = await _call(**THANH_MY_TAY, radius_km=3, session_uid=uuid.uuid4())
        count_sql, page_sql = db.compiled_sql()[0], db.compiled_sql()[1]
        self.assertIn("ST_DWithin", count_sql)
        self.assertIn("ST_DWithin", page_sql)


if __name__ == "__main__":
    unittest.main()
