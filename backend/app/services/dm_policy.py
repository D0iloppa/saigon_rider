import uuid

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DmConversation, UserBlock


def require_participant(conv: DmConversation, session_uid: uuid.UUID) -> uuid.UUID:
    if session_uid not in (conv.participant_1, conv.participant_2):
        raise HTTPException(status_code=403, detail="Not a participant")
    return conv.participant_2 if conv.participant_1 == session_uid else conv.participant_1


async def require_unblocked(db: AsyncSession, user_a: uuid.UUID, user_b: uuid.UUID) -> None:
    blocked = (
        await db.execute(
            select(UserBlock.blocker_id).where(
                or_(
                    (UserBlock.blocker_id == user_a) & (UserBlock.blocked_id == user_b),
                    (UserBlock.blocker_id == user_b) & (UserBlock.blocked_id == user_a),
                )
            )
        )
    ).first()
    if blocked is not None:
        raise HTTPException(status_code=403, detail="Conversation blocked")
