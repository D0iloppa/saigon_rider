import os
import unittest
import uuid
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.deps import verify_user_session
from app.routers import info_route

_HCMC_PAIRS = (
    ((10.7769, 106.7009), (10.7716, 106.6980)),
    ((10.8231, 106.6297), (10.7759, 106.7010)),
    ((10.7544, 106.6669), (10.8011, 106.6520)),
)
_MODE_TO_COSTING = {"motorcycle": "motorcycle", "car": "auto", "walking": "pedestrian"}
_TRIP = {
    "legs": [{"shape": "_p~iF~ps|U", "maneuvers": [{"type": 1, "length": 1.0}]}],
    "summary": {"length": 1.0, "time": 60.0},
    "status": 0,
}

app = FastAPI()
app.include_router(info_route.router)


async def _authenticated_user():
    return uuid.uuid4()


app.dependency_overrides[verify_user_session] = _authenticated_user


class RouteModeContractTests(unittest.TestCase):
    def test_authenticated_hcmc_pairs_preserve_requested_mode_and_costing(self):
        cache: dict[str, info_route.RouteOut] = {}
        calls: list[tuple[float, float, float, float, str]] = []

        async def get_cached(key: str):
            return cache.get(key)

        async def set_cached(key: str, route: info_route.RouteOut):
            cache[key] = route

        async def fetch_trip(engine_url, origin_lat, origin_lng, dest_lat, dest_lng, costing):
            calls.append((origin_lat, origin_lng, dest_lat, dest_lng, costing))
            return _TRIP

        with (
            patch.dict(os.environ, {"ROUTING_ENGINE_URL": "http://routing-engine"}),
            patch.object(info_route, "_get_cached_route", new=AsyncMock(side_effect=get_cached)),
            patch.object(info_route, "_set_cached_route", new=AsyncMock(side_effect=set_cached)),
            patch.object(info_route, "_enforce_rate_limit", new=AsyncMock()),
            patch.object(info_route.routing_engine, "fetch_trip", new=AsyncMock(side_effect=fetch_trip)),
            TestClient(app) as client,
        ):
            for origin, destination in _HCMC_PAIRS:
                for mode, _costing in _MODE_TO_COSTING.items():
                    response = client.get(
                        "/info/route",
                        params={
                            "origin_lat": origin[0],
                            "origin_lng": origin[1],
                            "dest_lat": destination[0],
                            "dest_lng": destination[1],
                            "mode": mode,
                        },
                    )

                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["route_mode"], mode)
                    self.assertEqual(response.json()["distance_m"], 1000)
                    self.assertEqual(response.json()["duration_s"], 60)

        self.assertEqual([call[-1] for call in calls], list(_MODE_TO_COSTING.values()) * len(_HCMC_PAIRS))

    def test_omitted_mode_defaults_to_motorcycle_and_cache_is_mode_aware(self):
        cache: dict[str, info_route.RouteOut] = {}
        fetch_trip = AsyncMock(return_value=_TRIP)

        async def get_cached(key: str):
            return cache.get(key)

        async def set_cached(key: str, route: info_route.RouteOut):
            cache[key] = route

        params = {"origin_lat": 10.7769, "origin_lng": 106.7009, "dest_lat": 10.7716, "dest_lng": 106.6980}
        with (
            patch.dict(os.environ, {"ROUTING_ENGINE_URL": "http://routing-engine"}),
            patch.object(info_route, "_get_cached_route", new=AsyncMock(side_effect=get_cached)),
            patch.object(info_route, "_set_cached_route", new=AsyncMock(side_effect=set_cached)),
            patch.object(info_route, "_enforce_rate_limit", new=AsyncMock()),
            patch.object(info_route.routing_engine, "fetch_trip", new=fetch_trip),
            TestClient(app) as client,
        ):
            default_response = client.get("/info/route", params=params)
            car_response = client.get("/info/route", params={**params, "mode": "car"})
            cached_response = client.get("/info/route", params=params)

        self.assertEqual(default_response.json()["route_mode"], "motorcycle")
        self.assertEqual(car_response.json()["route_mode"], "car")
        self.assertEqual(cached_response.json()["route_mode"], "motorcycle")
        self.assertEqual(fetch_trip.await_count, 2)
        self.assertEqual(fetch_trip.await_args_list[0].args[-1], "motorcycle")
        self.assertEqual(fetch_trip.await_args_list[1].args[-1], "auto")

    def test_unconfigured_response_preserves_requested_mode(self):
        with patch.dict(os.environ, {}, clear=True), TestClient(app) as client:
            response = client.get(
                "/info/route",
                params={
                    "origin_lat": 10.7769,
                    "origin_lng": 106.7009,
                    "dest_lat": 10.7716,
                    "dest_lng": 106.6980,
                    "mode": "walking",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["route_mode"], "walking")
        self.assertEqual(response.json()["steps"], [])

    def test_rejects_unlisted_mode_before_routing(self):
        with TestClient(app) as client:
            response = client.get(
                "/info/route",
                params={
                    "origin_lat": 10.7769,
                    "origin_lng": 106.7009,
                    "dest_lat": 10.7716,
                    "dest_lng": 106.6980,
                    "mode": "scooter",
                },
            )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
