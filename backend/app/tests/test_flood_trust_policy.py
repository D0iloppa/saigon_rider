import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.routers import info_flood


class FloodTrustPolicyTest(unittest.TestCase):
    def test_initial_report_is_pending(self):
        self.assertEqual(info_flood._trust_level(0), "PENDING")
        self.assertEqual(info_flood._trust_level(1), "PENDING")

    def test_confirm_quorum_and_verified_threshold(self):
        self.assertEqual(info_flood._trust_level(2), "CONFIRMED")
        self.assertEqual(info_flood._trust_level(3), "VERIFIED")

    def test_one_resolved_vote_does_not_close_report(self):
        self.assertEqual(info_flood._vote_transition("resolved", 1), (None, None))
        self.assertEqual(info_flood._vote_transition("resolved", 2), ("RESOLVED", None))


class FloodHotspotRadiusTest(unittest.IsolatedAsyncioTestCase):
    async def test_map_data_filters_hotspots_by_request_radius(self):
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[[], [], []])
        await info_flood.get_map_data(10.776, 106.7, 5.0, uuid.uuid4(), db)
        hotspot_sql = str(db.execute.await_args_list[1].args[0])
        self.assertIn("ST_DWithin", hotspot_sql)
        self.assertEqual(db.execute.await_args_list[1].args[1]["radius_m"], 5000)
