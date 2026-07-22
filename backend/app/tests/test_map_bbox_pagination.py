import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

from app.routers import biz
from app.routers.map import poi


def _db_with_total(total: int):
    count_result = MagicMock()
    count_result.scalar_one.return_value = total
    rows_result = MagicMock()
    rows_result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[count_result, rows_result])
    return db


class MapBboxPaginationTest(unittest.IsolatedAsyncioTestCase):
    async def test_business_map_is_deterministic_and_reports_more(self):
        db = _db_with_total(500)

        result = await biz.get_public_map(
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
        self.assertNotIn("LIMIT 200", rows_sql)
        self.assertEqual(result.total, 500)
        self.assertTrue(result.has_more)

    async def test_poi_map_is_deterministic_and_reports_last_page(self):
        db = _db_with_total(150)

        result = await poi.get_public_map(
            min_lat=Decimal("10.70"),
            max_lat=Decimal("10.80"),
            min_lng=Decimal("106.60"),
            max_lng=Decimal("106.80"),
            category=None,
            q=None,
            page=2,
            size=100,
            db=db,
        )

        rows_sql = str(db.execute.await_args_list[1].args[0])
        self.assertIn("poi.id ASC", rows_sql)
        self.assertNotIn("LIMIT 200", rows_sql)
        self.assertEqual(result.total, 150)
        self.assertFalse(result.has_more)


if __name__ == "__main__":
    unittest.main()
