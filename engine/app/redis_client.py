import logging

import redis.asyncio as aioredis

from app.config import settings

log = logging.getLogger(__name__)

STREAM_KEY = "sre:messages"
CONSUMER_GROUP = "sre-workers"

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
    return _pool


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


async def ensure_consumer_group() -> None:
    r = await get_redis()
    try:
        await r.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        log.info(
            "Created consumer group '%s' on stream '%s'", CONSUMER_GROUP, STREAM_KEY
        )
    except aioredis.ResponseError as e:
        if "BUSYGROUP" in str(e):
            pass
        else:
            raise
