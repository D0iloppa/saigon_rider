import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import (
    BusinessCategory,
    BusinessNews,
    BusinessProfile,
    BusinessReview,
    Content,
    MarketplaceAd,
    User,
    UserFavoriteBusiness,
)
from ..schemas import (
    BusinessAdCreateRequest,
    BusinessAdOut,
    BusinessCategoryOut,
    BusinessFavoriteOut,
    BusinessMapItemOut,
    BusinessNewsBrief,
    BusinessNewsItemOut,
    BusinessProfileApplyRequest,
    BusinessProfileOut,
    BusinessProfileUpdateRequest,
    BusinessPublicProfileOut,
    BusinessReviewCreateRequest,
    BusinessReviewListOut,
    BusinessReviewOut,
    MarketplaceAdOut,
    Page,
)
from ..services.redis_cache import get_client
from ..utils import build_imgproxy_url

router = APIRouter(prefix="/biz", tags=["비즈니스 파트너 (Business Partner)"])

# D2: 1계정 N프로필 상한 (당근 벤치마크 — REJECTED 는 카운트에서 제외)
MAX_PROFILES_PER_USER = 3

# VP-BE: 업체 프로필 실시간 열람 수 — Redis ZADD 멱등 윈도우 (소켓 없음)
_VIEW_TTL_SEC = 30


async def _view_ping(profile_id: uuid.UUID, user_id: str) -> int:
    client = await get_client()
    key = f"saigon:bizview:{profile_id}"
    now = datetime.now(UTC).timestamp()
    try:
        await client.zadd(key, {user_id: now})
        await client.zremrangebyscore(key, "-inf", now - _VIEW_TTL_SEC)
        await client.expire(key, _VIEW_TTL_SEC * 2)
        return await client.zcard(key)
    except Exception:
        return 0  # Redis 순단이 화면을 깨면 안 됨 (noti_events.py 관례)


def _out(p: BusinessProfile) -> BusinessProfileOut:
    photo_url = build_imgproxy_url(p.photo_content.file_path) if p.photo_content else None
    return BusinessProfileOut(
        id=p.id,
        name=p.name,
        category=p.category,
        address=p.address,
        latitude=p.latitude,
        longitude=p.longitude,
        phone=p.phone,
        photo_content_id=p.photo_content_id,
        photo_url=photo_url,
        status=p.status,
        reject_reason=p.reject_reason,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


async def _require_content(db: AsyncSession, content_id: uuid.UUID | None) -> None:
    """content_id 존재 검증 (BIZ-4) — 없는 UUID로 FK 위반 500 대신 400 반환. 소유권은 미검사(존재만)."""
    if content_id is not None and await db.get(Content, content_id) is None:
        raise HTTPException(status_code=400, detail="Invalid content_id")


async def _get_own_profile(db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID) -> BusinessProfile:
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.user_id != user_id:
        raise HTTPException(status_code=404, detail="Business profile not found")
    return profile


@router.post("/apply", response_model=BusinessProfileOut, status_code=201, summary="비즈니스 파트너 신청")
async def apply(
    body: BusinessProfileApplyRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    active_count = (
        await db.execute(
            select(func.count())
            .select_from(BusinessProfile)
            .where(BusinessProfile.user_id == session_uid, BusinessProfile.status != "REJECTED")
        )
    ).scalar_one()
    if active_count >= MAX_PROFILES_PER_USER:
        raise HTTPException(status_code=409, detail="Business profile limit reached (max 3)")

    name = body.name.strip()
    address = body.address.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not address:
        raise HTTPException(status_code=400, detail="Address is required")
    await _require_content(db, body.photo_content_id)

    now = datetime.now(UTC)
    profile = BusinessProfile(
        user_id=session_uid,
        name=name,
        category=body.category,
        address=address,
        latitude=body.latitude,
        longitude=body.longitude,
        phone=body.phone,
        photo_content_id=body.photo_content_id,
        status="PENDING",
        created_at=now,
        updated_at=now,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _out(profile)


@router.get("/profiles", response_model=list[BusinessProfileOut], summary="내 비즈니스 프로필 목록")
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profiles = (
        (
            await db.execute(
                select(BusinessProfile)
                .where(BusinessProfile.user_id == session_uid)
                .order_by(BusinessProfile.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_out(p) for p in profiles]


@router.get("/profiles/{profile_id}", response_model=BusinessProfileOut, summary="내 비즈니스 프로필 상세")
async def get_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await _get_own_profile(db, profile_id, session_uid)
    return _out(profile)


@router.put("/profiles/{profile_id}", response_model=BusinessProfileOut, summary="비즈니스 프로필 수정/재신청")
async def update_profile(
    profile_id: uuid.UUID,
    body: BusinessProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await _get_own_profile(db, profile_id, session_uid)
    if profile.status == "PENDING":
        raise HTTPException(status_code=409, detail="Profile under review — cannot edit")

    name = body.name.strip()
    address = body.address.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not address:
        raise HTTPException(status_code=400, detail="Address is required")
    await _require_content(db, body.photo_content_id)

    profile.name = name
    profile.category = body.category
    profile.address = address
    profile.latitude = body.latitude
    profile.longitude = body.longitude
    profile.phone = body.phone
    profile.photo_content_id = body.photo_content_id
    profile.updated_at = datetime.now(UTC)

    # REJECTED 재신청 → 재심사 큐로 (APPROVED 는 정보 수정만, 상태 유지)
    if profile.status == "REJECTED":
        profile.status = "PENDING"
        profile.reject_reason = None
        profile.reviewed_at = None

    await db.commit()
    await db.refresh(profile)
    return _out(profile)


# ── 파트너 광고 (SGR-312 BP-4 — D3 [등록→심사→게시]) ─────────────


def _ad_out(ad: MarketplaceAd) -> BusinessAdOut:
    # contents 중개 이미지 우선, 레거시 image_url 은 read-only 폴백 (BP-5 이관 광고)
    if ad.image_content:
        image_url = build_imgproxy_url(ad.image_content.file_path, options="rs:fill:360:200:1")
    elif ad.image_url and not ad.image_url.startswith("http"):
        image_url = build_imgproxy_url(ad.image_url, options="rs:fill:360:200:1")
    else:
        image_url = ad.image_url
    return BusinessAdOut(
        id=ad.id,
        profile_id=ad.owner_business_profile_id,
        title=ad.title,
        body=ad.body,
        image_url=image_url,
        review_status=ad.review_status,
        reject_reason=ad.reject_reason,
        starts_at=ad.starts_at,
        ends_at=ad.ends_at,
        created_at=ad.created_at,
    )


async def _get_own_ad(db: AsyncSession, ad_id: uuid.UUID, user_id: uuid.UUID) -> tuple[MarketplaceAd, BusinessProfile]:
    row = (
        await db.execute(
            select(MarketplaceAd, BusinessProfile)
            .join(BusinessProfile, BusinessProfile.id == MarketplaceAd.owner_business_profile_id)
            .where(MarketplaceAd.id == ad_id, BusinessProfile.user_id == user_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    return row[0], row[1]


@router.post("/ads", response_model=BusinessAdOut, status_code=201, summary="파트너 광고 등록 (심사 후 게시)")
async def create_ad(
    body: BusinessAdCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await _get_own_profile(db, body.profile_id, session_uid)
    if profile.status != "APPROVED":
        raise HTTPException(status_code=409, detail="Only approved business profiles can create ads")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if body.starts_at and body.ends_at and body.ends_at <= body.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    await _require_content(db, body.image_content_id)

    ad = MarketplaceAd(
        partner_name=profile.name[:80],
        title=body.title.strip(),
        body=body.body,
        image_content_id=body.image_content_id,
        phone=profile.phone,
        address=profile.address,
        owner_id=session_uid,
        owner_business_profile_id=profile.id,
        review_status="PENDING",
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        created_at=datetime.now(UTC),
    )
    db.add(ad)
    await db.commit()
    await db.refresh(ad)
    return _ad_out(ad)


@router.get("/ads", response_model=list[BusinessAdOut], summary="내 프로필의 광고 목록")
async def list_ads(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _get_own_profile(db, profile_id, session_uid)
    ads = (
        (
            await db.execute(
                select(MarketplaceAd)
                .where(MarketplaceAd.owner_business_profile_id == profile_id)
                .order_by(MarketplaceAd.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_ad_out(a) for a in ads]


@router.get("/ads/{ad_id}", response_model=BusinessAdOut, summary="내 광고 상세 (반려 사유 포함)")
async def get_ad(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    ad, _ = await _get_own_ad(db, ad_id, session_uid)
    return _ad_out(ad)


@router.post("/ads/{ad_id}/stop", response_model=BusinessAdOut, summary="광고 게시 중단")
async def stop_ad(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    ad, _ = await _get_own_ad(db, ad_id, session_uid)
    if ad.review_status != "APPROVED":
        raise HTTPException(status_code=409, detail="Only published (APPROVED) ads can be stopped")
    ad.review_status = "STOPPED"
    await db.commit()
    await db.refresh(ad)
    return _ad_out(ad)


@router.post("/ads/{ad_id}/resume", response_model=BusinessAdOut, summary="광고 게시 재개")
async def resume_ad(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    ad, profile = await _get_own_ad(db, ad_id, session_uid)
    if ad.review_status != "STOPPED":
        raise HTTPException(status_code=409, detail="Only stopped ads can be resumed")
    # admin 계정 정지 우회 방지 — SUSPENDED 프로필은 재개 불가
    if profile.status != "APPROVED":
        raise HTTPException(status_code=409, detail="Business profile is not active")
    # 소재 불변이므로 재심사 없이 즉시 복귀 (STOPPED→APPROVED)
    ad.review_status = "APPROVED"
    await db.commit()
    await db.refresh(ad)
    return _ad_out(ad)


# ── 공개 비즈니스 프로필 (SGR-312 BP-6 — AD 카드 탭 노출면) ─────────


def _public_ad_out(ad: MarketplaceAd) -> MarketplaceAdOut:
    """market.py GET /ads 의 이미지 해상 로직 미러 (BP-4 contents 중개 우선)."""
    out = MarketplaceAdOut.model_validate(ad)
    if ad.image_content:
        out.image_url = build_imgproxy_url(ad.image_content.file_path, options="rs:fill:360:200:1")
    return out


async def _latest_news_map(db: AsyncSession, profile_ids: list[uuid.UUID]) -> dict[uuid.UUID, BusinessNewsBrief]:
    """최신 소식 1건씩 N+1 없이 조회 (DISTINCT ON — profile_id 별 created_at 최신 1행)."""
    if not profile_ids:
        return {}
    news_stmt = (
        select(BusinessNews)
        .where(BusinessNews.profile_id.in_(profile_ids))
        .distinct(BusinessNews.profile_id)
        .order_by(BusinessNews.profile_id, BusinessNews.created_at.desc())
    )
    news_rows = (await db.execute(news_stmt)).scalars().all()
    return {
        n.profile_id: BusinessNewsBrief(
            title=n.title,
            created_at=n.created_at,
            photos=[build_imgproxy_url(ph.content.file_path) for ph in n.photos if ph.content and ph.content.file_path],
        )
        for n in news_rows
    }


class BusinessMapPageOut(Page[BusinessMapItemOut]):
    has_more: bool


@router.get("/public/map", response_model=BusinessMapPageOut, summary="업체 지도 공개 조회 (bbox)")
async def get_public_map(
    min_lat: Decimal,
    max_lat: Decimal,
    min_lng: Decimal,
    max_lng: Decimal,
    category: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """동네지도 업체 핀 레이어 — APPROVED + 좌표 보유 프로필만 bbox 범위로 노출."""
    stmt = select(BusinessProfile).where(
        BusinessProfile.status == "APPROVED",
        BusinessProfile.latitude.is_not(None),
        BusinessProfile.longitude.is_not(None),
        BusinessProfile.latitude >= min_lat,
        BusinessProfile.latitude <= max_lat,
        BusinessProfile.longitude >= min_lng,
        BusinessProfile.longitude <= max_lng,
    )
    if category:
        stmt = stmt.where(BusinessProfile.category == category)
    if q:
        stmt = stmt.where(BusinessProfile.name.ilike(f"%{q}%"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    profiles = (
        (await db.execute(stmt.order_by(BusinessProfile.id.asc()).offset((page - 1) * size).limit(size)))
        .scalars()
        .all()
    )

    latest_news_by_profile = await _latest_news_map(db, [p.id for p in profiles])

    items = [
        BusinessMapItemOut(
            id=p.id,
            name=p.name,
            category=p.category,
            address=p.address,
            lat=p.latitude,
            lng=p.longitude,
            photo_url=build_imgproxy_url(p.photo_content.file_path) if p.photo_content else None,
            latest_news=latest_news_by_profile.get(p.id),
        )
        for p in profiles
    ]
    return BusinessMapPageOut(items=items, total=total, page=page, size=size, has_more=page * size < total)


# W3-BE T3: /public/{profile_id} 보다 먼저 등록 — 그래야 "categories" 가 UUID 파싱에 안 먹힌다.
@router.get("/public/categories", response_model=list[BusinessCategoryOut], summary="업체 카테고리 목록")
async def get_public_categories(db: AsyncSession = Depends(get_db)):
    rows = (
        (
            await db.execute(
                select(BusinessCategory)
                .where(BusinessCategory.is_active == True)
                .order_by(BusinessCategory.group_sort_order, BusinessCategory.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return rows


@router.get("/public/{profile_id}", response_model=BusinessPublicProfileOut, summary="공개 비즈니스 프로필")
async def get_public_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """일반 유저가 AD 카드 탭으로 진입하는 공개 프로필면 — APPROVED 프로필만 노출(그 외 404)."""
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.status != "APPROVED":
        raise HTTPException(status_code=404, detail="Business profile not found")

    now = datetime.now(UTC)
    # 게시중 광고 노출 조건 — market.py GET /ads 미러 (APPROVED + is_active + 기간 유효)
    ads = (
        (
            await db.execute(
                select(MarketplaceAd)
                .where(
                    MarketplaceAd.owner_business_profile_id == profile_id,
                    MarketplaceAd.is_active == True,
                    MarketplaceAd.review_status == "APPROVED",
                )
                .where(or_(MarketplaceAd.starts_at.is_(None), MarketplaceAd.starts_at <= now))
                .where(or_(MarketplaceAd.ends_at.is_(None), MarketplaceAd.ends_at >= now))
                .order_by(MarketplaceAd.sort_order)
            )
        )
        .scalars()
        .all()
    )
    photo_url = build_imgproxy_url(profile.photo_content.file_path) if profile.photo_content else None
    return BusinessPublicProfileOut(
        id=profile.id,
        name=profile.name,
        category=profile.category,
        address=profile.address,
        latitude=profile.latitude,
        longitude=profile.longitude,
        phone=profile.phone,
        photo_url=photo_url,
        ads=[_public_ad_out(a) for a in ads],
    )


@router.get("/public/{profile_id}/news", response_model=list[BusinessNewsItemOut], summary="업체 소식 목록 (공개)")
async def get_public_news(
    profile_id: uuid.UUID,
    limit: int = 10,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """공개 프로필 '소식' 섹션 — APPROVED 프로필만(그 외 404), created_at DESC 페이지네이션."""
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.status != "APPROVED":
        raise HTTPException(status_code=404, detail="Business profile not found")

    limit = max(1, min(limit, 30))
    offset = max(0, offset)
    rows = (
        (
            await db.execute(
                select(BusinessNews)
                .where(BusinessNews.profile_id == profile_id)
                .order_by(BusinessNews.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return [
        BusinessNewsItemOut(
            id=n.id,
            title=n.title,
            body=n.body,
            created_at=n.created_at,
            photos=[build_imgproxy_url(ph.content.file_path) for ph in n.photos if ph.content and ph.content.file_path],
        )
        for n in rows
    ]


# ── 업체 후기 (동네지도 + 메뉴 '후기쓰기' 실배선) ─────────────────
# 장소 평가형(당근 모델): 유저당 업체 1건 UNIQUE + 재작성 시 갱신(upsert). init/123.


def _review_out(r: BusinessReview, nickname: str | None) -> BusinessReviewOut:
    return BusinessReviewOut(id=r.id, rating=r.rating, body=r.body, created_at=r.created_at, reviewer_nickname=nickname)


async def _get_approved_profile(db: AsyncSession, profile_id: uuid.UUID) -> BusinessProfile:
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.status != "APPROVED":
        raise HTTPException(status_code=404, detail="Business profile not found")
    return profile


@router.get("/public/{profile_id}/reviews", response_model=BusinessReviewListOut, summary="업체 후기 목록 (공개)")
async def get_public_reviews(
    profile_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """무인증 공개 조회 — APPROVED 프로필만(그 외 404), created_at DESC 페이지네이션.
    응답 wrapper 에 합계·평균 별점 포함 (info_repair {reviews, total, has_more} 관례 미러)."""
    await _get_approved_profile(db, profile_id)
    limit = max(1, min(limit, 50))
    offset = max(0, offset)

    total, avg_rating = (
        await db.execute(
            select(func.count(), func.avg(BusinessReview.rating))
            .select_from(BusinessReview)
            .where(BusinessReview.profile_id == profile_id)
        )
    ).one()
    rows = (
        await db.execute(
            select(BusinessReview, User.nickname)
            .join(User, User.id == BusinessReview.user_id)
            .where(BusinessReview.profile_id == profile_id)
            .order_by(BusinessReview.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    reviews = [_review_out(r, nickname) for r, nickname in rows]
    return BusinessReviewListOut(
        reviews=reviews,
        total=int(total),
        avg_rating=round(float(avg_rating), 1) if avg_rating is not None else None,
        has_more=offset + len(reviews) < int(total),
    )


@router.get(
    "/public/{profile_id}/reviews/mine",
    response_model=BusinessReviewOut | None,
    summary="이 업체에 내가 남긴 후기",
)
async def get_my_public_review(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """작성 시트 프리필용 (market GET /reviews/mine 미러) — 없으면 null."""
    await _get_approved_profile(db, profile_id)
    row = (
        await db.execute(
            select(BusinessReview, User.nickname)
            .join(User, User.id == BusinessReview.user_id)
            .where(BusinessReview.profile_id == profile_id, BusinessReview.user_id == session_uid)
        )
    ).first()
    if row is None:
        return None
    return _review_out(row[0], row[1])


@router.post("/public/{profile_id}/reviews", response_model=BusinessReviewOut, summary="업체 후기 작성/재작성 (upsert)")
async def upsert_public_review(
    profile_id: uuid.UUID,
    body: BusinessReviewCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await _get_approved_profile(db, profile_id)
    if profile.user_id == session_uid:
        raise HTTPException(status_code=403, detail="Cannot review your own business profile")
    body_text = body.body.strip()
    if not body_text:
        raise HTTPException(status_code=400, detail="Body is required")

    review = (
        await db.execute(
            select(BusinessReview).where(BusinessReview.profile_id == profile_id, BusinessReview.user_id == session_uid)
        )
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if review is not None:
        review.rating = body.rating
        review.body = body_text
        review.updated_at = now
    else:
        review = BusinessReview(
            profile_id=profile_id,
            user_id=session_uid,
            rating=body.rating,
            body=body_text,
            created_at=now,
            updated_at=now,
        )
        db.add(review)
    await db.commit()
    await db.refresh(review)
    user = await db.get(User, session_uid)
    return _review_out(review, user.nickname if user else None)


@router.post("/public/{profile_id}/view-ping", summary="업체 프로필 실시간 열람 핑")
async def view_ping(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.status != "APPROVED":
        raise HTTPException(status_code=404, detail="Business profile not found")
    count = await _view_ping(profile_id, str(session_uid))
    return {"viewer_count": count}


# ── 업체 찜 (동네지도 프로필 실배선 P-BE T1) ─────────────────────


@router.post("/favorites/{profile_id}", status_code=201, summary="업체 찜 추가")
async def add_favorite(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.status != "APPROVED":
        raise HTTPException(status_code=404, detail="Business profile not found")
    existing = await db.get(UserFavoriteBusiness, {"user_id": session_uid, "profile_id": profile_id})
    if existing is None:
        db.add(UserFavoriteBusiness(user_id=session_uid, profile_id=profile_id))
        await db.commit()
    return {"favorited": True}


@router.delete("/favorites/{profile_id}", summary="업체 찜 해제")
async def remove_favorite(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    existing = await db.get(UserFavoriteBusiness, {"user_id": session_uid, "profile_id": profile_id})
    if existing is not None:
        await db.delete(existing)
        await db.commit()
    return {"favorited": False}


@router.get("/favorites", response_model=list[BusinessFavoriteOut], summary="내 찜 업체 목록")
async def get_favorites(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    rows = (
        await db.execute(
            select(BusinessProfile, UserFavoriteBusiness.created_at)
            .join(UserFavoriteBusiness, UserFavoriteBusiness.profile_id == BusinessProfile.id)
            .where(UserFavoriteBusiness.user_id == session_uid, BusinessProfile.status == "APPROVED")
            .order_by(UserFavoriteBusiness.created_at.desc())
            .limit(200)
        )
    ).all()

    latest_news_by_profile = await _latest_news_map(db, [p.id for p, _ in rows])

    return [
        BusinessFavoriteOut(
            id=p.id,
            name=p.name,
            category=p.category,
            address=p.address,
            lat=p.latitude,
            lng=p.longitude,
            photo_url=build_imgproxy_url(p.photo_content.file_path) if p.photo_content else None,
            latest_news=latest_news_by_profile.get(p.id),
            favorited_at=favorited_at,
        )
        for p, favorited_at in rows
    ]
