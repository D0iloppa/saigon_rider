"""일배치: 만료된 멱등성 키 정리 (베트남 시간 04:10)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete

from app.database import AsyncSessionLocal
from app.models import IdempotencyKey

log = logging.getLogger(__name__)


async def run() -> None:
    log.info("cleanup_idem job started")
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(IdempotencyKey).where(IdempotencyKey.expires_at < now)
        )
        await db.commit()

    log.info("cleanup_idem job done: %d keys deleted", result.rowcount)
