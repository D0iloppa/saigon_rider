import logging
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import optional_user_session, verify_user_session
from ..models import (
    AdDailyStat,
    BusinessCategory,
    BusinessFollow,
    BusinessNews,
    BusinessNewsPhoto,
    BusinessPrice,
    BusinessProfile,
    BusinessReview,
    Content,
    MarketplaceAd,
    User,
    UserFavoriteBusiness,
    Ward,
)
from ..modules.ads import AdsApplication
from ..modules.ads.application import AdRead, AdsError
from ..schemas import (
    AdStatsByAdItem,
    AdStatsSeriesPoint,
    AdStatsSeriesPrevious,
    AdStatsSeriesTotals,
    AdTierOut,
    BizAdStatsSeriesOut,
    BizAdStatsSummaryOut,
    BusinessAdCreateRequest,
    BusinessAdOut,
    BusinessCategoryOut,
    BusinessFavoriteOut,
    BusinessFollowOut,
    BusinessMapItemOut,
    BusinessNewsBrief,
    BusinessNewsCreateRequest,
    BusinessNewsFeedItemOut,
    BusinessNewsItemOut,
    BusinessPriceCreateRequest,
    BusinessPriceItemOut,
    BusinessProfileApplyRequest,
    BusinessProfileOut,
    BusinessProfileUpdateRequest,
    BusinessPublicProfileOut,
    BusinessReviewBrief,
    BusinessReviewCreateRequest,
    BusinessReviewListOut,
    BusinessReviewOut,
    BusinessVerificationRequest,
    MarketplaceAdOut,
    Page,
)
from ..services import noti_events
from ..services.redis_cache import get_client
from ..services.search_index import immediate_blob
from ..services.search_norm import norm
from ..services.translate import warm_translations
from ..utils import build_imgproxy_url, haversine_m
from .auth import _normalize_vn_phone

router = APIRouter(prefix="/biz", tags=["비즈니스 파트너 (Business Partner)"])

log = logging.getLogger(__name__)

# D2: 1계정 N프로필 상한 (당근 벤치마크 — REJECTED 는 카운트에서 제외)
MAX_PROFILES_PER_USER = 3

# VP-BE: 업체 프로필 실시간 열람 수 — Redis ZADD 멱등 윈도우 (소켓 없음)
_VIEW_TTL_SEC = 30

# 광고 성과 — 표본 100 미만이면 비율/비용 지표 숨김 (ai-docs/spec/ad-performance-metrics.md §7-3 D, X-4)
MIN_SAMPLE_FOR_RATIO = 100
_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


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
        intro=p.intro,
        status=p.status,
        reject_reason=p.reject_reason,
        verification_status=p.verification_status,
        biz_license_content_id=p.biz_license_content_id,
        signboard_content_id=p.signboard_content_id,
        rep_name=p.rep_name,
        verified_at=p.verified_at,
        verification_reject_reason=p.verification_reject_reason,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


async def _require_content(db: AsyncSession, content_id: uuid.UUID | None) -> None:
    """content_id 존재 검증 (BIZ-4) — 없는 UUID로 FK 위반 500 대신 400 반환. 소유권은 미검사(존재만)."""
    if content_id is not None and await db.get(Content, content_id) is None:
        raise HTTPException(status_code=400, detail="Invalid content_id")


async def _require_owned_content(db: AsyncSession, content_id: uuid.UUID | None, user_id: uuid.UUID) -> None:
    """content_id 존재 + 신청자 소유(owner_type='user', owner_id=session_uid) 검증 (F-06).

    사업자등록증·간판 등 검증 문서는 UUID 유출 시 타인 content 도용을 막기 위해 소유권까지 검사한다."""
    if content_id is None:
        return
    content = await db.get(Content, content_id)
    if content is None or content.owner_type != "user" or content.owner_id != user_id:
        raise HTTPException(status_code=400, detail="Invalid content_id")


async def _get_own_profile(db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID) -> BusinessProfile:
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.user_id != user_id:
        raise HTTPException(status_code=404, detail="Business profile not found")
    return profile


async def _find_claimable_profile(db: AsyncSession, raw_phone: str) -> BusinessProfile | None:
    """필드에이전트 CSV 사전등록(user_id=NULL, import_business_csv.py) 프로필을 전화번호로 매칭.

    이름/주소는 오타·표기차 여지가 커 매칭 기준에서 제외(대표 결정, Option A) — 전화번호만.
    CSV 원본은 구분자(공백 등) 포함 다양한 표기라 SQL 등호로는 못 잡는다 — status/user_id 로
    좁힌 후보만(2,300건 규모, idx_biz_profile_status/idx_biz_profile_user 사용) 기존 OTP
    정규화 함수(_normalize_vn_phone, auth.py)로 양쪽을 같은 정규형으로 맞춰 비교한다."""
    normalized = _normalize_vn_phone(raw_phone)
    if normalized is None:
        return None
    candidates = (
        (
            await db.execute(
                select(BusinessProfile).where(
                    BusinessProfile.user_id.is_(None),
                    BusinessProfile.status == "APPROVED",
                    BusinessProfile.phone.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for candidate in candidates:
        if candidate.user_id is not None:  # 방어적 재확인 — 쿼리 필터와 무관하게 이미 연결된 프로필은 재클레임 금지
            continue
        if _normalize_vn_phone(candidate.phone) == normalized:
            return candidate
    return None


@router.post("/apply", response_model=BusinessProfileOut, status_code=201, summary="비즈니스 파트너 신청")
async def apply(
    body: BusinessProfileApplyRequest,
    background: BackgroundTasks,
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

    claimable = await _find_claimable_profile(db, body.phone)
    if claimable is not None:
        claimable.user_id = session_uid
        claimable.updated_at = datetime.now(UTC)
        log.info("business profile %s auto-claimed by user %s via phone match", claimable.id, session_uid)
        await db.commit()
        await db.refresh(claimable)
        return _out(claimable)

    intro = body.intro.strip() if body.intro else None
    now = datetime.now(UTC)
    profile = BusinessProfile(
        user_id=session_uid,
        name=name,
        category=body.category,
        address=address,
        intro=intro,
        latitude=body.latitude,
        longitude=body.longitude,
        phone=body.phone,
        photo_content_id=body.photo_content_id,
        status="PENDING",
        created_at=now,
        updated_at=now,
        # 원문만으로 즉시 검색 가능(번역 대기 없음) — search.reindex 소비 후 번역이 얹혀 재계산된다.
        search_blob=immediate_blob([name, address, intro]),
    )
    db.add(profile)
    await db.flush()
    noti_events.enqueue(
        db, "search.reindex", {"entity_type": "biz", "entity_id": str(profile.id), "texts": [name, address, intro]}
    )
    await db.commit()
    await db.refresh(profile)
    background.add_task(warm_translations, [name, address, intro or ""])
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
    background: BackgroundTasks,
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

    intro = body.intro.strip() if body.intro else None
    profile.name = name
    profile.category = body.category
    profile.address = address
    profile.intro = intro
    profile.latitude = body.latitude
    profile.longitude = body.longitude
    profile.phone = body.phone
    profile.photo_content_id = body.photo_content_id
    profile.updated_at = datetime.now(UTC)
    profile.search_blob = immediate_blob([name, address, intro])

    # REJECTED 재신청 → 재심사 큐로 (APPROVED 는 정보 수정만, 상태 유지)
    if profile.status == "REJECTED":
        profile.status = "PENDING"
        profile.reject_reason = None
        profile.reviewed_at = None

    noti_events.enqueue(
        db, "search.reindex", {"entity_type": "biz", "entity_id": str(profile.id), "texts": [name, address, intro]}
    )
    await db.commit()
    await db.refresh(profile)
    background.add_task(warm_translations, [name, address, intro or ""])
    return _out(profile)


@router.post("/verification", response_model=BusinessProfileOut, summary="비즈니스 검증 문서 제출")
async def submit_verification(
    body: BusinessVerificationRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """중간 검증 문서 제출 — 사업자등록증(+간판) content 를 프로필에 연결하고 docs_submitted 로 전환.
    contents 는 contents 라우터로 선업로드 후 UUID 만 전달(민감 문서 — 원문 경로 미노출)."""
    profile = await _get_own_profile(db, body.profile_id, session_uid)
    if profile.verification_status == "verified":
        raise HTTPException(status_code=409, detail="Already verified")
    await _require_owned_content(db, body.biz_license_content_id, session_uid)
    await _require_owned_content(db, body.signboard_content_id, session_uid)

    profile.biz_license_content_id = body.biz_license_content_id
    profile.signboard_content_id = body.signboard_content_id
    if body.rep_name is not None:
        profile.rep_name = body.rep_name.strip() or None
    profile.verification_status = "docs_submitted"
    profile.verification_reject_reason = None
    profile.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(profile)
    return _out(profile)


# ── 파트너 광고 (SGR-312 BP-4 — D3 [등록→심사→게시]) ─────────────


def _ad_out(ad: AdRead) -> BusinessAdOut:
    # contents 중개 이미지 우선, 레거시 image_url 은 read-only 폴백 (BP-5 이관 광고)
    if ad.image_file_path:
        image_url = build_imgproxy_url(ad.image_file_path, options="rs:fill:360:200:1")
    elif ad.image_url and not ad.image_url.startswith("http"):
        image_url = build_imgproxy_url(ad.image_url, options="rs:fill:360:200:1")
    else:
        image_url = ad.image_url
    return BusinessAdOut(
        id=ad.id,
        profile_id=ad.owner_business_profile_id,
        tier_id=ad.tier_id,
        tier_name=ad.tier_name,
        monthly_price_snapshot_vnd=ad.monthly_price_snapshot_vnd,
        title=ad.title,
        body=ad.body,
        image_url=image_url,
        review_status=ad.review_status,
        reject_reason=ad.reject_reason,
        is_ongoing=ad.is_ongoing,
        subscription_status=ad.subscription_status,
        starts_at=ad.starts_at,
        ends_at=ad.ends_at,
        created_at=ad.created_at,
    )


@router.get("/ad-tiers", response_model=list[AdTierOut], summary="신청 가능한 광고 티어")
async def list_ad_tiers(db: AsyncSession = Depends(get_db)):
    return await AdsApplication(db).list_active_tiers()


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
    await _require_content(db, body.image_content_id)

    try:
        ad = await AdsApplication(db).create_ad(
            profile=profile,
            user_id=session_uid,
            tier_id=body.tier_id,
            title=body.title.strip(),
            body=body.body,
            image_content_id=body.image_content_id,
            is_ongoing=body.is_ongoing,
            ends_at=body.ends_at,
        )
    except AdsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _ad_out(ad)


@router.get("/ads", response_model=list[BusinessAdOut], summary="내 프로필의 광고 목록")
async def list_ads(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _get_own_profile(db, profile_id, session_uid)
    ads = await AdsApplication(db).own_ads(profile_id)
    return [_ad_out(a) for a in ads]


@router.get("/ads/{ad_id}", response_model=BusinessAdOut, summary="내 광고 상세 (반려 사유 포함)")
async def get_ad(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    try:
        ad, _ = await AdsApplication(db).own_ad(ad_id, session_uid)
    except AdsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _ad_out(ad)


@router.post("/ads/{ad_id}/stop", response_model=BusinessAdOut, summary="광고 게시 중단")
async def stop_ad(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    try:
        ad = await AdsApplication(db).stop(ad_id, session_uid)
    except AdsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _ad_out(ad)


@router.post("/ads/{ad_id}/resume", response_model=BusinessAdOut, summary="광고 게시 재개")
async def resume_ad(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    try:
        ad = await AdsApplication(db).resume(ad_id, session_uid)
    except AdsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _ad_out(ad)


# ── 광고 성과 대시보드 (ai-docs/spec/ad-performance-metrics.md §7/§8 B-9) ──────
# 조회는 ad_daily_stats 롤업만 읽는다(원시 ad_events 스캔 금지). 수집·롤업 파이프라인은
# 후속 단계라 지금은 항상 빈 결과(0)가 정상 — 그것을 감추지 않고 빈 상태로 정직하게 보여준다.

_PERIOD_DAYS = {"7d": 7, "14d": 14, "30d": 30, "all": None}
_SERIES_PERIODS = ("7d", "14d", "30d")


def _is_launching_ad(ad: MarketplaceAd, now: datetime) -> bool:
    """launching_ad_conditions(services/ad_gating.py) 의 단일 객체 버전 — 상태 판정용."""
    if ad.review_status != "APPROVED" or not ad.is_active:
        return False
    if ad.starts_at is not None and ad.starts_at > now:
        return False
    return not (ad.ends_at is not None and ad.ends_at < now)


def _ad_ever_launched(ad: MarketplaceAd) -> bool:
    """광고비가 실제로 발생한 적 있는지 — 심사중(PENDING)/반려(REJECTED)/입금대기 는 제외.

    review_status 가 APPROVED/STOPPED 라는 것은 최소 한 번 승인(=게시 시작)됐다는 뜻이고,
    subscription_status='pending_payment' 는 아직 입금 확인 전이라 비용이 발생하지 않았다.
    """
    if ad.review_status not in ("APPROVED", "STOPPED"):
        return False
    return ad.subscription_status != "pending_payment"


def _ad_spend_for_period(ad: MarketplaceAd, start_date, today) -> float:
    """단일 광고의 조회기간 내 광고비 — 게시기간 ∩ 조회기간 교집합 일수로 안분(§2-4).

    ad-stats-summary/ad-stats-series 공용 헬퍼 (중복 구현 금지).
    """
    if not _ad_ever_launched(ad):
        return 0.0
    ad_start = (ad.starts_at or ad.created_at).astimezone(_VN_TZ).date()
    ad_end = ad.ends_at.astimezone(_VN_TZ).date() if ad.ends_at is not None else today
    overlap_start = max(ad_start, start_date) if start_date is not None else ad_start
    overlap_end = min(ad_end, today)
    overlap_days = max(0, (overlap_end - overlap_start).days + 1)
    price = ad.monthly_price_snapshot_vnd or 0  # NULL 스냅샷은 0 원으로 취급
    return price * overlap_days / 30


@router.get(
    "/profiles/{profile_id}/ad-stats-summary",
    response_model=BizAdStatsSummaryOut,
    summary="광고 성과 대시보드 요약 (프로필 전체 광고 합산)",
)
async def get_ad_stats_summary(
    profile_id: uuid.UUID,
    period: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _get_own_profile(db, profile_id, session_uid)
    if period not in _PERIOD_DAYS:
        raise HTTPException(status_code=400, detail="Invalid period")
    days = _PERIOD_DAYS[period]

    ads = (
        (await db.execute(select(MarketplaceAd).where(MarketplaceAd.owner_business_profile_id == profile_id)))
        .scalars()
        .all()
    )
    if not ads:
        return BizAdStatsSummaryOut(
            state="no_ads", period=period, period_days=days or 0, min_sample_for_ratio=MIN_SAMPLE_FOR_RATIO
        )

    now = datetime.now(UTC)
    active = [a for a in ads if _is_launching_ad(a, now)]
    ever_approved = [a for a in ads if a.review_status == "APPROVED"]
    is_ended = False
    if active:
        reference_ad = min(active, key=lambda a: a.starts_at or a.created_at)
    elif ever_approved:
        reference_ad = max(ever_approved, key=lambda a: a.created_at)
        is_ended = True
    else:
        reference_ad = None

    today = datetime.now(_VN_TZ).date()
    start_date = today - timedelta(days=days - 1) if days is not None else None

    stmt = select(
        func.coalesce(func.sum(AdDailyStat.impressions), 0),
        func.coalesce(func.sum(AdDailyStat.reach), 0),
        func.coalesce(func.sum(AdDailyStat.clicks), 0),
        func.coalesce(func.sum(AdDailyStat.cta_call), 0),
        func.coalesce(func.sum(AdDailyStat.cta_follow), 0),
        func.coalesce(func.sum(AdDailyStat.cta_favorite), 0),
        func.coalesce(func.sum(AdDailyStat.cta_review), 0),
        func.coalesce(func.sum(AdDailyStat.cta_secondary), 0),
    ).where(AdDailyStat.business_profile_id == profile_id)
    if start_date is not None:
        stmt = stmt.where(AdDailyStat.stat_date >= start_date, AdDailyStat.stat_date <= today)
    impressions, reach, clicks, cta_call, cta_follow, cta_favorite, cta_review, cta_secondary = (
        await db.execute(stmt)
    ).one()
    primary_cta_total = cta_call + cta_follow + cta_favorite + cta_review

    if reference_ad is None:
        state = "pending"  # 광고가 있으나 한 번도 게시된 적이 없음(심사중/입금대기/반려) — 데이터 발생 불가
    elif not is_ended and (now - (reference_ad.starts_at or reference_ad.created_at)) < timedelta(hours=24):
        state = "warming_up"
    elif impressions < MIN_SAMPLE_FOR_RATIO:
        state = "low_sample"
    else:
        state = "normal"

    ctr = cvr = ad_spend = cpm = cpc = cpa = None
    if state == "normal":
        ctr = (clicks / impressions * 100) if impressions else None
        cvr = (primary_cta_total / clicks * 100) if clicks else None
        # 광고비는 프로필의 광고 전체를 각자의 게시기간 ∩ 조회기간으로 교집합해 합산한다
        # (ai-docs/spec/ad-performance-metrics.md HIGH-2/MEDIUM-1 처방). 노출/클릭/CTA 도
        # 프로필 전체 합산이므로 분자·분모의 집계 범위를 맞춰야 CPM/CPC/CPA 가 과소되지 않는다.
        spend = sum(_ad_spend_for_period(ad, start_date, today) for ad in ads)
        ad_spend = round(spend)
        cpm = (ad_spend / impressions * 1000) if impressions else None
        cpc = (ad_spend / clicks) if clicks else None
        cpa = (ad_spend / primary_cta_total) if primary_cta_total else None

    return BizAdStatsSummaryOut(
        state=state,
        period=period,
        period_days=days or 0,  # NOTE: period='all' 이면 0 으로 내려감 — 계약 모호(프론트 동반수정 필요, 이번엔 미변경)
        impressions=impressions,
        reach=reach,
        clicks=clicks,
        cta_call=cta_call,
        cta_follow=cta_follow,
        cta_favorite=cta_favorite,
        cta_review=cta_review,
        primary_cta_total=primary_cta_total,
        cta_secondary=cta_secondary,
        min_sample_for_ratio=MIN_SAMPLE_FOR_RATIO,
        ctr=ctr,
        cvr=cvr,
        ad_spend_vnd=ad_spend,
        cpm_vnd=cpm,
        cpc_vnd=cpc,
        cpa_vnd=cpa,
        is_ended=is_ended,
        ad_started_at=reference_ad.starts_at if reference_ad else None,
        ad_ends_at=reference_ad.ends_at if reference_ad else None,
    )


@router.get(
    "/profiles/{profile_id}/ad-stats-series",
    response_model=BizAdStatsSeriesOut,
    summary="광고 성과 시계열 (일별 배열 + 기간비교 + 광고별 분해)",
)
async def get_ad_stats_series(
    profile_id: uuid.UUID,
    period: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _get_own_profile(db, profile_id, session_uid)
    if period not in _SERIES_PERIODS:
        raise HTTPException(status_code=400, detail="Invalid period")
    days = _PERIOD_DAYS[period]

    today = datetime.now(_VN_TZ).date()
    start_date = today - timedelta(days=days - 1)
    prev_end = start_date - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)

    ads = (
        (await db.execute(select(MarketplaceAd).where(MarketplaceAd.owner_business_profile_id == profile_id)))
        .scalars()
        .all()
    )
    ad_ids = [a.id for a in ads]

    # 일별 시계열 — 단일 집계 쿼리 (surface 는 합산, 광고 수만큼 쿼리 안 돎 — N+1 금지)
    daily_by_date: dict = {}
    if ad_ids:
        daily_stmt = (
            select(
                AdDailyStat.stat_date,
                func.sum(AdDailyStat.impressions),
                func.sum(AdDailyStat.reach),
                func.sum(AdDailyStat.clicks),
                func.sum(AdDailyStat.cta_call),
                func.sum(AdDailyStat.cta_follow),
                func.sum(AdDailyStat.cta_favorite),
                func.sum(AdDailyStat.cta_review),
                func.sum(AdDailyStat.cta_secondary),
            )
            .where(
                AdDailyStat.ad_id.in_(ad_ids),
                AdDailyStat.stat_date >= start_date,
                AdDailyStat.stat_date <= today,
            )
            .group_by(AdDailyStat.stat_date)
        )
        daily_by_date = {row[0]: row[1:] for row in (await db.execute(daily_stmt)).all()}

    series: list[AdStatsSeriesPoint] = []
    totals = AdStatsSeriesTotals()
    for i in range(days):
        d = start_date + timedelta(days=i)
        impr, reach, clicks, call, follow, fav, review, secondary = daily_by_date.get(d, (0, 0, 0, 0, 0, 0, 0, 0))
        impr, reach, clicks, call, follow, fav, review, secondary = (
            impr or 0,
            reach or 0,
            clicks or 0,
            call or 0,
            follow or 0,
            fav or 0,
            review or 0,
            secondary or 0,
        )
        primary = call + follow + fav + review
        series.append(
            AdStatsSeriesPoint(
                date=d, impressions=impr, reach=reach, clicks=clicks, cta_primary=primary, cta_secondary=secondary
            )
        )
        totals.impressions += impr
        totals.reach += reach
        totals.clicks += clicks
        totals.cta_call += call
        totals.cta_follow += follow
        totals.cta_favorite += fav
        totals.cta_review += review
        totals.cta_primary += primary
        totals.cta_secondary += secondary

    # 직전 동일 길이 기간 — 단일 합계 쿼리 (경계: prev_end = start_date - 1일, 겹치지 않음)
    previous = AdStatsSeriesPrevious()
    if ad_ids:
        prev_stmt = select(
            func.coalesce(func.sum(AdDailyStat.impressions), 0),
            func.coalesce(func.sum(AdDailyStat.reach), 0),
            func.coalesce(func.sum(AdDailyStat.clicks), 0),
            func.coalesce(
                func.sum(
                    AdDailyStat.cta_call + AdDailyStat.cta_follow + AdDailyStat.cta_favorite + AdDailyStat.cta_review
                ),
                0,
            ),
            func.coalesce(func.sum(AdDailyStat.cta_secondary), 0),
        ).where(
            AdDailyStat.ad_id.in_(ad_ids),
            AdDailyStat.stat_date >= prev_start,
            AdDailyStat.stat_date <= prev_end,
        )
        p_impr, p_reach, p_clicks, p_primary, p_secondary = (await db.execute(prev_stmt)).one()
        previous = AdStatsSeriesPrevious(
            impressions=p_impr, reach=p_reach, clicks=p_clicks, cta_primary=p_primary, cta_secondary=p_secondary
        )

    # 광고별 분해 — 단일 집계 쿼리 (광고 수만큼 쿼리 안 돎 — N+1 금지)
    by_ad_rows: dict = {}
    if ad_ids:
        by_ad_stmt = (
            select(
                AdDailyStat.ad_id,
                func.sum(AdDailyStat.impressions),
                func.sum(AdDailyStat.reach),
                func.sum(AdDailyStat.clicks),
                func.sum(
                    AdDailyStat.cta_call + AdDailyStat.cta_follow + AdDailyStat.cta_favorite + AdDailyStat.cta_review
                ),
            )
            .where(
                AdDailyStat.ad_id.in_(ad_ids),
                AdDailyStat.stat_date >= start_date,
                AdDailyStat.stat_date <= today,
            )
            .group_by(AdDailyStat.ad_id)
        )
        by_ad_rows = {row[0]: row[1:] for row in (await db.execute(by_ad_stmt)).all()}

    now = datetime.now(UTC)
    by_ad: list[AdStatsByAdItem] = []
    for ad in ads:
        impr, reach, clicks, primary = by_ad_rows.get(ad.id, (0, 0, 0, 0))
        spend = round(_ad_spend_for_period(ad, start_date, today))
        is_ended = _ad_ever_launched(ad) and not _is_launching_ad(ad, now)
        by_ad.append(
            AdStatsByAdItem(
                ad_id=ad.id,
                title=ad.title,
                impressions=impr or 0,
                reach=reach or 0,
                clicks=clicks or 0,
                cta_primary=primary or 0,
                spend_vnd=spend,
                review_status=ad.review_status,
                is_ended=is_ended,
            )
        )
    spend_vnd = sum(item.spend_vnd for item in by_ad)

    ctr = cvr = cpm = cpc = cpa = None
    if totals.impressions >= MIN_SAMPLE_FOR_RATIO:
        ctr = (totals.clicks / totals.impressions * 100) if totals.impressions else None
        cvr = (totals.cta_primary / totals.clicks * 100) if totals.clicks else None
        cpm = (spend_vnd / totals.impressions * 1000) if totals.impressions else None
        cpc = (spend_vnd / totals.clicks) if totals.clicks else None
        cpa = (spend_vnd / totals.cta_primary) if totals.cta_primary else None

    return BizAdStatsSeriesOut(
        period=period,
        period_days=days,
        series=series,
        totals=totals,
        previous=previous,
        by_ad=by_ad,
        spend_vnd=spend_vnd,
        min_sample_for_ratio=MIN_SAMPLE_FOR_RATIO,
        ctr=ctr,
        cvr=cvr,
        cpm_vnd=cpm,
        cpc_vnd=cpc,
        cpa_vnd=cpa,
    )


# ── 공개 비즈니스 프로필 (SGR-312 BP-6 — AD 카드 탭 노출면) ─────────


def _public_ad_out(ad: AdRead) -> MarketplaceAdOut:
    """market.py GET /ads 의 이미지 해상 로직 미러 (BP-4 contents 중개 우선)."""
    return MarketplaceAdOut(
        id=ad.id,
        partner_name=ad.partner_name,
        title=ad.title,
        body=ad.body,
        image_url=ad.image_file_path or ad.image_url,
        link_url=ad.link_url,
        phone=ad.phone,
        address=ad.address,
        owner_id=ad.owner_id,
        owner_business_profile_id=ad.owner_business_profile_id,
        district_id=ad.district_id,
        category=ad.category,
        rating=float(ad.rating) if ad.rating is not None else None,
        service_count=ad.service_count,
        established_year=ad.established_year,
        business_hours=ad.business_hours,
    )


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


async def _review_stats_map(db: AsyncSession, profile_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[int, float]]:
    """프로필별 (후기 수, 평균 별점) 일괄 집계 — GROUP BY 한 방 (N+1 방지)."""
    if not profile_ids:
        return {}
    rows = (
        await db.execute(
            select(BusinessReview.profile_id, func.count(), func.avg(BusinessReview.rating))
            .where(BusinessReview.profile_id.in_(profile_ids))
            .group_by(BusinessReview.profile_id)
        )
    ).all()
    return {pid: (int(cnt), round(float(avg), 1)) for pid, cnt, avg in rows}


async def _follower_count_map(db: AsyncSession, profile_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """프로필별 단골(팔로우) 수 일괄 집계 (N+1 방지)."""
    if not profile_ids:
        return {}
    rows = (
        await db.execute(
            select(BusinessFollow.profile_id, func.count())
            .where(BusinessFollow.profile_id.in_(profile_ids))
            .group_by(BusinessFollow.profile_id)
        )
    ).all()
    return {pid: int(cnt) for pid, cnt in rows}


async def _favorite_count_map(db: AsyncSession, profile_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """프로필별 찜(관심) 수 일괄 집계 (N+1 방지) — _follower_count_map 미러."""
    if not profile_ids:
        return {}
    rows = (
        await db.execute(
            select(UserFavoriteBusiness.profile_id, func.count())
            .where(UserFavoriteBusiness.profile_id.in_(profile_ids))
            .group_by(UserFavoriteBusiness.profile_id)
        )
    ).all()
    return {pid: int(cnt) for pid, cnt in rows}


async def _review_previews_map(
    db: AsyncSession, profile_ids: list[uuid.UUID], per_profile: int = 2
) -> dict[uuid.UUID, list[BusinessReviewBrief]]:
    """프로필별 최신 후기 N건 프리뷰 — row_number 윈도우 한 방 (N+1 방지). 본문은 카드용 120자 컷."""
    if not profile_ids:
        return {}
    rn = (
        func.row_number()
        .over(partition_by=BusinessReview.profile_id, order_by=BusinessReview.created_at.desc())
        .label("rn")
    )
    sub = (
        select(BusinessReview.profile_id, BusinessReview.rating, BusinessReview.body, rn)
        .where(BusinessReview.profile_id.in_(profile_ids))
        .subquery()
    )
    rows = (
        await db.execute(
            select(sub.c.profile_id, sub.c.rating, sub.c.body)
            .where(sub.c.rn <= per_profile)
            .order_by(sub.c.profile_id, sub.c.rn)
        )
    ).all()
    out: dict[uuid.UUID, list[BusinessReviewBrief]] = {}
    for pid, rating, body in rows:
        out.setdefault(pid, []).append(BusinessReviewBrief(rating=rating, body=body[:120]))
    return out


async def _ward_map(db: AsyncSession, profiles: list[BusinessProfile]) -> dict[uuid.UUID, Ward]:
    """프로필별 최근접 ward — 센터 좌표 기준 haversine (find_nearest_ward_id/·_nearest_ward 패턴 미러)."""
    if not profiles:
        return {}
    wards = (
        (
            await db.execute(
                select(Ward).where(
                    Ward.is_active == True,
                    Ward.city_code == "HCMC",
                    Ward.center_lat.isnot(None),
                    Ward.center_lng.isnot(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not wards:
        return {}
    return {
        p.id: min(
            wards,
            key=lambda w: haversine_m(float(p.latitude), float(p.longitude), w.center_lat, w.center_lng),
        )
        for p in profiles
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
    lat: Decimal | None = None,
    lng: Decimal | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """동네지도 업체 핀 레이어 — APPROVED + 좌표 보유 프로필만 bbox 범위로 노출.

    S-5: `lat`/`lng`(조회자 위치)가 주어지면 거리순(가까운 순)으로 정렬 — "우리 동네" 리스트인데
    페이지 경계가 없는 id 순이라 40km 밖 업체가 상단에 오던 문제. 좌표가 없으면(위치 거부/실패)
    기존 `id.asc()` 로 폴백해 페이지네이션 결정론을 유지한다(info_gas/info_repair 의
    ST_Distance/ST_DWithin geography 캐스트 패턴 미러, business_profile.geom 은 143 migration 의
    GENERATED GEOGRAPHY 컬럼).
    """
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
    if q and q.strip():
        # 다국어 검색(260801 설계 P4) — market.py 와 동일한 search_blob LIKE 매칭.
        # COALESCE 필수: blob 이 NULL(미색인)인 행이 검색에서 사라지면 안 된다(fail-open).
        nq = norm(q).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(func.coalesce(BusinessProfile.search_blob, "").like(f"%{nq}%", escape="\\"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    if lat is not None and lng is not None:
        order_clause = text(
            "ST_Distance(business_profile.geom, ST_SetSRID(ST_MakePoint(:origin_lng, :origin_lat), 4326)::geography)"
        ).bindparams(origin_lng=float(lng), origin_lat=float(lat))
    else:
        order_clause = BusinessProfile.id.asc()
    profiles = (await db.execute(stmt.order_by(order_clause).offset((page - 1) * size).limit(size))).scalars().all()

    profile_ids = [p.id for p in profiles]
    latest_news_by_profile = await _latest_news_map(db, profile_ids)
    review_stats = await _review_stats_map(db, profile_ids)
    follower_counts = await _follower_count_map(db, profile_ids)
    favorite_counts = await _favorite_count_map(db, profile_ids)
    review_previews = await _review_previews_map(db, profile_ids)
    wards_by_profile = await _ward_map(db, profiles)

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
            ward_name_ko=wards_by_profile[p.id].name_ko if p.id in wards_by_profile else None,
            ward_name_vi=wards_by_profile[p.id].name_vi if p.id in wards_by_profile else None,
            ward_name_en=wards_by_profile[p.id].name_en if p.id in wards_by_profile else None,
            rating=review_stats[p.id][1] if p.id in review_stats else None,
            review_count=review_stats[p.id][0] if p.id in review_stats else 0,
            follower_count=follower_counts.get(p.id, 0),
            favorite_count=favorite_counts.get(p.id, 0),
            review_previews=review_previews.get(p.id, []),
        )
        for p in profiles
    ]
    return BusinessMapPageOut(items=items, total=total, page=page, size=size, has_more=page * size < total)


_NEWS_FEED_DEFAULT_LIMIT = 8
_NEWS_FEED_MAX_LIMIT = 20


@router.get(
    "/public/news/recent",
    response_model=list[BusinessNewsFeedItemOut],
    summary="홈 '업체 소식' 피드 (여러 업체 최신 소식, 업체당 1건)",
)
async def get_public_news_recent(
    limit: int = _NEWS_FEED_DEFAULT_LIMIT,
    db: AsyncSession = Depends(get_db),
):
    """홈 화면 '업체 소식' 섹션 — GET /public/map 과 동일하게 APPROVED 프로필만 노출.
    업체당 최신 소식 1건으로 묶은 뒤(DISTINCT ON) created_at DESC 로 재정렬한다(N+1 없음)."""
    limit = max(1, min(limit, _NEWS_FEED_MAX_LIMIT))

    latest_ids = (
        select(BusinessNews.id)
        .join(BusinessProfile, BusinessProfile.id == BusinessNews.profile_id)
        .where(BusinessProfile.status == "APPROVED")
        .distinct(BusinessNews.profile_id)
        .order_by(BusinessNews.profile_id, BusinessNews.created_at.desc())
    ).subquery()

    rows = (
        await db.execute(
            select(BusinessNews, BusinessProfile)
            .join(BusinessProfile, BusinessProfile.id == BusinessNews.profile_id)
            .where(BusinessNews.id.in_(select(latest_ids.c.id)))
            .order_by(BusinessNews.created_at.desc())
            .limit(limit)
        )
    ).all()

    return [
        BusinessNewsFeedItemOut(
            profile_id=p.id,
            profile_name=p.name,
            category=p.category,
            photo_url=build_imgproxy_url(p.photo_content.file_path) if p.photo_content else None,
            news_id=n.id,
            title=n.title,
            created_at=n.created_at,
            photos=[build_imgproxy_url(ph.content.file_path) for ph in n.photos if ph.content and ph.content.file_path],
        )
        for n, p in rows
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
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    """일반 유저가 AD 카드 탭으로 진입하는 공개 프로필면 — APPROVED 프로필만 노출(그 외 404)."""
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.status != "APPROVED":
        raise HTTPException(status_code=404, detail="Business profile not found")

    # 게시중 광고 노출 조건 — market.py GET /ads 미러 (APPROVED + is_active + 기간 유효)
    ads = await AdsApplication(db).profile_public_ads(profile_id)
    photo_url = build_imgproxy_url(profile.photo_content.file_path) if profile.photo_content else None
    follower_count = (
        await db.execute(
            select(func.count()).select_from(BusinessFollow).where(BusinessFollow.profile_id == profile_id)
        )
    ).scalar_one()
    is_following = (
        session_uid is not None
        and await db.get(BusinessFollow, {"user_id": session_uid, "profile_id": profile_id}) is not None
    )
    is_owner = session_uid is not None and profile.user_id == session_uid
    return BusinessPublicProfileOut(
        id=profile.id,
        name=profile.name,
        category=profile.category,
        address=profile.address,
        latitude=profile.latitude,
        longitude=profile.longitude,
        phone=profile.phone,
        photo_url=photo_url,
        intro=profile.intro,
        ads=[_public_ad_out(a) for a in ads],
        follower_count=follower_count,
        is_following=is_following,
        is_owner=is_owner,
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


@router.post("/news", response_model=BusinessNewsItemOut, status_code=201, summary="업체 소식 등록 (오너)")
async def create_news(
    body: BusinessNewsCreateRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """업체 오너가 소식 등록 — 무료 기능(유료 광고 게이트와 무관). N-6: 노출은 APPROVED만 되지만
    작성 자체는 소유권만 검사해 PENDING 프로필도 쓸 수 있었다 — create_ad 와 동일한 게이트로 통일."""
    profile = await _get_own_profile(db, body.profile_id, session_uid)
    if profile.status != "APPROVED":
        raise HTTPException(status_code=409, detail="Only approved business profiles can post news")
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    for cid in body.photo_content_ids:
        await _require_content(db, cid)

    news = BusinessNews(
        profile_id=profile.id,
        title=title,
        body=body.body,
        created_at=datetime.now(UTC),
        # 원문만으로 즉시 검색 가능(번역 대기 없음) — search.reindex 소비 후 번역이 얹혀 재계산된다.
        search_blob=immediate_blob([title, body.body]),
    )
    db.add(news)
    await db.flush()

    photos: list[str] = []
    for idx, cid in enumerate(body.photo_content_ids):
        db.add(BusinessNewsPhoto(news_id=news.id, content_id=cid, sort_order=idx))
        content = await db.get(Content, cid)
        if content and content.file_path:
            photos.append(build_imgproxy_url(content.file_path))

    noti_events.enqueue(
        db, "search.reindex", {"entity_type": "news", "entity_id": str(news.id), "texts": [title, body.body or ""]}
    )
    await db.commit()
    background.add_task(warm_translations, [title, body.body or ""])
    return BusinessNewsItemOut(id=news.id, title=news.title, body=news.body, created_at=news.created_at, photos=photos)


@router.delete("/news/{news_id}", summary="업체 소식 삭제 (오너)")
async def delete_news(
    news_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    news = await db.get(BusinessNews, news_id)
    if news is None:
        raise HTTPException(status_code=404, detail="News not found")
    await _get_own_profile(db, news.profile_id, session_uid)  # 오너십 검증 (소유 아니면 404 로 통일)
    await db.delete(news)
    await db.commit()
    return {"deleted": True}


# ── 업체 가격표 (파트너 라운지 가격표 등록) — business_news CRUD 패턴 미러 ──


@router.get("/public/{profile_id}/prices", response_model=list[BusinessPriceItemOut], summary="업체 가격표 목록 (공개)")
async def get_public_prices(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """공개 프로필 '가격표' 섹션 — APPROVED 프로필만(그 외 404), 등록 순(sort_order)."""
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.status != "APPROVED":
        raise HTTPException(status_code=404, detail="Business profile not found")

    rows = (
        (
            await db.execute(
                select(BusinessPrice).where(BusinessPrice.profile_id == profile_id).order_by(BusinessPrice.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return [
        BusinessPriceItemOut(
            id=p.id, name=p.name, price_vnd=p.price_vnd, sort_order=p.sort_order, created_at=p.created_at
        )
        for p in rows
    ]


@router.post("/prices", response_model=BusinessPriceItemOut, status_code=201, summary="업체 가격표 항목 등록 (오너)")
async def create_price(
    body: BusinessPriceCreateRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """업체 오너가 가격표 항목 등록 — 무료 기능(소식과 동일)."""
    profile = await _get_own_profile(db, body.profile_id, session_uid)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    next_sort = (
        await db.execute(select(func.count()).select_from(BusinessPrice).where(BusinessPrice.profile_id == profile.id))
    ).scalar_one()

    price = BusinessPrice(
        profile_id=profile.id, name=name, price_vnd=body.price_vnd, sort_order=next_sort, created_at=datetime.now(UTC)
    )
    db.add(price)
    await db.commit()
    background.add_task(warm_translations, [name])
    return BusinessPriceItemOut(
        id=price.id,
        name=price.name,
        price_vnd=price.price_vnd,
        sort_order=price.sort_order,
        created_at=price.created_at,
    )


@router.delete("/prices/{price_id}", summary="업체 가격표 항목 삭제 (오너)")
async def delete_price(
    price_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    price = await db.get(BusinessPrice, price_id)
    if price is None:
        raise HTTPException(status_code=404, detail="Price not found")
    await _get_own_profile(db, price.profile_id, session_uid)  # 오너십 검증 (소유 아니면 404 로 통일)
    await db.delete(price)
    await db.commit()
    return {"deleted": True}


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


# ── 업체 단골(팔로우) — 찜(favorite)과 별개 개념 (init/152) ──────


@router.post("/follow/{profile_id}", status_code=201, summary="업체 단골 맺기")
async def add_follow(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.status != "APPROVED":
        raise HTTPException(status_code=404, detail="Business profile not found")
    existing = await db.get(BusinessFollow, {"user_id": session_uid, "profile_id": profile_id})
    if existing is None:
        db.add(BusinessFollow(user_id=session_uid, profile_id=profile_id))
        await db.commit()
    return {"following": True}


@router.delete("/follow/{profile_id}", summary="업체 단골 해제")
async def remove_follow(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    existing = await db.get(BusinessFollow, {"user_id": session_uid, "profile_id": profile_id})
    if existing is not None:
        await db.delete(existing)
        await db.commit()
    return {"following": False}


@router.get("/follow", response_model=list[BusinessFollowOut], summary="내 단골 업체 목록")
async def get_follows(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """get_favorites 미러 — 단골은 '소식 구독'이 실체이므로 latest_news 를 항상 함께 내려준다.
    비승인으로 전환된 업체는 찜 목록과 동일하게 숨긴다(status == APPROVED 필터, 대표 지시)."""
    rows = (
        await db.execute(
            select(BusinessProfile, BusinessFollow.created_at)
            .join(BusinessFollow, BusinessFollow.profile_id == BusinessProfile.id)
            .where(BusinessFollow.user_id == session_uid, BusinessProfile.status == "APPROVED")
            .order_by(BusinessFollow.created_at.desc())
            .limit(200)
        )
    ).all()

    latest_news_by_profile = await _latest_news_map(db, [p.id for p, _ in rows])

    return [
        BusinessFollowOut(
            id=p.id,
            name=p.name,
            category=p.category,
            address=p.address,
            lat=p.latitude,
            lng=p.longitude,
            photo_url=build_imgproxy_url(p.photo_content.file_path) if p.photo_content else None,
            latest_news=latest_news_by_profile.get(p.id),
            followed_at=followed_at,
        )
        for p, followed_at in rows
    ]
