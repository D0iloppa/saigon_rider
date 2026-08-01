"""일배치: 만료된 퀘스트 카드 처리 (베트남 시간 04:10)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.enums import QuestCardStatusEnum
from app.models import SreQuestCard

log = logging.getLogger(__name__)


async def run() -> None:
    log.info("expire_quest_cards job started")
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SreQuestCard).where(
                SreQuestCard.status == QuestCardStatusEnum.ACTIVE,
                SreQuestCard.expires_at <= now,
            ).with_for_update(skip_locked=True)
        )
        cards = result.scalars().all()
        for card in cards:
            card.status = QuestCardStatusEnum.EXPIRED

        await db.commit()

    log.info("expire_quest_cards job done: %d cards expired", len(cards))
