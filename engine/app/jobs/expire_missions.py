"""일배치: 만료된 미션 처리 (베트남 시간 04:05)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.enums import MissionStatusEnum
from app.models import UserMissionProgress

log = logging.getLogger(__name__)


async def run() -> None:
    log.info("expire_missions job started")
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserMissionProgress).where(
                UserMissionProgress.status == MissionStatusEnum.ACTIVE,
                UserMissionProgress.expires_at <= now,
            ).with_for_update(skip_locked=True)
        )
        missions = result.scalars().all()
        for prog in missions:
            prog.status = MissionStatusEnum.EXPIRED

        await db.commit()

    log.info("expire_missions job done: %d missions expired", len(missions))
