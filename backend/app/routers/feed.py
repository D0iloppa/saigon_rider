import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import FeedPost, FeedPostImage, PostComment, PostCommentLike, PostLike, RideSession, User, UserFollow
from ..schemas import (
    CommentCreateRequest,
    CommentOut,
    FeedCreateRequest,
    FeedDeleteRequest,
    FeedPostEnrichedOut,
    FeedPostOut,
    FeedUpdateRequest,
    LikeToggleRequest,
    LikeToggleResponse,
    Page,
)
from ..utils import build_imgproxy_url, default_avatar_url, resolve_avatar_url, resolve_feed_image_url

log = logging.getLogger(__name__)
router = APIRouter(prefix="/feed", tags=["피드 (Feed)"])


async def _get_post_or_404(post_id: uuid.UUID, db: AsyncSession) -> FeedPost:
    result = await db.execute(select(FeedPost).where(FeedPost.id == post_id))
    post = result.scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


def _resolve_image_urls(post: FeedPost) -> list[str]:
    urls = []
    for img in post.images or []:
        if img.content and img.content.file_path:
            urls.append(build_imgproxy_url(img.content.file_path))
    if not urls:
        legacy = resolve_feed_image_url(post)
        if legacy:
            urls.append(legacy)
    return urls


def _enrich(post: FeedPost, user: User | None, ride: RideSession | None) -> FeedPostEnrichedOut:
    image_urls = _resolve_image_urls(post)
    content_ids = [img.content_id for img in (post.images or [])]
    return FeedPostEnrichedOut(
        id=post.id,
        user_id=post.user_id,
        user_nickname=user.nickname if user else None,
        user_avatar_url=(resolve_avatar_url(user) if user else default_avatar_url(seed=str(post.user_id))),
        user_level=user.level if user else 1,
        ride_session_id=post.ride_session_id,
        content=post.content,
        image_url=image_urls[0] if image_urls else None,
        image_urls=image_urls,
        image_content_ids=content_ids,
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
    user_id: uuid.UUID | None = Query(None),
    author_id: uuid.UUID | None = Query(None),
    lat: Decimal | None = Query(None),
    lng: Decimal | None = Query(None),
    radius_m: int = Query(5000),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size

    if filter == "hot":
        order = [FeedPost.like_count.desc(), FeedPost.created_at.desc()]
    else:
        order = [FeedPost.created_at.desc()]

    base_q = (
        select(FeedPost, User, RideSession)
        .outerjoin(User, FeedPost.user_id == User.id)
        .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
    )
    count_q = select(func.count()).select_from(FeedPost)

    if author_id:
        base_q = base_q.where(FeedPost.user_id == author_id)
        count_q = count_q.where(FeedPost.user_id == author_id)

    if filter == "friends" and user_id:
        following_ids = select(UserFollow.following_id).where(UserFollow.follower_id == user_id)
        base_q = base_q.where(FeedPost.user_id.in_(following_ids))
        count_q = count_q.where(FeedPost.user_id.in_(following_ids))

    elif filter == "neighborhood" and lat is not None and lng is not None:
        location_cond = text(
            "ST_DWithin("
            "  ST_SetSRID(ST_MakePoint(feed_posts.longitude, feed_posts.latitude), 4326)::geography,"
            "  ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,"
            "  :radius"
            ")"
        ).bindparams(lng=float(lng), lat=float(lat), radius=radius_m)
        neighborhood_filter = FeedPost.latitude.isnot(None) & FeedPost.longitude.isnot(None)
        base_q = base_q.where(neighborhood_filter).where(location_cond)
        count_q = count_q.where(neighborhood_filter).where(location_cond)

    total = (await db.execute(count_q)).scalar_one()

    rows = (await db.execute(base_q.order_by(*order).offset(offset).limit(size))).all()

    items = [_enrich(post, user, ride) for post, user, ride in rows]
    return Page(items=items, total=total, page=page, size=size)


# F-2
@router.get("/stories", response_model=list[FeedPostEnrichedOut], summary="스토리 목록")
async def get_stories(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(FeedPost, User, RideSession)
            .outerjoin(User, FeedPost.user_id == User.id)
            .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
            .where(FeedPost.is_story == True)
            .order_by(FeedPost.created_at.desc())
            .limit(50)
        )
    ).all()
    return [_enrich(post, user, ride) for post, user, ride in rows]


# F-2b
@router.get("/{post_id}", response_model=FeedPostEnrichedOut, summary="피드 단건 조회")
async def get_feed_post(post_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(
            select(FeedPost, User, RideSession)
            .outerjoin(User, FeedPost.user_id == User.id)
            .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
            .where(FeedPost.id == post_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Post not found")
    post, user, ride = row
    return _enrich(post, user, ride)


# F-3
@router.post("", response_model=FeedPostOut, status_code=201, summary="피드 공유 (라이딩 결과 게시)")
async def create_feed_post(
    body: FeedCreateRequest, db: AsyncSession = Depends(get_db), _session_uid: uuid.UUID = Depends(verify_user_session)
):
    has_images = bool(body.image_content_ids) or body.image_content_id is not None
    if body.content is None and body.image_url is None and not has_images:
        raise HTTPException(status_code=400, detail="content, image_content_ids or image_url is required")

    now = datetime.now(UTC)
    first_content_id = body.image_content_ids[0] if body.image_content_ids else body.image_content_id
    post = FeedPost(
        user_id=body.user_id,
        ride_session_id=body.ride_session_id,
        content=body.content,
        image_content_id=first_content_id,
        image_url=body.image_url,
        is_story=body.is_story,
        latitude=body.latitude,
        longitude=body.longitude,
        district_id=body.district_id,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    await db.flush()
    post_id = post.id

    content_ids = body.image_content_ids or ([body.image_content_id] if body.image_content_id else [])
    for idx, cid in enumerate(content_ids):
        db.add(FeedPostImage(post_id=post_id, content_id=cid, sort_order=idx))

    await db.commit()

    try:
        await engine_client.post_event(
            user_uuid=str(body.user_id),
            action_code="SHARE_SNS",
            occurred_at=now,
            payload={
                "post_id": str(post_id),
                "ride_session_id": str(body.ride_session_id) if body.ride_session_id else None,
            },
            idem_key=f"feed-{post_id}-sns",
        )
    except (httpx.HTTPError, httpx.RequestError) as exc:
        log.warning("Engine SHARE_SNS event failed for post %s: %s", post_id, exc)

    post = (await db.execute(select(FeedPost).where(FeedPost.id == post_id))).scalar_one()
    return FeedPostOut.model_validate(post)


# F-3b
@router.put("/{post_id}", response_model=FeedPostOut, summary="피드 수정 (본인만)")
async def update_feed_post(
    post_id: uuid.UUID,
    body: FeedUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    post = await _get_post_or_404(post_id, db)
    if post.user_id != body.user_id:
        raise HTTPException(status_code=403, detail="Not the post owner")

    if body.content is not None:
        post.content = body.content
    if body.image_content_ids is not None:
        await db.execute(select(FeedPostImage).where(FeedPostImage.post_id == post_id))
        for old_img in list(post.images):
            await db.delete(old_img)
        for idx, cid in enumerate(body.image_content_ids):
            db.add(FeedPostImage(post_id=post_id, content_id=cid, sort_order=idx))
        post.image_content_id = body.image_content_ids[0] if body.image_content_ids else None
    elif body.image_content_id is not None:
        post.image_content_id = body.image_content_id
    post.updated_at = datetime.now(UTC)
    await db.commit()

    post = (await db.execute(select(FeedPost).where(FeedPost.id == post_id))).scalar_one()
    return FeedPostOut.model_validate(post)


# F-3c
@router.delete("/{post_id}", status_code=204, summary="피드 삭제 (본인만)")
async def delete_feed_post(
    post_id: uuid.UUID,
    body: FeedDeleteRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    post = await _get_post_or_404(post_id, db)
    if post.user_id != body.user_id:
        raise HTTPException(status_code=403, detail="Not the post owner")

    await db.delete(post)
    await db.commit()


# F-4
@router.post("/{post_id}/like", response_model=LikeToggleResponse, summary="좋아요 토글")
async def toggle_like(
    post_id: uuid.UUID,
    body: LikeToggleRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
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


def _enrich_comment(comment: PostComment, user: User | None) -> CommentOut:
    return CommentOut(
        id=comment.id,
        post_id=comment.post_id,
        user_id=comment.user_id,
        user_nickname=user.nickname if user else None,
        user_avatar_url=(resolve_avatar_url(user) if user else default_avatar_url(seed=str(comment.user_id))),
        parent_id=comment.parent_id,
        content=comment.content,
        image_url=comment.image_url,
        like_count=comment.like_count,
        created_at=comment.created_at,
    )


# F-5
@router.get("/{post_id}/comments", response_model=list[CommentOut], summary="댓글 목록")
async def get_comments(post_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_post_or_404(post_id, db)
    rows = (
        await db.execute(
            select(PostComment, User)
            .outerjoin(User, PostComment.user_id == User.id)
            .where(PostComment.post_id == post_id)
            .order_by(PostComment.created_at.asc())
        )
    ).all()
    return [_enrich_comment(comment, user) for comment, user in rows]


# F-6
@router.post("/{post_id}/comments", response_model=CommentOut, status_code=201, summary="댓글 작성")
async def post_comment(
    post_id: uuid.UUID,
    body: CommentCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
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

    user = await db.get(User, body.user_id)
    return _enrich_comment(comment, user)


# F-7 (신규)
@router.post("/{post_id}/comments/{comment_id}/like", response_model=LikeToggleResponse, summary="댓글 좋아요 토글")
async def toggle_comment_like(
    post_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: LikeToggleRequest,
    _session_uid: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    await _get_post_or_404(post_id, db)

    result = await db.execute(select(PostComment).where(PostComment.id == comment_id))
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")

    existing = await db.get(PostCommentLike, {"comment_id": comment_id, "user_id": body.user_id})
    if existing:
        await db.delete(existing)
        comment.like_count = max(0, comment.like_count - 1)
        await db.commit()
        return LikeToggleResponse(liked=False, like_count=comment.like_count)

    db.add(PostCommentLike(comment_id=comment_id, user_id=body.user_id))
    comment.like_count += 1
    await db.commit()
    return LikeToggleResponse(liked=True, like_count=comment.like_count)
