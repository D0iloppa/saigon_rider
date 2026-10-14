"""admin JSON API — 공식 그룹 관리 (공식 계정 ADMIN_USER_ID 소유 커뮤니티 그룹).

개설 로직은 앱 `POST /community/groups` 와 공용(`services/community_group.py`) — 소유자 멤버십 +
오픈톡방 자동 생성까지 동일. 하드 삭제는 없고 상태(ACTIVE/SUSPENDED)만 바꾼다.
"""

import os
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import CommunityGroup, CommunityGroupTopic
from ...schemas import Page
from ...services.community_group import create_group_with_room, require_active_topic
from ...utils import build_imgproxy_url
from ._audit import audit

router = APIRouter(prefix="/community-groups")

ADMIN_USER_ID = uuid.UUID(os.getenv("ADMIN_USER_ID", "00000000-0000-0000-0000-000000000001"))

JoinPolicy = Literal["open", "approval", "invite"]
Visibility = Literal["public", "private"]
GroupStatus = Literal["ACTIVE", "SUSPENDED"]


class AdminGroupTopic(BaseModel):
    code: str
    label_ko: str
    label_en: str
    label_vi: str


class AdminGroupRow(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    topic: str
    topic_label_ko: str | None
    join_policy: str
    visibility: str
    group_type: str
    status: str
    member_count: int
    post_count: int
    cover_content_id: uuid.UUID | None
    cover_url: str | None
    owner_id: uuid.UUID | None
    created_at: datetime


class AdminGroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = None
    topic: str
    join_policy: JoinPolicy = "open"
    visibility: Visibility = "public"
    group_type: Literal["interest"] = "interest"
    cover_content_id: uuid.UUID | None = None


class AdminGroupUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = None
    topic: str | None = None
    join_policy: JoinPolicy | None = None
    visibility: Visibility | None = None
    cover_content_id: uuid.UUID | None = None  # 명시적 null 이면 커버 제거
    status: GroupStatus | None = None


def _row(group: CommunityGroup) -> AdminGroupRow:
    return AdminGroupRow(
        id=group.id,
        name=group.name,
        description=group.description,
        topic=group.topic,
        topic_label_ko=group.topic_ref.label_ko if group.topic_ref else None,
        join_policy=group.join_policy,
        visibility=group.visibility,
        group_type=group.group_type,
        status=group.status,
        member_count=group.member_count,
        post_count=group.post_count,
        cover_content_id=group.cover_content_id,
        cover_url=build_imgproxy_url(group.cover_content.file_path) if group.cover_content else None,
        owner_id=group.owner_id,
        created_at=group.created_at,
    )


@router.get("/topics", response_model=list[AdminGroupTopic])
async def list_topics(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        (
            await db.execute(
                select(CommunityGroupTopic)
                .where(CommunityGroupTopic.is_active)
                .order_by(CommunityGroupTopic.sort_order, CommunityGroupTopic.code)
            )
        )
        .scalars()
        .all()
    )
    return [AdminGroupTopic(code=t.code, label_ko=t.label_ko, label_en=t.label_en, label_vi=t.label_vi) for t in rows]


@router.get("", response_model=Page[AdminGroupRow])
async def list_groups(
    owner: Literal["official", "all"] = "official",
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    base = select(CommunityGroup)
    count = select(func.count()).select_from(CommunityGroup)
    if owner == "official":
        base = base.where(CommunityGroup.owner_id == ADMIN_USER_ID)
        count = count.where(CommunityGroup.owner_id == ADMIN_USER_ID)
    total = (await db.execute(count)).scalar_one()
    groups = (
        (
            await db.execute(
                base.order_by(CommunityGroup.created_at.desc(), CommunityGroup.id.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )
    return Page(items=[_row(g) for g in groups], total=total, page=page, size=size)


@router.post("", response_model=AdminGroupRow, status_code=201)
async def create_group(
    body: AdminGroupCreateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    group = await create_group_with_room(
        db,
        owner_id=ADMIN_USER_ID,
        name=body.name,
        description=body.description,
        cover_content_id=body.cover_content_id,
        group_type=body.group_type,
        ward_id=None,
        district_id=None,
        join_policy=body.join_policy,
        visibility=body.visibility,
        topic=body.topic,
    )
    await audit(db, session, request, "COMMUNITY_GROUP_CREATE", "community_group", str(group.id), {"name": group.name})
    await db.commit()
    await db.refresh(group)
    return _row(group)


@router.put("/{group_id}", response_model=AdminGroupRow)
async def update_group(
    group_id: uuid.UUID,
    body: AdminGroupUpdateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(CommunityGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")

    changes = body.model_dump(exclude_unset=True)
    if body.topic is not None:
        await require_active_topic(db, body.topic)
    for field in ("name", "description", "topic", "join_policy", "visibility", "status"):
        if field in changes and (changes[field] is not None or field == "description"):
            setattr(group, field, changes[field])
    if "cover_content_id" in changes:
        group.cover_content_id = changes["cover_content_id"]
    group.updated_at = datetime.now(UTC)

    action = "COMMUNITY_GROUP_STATUS" if set(changes) == {"status"} else "COMMUNITY_GROUP_UPDATE"
    await audit(db, session, request, action, "community_group", str(group_id), {k: str(v) for k, v in changes.items()})
    await db.commit()
    await db.refresh(group)
    return _row(group)
