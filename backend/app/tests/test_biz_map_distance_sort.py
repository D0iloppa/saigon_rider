"""S-5 회귀 테스트 — "우리 동네" 업체 지도가 거리순이 아니라 id.asc() 전역 정렬이라
40km 밖 업체가 상단에 오던 문제. lat/lng(조회자 위치)가 주어지면 ST_Distance 로 정렬,
없으면 기존 id.asc() 폴백(test_map_bbox_pagination.py 의 결정론 계약과 공존)을 확인한다.
"""

import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

from app.routers import biz


def _db_with_total(total: int):
    count_result = MagicMock()
    count_result.scalar_one.return_value = total
    rows_result = MagicMock()
    rows_result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[count_result, rows_result])
    return db


class BizMapDistanceSortTest(unittest.IsolatedAsyncioTestCase):
    async def test_no_viewer_location_falls_back_to_id_asc(self):
        db = _db_with_total(10)
        await biz.get_public_map(
            min_lat=Decimal("10.70"),
            max_lat=Decimal("10.80"),
            min_lng=Decimal("106.60"),
            max_lng=Decimal("106.80"),
            category=None,
            q=None,
            page=1,
            size=100,
            db=db,
        )
        rows_sql = str(db.execute.await_args_list[1].args[0])
        self.assertIn("ORDER BY business_profile.id ASC", rows_sql)

    async def test_viewer_location_sorts_by_distance(self):
        db = _db_with_total(10)
        await biz.get_public_map(
            min_lat=Decimal("10.70"),
            max_lat=Decimal("10.80"),
            min_lng=Decimal("106.60"),
            max_lng=Decimal("106.80"),
            category=None,
            q=None,
            lat=Decimal("10.75"),
            lng=Decimal("106.70"),
            page=1,
            size=100,
            db=db,
        )
        rows_stmt = db.execute.await_args_list[1].args[0]
        rows_sql = str(rows_stmt)
        self.assertIn("ST_Distance", rows_sql)
        self.assertNotIn("ORDER BY business_profile.id ASC", rows_sql)
        # bound params carry the caller's own lat/lng — not a hardcoded fallback point
        compiled = rows_stmt.compile()
        self.assertEqual(compiled.params.get("origin_lat"), 10.75)
        self.assertEqual(compiled.params.get("origin_lng"), 106.70)


if __name__ == "__main__":
    unittest.main()
