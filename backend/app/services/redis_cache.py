"""Redis 캐시 헬퍼 (fuel price 도메인 전용).

기존 Redis Streams 클라이언트와 키 prefix 분리 → `saigon:fuel:` 사용.
"""

from __future__ import annotations

import json
import logging
import math
import os
from typing import Any

import redis.asyncio as redis

log = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
PREFIX = os.getenv("REDIS_FUEL_PRICE_PREFIX", "saigon:fuel:")

_client: redis.Redis | None = None


async def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL, decode_responses=True)
    return _client


async def cache_get(key: str) -> Any | None:
    client = await get_client()
    raw = await client.get(PREFIX + key)
    return json.loads(raw) if raw else None


async def cache_set(key: str, value: Any, ttl: int = 3600) -> None:
    client = await get_client()
    await client.set(PREFIX + key, json.dumps(value, default=str), ex=ttl)


async def cache_invalidate(pattern: str = "*") -> int:
    client = await get_client()
    keys: list[str] = []
    async for k in client.scan_iter(match=PREFIX + pattern):
        keys.append(k)
    if keys:
        return await client.delete(*keys)
    return 0


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0088
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def invalidate_gas_nearby_for_station(lat: float, lng: float) -> int:
    """대기시간이 바뀐 주유소를 포함하는 v1 nearby 캐시만 비동기 삭제한다."""
    client = await get_client()
    affected: list[str] = []
    async for full_key in client.scan_iter(match=PREFIX + "nearby:v1:*"):
        logical_key = full_key.removeprefix(PREFIX)
        parts = logical_key.split(":")
        if len(parts) != 6:
            continue
        try:
            center_lat = float(parts[2])
            center_lng = float(parts[3])
            radius_km = float(parts[4])
        except ValueError:
            continue
        if _distance_km(lat, lng, center_lat, center_lng) <= radius_km + 0.1:
            affected.append(full_key)
    if affected:
        return await client.unlink(*affected)
    return 0


class CacheKeys:
    TODAY_PRICES = "today:prices"
    STATION_PRICE = "station:{station_id}"
    STATIONS_NEARBY = "nearby:{lat}:{lng}:{radius}"
