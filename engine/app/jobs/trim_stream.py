"""일배치: Redis Stream 7일 초과 메시지 정리 (베트남 시간 04:15)."""
from __future__ import annotations

import logging
import time

from app.redis_client import STREAM_KEY, get_redis

log = logging.getLogger(__name__)

RETENTION_DAYS = 7


async def run() -> None:
    cutoff_ms = int((time.time() - RETENTION_DAYS * 86400) * 1000)
    r = await get_redis()
    trimmed = await r.xtrim(STREAM_KEY, minid=cutoff_ms, approximate=True)
    log.info("trim_stream job done: %d messages trimmed (minid=%d)", trimmed, cutoff_ms)
