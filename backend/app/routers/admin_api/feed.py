"""admin JSON API — 커뮤니티 피드 모더레이션 (조회 + 삭제).

`admin_legacy.py`의 `admin_feed_list`/`admin_feed_delete`(780-1053행)를 JSON 응답으로
이관한 것 — 읽기·삭제만 옮기고, 관리자 피드 작성/수정(new/edit/update)은 포함하지
않는다. 공식계정 피드 관리는 별도 기능(작성 UI)으로 이관 예정. 구 `/admin-legacy/*`
라우트는 손대지 않고 병행 유지한다.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import FeedPost, User
from ...schemas import Page
from ...utils import default_avatar_url, resolve_avatar_url
from ..feed import _resolve_image_urls
from ._audit import audit

router = APIRouter(prefix="/community")


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
    like_count: int
    comment_count: int
    is_story: bool
    created_at: datetime


class AdminFeedDetail(BaseModel):
    id: uuid.UUID
    author: FeedAuthorBrief
    content: str | None
    image_urls: list[str]
    latitude: Decimal | None
    longitude: Decimal | None
    district_name: str | None
    like_count: int
    comment_count: int
    is_story: bool
    created_at: datetime
    updated_at: datetime


def _author_brief(user: User | None, user_id: uuid.UUID) -> FeedAuthorBrief:
    return FeedAuthorBrief(
        id=user_id,
        nickname=user.nickname if user else None,
        avatar_url=resolve_avatar_url(user) if user else default_avatar_url(seed=str(user_id)),
    )


def _feed_row(post: FeedPost, user: User | None) -> AdminFeedRow:
    image_urls = _resolve_image_urls(post)
    return AdminFeedRow(
        id=post.id,
        author=_author_brief(user, post.user_id),
        content=post.content,
        thumbnail_url=image_urls[0] if image_urls else None,
        image_count=len(image_urls),
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
    items = [_feed_row(post, user) for post, user in rows]
    return Page(items=items, total=total, page=page, size=size)


@router.get("/feed/{post_id}", response_model=AdminFeedDetail)
async def get_feed_post(
    post_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    post = await _get_post_or_404(db, post_id)
    user = await db.get(User, post.user_id)
    return AdminFeedDetail(
        id=post.id,
        author=_author_brief(user, post.user_id),
        content=post.content,
        image_urls=_resolve_image_urls(post),
        latitude=post.latitude,
        longitude=post.longitude,
        district_name=post.district.name_ko if post.district else None,
        like_count=post.like_count,
        comment_count=post.comment_count,
        is_story=post.is_story,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


@router.delete("/feed/{post_id}", status_code=204)
async def delete_feed_post(
    post_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    post = await _get_post_or_404(db, post_id)
    await db.delete(post)
    await audit(db, session, request, "FEED_DELETE", "feed_post", str(post_id))
    await db.commit()
