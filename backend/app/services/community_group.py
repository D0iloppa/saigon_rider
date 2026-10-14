"""커뮤니티 그룹 개설 공용 로직 — 앱(`routers/community_groups.py`)과 관리자 콘솔(`admin_api/community_groups.py`)이 공유."""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CommunityGroup, CommunityGroupMember, CommunityGroupTopic, DmConversation, DmConversationMember


async def require_active_topic(db: AsyncSession, code: str) -> None:
    ok = (
        await db.execute(
            select(CommunityGroupTopic.code).where(CommunityGroupTopic.code == code, CommunityGroupTopic.is_active)
        )
    ).scalar_one_or_none()
    if ok is None:
        raise HTTPException(status_code=422, detail={"code": "invalid_topic"})


async def create_group_with_room(
    db: AsyncSession,
    *,
    owner_id: uuid.UUID,
    name: str,
    description: str | None,
    cover_content_id: uuid.UUID | None,
    group_type: str,
    ward_id: int | None,
    district_id: int | None,
    join_policy: str,
    visibility: str,
    topic: str,
) -> CommunityGroup:
    """그룹 행 + 소유자 멤버십 + 오픈톡방(+방 소유자 멤버)을 만든다. commit 은 호출자 몫."""
    await require_active_topic(db, topic)
    now = datetime.now(UTC)
    group = CommunityGroup(
        name=name,
        description=description,
        cover_content_id=cover_content_id,
        group_type=group_type,
        ward_id=ward_id,
        district_id=district_id,
        join_policy=join_policy,
        visibility=visibility,
        topic=topic,
        owner_id=owner_id,
        member_count=1,
        created_at=now,
        updated_at=now,
    )
    db.add(group)
    await db.flush()

    db.add(CommunityGroupMember(group_id=group.id, user_id=owner_id, role="owner", status="ACTIVE", joined_at=now))

    # 그룹 개설과 동시에 오픈톡방 1개 자동 생성 (§4.2, P2-3) — dm.py create_group_conversation 패턴 재사용.
    conv = DmConversation(
        conversation_type="open",
        title=group.name,
        community_group_id=group.id,
        created_by=owner_id,
        member_count=1,
        last_message_at=now,
    )
    db.add(conv)
    await db.flush()
    db.add(
        DmConversationMember(conversation_id=conv.id, user_id=owner_id, role="owner", joined_at=now, last_read_at=now)
    )
    return group
