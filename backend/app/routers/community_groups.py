import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import optional_user_session, verify_user_session
from ..models import (
    CommunityGroup,
    CommunityGroupInvite,
    CommunityGroupMember,
    DmConversation,
    DmConversationBan,
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
    DmConversationCreateRequest,
    DmMessageCreateRequest,
    GroupInviteCandidateOut,
    GroupInviteResultOut,
    GroupInviteSendOut,
    GroupInviteSendRequest,
    GroupInviteStateOut,
    Page,
)
from ..utils import build_imgproxy_url, resolve_avatar_url
from .dm import create_conversation, send_message
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
    q: str | None = None,  # 이름·설명 부분일치 검색 (F-CM-02 FR-1 r14)
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    offset = (page - 1) * size
    base_q = select(CommunityGroup).where(CommunityGroup.status == "ACTIVE")
    count_q = select(func.count()).select_from(CommunityGroup).where(CommunityGroup.status == "ACTIVE")

    keyword = (q or "").strip()
    if keyword:
        escaped = keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        cond = CommunityGroup.name.ilike(like, escape="\\") | CommunityGroup.description.ilike(like, escape="\\")
        base_q = base_q.where(cond)
        count_q = count_q.where(cond)

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
        if (membership is None or membership.status != "ACTIVE") and not await _has_pending_invite(
            db, group.id, session_uid
        ):
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

    await _join_with_status(db, group, _session_uid, "ACTIVE" if group.join_policy == "open" else "PENDING")
    await db.commit()
    await db.refresh(group)
    return await _group_out(db, group, _session_uid)


async def _join_with_status(db: AsyncSession, group: CommunityGroup, user_id: uuid.UUID, target_status: str) -> None:
    """가입 공통 경로 (직접 가입 / 초대 수락). 정책 판정은 호출부 몫이고 여기선 차단·밴 검사 + 멤버 행 + 공식 채팅 합류만."""
    blocked = (
        await db.execute(
            select(UserBlock).where(
                ((UserBlock.blocker_id == group.owner_id) & (UserBlock.blocked_id == user_id))
                | ((UserBlock.blocker_id == user_id) & (UserBlock.blocked_id == group.owner_id))
            )
        )
    ).scalar_one_or_none()
    if blocked is not None:
        raise HTTPException(status_code=403, detail="Blocked")

    now = datetime.now(UTC)
    member = await _my_membership(db, group.id, user_id)
    was_active = member is not None and member.status == "ACTIVE"

    if member is None:
        db.add(
            CommunityGroupMember(group_id=group.id, user_id=user_id, role="member", status=target_status, joined_at=now)
        )
        if target_status == "ACTIVE":
            group.member_count += 1
    elif member.status == "BANNED":
        raise HTTPException(status_code=403, detail="Banned from this group")
    elif member.status == "PENDING":
        if target_status == "ACTIVE":  # 초대 수락(초대전용 그룹) — 대기 행은 승격
            member.status = "ACTIVE"
            group.member_count += 1
    else:
        pass  # 이미 ACTIVE — 멱등

    if target_status == "ACTIVE" and not was_active:
        await _add_open_conversation_member(db, group.id, user_id)


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


# ── 그룹 초대 (대표 판정 260929) ─────────────────────────────────────


async def _has_pending_invite(db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID | None) -> bool:
    if user_id is None:
        return False
    return (
        await db.execute(
            select(CommunityGroupInvite.id).where(
                CommunityGroupInvite.group_id == group_id,
                CommunityGroupInvite.invitee_id == user_id,
                CommunityGroupInvite.status == "pending",
            )
        )
    ).first() is not None


async def _may_invite(db: AsyncSession, group: CommunityGroup, user_id: uuid.UUID) -> bool:
    """ACTIVE 멤버면 누구나, 초대전용(invite) 그룹은 owner/manager 만."""
    if group.status != "ACTIVE":
        return False
    m = await _my_membership(db, group.id, user_id)
    if m is None or m.status != "ACTIVE":
        return False
    return group.join_policy != "invite" or m.role in _MANAGE_ROLES


async def _require_inviter(db: AsyncSession, group: CommunityGroup, user_id: uuid.UUID) -> None:
    if not await _may_invite(db, group, user_id):
        raise HTTPException(status_code=403, detail={"code": "invite_forbidden"})


def _related_user_cond(me: uuid.UUID):
    """초대 후보 = 내가 팔로우하는 사람 + 나를 팔로우하는 사람 + 1:1(direct) DM 상대 (전역 검색 없음)."""
    following = select(UserFollow.following_id).where(UserFollow.follower_id == me)
    followers = select(UserFollow.follower_id).where(UserFollow.following_id == me)
    dm_partners = select(
        case((DmConversation.participant_1 == me, DmConversation.participant_2), else_=DmConversation.participant_1)
    ).where(
        DmConversation.conversation_type == "direct",
        or_(DmConversation.participant_1 == me, DmConversation.participant_2 == me),
    )
    return or_(User.id.in_(following), User.id.in_(followers), User.id.in_(dm_partners))


def _not_blocked_cond(me: uuid.UUID):
    blocked = select(UserBlock.blocked_id).where(UserBlock.blocker_id == me)
    blocking = select(UserBlock.blocker_id).where(UserBlock.blocked_id == me)
    return User.id.notin_(blocked) & User.id.notin_(blocking)


async def _invite_states(db: AsyncSession, group_id: uuid.UUID, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    members = dict(
        (
            await db.execute(
                select(CommunityGroupMember.user_id, CommunityGroupMember.status).where(
                    CommunityGroupMember.group_id == group_id, CommunityGroupMember.user_id.in_(user_ids)
                )
            )
        ).all()
    )
    invited = set(
        (
            await db.execute(
                select(CommunityGroupInvite.invitee_id).where(
                    CommunityGroupInvite.group_id == group_id,
                    CommunityGroupInvite.invitee_id.in_(user_ids),
                    CommunityGroupInvite.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )
    states: dict[uuid.UUID, str] = {}
    for uid in user_ids:
        ms = members.get(uid)
        if ms == "ACTIVE":
            states[uid] = "member"
        elif ms == "PENDING":
            states[uid] = "pending_request"
        elif ms == "BANNED":
            states[uid] = "banned"
        elif uid in invited:
            states[uid] = "invited"
        else:
            states[uid] = "invitable"
    return states


@router.get(
    "/{group_id}/invite-candidates", response_model=list[GroupInviteCandidateOut], summary="초대 후보 (관계 기반)"
)
async def list_invite_candidates(
    group_id: uuid.UUID,
    q: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    group = await _resolve_group(db, str(group_id))
    await _require_inviter(db, group, _session_uid)

    stmt = select(User).where(
        User.status == "ACTIVE",
        User.id != _session_uid,
        _related_user_cond(_session_uid),
        _not_blocked_cond(_session_uid),
    )
    keyword = (q or "").strip()
    if keyword:
        escaped = keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(User.nickname.ilike(f"%{escaped}%", escape="\\"))
    users = (await db.execute(stmt.order_by(User.nickname.asc()).limit(max(1, min(limit, 100))))).scalars().all()

    states = await _invite_states(db, group.id, [u.id for u in users])
    return [
        GroupInviteCandidateOut(user_id=u.id, nickname=u.nickname, avatar_url=resolve_avatar_url(u), state=states[u.id])
        for u in users
        if states[u.id] != "banned"
    ]


@router.post("/{group_id}/invites", response_model=GroupInviteSendOut, summary="그룹 초대 보내기 (1:1 DM 카드)")
async def send_invites(
    group_id: uuid.UUID,
    body: GroupInviteSendRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    group = await _resolve_group(db, str(group_id))
    await _require_inviter(db, group, _session_uid)
    gid = group.id

    user_ids = list(dict.fromkeys(body.user_ids))
    allowed = set(
        (
            await db.execute(
                select(User.id).where(
                    User.id.in_(user_ids),
                    User.status == "ACTIVE",
                    User.id != _session_uid,
                    _related_user_cond(_session_uid),
                    _not_blocked_cond(_session_uid),
                )
            )
        )
        .scalars()
        .all()
    )
    states = await _invite_states(db, gid, list(allowed))

    results: list[GroupInviteResultOut] = []
    for uid in user_ids:
        if uid not in allowed:
            results.append(GroupInviteResultOut(user_id=uid, result="skipped", reason="not_candidate"))
            continue
        if states[uid] != "invitable":
            reason = "member" if states[uid] == "banned" else states[uid]
            results.append(GroupInviteResultOut(user_id=uid, result="skipped", reason=reason))
            continue
        try:
            # 앱이 1:1 DM 을 여는 것과 같은 경로(create_conversation: get-or-create + 차단 검사)와
            # 메시지 전송 경로(send_message: 카드 검증·푸시 이벤트)를 그대로 태운다.
            conv = await create_conversation(
                DmConversationCreateRequest(other_user_id=uid), db, _session_uid, (None, None)
            )
            invite = CommunityGroupInvite(group_id=gid, inviter_id=_session_uid, invitee_id=uid)
            db.add(invite)
            await db.flush()
            await send_message(
                conv.id,
                DmMessageCreateRequest(
                    message_type="card", meta={"subtype": "group_invite", "inviteId": str(invite.id)}
                ),
                db,
                _session_uid,
            )
            results.append(GroupInviteResultOut(user_id=uid, result="sent"))
        except HTTPException:
            await db.rollback()
            results.append(GroupInviteResultOut(user_id=uid, result="skipped", reason="unavailable"))
    return GroupInviteSendOut(results=results)


async def _load_invite(db: AsyncSession, group: CommunityGroup, invite_id: uuid.UUID) -> CommunityGroupInvite:
    invite = await db.get(CommunityGroupInvite, invite_id)
    if invite is None or invite.group_id != group.id:
        raise HTTPException(status_code=404, detail={"code": "invite_not_found"})
    return invite


@router.get(
    "/{group_id}/invites/{invite_id}",
    response_model=GroupInviteStateOut,
    summary="초대 카드 상태 (초대자/초대받는 사람)",
)
async def get_invite_state(
    group_id: uuid.UUID,
    invite_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    group = await _resolve_group(db, str(group_id))
    invite = await _load_invite(db, group, invite_id)
    if _session_uid not in (invite.inviter_id, invite.invitee_id):
        raise HTTPException(status_code=404, detail={"code": "invite_not_found"})
    return GroupInviteStateOut(
        invite_id=invite.id,
        status=invite.status,
        is_invitee=invite.invitee_id == _session_uid,
        group=await _group_out(db, group, _session_uid),
    )


@router.post(
    "/{group_id}/invites/{invite_id}/accept", response_model=CommunityGroupOut, summary="초대 수락 (가입 정책별)"
)
async def accept_invite(
    group_id: uuid.UUID,
    invite_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """open → ACTIVE / approval → 승인 대기(PENDING, 초대가 승인을 우회하지 않음) / invite → ACTIVE(유일한 진입 경로).
    승인제여도 수락 시점에 초대는 accepted 로 닫는다(대기 상태는 멤버십 PENDING 이 표현)."""
    group = await _resolve_group(db, str(group_id))
    invite = await _load_invite(db, group, invite_id)
    if invite.invitee_id != _session_uid:
        raise HTTPException(status_code=404, detail={"code": "invite_not_found"})
    if invite.status == "accepted":
        return await _group_out(db, group, _session_uid)  # 멱등
    if invite.status != "pending" or group.status != "ACTIVE":
        raise HTTPException(status_code=409, detail={"code": "invite_not_pending"})
    # 초대 이후 초대자가 강퇴·권한 상실했으면 초대는 무효 (초대전용 그룹 우회 차단)
    if not await _may_invite(db, group, invite.inviter_id):
        invite.status = "revoked"
        invite.responded_at = datetime.now(UTC)
        await db.commit()
        raise HTTPException(status_code=409, detail={"code": "invite_not_pending"})

    await _join_with_status(db, group, _session_uid, "PENDING" if group.join_policy == "approval" else "ACTIVE")
    invite.status = "accepted"
    invite.responded_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(group)
    return await _group_out(db, group, _session_uid)


async def _add_open_conversation_member(db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """그룹 멤버 승인/가입 시 그룹 공식 채팅방에도 반영. 공식 채널이므로 알림 켜진 상태로 시작(대표 판정 260929)."""
    conv = (
        await db.execute(select(DmConversation).where(DmConversation.community_group_id == group_id))
    ).scalar_one_or_none()
    if conv is None:
        return
    # 방 블랙리스트는 이 경로로도 뚫리면 안 된다 — 밴당한 사용자가 커뮤니티 그룹을 탈퇴했다가
    # 재가입하면 여기서 left_at 이 되살아나 밴이 무력화된다(join_open_conversation 만 막아서는
    # 부족하다). 밴된 사용자는 그룹 멤버십과 무관하게 오픈톡방에 넣지 않는다.
    banned = (
        await db.execute(
            select(DmConversationBan.user_id).where(
                DmConversationBan.conversation_id == conv.id,
                DmConversationBan.user_id == user_id,
            )
        )
    ).first()
    if banned is not None:
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
                conversation_id=conv.id, user_id=user_id, role="member", joined_at=now, last_read_at=now
            )
        )
        conv.member_count += 1
    elif member.left_at is not None:
        member.left_at = None
        member.joined_at = now
        member.last_read_at = now
        member.muted_at = None
        conv.member_count += 1
