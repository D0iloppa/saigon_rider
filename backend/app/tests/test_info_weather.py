import asyncio
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import info_weather


class _AsyncClientContext:
    def __init__(self, client):
        self.client = client

    async def __aenter__(self):
        return self.client

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class OpenWeatherFailureTest(unittest.IsolatedAsyncioTestCase):
    async def test_current_non_200_raises_bad_gateway_instead_of_mock(self):
        response = MagicMock(status_code=401)
        client = MagicMock(get=AsyncMock(return_value=response))

        with (
            patch.object(info_weather.httpx, "AsyncClient", return_value=_AsyncClientContext(client)),
            self.assertRaises(HTTPException) as raised,
        ):
            await info_weather._fetch_openweather_current(10.776, 106.7, "invalid")

        self.assertEqual(raised.exception.status_code, 502)

    async def test_forecast_request_error_raises_bad_gateway_instead_of_mock(self):
        client = MagicMock(get=AsyncMock(side_effect=info_weather.httpx.ConnectError("offline")))

        with (
            patch.object(info_weather.httpx, "AsyncClient", return_value=_AsyncClientContext(client)),
            self.assertRaises(HTTPException) as raised,
        ):
            await info_weather._fetch_openweather_forecast(10.776, 106.7, "invalid")

        self.assertEqual(raised.exception.status_code, 502)

    async def test_failed_current_response_is_not_cached(self):
        unavailable = HTTPException(status_code=502, detail="Weather data unavailable")

        with (
            patch.object(info_weather, "find_district_by_point", new=AsyncMock(return_value="Q1")),
            patch.object(info_weather, "_get_api_key", new=AsyncMock(return_value="invalid")),
            patch.object(info_weather, "_get_cached", new=AsyncMock(return_value=None)),
            patch.object(info_weather, "_get_stale_cached", new=AsyncMock(return_value=None)),
            patch.object(info_weather, "_fetch_openweather_current", new=AsyncMock(side_effect=unavailable)),
            patch.object(info_weather, "_upsert_cache", new=AsyncMock()) as upsert_cache,
            self.assertRaises(HTTPException),
        ):
            await info_weather.get_weather(10.776, 106.7, uuid.uuid4(), MagicMock())

        upsert_cache.assert_not_awaited()

    async def test_fifty_concurrent_cache_misses_call_producer_once(self):
        cache = {}
        redis = MagicMock()
        redis.get = AsyncMock(return_value=None)
        redis.set = AsyncMock(return_value=True)
        redis.eval = AsyncMock(return_value=1)

        async def get_cached(_db, district, weather_type):
            return cache.get((district, weather_type))

        async def upsert_cache(_db, district, _lat, _lng, weather_type, data, _ttl):
            cache[(district, weather_type)] = data

        async def produce():
            await asyncio.sleep(0.01)
            return {"temp_c": 31.0}

        producer = AsyncMock(side_effect=produce)
        with (
            patch.object(info_weather, "_get_cached", new=AsyncMock(side_effect=get_cached)),
            patch.object(info_weather, "_upsert_cache", new=AsyncMock(side_effect=upsert_cache)),
            patch.object(info_weather, "get_client", new=AsyncMock(return_value=redis)),
        ):
            results = await asyncio.gather(
                *[
                    info_weather._cached_or_singleflight(
                        MagicMock(),
                        district="STAMPede_TEST",
                        lat=10.776,
                        lng=106.7,
                        weather_type="current",
                        ttl=600,
                        producer=producer,
                    )
                    for _ in range(50)
                ]
            )

        self.assertTrue(all(result["temp_c"] == 31.0 and result["_stale"] is False for result in results))
        producer.assert_awaited_once()
        redis.set.assert_awaited_once()

    async def test_failed_producer_is_called_once_for_concurrent_burst(self):
        redis = MagicMock()
        redis.get = AsyncMock(return_value=None)
        redis.set = AsyncMock(return_value=True)
        redis.eval = AsyncMock(return_value=1)
        producer = AsyncMock(side_effect=HTTPException(status_code=502, detail="upstream failed"))

        with (
            patch.object(info_weather, "_get_cached", new=AsyncMock(return_value=None)),
            patch.object(info_weather, "_upsert_cache", new=AsyncMock()) as upsert_cache,
            patch.object(info_weather, "get_client", new=AsyncMock(return_value=redis)),
        ):
            results = await asyncio.gather(
                *[
                    info_weather._cached_or_singleflight(
                        MagicMock(),
                        district="FAILURE_BURST_TEST",
                        lat=10.776,
                        lng=106.7,
                        weather_type="current",
                        ttl=600,
                        producer=producer,
                    )
                    for _ in range(50)
                ],
                return_exceptions=True,
            )

        self.assertTrue(all(isinstance(result, HTTPException) for result in results))
        producer.assert_awaited_once()
        upsert_cache.assert_not_awaited()

    async def test_cache_identity_uses_grid_not_district(self):
        self.assertNotEqual(info_weather._grid_code(10.771, 106.701), info_weather._grid_code(10.789, 106.719))

    async def test_upstream_failure_returns_stale_with_uncertain_recommendation(self):
        stale_current = {
            "temp_c": 31.0,
            "feels_like_c": 35.0,
            "condition": "Clouds",
            "condition_desc": "cloudy",
            "emoji": "⛅",
            "humidity": 70,
            "wind_kmh": 8,
            "_source": "OPENWEATHER",
            "_observed_at": "2026-07-22T01:00:00+00:00",
            "_fetched_at": "2026-07-22T01:01:00+00:00",
            "_stale": True,
            "_error": "UPSTREAM_UNAVAILABLE",
        }
        stale_forecast = {
            "hourly": [{"time": "09:00", "temp_c": 31.0, "condition": "Clouds", "emoji": "⛅", "rain_prob": 10}],
            "_source": "OPENWEATHER",
            "_observed_at": "2026-07-22T01:00:00+00:00",
            "_fetched_at": "2026-07-22T01:01:00+00:00",
            "_stale": True,
            "_error": "UPSTREAM_UNAVAILABLE",
        }
        with (
            patch.object(info_weather, "find_district_by_point", new=AsyncMock(return_value="Q1")),
            patch.object(info_weather, "_get_api_key", new=AsyncMock(return_value="key")),
            patch.object(info_weather, "_cached_or_singleflight", new=AsyncMock(side_effect=HTTPException(502))),
            patch.object(info_weather, "_get_stale_cached", new=AsyncMock(side_effect=[stale_current, stale_forecast])),
            patch.object(info_weather, "_earn_gp_safe", new=AsyncMock(return_value=True)),
        ):
            result = await info_weather.get_weather(10.776, 106.7, uuid.uuid4(), MagicMock())

        self.assertTrue(result.stale)
        self.assertEqual(result.error, "UPSTREAM_UNAVAILABLE")
        self.assertEqual(result.recommendation_code, "UNCERTAIN")
