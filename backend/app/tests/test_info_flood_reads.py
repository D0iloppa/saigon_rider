import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.routers import info_flood


def _empty_result():
    return []


class FloodReadOnlyTest(unittest.IsolatedAsyncioTestCase):
    async def test_active_endpoint_is_select_only(self):
        db = MagicMock()
        db.execute = AsyncMock(return_value=_empty_result())
        db.commit = AsyncMock()

        result = await info_flood.get_active_floods(10.776, 106.7, 5.0, uuid.uuid4(), db)

        self.assertEqual(result, {"floods": []})
        self.assertEqual(db.execute.await_count, 1)
        sql = str(db.execute.await_args.args[0]).lstrip()
        self.assertTrue(sql.startswith("SELECT"))
        db.commit.assert_not_awaited()

    async def test_map_data_endpoint_is_select_only(self):
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[_empty_result(), _empty_result(), _empty_result()])
        db.commit = AsyncMock()

        result = await info_flood.get_map_data(10.776, 106.7, 5.0, uuid.uuid4(), db)

        self.assertEqual(result["reports"], [])
        self.assertEqual(result["hotspots"], [])
        self.assertEqual(result["risks"], [])
        self.assertEqual(db.execute.await_count, 3)
        for call in db.execute.await_args_list:
            self.assertTrue(str(call.args[0]).lstrip().startswith("SELECT"))
        db.commit.assert_not_awaited()
