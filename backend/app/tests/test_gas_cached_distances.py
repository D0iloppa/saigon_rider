import asyncio
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app.routers.info_gas import _with_request_distances, _without_distances, get_nearby_gas_stations


class GasCachedDistanceTests(unittest.TestCase):
    def setUp(self):
        self.cached_stations = [
            {"station_id": 1, "lat": 10.0, "lng": 106.001, "distance_km": 9.9},
            {"station_id": 2, "lat": 10.0, "lng": 106.002, "distance_km": 0.1},
        ]

    def test_cache_payload_omits_request_specific_distance(self):
        cached = _without_distances(self.cached_stations)

        self.assertNotIn("distance_km", cached[0])
        self.assertNotIn("distance_km", cached[1])
        self.assertIn("distance_km", self.cached_stations[0])

    def test_cached_stations_are_recomputed_and_sorted_for_each_request(self):
        static = _without_distances(self.cached_stations)

        from_west = _with_request_distances(static, 10.0, 106.0)
        from_east = _with_request_distances(static, 10.0, 106.003)

        self.assertEqual([station["station_id"] for station in from_west], [1, 2])
        self.assertEqual([station["station_id"] for station in from_east], [2, 1])
        west_distances = {station["station_id"]: station["distance_km"] for station in from_west}
        east_distances = {station["station_id"]: station["distance_km"] for station in from_east}
        self.assertNotEqual(west_distances[1], east_distances[1])
        self.assertNotIn("distance_km", static[0])


class GasCachedEndpointTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.cached = {
            "stations": [
                {"station_id": 1, "lat": 10.0, "lng": 106.001, "distance_km": 99.0},
                {"station_id": 2, "lat": 10.0, "lng": 106.002, "distance_km": 0.0},
            ]
        }

    async def test_v1_cache_hit_recomputes_distance_and_order(self):
        reward_started = asyncio.Event()
        release_reward = asyncio.Event()
        user_id = uuid.uuid4()

        async def earn_reward(*args):
            reward_started.set()
            await release_reward.wait()
            return True

        reward = AsyncMock(side_effect=earn_reward)
        with (
            patch("app.routers.info_gas.cache_get", AsyncMock(return_value=self.cached)),
            patch("app.routers.info_gas._earn_gp_safe", reward),
        ):
            request = asyncio.create_task(get_nearby_gas_stations(10.0, 106.0, user_id=user_id, db=AsyncMock()))
            await reward_started.wait()
            self.assertFalse(request.done())
            release_reward.set()
            response = await request

        self.assertEqual([station["station_id"] for station in response["stations"]], [1, 2])
        self.assertNotEqual(response["stations"][0]["distance_km"], 99.0)
        self.assertEqual(reward.await_args.args[:2], (user_id, "INFO_GAS_NEARBY_VIEW"))
        self.assertTrue(reward.await_args.args[2].startswith(f"gas-view-{user_id}-"))

    async def test_v1_cache_miss_waits_for_reward_before_returning(self):
        reward_started = asyncio.Event()
        release_reward = asyncio.Event()
        user_id = uuid.uuid4()

        async def earn_reward(*args):
            reward_started.set()
            await release_reward.wait()
            return True

        rows = MagicMock()
        rows.__iter__.return_value = iter([])
        db = AsyncMock()
        db.execute = AsyncMock(return_value=rows)
        reward = AsyncMock(side_effect=earn_reward)
        with (
            patch("app.routers.info_gas.cache_get", AsyncMock(return_value=None)),
            patch("app.routers.info_gas.cache_set", AsyncMock()),
            patch("app.routers.info_gas._earn_gp_safe", reward),
        ):
            request = asyncio.create_task(get_nearby_gas_stations(10.0, 106.0, user_id=user_id, db=db))
            await reward_started.wait()
            self.assertFalse(request.done())
            release_reward.set()
            response = await request

        self.assertEqual(response, {"stations": []})
        self.assertEqual(reward.await_args.args[:2], (user_id, "INFO_GAS_NEARBY_VIEW"))
        self.assertTrue(reward.await_args.args[2].startswith(f"gas-view-{user_id}-"))


if __name__ == "__main__":
    unittest.main()
