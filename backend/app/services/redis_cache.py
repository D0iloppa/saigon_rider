"""Redis 캐시 헬퍼 (fuel price 도메인 전용).

기존 Redis Streams 클라이언트와 키 prefix 분리 → `saigon:fuel:` 사용.
"""

from __future__ import annotations

import json
import logging
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


class CacheKeys:
    TODAY_PRICES = "today:prices"
    STATION_PRICE = "station:{station_id}"
    STATIONS_NEARBY = "nearby:{lat}:{lng}:{radius}"
