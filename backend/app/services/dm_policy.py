import uuid

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DmConversation, DmConversationBan, DmConversationMember, UserBlock, UserFollow


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


def require_manager(member: DmConversationMember) -> None:
    """방 운영진(개설자 owner / 관리자 admin)만 통과시킨다 — 강퇴·밴·관리자 임명 공통 가드."""
    if member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owner/admin can do this")


async def require_not_banned(db: AsyncSession, conv_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """블랙리스트(212_dm_conversation_bans.sql)에 오른 사용자의 입장·재초대를 거부한다.

    강퇴(`DmConversationMember.left_at`)와 구분된다 — 강퇴당한 사람은 운영진이 다시 초대하면
    복귀할 수 있지만(대표 지시 2026-08-28), 밴은 해제 전까지 초대로도 들어올 수 없다.
    """
    banned = (
        await db.execute(
            select(DmConversationBan.user_id).where(
                DmConversationBan.conversation_id == conv_id,
                DmConversationBan.user_id == user_id,
            )
        )
    ).first()
    if banned is not None:
        raise HTTPException(status_code=403, detail="User is banned from this conversation")


async def require_invite_eligible(db: AsyncSession, inviter_id: uuid.UUID, target_id: uuid.UUID) -> None:
    """초대 자격: **초대하는 사람이 대상을 팔로우 중**이어야 한다 (대표 지시 2026-08-28).

    종전엔 서버가 관계를 전혀 검증하지 않아, 클라이언트가 맞팔만 보여주는 것과 무관하게
    API 로는 아무나 그룹에 넣을 수 있었다. 맞팔(친구)은 팔로잉의 부분집합이라 함께 통과한다.
    """
    following = (
        await db.execute(
            select(UserFollow.following_id).where(
                UserFollow.follower_id == inviter_id,
                UserFollow.following_id == target_id,
            )
        )
    ).first()
    if following is None:
        raise HTTPException(status_code=403, detail="You can only invite users you follow")


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
