import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import Quest, User, UserQuest
from ..routers.internal import grant_quest_completion_reward

log = logging.getLogger(__name__)

_BATCH_SIZE = 50


async def retry_quest_reward(db: AsyncSession, user_quest_id: uuid.UUID) -> bool:
    uq = (
        await db.execute(select(UserQuest).where(UserQuest.id == user_quest_id).with_for_update(skip_locked=True))
    ).scalar_one_or_none()
    if (
        uq is None
        or uq.status != "ACCEPTED"
        or uq.reward_grant_status not in ("PENDING", "FAILED")
        or uq.reward_idempotency_key is None
    ):
        return False

    quest = await db.get(Quest, uq.quest_id)
    user = await db.get(User, uq.user_id)
    if quest is None or user is None:
        uq.reward_grant_status = "FAILED"
        uq.reward_last_error = "quest/user not found"
        await db.commit()
        return False
    await grant_quest_completion_reward(db, uq, quest, user)
    return True


async def retry_failed_quest_rewards() -> int:
    async with AsyncSessionLocal() as db:
        candidate_ids = (
            (
                await db.execute(
                    select(UserQuest.id)
                    .where(
                        UserQuest.status == "ACCEPTED",
                        UserQuest.reward_grant_status.in_(("PENDING", "FAILED")),
                        UserQuest.reward_idempotency_key.is_not(None),
                    )
                    .order_by(UserQuest.accepted_at.asc(), UserQuest.id.asc())
                    .limit(_BATCH_SIZE)
                )
            )
            .scalars()
            .all()
        )

    retried = 0
    for user_quest_id in candidate_ids:
        async with AsyncSessionLocal() as db:
            try:
                if await retry_quest_reward(db, user_quest_id):
                    retried += 1
            except Exception:
                log.exception("quest reward retry failed user_quest=%s", user_quest_id)
    return retried
