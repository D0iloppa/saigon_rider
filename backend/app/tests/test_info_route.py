import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import info_route

ROUTES_RESPONSE = {
    "routes": [
        {
            "distanceMeters": 2450,
            "duration": "601.4s",
            "polyline": {"encodedPolyline": "encoded"},
            "legs": [
                {
                    "steps": [
                        {
                            "distanceMeters": 450,
                            "navigationInstruction": {
                                "instructions": "Rẽ phải",
                                "maneuver": "TURN_RIGHT",
                            },
                        }
                    ]
                }
            ],
        }
    ]
}


class RoutesApiTest(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_uses_two_wheeler_routes_api(self):
        response = MagicMock(status_code=200)
        response.json.return_value = ROUTES_RESPONSE
        client = MagicMock(post=AsyncMock(return_value=response))

        with patch.object(info_route, "_get_http_client", new=AsyncMock(return_value=client)):
            result = await info_route._fetch_directions(10.776, 106.7, 10.78, 106.71, "api-key", "ko")

        self.assertEqual(result, ROUTES_RESPONSE)
        request = client.post.await_args
        self.assertEqual(request.args[0], info_route._ROUTES_URL)
        self.assertEqual(request.kwargs["json"]["travelMode"], "TWO_WHEELER")
        self.assertEqual(request.kwargs["json"]["languageCode"], "ko")
        self.assertEqual(request.kwargs["headers"]["X-Goog-Api-Key"], "api-key")
        self.assertIn("routes.polyline.encodedPolyline", request.kwargs["headers"]["X-Goog-FieldMask"])

    def test_routes_response_keeps_frontend_contract(self):
        route = info_route._to_route_out(ROUTES_RESPONSE)

        self.assertTrue(route.configured)
        self.assertEqual(route.route_mode, "two_wheeler")
        self.assertEqual(route.distance_m, 2450)
        self.assertEqual(route.duration_s, 601)
        self.assertEqual(route.distance_text, "2.5 km")
        self.assertEqual(route.duration_text, "10 min")
        self.assertEqual(route.polyline, "encoded")
        self.assertEqual(route.steps[0].instruction, "Rẽ phải")

    async def test_repeated_route_uses_cache_and_calls_google_once(self):
        cache: dict[str, info_route.RouteOut] = {}

        async def get_cached(key: str):
            return cache.get(key)

        async def set_cached(key: str, route: info_route.RouteOut):
            cache[key] = route

        with (
            patch.object(info_route, "_get_api_key", return_value="api-key"),
            patch.object(info_route, "_get_cached_route", new=AsyncMock(side_effect=get_cached)),
            patch.object(info_route, "_set_cached_route", new=AsyncMock(side_effect=set_cached)),
            patch.object(info_route, "_enforce_rate_limit", new=AsyncMock()) as rate_limit,
            patch.object(info_route, "_fetch_directions", new=AsyncMock(return_value=ROUTES_RESPONSE)) as fetch,
        ):
            user_id = uuid.uuid4()
            first = await info_route.get_route(10.7761, 106.7001, 10.78, 106.71, user_id)
            second = await info_route.get_route(10.7762, 106.7002, 10.78, 106.71, user_id)

        self.assertEqual(first, second)
        fetch.assert_awaited_once()
        rate_limit.assert_awaited_once()

    async def test_rate_limit_rejects_eleventh_cache_miss(self):
        client = MagicMock()
        client.incr = AsyncMock(return_value=11)
        client.expire = AsyncMock()

        with (
            patch.object(info_route, "get_client", new=AsyncMock(return_value=client)),
            self.assertRaises(HTTPException) as raised,
        ):
            await info_route._enforce_rate_limit(uuid.uuid4())

        self.assertEqual(raised.exception.status_code, 429)
