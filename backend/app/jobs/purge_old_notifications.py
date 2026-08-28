"""90일 지난 알림을 자동 삭제한다 — 알림함 무기한 보관을 막기 위한 전역 보관기간 정책."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete

from ..database import AsyncSessionLocal
from ..models import Notification

log = logging.getLogger(__name__)

_RETENTION = timedelta(days=90)


async def purge_old_notifications() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            cutoff = datetime.now(UTC) - _RETENTION
            await db.execute(delete(Notification).where(Notification.created_at < cutoff))
            await db.commit()
        return True
    except Exception:
        log.exception("Purge old notifications batch failed")
        return False
