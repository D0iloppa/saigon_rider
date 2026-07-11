import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import BusinessCategory, BusinessNews, BusinessProfile, MarketplaceAd
from ..schemas import (
    BusinessAdCreateRequest,
    BusinessAdOut,
    BusinessCategoryOut,
    BusinessMapItemOut,
    BusinessNewsBrief,
    BusinessProfileApplyRequest,
    BusinessProfileOut,
    BusinessProfileUpdateRequest,
    BusinessPublicProfileOut,
    MarketplaceAdOut,
)
from ..utils import build_imgproxy_url

router = APIRouter(prefix="/biz", tags=["비즈니스 파트너 (Business Partner)"])

# D2: 1계정 N프로필 상한 (당근 벤치마크 — REJECTED 는 카운트에서 제외)
MAX_PROFILES_PER_USER = 3


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

    now = datetime.now(UTC)
    profile = BusinessProfile(
        user_id=session_uid,
        name=body.name.strip(),
        category=body.category,
        address=body.address,
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

    profile.name = body.name.strip()
    profile.category = body.category
    profile.address = body.address
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


@router.get("/public/map", response_model=list[BusinessMapItemOut], summary="업체 지도 공개 조회 (bbox)")
async def get_public_map(
    min_lat: Decimal,
    max_lat: Decimal,
    min_lng: Decimal,
    max_lng: Decimal,
    category: str | None = None,
    q: str | None = None,
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
    profiles = (await db.execute(stmt.limit(200))).scalars().all()

    # 최신 소식 1건씩 N+1 없이 조회 (DISTINCT ON — profile_id 별 created_at 최신 1행)
    profile_ids = [p.id for p in profiles]
    latest_news_by_profile: dict[uuid.UUID, BusinessNewsBrief] = {}
    if profile_ids:
        news_stmt = (
            select(BusinessNews)
            .where(BusinessNews.profile_id.in_(profile_ids))
            .distinct(BusinessNews.profile_id)
            .order_by(BusinessNews.profile_id, BusinessNews.created_at.desc())
        )
        news_rows = (await db.execute(news_stmt)).scalars().all()
        latest_news_by_profile = {
            n.profile_id: BusinessNewsBrief(
                title=n.title,
                created_at=n.created_at,
                photos=[
                    build_imgproxy_url(ph.content.file_path) for ph in n.photos if ph.content and ph.content.file_path
                ],
            )
            for n in news_rows
        }

    return [
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
