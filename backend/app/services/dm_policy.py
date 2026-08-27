import uuid

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DmConversation, DmConversationMember, UserBlock


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


async def require_member(db: AsyncSession, conv: DmConversation, session_uid: uuid.UUID) -> DmConversationMember:
    """group/open 대화방의 활성(left_at IS NULL) 멤버십을 요구한다 (§3.4)."""
    member = (
        await db.execute(
            select(DmConversationMember).where(
                DmConversationMember.conversation_id == conv.id,
                DmConversationMember.user_id == session_uid,
                DmConversationMember.left_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=403, detail="Not a member")
    return member


async def require_unblocked_for_join(db: AsyncSession, conv_id: uuid.UUID, joining_uid: uuid.UUID) -> None:
    """group 방 입장 시 기존 활성 멤버 중 joining_uid 와 양방향 차단 관계가 있으면 거부한다 (§3.4).

    open 톡방은 입장 시 N-1 차단 검사를 생략(표시 필터만 적용)하므로 이 함수를 호출하지 않는다 —
    호출부(dm.py)가 conversation_type == 'group' 일 때만 부른다.
    """
    existing_member_ids = (
        await db.execute(
            select(DmConversationMember.user_id).where(
                DmConversationMember.conversation_id == conv_id,
                DmConversationMember.left_at.is_(None),
            )
        )
    ).scalars()
    member_ids = {uid for uid in existing_member_ids if uid != joining_uid}
    if not member_ids:
        return
    blocked = (
        await db.execute(
            select(UserBlock.blocker_id).where(
                or_(
                    (UserBlock.blocker_id == joining_uid) & (UserBlock.blocked_id.in_(member_ids)),
                    (UserBlock.blocked_id == joining_uid) & (UserBlock.blocker_id.in_(member_ids)),
                )
            )
        )
    ).first()
    if blocked is not None:
        raise HTTPException(status_code=403, detail="Conversation blocked")
