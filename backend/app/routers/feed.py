import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import optional_user_session, verify_user_session
from ..engine_client import engine_client
from ..models import (
    FeedPost,
    FeedPostImage,
    PostComment,
    PostCommentLike,
    PostLike,
    Report,
    RideSession,
    User,
    UserBlock,
    UserFollow,
    Ward,
)
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
    ReportCreateRequest,
)
from ..services import noti_events
from ..services.dm_policy import require_unblocked
from ..services.search_index import immediate_blob
from ..services.service_area import in_service_area
from ..services.translate import lookup_lang_batch, translate_to, warm_translations
from ..utils import build_imgproxy_url, default_avatar_url, resolve_avatar_url, resolve_feed_image_url
from ._report_guard import guard_duplicate_report

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


async def _nearest_ward(latitude: Decimal, longitude: Decimal, db: AsyncSession) -> Ward | None:
    if not in_service_area(latitude, longitude):
        return None
    distance = func.pow(Ward.center_lat - float(latitude), 2) + func.pow(Ward.center_lng - float(longitude), 2)
    return (
        await db.execute(
            select(Ward)
            .where(
                Ward.is_active.is_(True),
                Ward.city_code == "HCMC",
                Ward.center_lat.isnot(None),
                Ward.center_lng.isnot(None),
            )
            .order_by(distance)
            .limit(1)
        )
    ).scalar_one_or_none()


async def _public_coordinates(post: FeedPost, db: AsyncSession) -> tuple[Decimal | None, Decimal | None]:
    if post.latitude is None or post.longitude is None:
        return None, None
    ward = post.ward
    if ward is None:
        ward = await _nearest_ward(post.latitude, post.longitude, db)
    if ward is None or ward.center_lat is None or ward.center_lng is None:
        return None, None
    return Decimal(str(ward.center_lat)), Decimal(str(ward.center_lng))


async def _enrich(post: FeedPost, user: User | None, ride: RideSession | None, db: AsyncSession) -> FeedPostEnrichedOut:
    image_urls = _resolve_image_urls(post)
    content_ids = [img.content_id for img in (post.images or [])]
    public_latitude, public_longitude = await _public_coordinates(post, db)
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
        latitude=public_latitude,
        longitude=public_longitude,
    )


# F-1
class FeedPageOut(Page[FeedPostEnrichedOut]):
    has_more: bool


@router.get("", response_model=FeedPageOut, summary="피드 목록")
async def get_feed(
    filter: str = "all",
    page: int = 1,
    size: int = 20,
    user_id: uuid.UUID | None = Query(None),
    author_id: uuid.UUID | None = Query(None),
    lat: Decimal | None = Query(None),
    lng: Decimal | None = Query(None),
    radius_m: int = Query(5000),
    min_lat: Decimal | None = Query(None),
    max_lat: Decimal | None = Query(None),
    min_lng: Decimal | None = Query(None),
    max_lng: Decimal | None = Query(None),
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 내용을 캐시된 번역으로 표기"),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    offset = (page - 1) * size

    if filter == "hot":
        order = [FeedPost.like_count.desc(), FeedPost.created_at.desc(), FeedPost.id.desc()]
    else:
        order = [FeedPost.created_at.desc(), FeedPost.id.desc()]

    base_q = (
        select(FeedPost, User, RideSession)
        .outerjoin(User, FeedPost.user_id == User.id)
        .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
    )
    count_q = select(func.count()).select_from(FeedPost)

    if author_id:
        base_q = base_q.where(FeedPost.user_id == author_id)
        count_q = count_q.where(FeedPost.user_id == author_id)

    bbox_values = (min_lat, max_lat, min_lng, max_lng)
    if any(value is not None for value in bbox_values):
        if not all(value is not None for value in bbox_values):
            raise HTTPException(status_code=422, detail="bbox requires min/max latitude and longitude")
        if min_lat > max_lat or min_lng > max_lng:
            raise HTTPException(status_code=422, detail="invalid bbox")
        # 공개 지도 계약은 원본 게시 좌표가 아니라 응답에 노출되는 Ward centroid 기준이다.
        # 원본 좌표로 bbox를 자르면 응답 핀 좌표와 목록 포함 여부가 달라지고 위치 정보도 샌다.
        base_q = base_q.join(Ward, Ward.id == FeedPost.ward_id)
        count_q = count_q.join(Ward, Ward.id == FeedPost.ward_id)
        bbox_filter = (
            Ward.center_lat.isnot(None)
            & Ward.center_lng.isnot(None)
            & (Ward.center_lat >= min_lat)
            & (Ward.center_lat <= max_lat)
            & (Ward.center_lng >= min_lng)
            & (Ward.center_lng <= max_lng)
        )
        base_q = base_q.where(bbox_filter)
        count_q = count_q.where(bbox_filter)

    if session_uid is not None:
        blocked_users = select(UserBlock.blocked_id).where(UserBlock.blocker_id == session_uid)
        blocking_users = select(UserBlock.blocker_id).where(UserBlock.blocked_id == session_uid)
        base_q = base_q.where(FeedPost.user_id.notin_(blocked_users), FeedPost.user_id.notin_(blocking_users))
        count_q = count_q.where(FeedPost.user_id.notin_(blocked_users), FeedPost.user_id.notin_(blocking_users))

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

    items = [await _enrich(post, user, ride, db) for post, user, ride in rows]
    # 조회 언어로 내용 표기(캐시 히트만, 없으면 원문). 배치(MGET+IN) — API 호출 안 함.
    if lang:
        contents = await lookup_lang_batch([it.content or "" for it in items], lang, db)
        for it, ct in zip(items, contents, strict=True):
            if it.content:
                it.content = ct
    return FeedPageOut(items=items, total=total, page=page, size=size, has_more=offset + len(items) < total)


# F-2
@router.get("/stories", response_model=list[FeedPostEnrichedOut], summary="스토리 목록")
async def get_stories(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    query = (
        select(FeedPost, User, RideSession)
        .outerjoin(User, FeedPost.user_id == User.id)
        .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
        .where(FeedPost.is_story == True)
    )
    if session_uid is not None:
        blocked_users = select(UserBlock.blocked_id).where(UserBlock.blocker_id == session_uid)
        blocking_users = select(UserBlock.blocker_id).where(UserBlock.blocked_id == session_uid)
        query = query.where(FeedPost.user_id.notin_(blocked_users), FeedPost.user_id.notin_(blocking_users))
    rows = (await db.execute(query.order_by(FeedPost.created_at.desc()).limit(50))).all()
    return [await _enrich(post, user, ride, db) for post, user, ride in rows]


# F-2b
@router.get("/{post_id}", response_model=FeedPostEnrichedOut, summary="피드 단건 조회")
async def get_feed_post(
    post_id: uuid.UUID,
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 내용을 번역해 표기(미스 시 번역·워밍)"),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    query = (
        select(FeedPost, User, RideSession)
        .outerjoin(User, FeedPost.user_id == User.id)
        .outerjoin(RideSession, FeedPost.ride_session_id == RideSession.id)
        .where(FeedPost.id == post_id)
    )
    if session_uid is not None:
        blocked_users = select(UserBlock.blocked_id).where(UserBlock.blocker_id == session_uid)
        blocking_users = select(UserBlock.blocker_id).where(UserBlock.blocked_id == session_uid)
        query = query.where(FeedPost.user_id.notin_(blocked_users), FeedPost.user_id.notin_(blocking_users))
    row = (await db.execute(query)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Post not found")
    post, user, ride = row
    enriched = await _enrich(post, user, ride, db)
    if lang and enriched.content:
        enriched.content, enriched.translation_failed = await translate_to(enriched.content, lang, db)
    return enriched


# F-3
@router.post("", response_model=FeedPostOut, status_code=201, summary="피드 공유 (라이딩 결과 게시)")
async def create_feed_post(
    body: FeedCreateRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 세션 유저 명의로만 작성 가능 — body.user_id 는 세션과 일치해야 함 (impersonation 차단)
    if body.user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    has_images = bool(body.image_content_ids) or body.image_content_id is not None
    if body.content is None and body.image_url is None and not has_images:
        raise HTTPException(status_code=400, detail="content, image_content_ids or image_url is required")
    if body.latitude is not None and body.longitude is not None and not in_service_area(body.latitude, body.longitude):
        raise HTTPException(status_code=422, detail="Location is outside the service area")

    now = datetime.now(UTC)
    first_content_id = body.image_content_ids[0] if body.image_content_ids else body.image_content_id
    ward = (
        await _nearest_ward(body.latitude, body.longitude, db)
        if body.latitude is not None and body.longitude is not None
        else None
    )
    post = FeedPost(
        user_id=body.user_id,
        ride_session_id=body.ride_session_id,
        content=body.content,
        image_content_id=first_content_id,
        image_url=body.image_url,
        is_story=body.is_story,
        latitude=body.latitude,
        longitude=body.longitude,
        ward_id=ward.id if ward else None,
        district_id=body.district_id,
        created_at=now,
        updated_at=now,
        # 원문만으로 즉시 검색 가능(번역 대기 없음) — search.reindex 소비 후 번역이 얹혀 재계산된다.
        search_blob=immediate_blob([body.content]),
    )
    db.add(post)
    await db.flush()
    post_id = post.id

    content_ids = body.image_content_ids or ([body.image_content_id] if body.image_content_id else [])
    for idx, cid in enumerate(content_ids):
        db.add(FeedPostImage(post_id=post_id, content_id=cid, sort_order=idx))

    if body.content:
        noti_events.enqueue(
            db, "search.reindex", {"entity_type": "feed", "entity_id": str(post_id), "texts": [body.content]}
        )
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

    if body.content:
        background.add_task(warm_translations, [body.content])

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
    if body.user_id != _session_uid or post.user_id != _session_uid:
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
    if body.update_location:
        if (
            body.latitude is not None
            and body.longitude is not None
            and not in_service_area(body.latitude, body.longitude)
        ):
            raise HTTPException(status_code=422, detail="Location is outside the service area")
        post.latitude = body.latitude
        post.longitude = body.longitude
        ward = (
            await _nearest_ward(body.latitude, body.longitude, db)
            if body.latitude is not None and body.longitude is not None
            else None
        )
        post.ward_id = ward.id if ward else None
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
    if body.user_id != _session_uid or post.user_id != _session_uid:
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
    if body.user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    post = await _get_post_or_404(post_id, db)
    await require_unblocked(db, _session_uid, post.user_id)

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
async def get_comments(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    post = await _get_post_or_404(post_id, db)
    if session_uid is not None:
        await require_unblocked(db, session_uid, post.user_id)
    q = select(PostComment, User).outerjoin(User, PostComment.user_id == User.id).where(PostComment.post_id == post_id)
    if session_uid is not None:
        blocked_users = select(UserBlock.blocked_id).where(UserBlock.blocker_id == session_uid)
        blocking_users = select(UserBlock.blocker_id).where(UserBlock.blocked_id == session_uid)
        q = q.where(PostComment.user_id.notin_(blocked_users), PostComment.user_id.notin_(blocking_users))
    rows = (await db.execute(q.order_by(PostComment.created_at.asc()))).all()
    return [_enrich_comment(comment, user) for comment, user in rows]


# F-6
@router.post("/{post_id}/comments", response_model=CommentOut, status_code=201, summary="댓글 작성")
async def post_comment(
    post_id: uuid.UUID,
    body: CommentCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 세션 유저 명의로만 작성 가능 (impersonation 차단)
    if body.user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    if body.content is None and body.image_url is None:
        raise HTTPException(status_code=400, detail="content or image_url is required")

    post = await _get_post_or_404(post_id, db)
    if post.user_id != body.user_id:
        await require_unblocked(db, body.user_id, post.user_id)

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
    if body.user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    post = await _get_post_or_404(post_id, db)
    await require_unblocked(db, _session_uid, post.user_id)

    result = await db.execute(select(PostComment).where(PostComment.id == comment_id, PostComment.post_id == post_id))
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != post.user_id:
        await require_unblocked(db, _session_uid, comment.user_id)

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


_POST_REPORT_REASONS = {"SPAM", "ABUSE", "INAPPROPRIATE", "OTHER"}


# FD-4 게시물 신고 (market.py report_listing 과 동일 패턴 — reports 통합 테이블)
@router.post("/{post_id}/report", status_code=201, summary="게시물 신고")
async def report_post(
    post_id: uuid.UUID,
    body: ReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.reason not in _POST_REPORT_REASONS:
        raise HTTPException(status_code=400, detail="invalid reason")

    post = await _get_post_or_404(post_id, db)
    if post.user_id == session_uid:
        raise HTTPException(status_code=400, detail="cannot report your own post")

    # 중복 판정 — reports 부분 유니크(uq_reports_post_once: post_id x reporter_id WHERE POST)와 동일 조건
    await guard_duplicate_report(
        db,
        Report.target_type == "POST",
        Report.post_id == post_id,
        Report.reporter_id == session_uid,
    )

    db.add(
        Report(
            target_type="POST",
            reporter_id=session_uid,
            reported_user_id=post.user_id,
            post_id=post_id,
            reason=body.reason,
            note=(body.note or None),
        )
    )
    await db.commit()
    return {"ok": True}


_COMMENT_REPORT_REASONS = {"SPAM", "ABUSE", "INAPPROPRIATE", "OTHER"}


# FD-4 댓글 신고 (동일 패턴)
@router.post("/{post_id}/comments/{comment_id}/report", status_code=201, summary="댓글 신고")
async def report_comment(
    post_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: ReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.reason not in _COMMENT_REPORT_REASONS:
        raise HTTPException(status_code=400, detail="invalid reason")

    await _get_post_or_404(post_id, db)
    comment = (
        await db.execute(select(PostComment).where(PostComment.id == comment_id, PostComment.post_id == post_id))
    ).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id == session_uid:
        raise HTTPException(status_code=400, detail="cannot report your own comment")

    # 중복 판정 — reports 부분 유니크(uq_reports_comment_once: comment_id x reporter_id WHERE COMMENT)와 동일 조건
    await guard_duplicate_report(
        db,
        Report.target_type == "COMMENT",
        Report.comment_id == comment_id,
        Report.reporter_id == session_uid,
    )

    db.add(
        Report(
            target_type="COMMENT",
            reporter_id=session_uid,
            reported_user_id=comment.user_id,
            comment_id=comment_id,
            reason=body.reason,
            note=(body.note or None),
        )
    )
    await db.commit()
    return {"ok": True}
