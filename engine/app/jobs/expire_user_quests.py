"""일배치: 자정 지난 DAILY UserQuest(ACCEPTED) 를 EXPIRED 로 전환.

BFF DB(user_quests, quests 테이블) 를 공유 DB 로 직접 갱신한다.
period_key (= YYYY-MM-DD, VN 기준)가 오늘 미만이면 모두 만료 대상.
"""
from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.database import AsyncSessionLocal

log = logging.getLogger(__name__)

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


async def run() -> None:
    today_vn = datetime.now(VN_TZ).date().isoformat()
    log.info("expire_user_quests job started (today=%s VN)", today_vn)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                """
                UPDATE user_quests AS uq
                SET status = 'EXPIRED'
                FROM quests AS q
                WHERE uq.quest_id = q.id
                  AND uq.status = 'ACCEPTED'
                  AND q.period = 'DAILY'
                  AND uq.period_key IS NOT NULL
                  AND uq.period_key < :today
                """
            ),
            {"today": today_vn},
        )
        await db.commit()

    log.info("expire_user_quests job done: %s rows updated", result.rowcount)
