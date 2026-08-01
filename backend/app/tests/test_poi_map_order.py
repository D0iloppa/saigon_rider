import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

from app.routers.map import poi


class PoiMapOrderTest(unittest.IsolatedAsyncioTestCase):
    async def test_map_page_orders_by_center_distance_with_stable_tiebreakers(self):
        count_result = MagicMock()
        count_result.scalar_one.return_value = 0
        rows_result = MagicMock()
        rows_result.scalars.return_value.all.return_value = []
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[count_result, rows_result])

        result = await poi.get_public_map(
            Decimal("10.70"),
            Decimal("10.80"),
            Decimal("106.60"),
            Decimal("106.80"),
            page=1,
            size=100,
            db=db,
        )

        self.assertEqual(result.items, [])
        statement = str(db.execute.await_args_list[1].args[0])
        order_by = statement.split("ORDER BY", 1)[1]
        self.assertIn("poi.latitude", order_by)
        self.assertIn("poi.longitude", order_by)
        self.assertIn("CASE", order_by)
        self.assertIn("poi.sort_order ASC", order_by)
        self.assertIn("poi.id ASC", order_by)
        self.assertLess(order_by.index("poi.latitude"), order_by.index("CASE"))
        self.assertLess(order_by.index("CASE"), order_by.index("poi.sort_order ASC"))
        self.assertLess(order_by.index("poi.sort_order ASC"), order_by.index("poi.id ASC"))
