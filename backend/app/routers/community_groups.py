import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import optional_user_session, verify_user_session
from ..models import (
    CommunityGroup,
    CommunityGroupMember,
    DmConversation,
    DmConversationMember,
    FeedPost,
    RideSession,
    User,
    UserBlock,
    UserFollow,
)
from ..schemas import (
    CommunityGroupCreateRequest,
    CommunityGroupMemberOut,
    CommunityGroupOut,
    CommunityGroupPatchRequest,
    Page,
)
from ..utils import build_imgproxy_url, resolve_avatar_url
from .feed import FeedPageOut, _enrich

router = APIRouter(prefix="/community/groups", tags=["커뮤니티 그룹 (Community Group)"])

_MANAGE_ROLES = ("owner", "manager")


async def _resolve_group(db: AsyncSession, id_or_slug: str) -> CommunityGroup:
    group = None
    try:
        gid = uuid.UUID(id_or_slug)
    except ValueError:
        gid = None
    if gid is not None:
        group = (await db.execute(select(CommunityGroup).where(CommunityGroup.id == gid))).scalar_one_or_none()
    if group is None:
        group = (await db.execute(select(CommunityGroup).where(CommunityGroup.slug == id_or_slug))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


async def _my_membership(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID | None
) -> CommunityGroupMember | None:
    if user_id is None:
        return None
    return (
        await db.execute(
            select(CommunityGroupMember).where(
                CommunityGroupMember.group_id == group_id, CommunityGroupMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()


async def _group_out(db: AsyncSession, group: CommunityGroup, session_uid: uuid.UUID | None) -> CommunityGroupOut:
    membership = await _my_membership(db, group.id, session_uid)
    conv = (
        await db.execute(select(DmConversation.id).where(DmConversation.community_group_id == group.id))
    ).scalar_one_or_none()
    cover_url = build_imgproxy_url(group.cover_content.file_path) if group.cover_content else None
    return CommunityGroupOut(
        id=group.id,
        slug=group.slug,
        name=group.name,
        description=group.description,
        cover_url=cover_url,
        group_type=group.group_type,
        ward_id=group.ward_id,
        district_id=group.district_id,
        join_policy=group.join_policy,
        visibility=group.visibility,
        owner_id=group.owner_id,
        member_count=group.member_count,
        post_count=group.post_count,
        status=group.status,
        created_at=group.created_at,
        my_membership_status=membership.status if membership else None,
        my_role=membership.role if membership else None,
        conversation_id=conv,
    )


@router.post("", response_model=CommunityGroupOut, status_code=201, summary="그룹 개설")
async def create_group(
    body: CommunityGroupCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    now = datetime.now(UTC)
    group = CommunityGroup(
        name=body.name,
        description=body.description,
        cover_content_id=body.cover_content_id,
        group_type=body.group_type,
        ward_id=body.ward_id,
        district_id=body.district_id,
        join_policy=body.join_policy,
        visibility=body.visibility,
        owner_id=_session_uid,
        member_count=1,
        created_at=now,
        updated_at=now,
    )
    db.add(group)
    await db.flush()

    db.add(CommunityGroupMember(group_id=group.id, user_id=_session_uid, role="owner", status="ACTIVE", joined_at=now))

    # 그룹 개설과 동시에 오픈톡방 1개 자동 생성 (§4.2, P2-3) — dm.py create_group_conversation 패턴 재사용.
    conv = DmConversation(
        conversation_type="open",
        title=group.name,
        community_group_id=group.id,
        created_by=_session_uid,
        member_count=1,
        last_message_at=now,
    )
    db.add(conv)
    await db.flush()
    db.add(
        DmConversationMember(
            conversation_id=conv.id, user_id=_session_uid, role="owner", joined_at=now, last_read_at=now
        )
    )

    await db.commit()
    await db.refresh(group)
    return await _group_out(db, group, _session_uid)


@router.get("", response_model=Page[CommunityGroupOut], summary="그룹 탐색 목록")
async def list_groups(
    filter: str = "all",  # 'all' | 'mine'
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    offset = (page - 1) * size
    base_q = select(CommunityGroup).where(CommunityGroup.status == "ACTIVE")
    count_q = select(func.count()).select_from(CommunityGroup).where(CommunityGroup.status == "ACTIVE")

    if filter == "mine":
        if session_uid is None:
            raise HTTPException(status_code=401, detail="Login required")
        my_group_ids = select(CommunityGroupMember.group_id).where(
            CommunityGroupMember.user_id == session_uid, CommunityGroupMember.status == "ACTIVE"
        )
        base_q = base_q.where(CommunityGroup.id.in_(my_group_ids))
        count_q = count_q.where(CommunityGroup.id.in_(my_group_ids))
    else:
        # 공개 탐색은 public 그룹만 (private 그룹은 초대/직접 링크로만 도달 — 비멤버 노출 금지)
        base_q = base_q.where(CommunityGroup.visibility == "public")
        count_q = count_q.where(CommunityGroup.visibility == "public")

    total = (await db.execute(count_q)).scalar_one()
    rows = (
        (await db.execute(base_q.order_by(CommunityGroup.member_count.desc()).offset(offset).limit(size)))
        .scalars()
        .all()
    )
    items = [await _group_out(db, g, session_uid) for g in rows]
    return Page(items=items, total=total, page=page, size=size)


@router.get("/recommended", response_model=list[CommunityGroupOut], summary="그룹 추천 (동네+팔로우 기반, P4-1)")
async def get_recommended_groups(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """추천 순위: ① 팔로우한 사람이 속한 그룹(멤버 수 가중) ② 내 동네(home_ward_id) 그룹 ③ 인기순.
    공개(public) + 활성(ACTIVE) 그룹만 후보로 삼는다(Q-10 — 비멤버에게 private 그룹 노출 금지).
    이미 가입/신청/차단된 그룹, 나와 상호 차단 관계인 소유자의 그룹은 제외한다.
    """
    user = await db.get(User, _session_uid)

    already_related = select(CommunityGroupMember.group_id).where(CommunityGroupMember.user_id == _session_uid)
    blocked_owners = select(UserBlock.blocked_id).where(UserBlock.blocker_id == _session_uid)
    blocking_owners = select(UserBlock.blocker_id).where(UserBlock.blocked_id == _session_uid)

    followed_member_counts = (
        select(CommunityGroupMember.group_id, func.count().label("cnt"))
        .join(UserFollow, UserFollow.following_id == CommunityGroupMember.user_id)
        .where(UserFollow.follower_id == _session_uid, CommunityGroupMember.status == "ACTIVE")
        .group_by(CommunityGroupMember.group_id)
        .subquery()
    )

    score = func.coalesce(followed_member_counts.c.cnt, 0) * 10 + case(
        (CommunityGroup.ward_id == (user.home_ward_id if user else None), 5), else_=0
    )

    rows = (
        (
            await db.execute(
                select(CommunityGroup)
                .outerjoin(followed_member_counts, followed_member_counts.c.group_id == CommunityGroup.id)
                .where(
                    CommunityGroup.status == "ACTIVE",
                    CommunityGroup.visibility == "public",
                    CommunityGroup.id.notin_(already_related),
                    CommunityGroup.owner_id.is_(None)
                    | (
                        CommunityGroup.owner_id.notin_(blocked_owners) & CommunityGroup.owner_id.notin_(blocking_owners)
                    ),
                )
                .order_by(score.desc(), CommunityGroup.member_count.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [await _group_out(db, g, _session_uid) for g in rows]


@router.get("/{id_or_slug}", response_model=CommunityGroupOut, summary="그룹 상세")
async def get_group(
    id_or_slug: str,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    group = await _resolve_group(db, id_or_slug)
    if group.visibility == "private":
        membership = await _my_membership(db, group.id, session_uid)
        if membership is None or membership.status != "ACTIVE":
            raise HTTPException(status_code=404, detail="Group not found")
    return await _group_out(db, group, session_uid)


@router.patch("/{group_id}", response_model=CommunityGroupOut, summary="그룹 수정 (owner/manager)")
async def update_group(
    group_id: uuid.UUID,
    body: CommunityGroupPatchRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    group = await _resolve_group(db, str(group_id))
    membership = await _my_membership(db, group.id, _session_uid)
    if membership is None or membership.status != "ACTIVE" or membership.role not in _MANAGE_ROLES:
        raise HTTPException(status_code=403, detail="Only owner/manager can edit this group")

    if body.name is not None:
        group.name = body.name
    if body.description is not None:
        group.description = body.description
    if body.join_policy is not None:
        if body.join_policy not in ("open", "approval", "invite"):
            raise HTTPException(status_code=422, detail="Invalid join_policy")
        group.join_policy = body.join_policy
    if body.visibility is not None:
        if body.visibility not in ("public", "private"):
            raise HTTPException(status_code=422, detail="Invalid visibility")
        group.visibility = body.visibility
    if body.cover_content_id is not None:
        group.cover_content_id = body.cover_content_id
    group.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(group)
    return await _group_out(db, group, _session_uid)


@router.post("/{group_id}/join", response_model=CommunityGroupOut, summary="그룹 가입")
async def join_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    group = await _resolve_group(db, str(group_id))
    if group.join_policy == "invite":
        raise HTTPException(status_code=400, detail="This group requires an invite")

    blocked = (
        await db.execute(
            select(UserBlock).where(
                ((UserBlock.blocker_id == group.owner_id) & (UserBlock.blocked_id == _session_uid))
                | ((UserBlock.blocker_id == _session_uid) & (UserBlock.blocked_id == group.owner_id))
            )
        )
    ).scalar_one_or_none()
    if blocked is not None:
        raise HTTPException(status_code=403, detail="Blocked")

    now = datetime.now(UTC)
    member = await _my_membership(db, group.id, _session_uid)
    target_status = "ACTIVE" if group.join_policy == "open" else "PENDING"

    if member is None:
        db.add(
            CommunityGroupMember(
                group_id=group.id, user_id=_session_uid, role="member", status=target_status, joined_at=now
            )
        )
        if target_status == "ACTIVE":
            group.member_count += 1
    elif member.status == "BANNED":
        raise HTTPException(status_code=403, detail="Banned from this group")
    elif member.status == "PENDING":
        pass  # 이미 승인 대기 — 멱등
    else:
        pass  # 이미 ACTIVE — 멱등

    if target_status == "ACTIVE" and (member is None or member.status != "ACTIVE"):
        await _add_open_conversation_member(db, group.id, _session_uid)

    await db.commit()
    await db.refresh(group)
    return await _group_out(db, group, _session_uid)


@router.post(
    "/{group_id}/members/{user_id}/approve", response_model=CommunityGroupOut, summary="가입 승인 (owner/manager)"
)
async def approve_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    group = await _resolve_group(db, str(group_id))
    actor = await _my_membership(db, group.id, _session_uid)
    if actor is None or actor.status != "ACTIVE" or actor.role not in _MANAGE_ROLES:
        raise HTTPException(status_code=403, detail="Only owner/manager can approve members")

    target = await _my_membership(db, group.id, user_id)
    if target is None or target.status != "PENDING":
        raise HTTPException(status_code=404, detail="No pending membership for this user")

    target.status = "ACTIVE"
    group.member_count += 1
    await _add_open_conversation_member(db, group.id, user_id)

    await db.commit()
    await db.refresh(group)
    return await _group_out(db, group, _session_uid)


@router.delete("/{group_id}/members/{user_id}", summary="탈퇴 또는 강퇴")
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    group = await _resolve_group(db, str(group_id))
    actor = await _my_membership(db, group.id, _session_uid)
    if actor is None or actor.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Not a member of this group")
    is_self = user_id == _session_uid
    if not is_self and actor.role not in _MANAGE_ROLES:
        raise HTTPException(status_code=403, detail="Only owner/manager can remove other members")

    target = await _my_membership(db, group.id, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    was_active = target.status == "ACTIVE"
    await db.delete(target)
    if was_active:
        group.member_count = max(group.member_count - 1, 0)

    # 그룹 탈퇴/강퇴 시 오픈톡방 멤버십도 함께 끊는다 (알림 연동 필수 — dm.py remove_member 패턴).
    conv_id = (
        await db.execute(select(DmConversation.id).where(DmConversation.community_group_id == group.id))
    ).scalar_one_or_none()
    if conv_id is not None:
        conv_member = (
            await db.execute(
                select(DmConversationMember).where(
                    DmConversationMember.conversation_id == conv_id,
                    DmConversationMember.user_id == user_id,
                    DmConversationMember.left_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if conv_member is not None:
            conv_member.left_at = datetime.now(UTC)
            conv = await db.get(DmConversation, conv_id)
            if conv is not None:
                conv.member_count = max(conv.member_count - 1, 0)

    await db.commit()
    return {"ok": True}


@router.get("/{group_id}/members", response_model=list[CommunityGroupMemberOut], summary="멤버 목록")
async def list_members(
    group_id: uuid.UUID,
    status: str = "active",  # 'active' | 'pending' — pending 은 owner/manager 전용
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    group = await _resolve_group(db, str(group_id))
    actor = await _my_membership(db, group.id, _session_uid)
    if actor is None or actor.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Not a member of this group")

    if status == "pending":
        if actor.role not in _MANAGE_ROLES:
            raise HTTPException(status_code=403, detail="Only owner/manager can view pending members")
        member_status = "PENDING"
    elif status == "active":
        member_status = "ACTIVE"
    else:
        raise HTTPException(status_code=422, detail="Invalid status")

    rows = (
        await db.execute(
            select(CommunityGroupMember, User)
            .join(User, CommunityGroupMember.user_id == User.id)
            .where(CommunityGroupMember.group_id == group.id, CommunityGroupMember.status == member_status)
            .order_by(CommunityGroupMember.joined_at.asc())
        )
    ).all()
    return [
        CommunityGroupMemberOut(
            user_id=m.user_id,
            nickname=u.nickname,
            avatar_url=resolve_avatar_url(u),
            role=m.role,
            status=m.status,
            joined_at=m.joined_at,
        )
        for m, u in rows
    ]


@router.get("/{group_id}/posts", response_model=FeedPageOut, summary="그룹 게시판")
async def list_group_posts(
    group_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    """멤버십 검사 후 그룹 글 노출. public/private 무관하게 그룹 멤버(ACTIVE)만 접근."""
    group = await _resolve_group(db, str(group_id))
    membership = await _my_membership(db, group.id, session_uid)
    if membership is None or membership.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Not an active member of this group")

    offset = (page - 1) * size
    base_q = (
        select(FeedPost, User, RideSession)
        .outerjoin(User, FeedPost.user_id == User.id)
        .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
        .where(FeedPost.group_id == group.id)
    )
    count_q = select(func.count()).select_from(FeedPost).where(FeedPost.group_id == group.id)

    total = (await db.execute(count_q)).scalar_one()
    rows = (
        await db.execute(base_q.order_by(FeedPost.created_at.desc(), FeedPost.id.desc()).offset(offset).limit(size))
    ).all()
    items = [await _enrich(post, user, ride, db) for post, user, ride in rows]
    return FeedPageOut(items=items, total=total, page=page, size=size, has_more=offset + len(items) < total)


async def _add_open_conversation_member(db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """그룹 멤버 승인/가입 시 오픈톡방에도 반영 (join_open_conversation 과 동일 패턴, 기본 muted)."""
    conv = (
        await db.execute(select(DmConversation).where(DmConversation.community_group_id == group_id))
    ).scalar_one_or_none()
    if conv is None:
        return
    now = datetime.now(UTC)
    member = (
        await db.execute(
            select(DmConversationMember).where(
                DmConversationMember.conversation_id == conv.id, DmConversationMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    if member is None:
        db.add(
            DmConversationMember(
                conversation_id=conv.id, user_id=user_id, role="member", joined_at=now, last_read_at=now, muted_at=now
            )
        )
        conv.member_count += 1
    elif member.left_at is not None:
        member.left_at = None
        member.joined_at = now
        member.last_read_at = now
        member.muted_at = now
        conv.member_count += 1
