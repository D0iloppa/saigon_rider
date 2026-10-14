"""admin JSON API — 커뮤니티 피드 모더레이션 + 공식계정 작성.

`admin_legacy.py`의 `admin_feed_list`/`admin_feed_delete`(780-1053행)를 JSON 응답으로
이관했고, 같은 파일의 작성/수정 로직(`admin_feed_create`/`admin_feed_update`,
937-1051행)도 1:1로 이관했다 — 공통 계정(ADMIN_USER_ID)으로 게시하는 것은 동일하며,
멀티파트 업로드 대신 다른 admin JSON API(POI/배지)와 동일하게 이미 업로드된
`contents.id`(UUID)를 입력받는 방식으로 포팅했다. 구 `/admin-legacy/*` 라우트는
손대지 않고 병행 유지한다.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import ADMIN_USER_ID, AdminSession, verify_admin_api
from ...database import get_db
from ...models import CommunityGroup, CommunityGroupMember, FeedPost, FeedPostImage, PostComment, PostHashtag, User
from ...schemas import Page
from ...services.feed_post_effects import apply_post_created_effects, extract_hashtags
from ...services.search_index import immediate_blob
from ...services.translate import warm_translations
from ...utils import default_avatar_url, resolve_avatar_url
from ..feed import _resolve_image_urls
from ._audit import audit

router = APIRouter(prefix="/community")

# admin_legacy.py 와 동일한 공통계정 (공식 피드 게시자)


class FeedAuthorBrief(BaseModel):
    id: uuid.UUID
    nickname: str | None
    avatar_url: str


class AdminFeedRow(BaseModel):
    id: uuid.UUID
    author: FeedAuthorBrief
    content: str | None
    thumbnail_url: str | None
    image_count: int
    group_id: uuid.UUID | None
    group_name: str | None
    like_count: int
    comment_count: int
    is_story: bool
    created_at: datetime


class AdminFeedDetail(BaseModel):
    id: uuid.UUID
    author: FeedAuthorBrief
    content: str | None
    image_urls: list[str]
    image_content_ids: list[uuid.UUID]
    group_id: uuid.UUID | None
    group_name: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    district_name: str | None
    like_count: int
    comment_count: int
    is_story: bool
    created_at: datetime
    updated_at: datetime


class FeedWriteRequest(BaseModel):
    content: str | None = None
    is_story: bool = False
    image_content_ids: list[uuid.UUID] = []
    group_id: uuid.UUID | None = None  # 공식 계정이 멤버인 그룹만, None = 전체 피드


class AdminCommentRow(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    author: FeedAuthorBrief
    parent_id: uuid.UUID | None
    content: str | None
    has_image: bool
    like_count: int
    created_at: datetime


def _author_brief(user: User | None, user_id: uuid.UUID) -> FeedAuthorBrief:
    return FeedAuthorBrief(
        id=user_id,
        nickname=user.nickname if user else None,
        avatar_url=resolve_avatar_url(user) if user else default_avatar_url(seed=str(user_id)),
    )


async def _group_names(db: AsyncSession, group_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not group_ids:
        return {}
    rows = (
        await db.execute(select(CommunityGroup.id, CommunityGroup.name).where(CommunityGroup.id.in_(group_ids)))
    ).all()
    return {gid: name for gid, name in rows}


async def _require_official_group(db: AsyncSession, group_id: uuid.UUID) -> CommunityGroup:
    group = await db.get(CommunityGroup, group_id)
    member = await db.get(CommunityGroupMember, (group_id, ADMIN_USER_ID))
    if group is None or group.status != "ACTIVE" or member is None or member.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="group must be one the official account is a member of")
    return group


def _feed_row(post: FeedPost, user: User | None, group_names: dict[uuid.UUID, str]) -> AdminFeedRow:
    image_urls = _resolve_image_urls(post)
    return AdminFeedRow(
        id=post.id,
        author=_author_brief(user, post.user_id),
        content=post.content,
        thumbnail_url=image_urls[0] if image_urls else None,
        image_count=len(image_urls),
        group_id=post.group_id,
        group_name=group_names.get(post.group_id) if post.group_id else None,
        like_count=post.like_count,
        comment_count=post.comment_count,
        is_story=post.is_story,
        created_at=post.created_at,
    )


async def _get_post_or_404(db: AsyncSession, post_id: uuid.UUID) -> FeedPost:
    post = await db.get(FeedPost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Feed post not found")
    return post


@router.get("/feed", response_model=Page[AdminFeedRow])
async def list_feed(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count()).select_from(FeedPost))).scalar_one()
    rows = (
        await db.execute(
            select(FeedPost, User)
            .outerjoin(User, FeedPost.user_id == User.id)
            .order_by(FeedPost.created_at.desc(), FeedPost.id.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()
    group_names = await _group_names(db, {post.group_id for post, _ in rows if post.group_id})
    items = [_feed_row(post, user, group_names) for post, user in rows]
    return Page(items=items, total=total, page=page, size=size)


async def _feed_detail(db: AsyncSession, post: FeedPost) -> AdminFeedDetail:
    user = await db.get(User, post.user_id)
    return AdminFeedDetail(
        id=post.id,
        author=_author_brief(user, post.user_id),
        content=post.content,
        image_urls=_resolve_image_urls(post),
        image_content_ids=[img.content_id for img in post.images or []],
        group_id=post.group_id,
        group_name=(await _group_names(db, {post.group_id})).get(post.group_id) if post.group_id else None,
        latitude=post.latitude,
        longitude=post.longitude,
        district_name=post.district.name_ko if post.district else None,
        like_count=post.like_count,
        comment_count=post.comment_count,
        is_story=post.is_story,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


@router.get("/feed/{post_id}", response_model=AdminFeedDetail)
async def get_feed_post(
    post_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    post = await _get_post_or_404(db, post_id)
    return await _feed_detail(db, post)


@router.get("/feed/{post_id}/comments", response_model=list[AdminCommentRow])
async def list_feed_comments(
    post_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    await _get_post_or_404(db, post_id)
    rows = (
        await db.execute(
            select(PostComment, User)
            .outerjoin(User, PostComment.user_id == User.id)
            .where(PostComment.post_id == post_id)
            .order_by(PostComment.created_at.asc())
        )
    ).all()
    return [
        AdminCommentRow(
            id=comment.id,
            post_id=comment.post_id,
            author=_author_brief(user, comment.user_id),
            parent_id=comment.parent_id,
            content=comment.content,
            has_image=bool(comment.image_url),
            like_count=comment.like_count,
            created_at=comment.created_at,
        )
        for comment, user in rows
    ]


@router.post("/feed", response_model=AdminFeedDetail, status_code=201)
async def create_feed_post(
    body: FeedWriteRequest,
    request: Request,
    background: BackgroundTasks,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    text_body = (body.content or "").strip() or None
    if not text_body and not body.image_content_ids:
        raise HTTPException(status_code=400, detail="content or image is required")

    group = await _require_official_group(db, body.group_id) if body.group_id else None

    now = datetime.now(UTC)
    post = FeedPost(
        user_id=ADMIN_USER_ID,
        group_id=body.group_id,
        content=text_body,
        image_content_id=body.image_content_ids[0] if body.image_content_ids else None,
        is_story=body.is_story,
        created_at=now,
        updated_at=now,
        search_blob=immediate_blob([text_body]),
    )
    db.add(post)
    await db.flush()

    for idx, cid in enumerate(body.image_content_ids):
        db.add(FeedPostImage(post_id=post.id, content_id=cid, sort_order=idx))

    await apply_post_created_effects(db, post_id=post.id, author_id=ADMIN_USER_ID, content=text_body, group=group)

    await audit(db, session, request, "FEED_CREATE", "feed_post", str(post.id), {"is_story": post.is_story})
    await db.commit()
    if text_body:
        background.add_task(warm_translations, [text_body])

    # commit 이후 컬렉션 관계(images)는 expire 되어 db.get() 만으로는 재조회되지 않음 — 명시 refresh 필요.
    await db.refresh(post, attribute_names=["images"])
    return await _feed_detail(db, post)


@router.put("/feed/{post_id}", response_model=AdminFeedDetail)
async def update_feed_post(
    post_id: uuid.UUID,
    body: FeedWriteRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    post = await _get_post_or_404(db, post_id)

    text_body = (body.content or "").strip() or None
    if not text_body and not body.image_content_ids:
        raise HTTPException(status_code=400, detail="content or image is required")

    # group_id 를 보내지 않으면 "변경 없음" — 명시적으로 보냈고 현재와 다를 때만 검증·카운트 조정.
    if "group_id" in body.model_fields_set and post.group_id != body.group_id:
        new_group = await _require_official_group(db, body.group_id) if body.group_id else None
        old_group = await db.get(CommunityGroup, post.group_id) if post.group_id else None
        if old_group is not None:
            old_group.post_count = max(old_group.post_count - 1, 0)
        if new_group is not None:
            new_group.post_count += 1
        post.group_id = body.group_id

    await db.execute(FeedPostImage.__table__.delete().where(FeedPostImage.post_id == post_id))
    for idx, cid in enumerate(body.image_content_ids):
        db.add(FeedPostImage(post_id=post_id, content_id=cid, sort_order=idx))

    await db.execute(delete(PostHashtag).where(PostHashtag.post_id == post_id))
    for tag in extract_hashtags(text_body):
        db.add(PostHashtag(post_id=post_id, tag=tag))

    post.content = text_body
    post.image_content_id = body.image_content_ids[0] if body.image_content_ids else None
    post.is_story = body.is_story
    post.updated_at = datetime.now(UTC)

    await audit(db, session, request, "FEED_UPDATE", "feed_post", str(post_id), {"is_story": post.is_story})
    await db.commit()

    await db.refresh(post, attribute_names=["images"])
    return await _feed_detail(db, post)


@router.delete("/feed/{post_id}", status_code=204)
async def delete_feed_post(
    post_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    post = await _get_post_or_404(db, post_id)
    group = await db.get(CommunityGroup, post.group_id) if post.group_id else None
    if group is not None:
        group.post_count = max(group.post_count - 1, 0)
    await db.delete(post)
    await audit(db, session, request, "FEED_DELETE", "feed_post", str(post_id))
    await db.commit()
