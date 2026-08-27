"""워키토키(A-7) "지금 녹음 중" 소프트 신호 — Redis TTL 기반, 서버 레벨 락 없음.

fuel price 캐시(redis_cache.py)와 같은 redis.asyncio 클라이언트 패턴을 쓰되,
prefix 를 분리해서 다른 도메인 캐시와 섞이지 않게 한다.
"""

from __future__ import annotations

import os

import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
PREFIX = "saigon:walkie:recording:"

_client: redis.Redis | None = None


async def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL, decode_responses=True)
    return _client


def _key(conversation_id: str, user_id: str) -> str:
    return f"{PREFIX}{conversation_id}:{user_id}"


async def mark_recording(conversation_id: str, user_id: str, ttl: int = 90) -> None:
    client = await get_client()
    await client.set(_key(conversation_id, user_id), "1", ex=ttl)


async def clear_recording(conversation_id: str, user_id: str) -> None:
    client = await get_client()
    await client.delete(_key(conversation_id, user_id))


async def get_active_recorders(conversation_id: str) -> list[str]:
    client = await get_client()
    prefix = f"{PREFIX}{conversation_id}:"
    user_ids: list[str] = []
    async for full_key in client.scan_iter(match=prefix + "*"):
        user_ids.append(full_key.removeprefix(prefix))
    return user_ids
