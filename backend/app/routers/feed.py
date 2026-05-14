import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..engine_client import engine_client
from ..models import FeedPost, PostComment, PostLike, RideSession, User
from ..schemas import (
    CommentCreateRequest,
    CommentOut,
    FeedCreateRequest,
    FeedPostEnrichedOut,
    FeedPostOut,
    LikeToggleRequest,
    LikeToggleResponse,
    Page,
)
from ..utils import default_avatar_url

log = logging.getLogger(__name__)
router = APIRouter(prefix="/feed", tags=["피드 (Feed)"])


async def _get_post_or_404(post_id: uuid.UUID, db: AsyncSession) -> FeedPost:
    result = await db.execute(select(FeedPost).where(FeedPost.id == post_id))
    post = result.scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


def _enrich(post: FeedPost, user: User | None, ride: RideSession | None) -> FeedPostEnrichedOut:
    return FeedPostEnrichedOut(
        id=post.id,
        user_id=post.user_id,
        user_nickname=user.nickname if user else None,
        user_avatar_url=(user.avatar_url if user and user.avatar_url else default_avatar_url()),
        user_level=user.level if user else 1,
        ride_session_id=post.ride_session_id,
        content=post.content,
        image_url=post.image_url,
        like_count=post.like_count,
        comment_count=post.comment_count,
        is_story=post.is_story,
        created_at=post.created_at,
        distance_km=ride.distance_km if ride else None,
        safety_grade=ride.safety_grade if ride else None,
        reward_exp=ride.reward_exp if ride else None,
    )


# F-1
@router.get("", response_model=Page[FeedPostEnrichedOut], summary="피드 목록")
async def get_feed(
    filter: str = "all",
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size

    if filter == "hot":
        order = [FeedPost.like_count.desc(), FeedPost.created_at.desc()]
    else:
        order = [FeedPost.created_at.desc()]

    total = (await db.execute(select(func.count()).select_from(FeedPost))).scalar_one()

    rows = (await db.execute(
        select(FeedPost, User, RideSession)
        .outerjoin(User, FeedPost.user_id == User.id)
        .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
        .order_by(*order)
        .offset(offset)
        .limit(size)
    )).all()

    items = [_enrich(post, user, ride) for post, user, ride in rows]
    return Page(items=items, total=total, page=page, size=size)


# F-2
@router.get("/stories", response_model=list[FeedPostEnrichedOut], summary="스토리 목록")
async def get_stories(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(FeedPost, User, RideSession)
        .outerjoin(User, FeedPost.user_id == User.id)
        .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
        .where(FeedPost.is_story == True)
        .order_by(FeedPost.created_at.desc())
        .limit(50)
    )).all()
    return [_enrich(post, user, ride) for post, user, ride in rows]


# F-3
@router.post("", response_model=FeedPostOut, status_code=201, summary="피드 공유 (라이딩 결과 게시)")
async def create_feed_post(body: FeedCreateRequest, db: AsyncSession = Depends(get_db)):
    if body.content is None and body.image_url is None:
        raise HTTPException(status_code=400, detail="content or image_url is required")

    now = datetime.now(timezone.utc)
    post = FeedPost(
        user_id=body.user_id,
        ride_session_id=body.ride_session_id,
        content=body.content,
        image_url=body.image_url,
        is_story=body.is_story,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    try:
        await engine_client.post_event(
            user_uuid=str(body.user_id),
            action_code="SHARE_SNS",
            occurred_at=now,
            payload={"post_id": str(post.id), "ride_session_id": str(body.ride_session_id) if body.ride_session_id else None},
            idem_key=f"feed-{post.id}-sns",
        )
    except (httpx.HTTPError, httpx.RequestError) as exc:
        log.warning("Engine SHARE_SNS event failed for post %s: %s", post.id, exc)

    return FeedPostOut.model_validate(post)


# F-4
@router.post("/{post_id}/like", response_model=LikeToggleResponse, summary="좋아요 토글")
async def toggle_like(
    post_id: uuid.UUID,
    body: LikeToggleRequest,
    db: AsyncSession = Depends(get_db),
):
    post = await _get_post_or_404(post_id, db)

    existing = await db.get(PostLike, {"post_id": post_id, "user_id": body.user_id})
    if existing:
        await db.delete(existing)
        post.like_count = max(0, post.like_count - 1)
        await db.commit()
        return LikeToggleResponse(liked=False, like_count=post.like_count)

    db.add(PostLike(post_id=post_id, user_id=body.user_id))
    post.like_count += 1
    await db.commit()
    return LikeToggleResponse(liked=True, like_count=post.like_count)


# F-5
@router.get("/{post_id}/comments", response_model=list[CommentOut], summary="댓글 목록")
async def get_comments(post_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_post_or_404(post_id, db)
    comments = (
        await db.execute(
            select(PostComment)
            .where(PostComment.post_id == post_id)
            .order_by(PostComment.created_at.asc())
        )
    ).scalars().all()
    return [CommentOut.model_validate(c) for c in comments]


# F-6
@router.post("/{post_id}/comments", response_model=CommentOut, status_code=201, summary="댓글 작성")
async def post_comment(
    post_id: uuid.UUID,
    body: CommentCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.content is None and body.image_url is None:
        raise HTTPException(status_code=400, detail="content or image_url is required")

    post = await _get_post_or_404(post_id, db)

    comment = PostComment(
        post_id=post_id,
        user_id=body.user_id,
        parent_id=body.parent_id,
        content=body.content,
        image_url=body.image_url,
    )
    db.add(comment)
    post.comment_count += 1
    await db.commit()
    await db.refresh(comment)

    return CommentOut.model_validate(comment)
