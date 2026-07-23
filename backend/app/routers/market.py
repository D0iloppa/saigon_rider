import logging
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, literal_column, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import optional_user_session, verify_user_session
from ..models import (
    DmConversation,
    DmMessage,
    MarketplaceAd,
    MarketplaceAppointment,
    MarketplaceCategory,
    MarketplaceKeywordAlert,
    MarketplaceListing,
    MarketplaceListingImage,
    MarketplaceListingLike,
    MarketplacePriceOffer,
    MarketplaceReview,
    Report,
    User,
    UserBlock,
    UserFollow,
)
from ..schemas import (
    AppointmentOut,
    AppointmentProposeRequest,
    BlockedUserOut,
    DistrictBrief,
    DmMessageOut,
    MarketplaceAdOut,
    MarketplaceBumpResult,
    MarketplaceCategoryOut,
    MarketplaceKeywordAlertCreateRequest,
    MarketplaceKeywordAlertDeleteRequest,
    MarketplaceKeywordAlertOut,
    MarketplaceLikeRequest,
    MarketplaceLikeResult,
    MarketplaceListingCard,
    MarketplaceListingCreated,
    MarketplaceListingCreateRequest,
    MarketplaceListingDetail,
    MarketplaceListingPriceUpdate,
    MarketplaceListingStatusUpdate,
    MarketplaceReportCreateRequest,
    MarketplaceReviewCreateRequest,
    MarketplaceReviewResult,
    Page,
    PriceOfferOut,
    PriceOfferProposeRequest,
    ReviewBrief,
    SellerBrief,
    TradeHistoryItem,
)
from ..services import noti_events
from ..services.ad_exposure import build_exposure_sequence
from ..services.ad_gating import launching_ad_conditions
from ..services.dm_policy import require_participant, require_unblocked
from ..services.service_area import in_service_area
from ..services.translate import lookup_lang_batch, translate_all, translate_to, warm_translations
from ..utils import build_imgproxy_url, default_avatar_url, find_nearest_ward_id, mask_phone, resolve_avatar_url

router = APIRouter(prefix="/market", tags=["거래 플랫폼 (Marketplace)"])
log = logging.getLogger(__name__)

_VALID_STATUSES = {"ON_SALE", "RESERVED", "SOLD"}
_BUMP_COOLDOWN = timedelta(hours=4)  # 끌올 쿨다운


_MANNER_BASE = 36.5


async def _recompute_manner_temp(db: AsyncSession, target_id) -> float:
    """별점 기반 매너온도 재계산: 36.5 + Σ delta(score) (0~99).
    5★=+0.5, 4★=+0.25, 3★=0, 2★=-0.5, 1★=-1.0"""
    _DELTA = {5: 0.5, 4: 0.25, 3: 0.0, 2: -0.5, 1: -1.0}
    rows = (
        (await db.execute(select(MarketplaceReview.rating).where(MarketplaceReview.target_id == target_id)))
        .scalars()
        .all()
    )
    delta = sum(_DELTA.get(int(r), 0.0) for r in rows)
    temp = max(0.0, min(99.0, round(_MANNER_BASE + delta, 1)))
    user = await db.get(User, target_id)
    if user:
        user.manner_temp = temp
    return temp


def _thumbnail_url(listing: MarketplaceListing) -> str | None:
    for img in listing.images or []:
        if img.content and img.content.file_path:
            return build_imgproxy_url(img.content.file_path)
    return None


def _district_brief(district) -> DistrictBrief | None:
    if district is None:
        return None
    return DistrictBrief(id=district.id, name_ko=district.name_ko, name_vi=district.name_vi, name_en=district.name_en)


def _card(listing: MarketplaceListing, distance_m: int | None = None, chat_count: int = 0) -> MarketplaceListingCard:
    return MarketplaceListingCard(
        id=listing.id,
        seller_id=listing.seller_id,
        title=listing.title,
        description=listing.description,
        price_vnd=listing.price_vnd,
        original_price_vnd=listing.original_price_vnd,
        is_negotiable=listing.is_negotiable,
        status=listing.status,
        category_code=listing.category.code if listing.category else None,
        thumbnail_url=_thumbnail_url(listing),
        district=_district_brief(listing.district),
        like_count=listing.like_count,
        chat_count=chat_count,
        bumped_at=listing.bumped_at,
        distance_m=distance_m,
        lat=float(listing.latitude) if listing.latitude is not None else None,
        lng=float(listing.longitude) if listing.longitude is not None else None,
    )


# M-1 품목 카테고리 (master, admin-editable)
@router.get("/categories", response_model=list[MarketplaceCategoryOut], summary="품목 카테고리 목록")
async def get_categories(db: AsyncSession = Depends(get_db)):
    rows = (
        (
            await db.execute(
                select(MarketplaceCategory)
                .where(MarketplaceCategory.is_active == True)
                .order_by(MarketplaceCategory.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return rows


def _public_ad_out(ad: MarketplaceAd) -> MarketplaceAdOut:
    """BP-4: contents 중개 이미지(image_content_id) 우선 — 레거시 image_url 은 validator 폴백."""
    out = MarketplaceAdOut.model_validate(ad)
    if ad.image_content:
        out.image_url = build_imgproxy_url(ad.image_content.file_path, options="rs:fill:360:200:1")
    return out


# M-8 제휴광고 (활성·지역 타게팅: 해당 구 + 전역). 피드 중간 삽입용.
@router.get("/ads", response_model=list[MarketplaceAdOut], summary="제휴 광고 목록")
async def get_ads(
    district_id: int | None = Query(None, description="지역 타게팅 (해당 구 + 전역 광고)"),
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 제목·본문을 캐시된 번역으로 표기"),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    # BP-4 노출 게이트: 심사 통과(APPROVED) 광고만 노출 (PENDING/REJECTED/STOPPED 제외)
    q = select(MarketplaceAd).where(*launching_ad_conditions(now))
    if district_id is not None:
        q = q.where(or_(MarketplaceAd.district_id == district_id, MarketplaceAd.district_id.is_(None)))
    q = q.order_by(MarketplaceAd.sort_order)
    ads = (await db.execute(q)).scalars().all()
    # 148: 균등 순환 대신 tier+ad_fee 가중 로테이션 시퀀스로 변환(반복 허용).
    # sort_order 정렬 입력은 동일 weight 광고의 결정적 tiebreak 로 보존된다.
    # 프론트는 이 리스트를 위치기반으로만 순환(재가중 안 함).
    ads = build_exposure_sequence(list(ads))
    if not lang:
        return [_public_ad_out(a) for a in ads]
    # 조회 언어로 제목·본문 표기(캐시 히트만, 없으면 원문). 배치 — API 호출 안 함.
    out = [_public_ad_out(a) for a in ads]
    titles = await lookup_lang_batch([o.title for o in out], lang, db)
    bodies = await lookup_lang_batch([o.body or "" for o in out], lang, db)
    for o, tt, bb in zip(out, titles, bodies, strict=True):
        o.title = tt
        o.body = bb or o.body
    return out


# M-8b 제휴 광고 상세 (앱 내 — 외부 라우팅 X)
@router.get("/ads/{ad_id}", response_model=MarketplaceAdOut, summary="제휴 광고 상세")
async def get_ad(
    ad_id: uuid.UUID,
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 제목·본문 번역"),
    db: AsyncSession = Depends(get_db),
):
    ad = (
        await db.execute(
            select(MarketplaceAd).where(
                MarketplaceAd.id == ad_id,
                MarketplaceAd.is_active == True,
                MarketplaceAd.review_status == "APPROVED",  # BP-4 노출 게이트
            )
        )
    ).scalar_one_or_none()
    if ad is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    if not lang:
        return _public_ad_out(ad)
    out = _public_ad_out(ad)
    out.title, title_failed = await translate_to(ad.title, lang, db)
    body_failed = False
    if ad.body:
        out.body, body_failed = await translate_to(ad.body, lang, db)
    out.translation_failed = title_failed or body_failed
    await db.commit()  # translate_to 워밍 결과 영속화
    return out


# M-2 동네 피드 (매물 목록 — 카테고리·정렬·거래완료 숨김·거리·페이지네이션)
@router.get("/listings", response_model=Page[MarketplaceListingCard], summary="매물 목록 (동네 피드)")
async def get_listings(
    category: str | None = Query(None, description="카테고리 code (예: PARTS). 'all'/미지정 시 전체"),
    category_id: int | None = Query(None, description="카테고리 id (하위 포함 subtree 매칭 — 검색용)"),
    keyword: str | None = Query(None, alias="q", description="제목 키워드 검색"),
    sort: str = Query("recent", description="recent | price_low | price_high | distance"),
    hide_sold: bool = Query(False, description="거래완료(SOLD) 매물 제외"),
    price_min: int | None = Query(None, description="최저 가격 (VND)"),
    price_max: int | None = Query(None, description="최고 가격 (VND)"),
    lat: float | None = Query(None, description="내 위치 위도 (거리 계산·거리순)"),
    lng: float | None = Query(None, description="내 위치 경도"),
    min_lat: float | None = Query(None, description="지도 뷰포트 최소 위도 (bbox 필터)"),
    max_lat: float | None = Query(None, description="지도 뷰포트 최대 위도"),
    min_lng: float | None = Query(None, description="지도 뷰포트 최소 경도"),
    max_lng: float | None = Query(None, description="지도 뷰포트 최대 경도"),
    district_id: int | None = Query(None, description="구 id — deprecated, ward_id 권장"),
    ward_id: int | None = Query(None, description="ward id (2025 신 행정단위)"),
    seller_id: uuid.UUID | None = Query(None, description="판매자 id — 내 매물 조회용"),
    viewer_id: uuid.UUID | None = Query(None, description="deprecated — 조회자는 세션에서 파생"),
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 제목을 캐시된 번역으로 표기"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    offset = (page - 1) * size
    has_loc = lat is not None and lng is not None

    if has_loc:
        # float 인라인(주입 위험 없음) — TextClause는 .label() 미지원이라 literal_column 사용
        dist = literal_column(
            "ST_Distance("
            "ST_SetSRID(ST_MakePoint(marketplace_listings.longitude, marketplace_listings.latitude), 4326)::geography,"
            f"ST_SetSRID(ST_MakePoint({float(lng)}, {float(lat)}), 4326)::geography)"
        )
        q = select(MarketplaceListing, dist.label("distance_m"))
    else:
        q = select(MarketplaceListing)
    count_q = select(func.count()).select_from(MarketplaceListing)

    if category and category.lower() != "all":
        q = q.join(MarketplaceCategory, MarketplaceListing.category_id == MarketplaceCategory.id).where(
            MarketplaceCategory.code == category.upper()
        )
        count_q = count_q.join(MarketplaceCategory, MarketplaceListing.category_id == MarketplaceCategory.id).where(
            MarketplaceCategory.code == category.upper()
        )

    if category_id is not None:
        # 대분류 선택 시 자식까지 포함(2-depth subtree)
        subtree = select(MarketplaceCategory.id).where(
            (MarketplaceCategory.id == category_id) | (MarketplaceCategory.parent_id == category_id)
        )
        q = q.where(MarketplaceListing.category_id.in_(subtree))
        count_q = count_q.where(MarketplaceListing.category_id.in_(subtree))

    if keyword and keyword.strip():
        # 다국어 검색: 검색어를 3개국어로 변환 → 원문 제목을 모든 변형으로 OR 매칭
        # (사용자는 번역된 제목을 보지만 제목은 원문 저장 → 원문/번역 양쪽 매칭).
        kw = keyword.strip()
        variants = {kw}
        try:
            b = await translate_all(kw, db)
            variants.update(v for v in (b["kr"], b["en"], b["vi"]) if v)
        except (httpx.HTTPError, httpx.RequestError, KeyError, IndexError, ValueError) as exc:
            log.warning("search query translate failed: %s", exc)
        kw_cond = or_(*(MarketplaceListing.title.ilike(f"%{v}%") for v in variants))
        q = q.where(kw_cond)
        count_q = count_q.where(kw_cond)

    if ward_id is not None:
        q = q.where(MarketplaceListing.ward_id == ward_id)
        count_q = count_q.where(MarketplaceListing.ward_id == ward_id)
    elif district_id is not None:
        q = q.where(MarketplaceListing.district_id == district_id)
        count_q = count_q.where(MarketplaceListing.district_id == district_id)

    if seller_id is not None:
        q = q.where(MarketplaceListing.seller_id == seller_id)
        count_q = count_q.where(MarketplaceListing.seller_id == seller_id)

    if session_uid is not None:
        blocked_users = select(UserBlock.blocked_id).where(UserBlock.blocker_id == session_uid)
        blocking_users = select(UserBlock.blocker_id).where(UserBlock.blocked_id == session_uid)
        q = q.where(
            MarketplaceListing.seller_id.notin_(blocked_users), MarketplaceListing.seller_id.notin_(blocking_users)
        )
        count_q = count_q.where(
            MarketplaceListing.seller_id.notin_(blocked_users),
            MarketplaceListing.seller_id.notin_(blocking_users),
        )

    # 공개 정책: 모더레이션된 매물은 query/viewer 값과 무관하게 항상 비노출.
    q = q.where(MarketplaceListing.status.notin_(("HIDDEN", "REMOVED")))
    count_q = count_q.where(MarketplaceListing.status.notin_(("HIDDEN", "REMOVED")))

    if hide_sold:
        q = q.where(MarketplaceListing.status != "SOLD")
        count_q = count_q.where(MarketplaceListing.status != "SOLD")

    if price_min is not None:
        q = q.where(MarketplaceListing.price_vnd >= price_min)
        count_q = count_q.where(MarketplaceListing.price_vnd >= price_min)
    if price_max is not None:
        q = q.where(MarketplaceListing.price_vnd <= price_max)
        count_q = count_q.where(MarketplaceListing.price_vnd <= price_max)

    if min_lat is not None and max_lat is not None and min_lng is not None and max_lng is not None:
        # 지도 뷰포트 확대 조회 — 반경/전역 최신순이 아니라 현재 화면 bbox 안의 매물만 필터
        q = q.where(
            MarketplaceListing.latitude >= min_lat,
            MarketplaceListing.latitude <= max_lat,
            MarketplaceListing.longitude >= min_lng,
            MarketplaceListing.longitude <= max_lng,
        )
        count_q = count_q.where(
            MarketplaceListing.latitude >= min_lat,
            MarketplaceListing.latitude <= max_lat,
            MarketplaceListing.longitude >= min_lng,
            MarketplaceListing.longitude <= max_lng,
        )

    if sort == "price_low":
        q = q.order_by(
            MarketplaceListing.price_vnd.asc(), MarketplaceListing.bumped_at.desc(), MarketplaceListing.id.desc()
        )
    elif sort == "price_high":
        q = q.order_by(
            MarketplaceListing.price_vnd.desc(), MarketplaceListing.bumped_at.desc(), MarketplaceListing.id.desc()
        )
    elif sort == "distance" and has_loc:
        q = q.order_by(text("distance_m ASC NULLS LAST"), MarketplaceListing.id.desc())
    else:
        # id tie-breaker: bumped_at 동률(시드 데이터 다수)에서 offset 페이지네이션이
        # 페이지 간 중복/누락을 만들던 문제 차단 (시나리오 4.1/4.2 — ghost 카드 근인)
        q = q.order_by(MarketplaceListing.bumped_at.desc(), MarketplaceListing.id.desc())

    total = (await db.execute(count_q)).scalar_one()
    rows = (await db.execute(q.offset(offset).limit(size))).all()

    # 매물별 채팅 건수 — 페이지 항목 id 로 dm_conversations 그룹 집계 1회 (항목별 COUNT N+1 금지)
    chat_counts: dict[uuid.UUID, int] = {}
    listing_ids = [row[0].id for row in rows]
    if listing_ids:
        chat_rows = (
            await db.execute(
                select(DmConversation.context_id, func.count())
                .where(DmConversation.context_type == "listing", DmConversation.context_id.in_(listing_ids))
                .group_by(DmConversation.context_id)
            )
        ).all()
        chat_counts = {cid: cnt for cid, cnt in chat_rows}

    if has_loc:
        items = [
            _card(row[0], int(row[1]) if row[1] is not None else None, chat_counts.get(row[0].id, 0)) for row in rows
        ]
    else:
        items = [_card(row[0], chat_count=chat_counts.get(row[0].id, 0)) for row in rows]

    # 조회 언어로 제목 표기(캐시 히트만, 없으면 원문). 배치(MGET+IN) — API 호출 안 함.
    if lang:
        titles = await lookup_lang_batch([it.title for it in items], lang, db)
        for it, tt in zip(items, titles, strict=True):
            it.title = tt
    return Page(items=items, total=total, page=page, size=size)


# M-3 매물 상세 (+ 판매자 다른 매물)
@router.get("/listings/{listing_id}", response_model=MarketplaceListingDetail, summary="매물 상세")
async def get_listing(
    listing_id: uuid.UUID,
    user_id: uuid.UUID | None = Query(None, description="deprecated — 조회자는 세션에서 파생"),
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 제목·설명을 번역해 표기(미스 시 번역·워밍)"),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
):
    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    if listing is None or listing.status in ("HIDDEN", "REMOVED"):
        raise HTTPException(status_code=404, detail="Listing not found")

    if session_uid is not None:
        blocked = (
            await db.execute(
                select(UserBlock.blocker_id).where(
                    or_(
                        (UserBlock.blocker_id == session_uid) & (UserBlock.blocked_id == listing.seller_id),
                        (UserBlock.blocker_id == listing.seller_id) & (UserBlock.blocked_id == session_uid),
                    )
                )
            )
        ).first()
        if blocked is not None:
            raise HTTPException(status_code=404, detail="Listing not found")

    listing.view_count += 1

    liked = False
    if session_uid is not None:
        liked = (await db.get(MarketplaceListingLike, {"listing_id": listing_id, "user_id": session_uid})) is not None

    image_urls = [
        build_imgproxy_url(img.content.file_path)
        for img in listing.images or []
        if img.content and img.content.file_path
    ]

    seller = listing.seller
    is_following = False
    if session_uid is not None and session_uid != seller.id:
        is_following = (await db.get(UserFollow, {"follower_id": session_uid, "following_id": seller.id})) is not None

    review_rows = (
        (await db.execute(select(MarketplaceReview.rating).where(MarketplaceReview.target_id == seller.id)))
        .scalars()
        .all()
    )
    review_count = len(review_rows)
    avg_rating = round(sum(review_rows) / review_count, 1) if review_count > 0 else None

    # MKT-3: 판매 신뢰지표는 실제 완료된 거래(COMPLETED 약속) 기준 — raw status='SOLD' 집계 금지
    sold_count = (
        await db.execute(
            select(func.count())
            .select_from(MarketplaceAppointment)
            .join(MarketplaceListing, MarketplaceListing.id == MarketplaceAppointment.listing_id)
            .where(MarketplaceListing.seller_id == seller.id, MarketplaceAppointment.status == "COMPLETED")
        )
    ).scalar_one()

    seller_brief = SellerBrief(
        id=seller.id,
        nickname=seller.nickname,
        avatar_url=resolve_avatar_url(seller) or default_avatar_url(seed=str(seller.id)),
        level=seller.level,
        manner_temp=float(seller.manner_temp),
        review_count=review_count,
        avg_rating=avg_rating,
        sold_count=sold_count,
        is_following=is_following,
        is_phone_verified=seller.phone_verified_at is not None,
        phone_masked=mask_phone(seller.phone) if seller.phone_verified_at is not None else None,
    )

    others = (
        (
            await db.execute(
                select(MarketplaceListing)
                .where(
                    MarketplaceListing.seller_id == listing.seller_id,
                    MarketplaceListing.id != listing.id,
                    MarketplaceListing.status.notin_(("HIDDEN", "REMOVED")),
                )
                .order_by(MarketplaceListing.bumped_at.desc())
                .limit(10)
            )
        )
        .scalars()
        .all()
    )

    title_out = listing.title
    desc_out = listing.description
    translation_failed = False
    if lang:
        title_out, title_failed = await translate_to(listing.title, lang, db)
        desc_failed = False
        if listing.description:
            desc_out, desc_failed = await translate_to(listing.description, lang, db)
        translation_failed = title_failed or desc_failed

    detail = MarketplaceListingDetail(
        id=listing.id,
        title=title_out,
        description=desc_out,
        price_vnd=listing.price_vnd,
        original_price_vnd=listing.original_price_vnd,
        is_negotiable=listing.is_negotiable,
        status=listing.status,
        category=MarketplaceCategoryOut.model_validate(listing.category) if listing.category else None,
        image_urls=image_urls,
        seller=seller_brief,
        district=_district_brief(listing.district),
        like_count=listing.like_count,
        view_count=listing.view_count,
        created_at=listing.created_at,
        bumped_at=listing.bumped_at,
        liked=liked,
        other_listings=[_card(o) for o in others],
        translation_failed=translation_failed,
    )
    await db.commit()
    return detail


# M-4 매물 등록
@router.post("/listings", response_model=MarketplaceListingCreated, status_code=201, summary="매물 등록")
async def create_listing(
    body: MarketplaceListingCreateRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 세션 유저 명의로만 등록 가능 — body.seller_id 는 세션과 일치해야 함 (impersonation 차단)
    if body.seller_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    # 판매자 휴대폰 인증 게이트 — OTP 인증(phone_verified_at) 완료 전 매물 등록 불가
    seller = await db.get(User, _session_uid)
    if seller is None or seller.phone_verified_at is None:
        raise HTTPException(status_code=403, detail="Phone verification required to list items")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="title is required")
    if body.latitude is not None and body.longitude is not None and not in_service_area(body.latitude, body.longitude):
        raise HTTPException(status_code=422, detail="Location is outside the service area")

    now = datetime.now(UTC)
    # 동네지도 배지(map.py listings 탭)가 ward_id 기준 집계 — 좌표가 있으면 ward를 배정해야 지도에 노출된다
    ward_id = (
        await find_nearest_ward_id(db, body.latitude, body.longitude)
        if body.latitude is not None and body.longitude is not None
        else None
    )
    listing = MarketplaceListing(
        seller_id=body.seller_id,
        category_id=body.category_id,
        title=body.title.strip(),
        description=body.description,
        price_vnd=body.price_vnd,
        is_negotiable=body.is_negotiable,
        status="ON_SALE",
        district_id=body.district_id,
        ward_id=ward_id,
        latitude=body.latitude,
        longitude=body.longitude,
        bumped_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(listing)
    await db.flush()
    listing_id = listing.id

    for idx, cid in enumerate(body.image_content_ids):
        db.add(MarketplaceListingImage(listing_id=listing_id, content_id=cid, sort_order=idx))

    # 키워드 매칭·푸시는 noti_worker 로 이관. FD-6: 매물 등록과 같은 트랜잭션에 이벤트를 적재해
    # (relay 가 발행) 커밋~발행 사이 유실을 막는다.
    noti_events.enqueue(
        db,
        "market.listing_created",
        {"listing_id": str(listing_id), "title": listing.title, "seller_id": str(body.seller_id)},
    )
    await db.commit()
    # 번역 세트 워밍(백그라운드) — 조회 시 캐시 히트로 번역본 즉시 로딩
    background.add_task(warm_translations, [listing.title, listing.description or ""])
    return MarketplaceListingCreated(id=listing_id)


# M-5 상태 전환 (판매자 전용: 판매중/예약중/거래완료)
@router.patch("/listings/{listing_id}/status", response_model=MarketplaceListingCreated, summary="매물 상태 변경")
async def update_status(
    listing_id: uuid.UUID,
    body: MarketplaceListingStatusUpdate,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.status not in _VALID_STATUSES:
        raise HTTPException(status_code=400, detail="invalid status")
    # MKT-3: SOLD 는 거래 완료(complete_appointment) 경로로만 전이 — 수동 PATCH 금지
    if body.status == "SOLD":
        raise HTTPException(status_code=400, detail={"code": "sold_via_appointment"})

    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.seller_id != session_uid:
        raise HTTPException(status_code=403, detail="Not the seller")
    # 관리자 모더레이션(HIDDEN/REMOVED) 매물은 판매자가 상태를 되돌릴 수 없다
    if listing.status in ("HIDDEN", "REMOVED"):
        raise HTTPException(status_code=400, detail={"code": "moderated"})

    listing.status = body.status
    listing.updated_at = datetime.now(UTC)
    await db.commit()
    return MarketplaceListingCreated(id=listing.id)


# M-5b 가격 변경 (판매자 전용). 인하 시 original_price_vnd 기록 → '가격내림' 배지.
@router.patch("/listings/{listing_id}/price", response_model=MarketplaceListingCreated, summary="매물 가격 변경")
async def update_price(
    listing_id: uuid.UUID,
    body: MarketplaceListingPriceUpdate,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.price_vnd < 0:
        raise HTTPException(status_code=400, detail="invalid price")

    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.seller_id != session_uid:
        raise HTTPException(status_code=403, detail="Not the seller")
    # MKT-7: 판매 완료된 매물은 가격 변경 불가 (거래 이력의 합의가 정합성 근거)
    if listing.status == "SOLD":
        raise HTTPException(status_code=409, detail="Cannot change price of a sold listing")

    new_price = body.price_vnd
    if new_price < listing.price_vnd:
        # 인하: 기준가(인하 전) 보존
        if listing.original_price_vnd is None:
            listing.original_price_vnd = listing.price_vnd
    elif listing.original_price_vnd is not None and new_price >= listing.original_price_vnd:
        # 기준가 이상으로 회복 → 배지 해제
        listing.original_price_vnd = None
    listing.price_vnd = new_price
    listing.updated_at = datetime.now(UTC)
    await db.commit()
    return MarketplaceListingCreated(id=listing.id)


# M-5c 끌어올리기 (판매자 전용, ON_SALE 만, 쿨다운). bumped_at 갱신 → 피드 상단 노출.
@router.post("/listings/{listing_id}/bump", response_model=MarketplaceBumpResult, summary="매물 끌어올리기")
async def bump_listing(
    listing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.seller_id != session_uid:
        raise HTTPException(status_code=403, detail="Not the seller")
    if listing.status != "ON_SALE":
        raise HTTPException(status_code=400, detail="only on-sale listings can be bumped")

    now = datetime.now(UTC)
    elapsed = now - listing.bumped_at
    if elapsed < _BUMP_COOLDOWN:
        retry_after = int((_BUMP_COOLDOWN - elapsed).total_seconds())
        raise HTTPException(status_code=429, detail={"code": "cooldown", "retry_after": retry_after})

    listing.bumped_at = now
    listing.updated_at = now
    await db.commit()
    return MarketplaceBumpResult(id=listing.id, bumped_at=now)


_VALID_REPORT_REASONS = {"SPAM", "FRAUD", "PROHIBITED", "DUPLICATE", "OTHER"}


# M-5d 매물 신고 (모더레이션 적재). 신고자당 매물 1회, 자기 매물 신고 불가.
@router.post("/listings/{listing_id}/report", status_code=201, summary="매물 신고")
async def report_listing(
    listing_id: uuid.UUID,
    body: MarketplaceReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.reason not in _VALID_REPORT_REASONS:
        raise HTTPException(status_code=400, detail="invalid reason")

    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.seller_id == session_uid:
        raise HTTPException(status_code=400, detail="cannot report your own listing")

    # 중복 판정 — reports 부분 유니크(uq_reports_listing_once: listing_id x reporter_id WHERE LISTING)와 동일 조건
    dup = (
        await db.execute(
            select(Report.id).where(
                Report.target_type == "LISTING",
                Report.listing_id == listing_id,
                Report.reporter_id == session_uid,
            )
        )
    ).first()
    if dup is not None:
        raise HTTPException(status_code=409, detail="already reported")

    db.add(
        Report(
            target_type="LISTING",
            reporter_id=session_uid,
            reported_user_id=listing.seller_id,
            listing_id=listing_id,
            reason=body.reason,
            note=(body.note or None),
        )
    )
    await db.commit()
    return {"ok": True}


# M-7 사용자 차단 (차단자 피드에서 피차단자 매물 제외).
@router.post("/users/{user_id}/block", status_code=204, summary="사용자 차단")
async def block_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if user_id == session_uid:
        raise HTTPException(status_code=400, detail="cannot block yourself")
    if await db.get(UserBlock, {"blocker_id": session_uid, "blocked_id": user_id}) is None:
        db.add(UserBlock(blocker_id=session_uid, blocked_id=user_id))
        await db.commit()


@router.delete("/users/{user_id}/block", status_code=204, summary="사용자 차단 해제")
async def unblock_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    block = await db.get(UserBlock, {"blocker_id": session_uid, "blocked_id": user_id})
    if block is not None:
        await db.delete(block)
        await db.commit()


@router.get("/blocks", response_model=list[BlockedUserOut], summary="내가 차단한 사용자 목록")
async def list_blocks(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    rows = (await db.execute(select(UserBlock).where(UserBlock.blocker_id == session_uid))).scalars().all()
    out: list[BlockedUserOut] = []
    for b in rows:
        u = await db.get(User, b.blocked_id)
        out.append(
            BlockedUserOut(
                user_id=b.blocked_id,
                nickname=u.nickname if u else None,
                avatar_url=resolve_avatar_url(u) if u else None,
            )
        )
    return out


# M-6 거래 후기 (만족도+칭찬+텍스트 → 대상 매너온도 재계산). '별로예요'는 미노출.
@router.post("/reviews", response_model=MarketplaceReviewResult, status_code=201, summary="거래 후기 작성")
async def create_review(
    body: MarketplaceReviewCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.rating not in (1, 2, 3, 4, 5):
        raise HTTPException(status_code=400, detail="rating must be 1~5")
    if body.reviewer_id == body.target_id:
        raise HTTPException(status_code=400, detail="cannot review yourself")
    if body.reviewer_id != session_uid:
        raise HTTPException(status_code=403, detail="reviewer mismatch")

    # 무결성: 후기는 해당 매물의 실제 거래 당사자에게만 (어뷰징 차단)
    # 구매자→판매자, 판매자→구매자 모두 허용
    listing = (
        (
            await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == body.listing_id))
        ).scalar_one_or_none()
        if body.listing_id is not None
        else None
    )
    if listing is None:
        raise HTTPException(status_code=400, detail="listing not found")

    is_seller = listing.seller_id == body.reviewer_id
    is_buyer = listing.seller_id == body.target_id

    if is_seller:
        # 판매자가 리뷰: 구매자가 target이어야 함 — 완료된 약속에서 상대방 확인
        completed_appt = (
            await db.execute(
                select(MarketplaceAppointment)
                .join(DmConversation, DmConversation.id == MarketplaceAppointment.conversation_id)
                .where(
                    MarketplaceAppointment.listing_id == body.listing_id,
                    MarketplaceAppointment.status == "COMPLETED",
                    or_(
                        DmConversation.participant_1 == body.target_id,
                        DmConversation.participant_2 == body.target_id,
                    ),
                )
            )
        ).scalar_one_or_none()
        if completed_appt is None:
            raise HTTPException(status_code=400, detail="no completed trade with this buyer")
    elif is_buyer:
        # MKT-1: 구매자가 판매자를 리뷰 — 대칭 참여 검증(완료된 약속에 리뷰어=참여자). 별점 테러 차단.
        completed_appt = (
            await db.execute(
                select(MarketplaceAppointment)
                .join(DmConversation, DmConversation.id == MarketplaceAppointment.conversation_id)
                .where(
                    MarketplaceAppointment.listing_id == body.listing_id,
                    MarketplaceAppointment.status == "COMPLETED",
                    or_(
                        DmConversation.participant_1 == body.reviewer_id,
                        DmConversation.participant_2 == body.reviewer_id,
                    ),
                )
            )
        ).scalar_one_or_none()
        if completed_appt is None:
            raise HTTPException(status_code=400, detail="no completed trade with this seller")
    else:
        raise HTTPException(status_code=400, detail="review target must be a trade participant")

    # 중복 방지: 같은 매물·리뷰어·대상 조합이 이미 있으면 거절
    dup = (
        await db.execute(
            select(MarketplaceReview).where(
                MarketplaceReview.listing_id == body.listing_id,
                MarketplaceReview.reviewer_id == body.reviewer_id,
                MarketplaceReview.target_id == body.target_id,
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=409, detail="already reviewed")

    review = MarketplaceReview(
        listing_id=body.listing_id,
        reviewer_id=body.reviewer_id,
        target_id=body.target_id,
        rating=body.rating,
        manner_tags=body.manner_tags or None,
        comment=body.comment,
    )
    db.add(review)
    await db.flush()
    temp = await _recompute_manner_temp(db, body.target_id)
    await db.commit()
    return MarketplaceReviewResult(id=review.id, target_manner_temp=temp)


# M-7 찜(관심) 토글
@router.post("/listings/{listing_id}/like", response_model=MarketplaceLikeResult, summary="찜 토글")
async def toggle_like(
    listing_id: uuid.UUID,
    body: MarketplaceLikeRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    existing = await db.get(MarketplaceListingLike, {"listing_id": listing_id, "user_id": body.user_id})
    if existing:
        await db.delete(existing)
        listing.like_count = max(0, listing.like_count - 1)
        await db.commit()
        return MarketplaceLikeResult(liked=False, like_count=listing.like_count)

    db.add(MarketplaceListingLike(listing_id=listing_id, user_id=body.user_id))
    listing.like_count += 1
    await db.commit()
    return MarketplaceLikeResult(liked=True, like_count=listing.like_count)


# M-8 내 찜 목록 (마이 > 찜)
@router.get("/wishlist", response_model=list[MarketplaceListingCard], summary="내 찜 목록")
async def get_wishlist(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if user_id != session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = (
        (
            await db.execute(
                select(MarketplaceListing)
                .join(MarketplaceListingLike, MarketplaceListingLike.listing_id == MarketplaceListing.id)
                .where(MarketplaceListingLike.user_id == user_id)
                .order_by(MarketplaceListingLike.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_card(listing) for listing in rows]


# M-9 키워드 알림 구독 (🔔)
@router.get("/keyword-alerts", response_model=list[MarketplaceKeywordAlertOut], summary="내 키워드 알림 목록")
async def get_keyword_alerts(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if user_id != session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = (
        (
            await db.execute(
                select(MarketplaceKeywordAlert)
                .where(MarketplaceKeywordAlert.user_id == user_id)
                .order_by(MarketplaceKeywordAlert.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return rows


@router.post("/keyword-alerts", response_model=MarketplaceKeywordAlertOut, status_code=201, summary="키워드 알림 추가")
async def add_keyword_alert(
    body: MarketplaceKeywordAlertCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    keyword = body.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")
    if body.user_id != session_uid:
        raise HTTPException(status_code=403, detail="user mismatch")

    existing = (
        await db.execute(
            select(MarketplaceKeywordAlert).where(
                MarketplaceKeywordAlert.user_id == body.user_id,
                func.lower(MarketplaceKeywordAlert.keyword) == keyword.lower(),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    alert = MarketplaceKeywordAlert(user_id=body.user_id, keyword=keyword)
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.delete("/keyword-alerts/{alert_id}", status_code=204, summary="키워드 알림 삭제")
async def delete_keyword_alert(
    alert_id: uuid.UUID,
    body: MarketplaceKeywordAlertDeleteRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    alert = await db.get(MarketplaceKeywordAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.user_id != session_uid or alert.user_id != body.user_id:
        raise HTTPException(status_code=403, detail="Not the owner")
    await db.delete(alert)
    await db.commit()


# ── 거래 약속 (Appointments, SGR-287) ─────────────────────────────
# DM 메시지 meta → 도메인 엔티티 승격. 거래 1건의 만남 = 단일 진실.
# 생명주기: PROPOSED → ACCEPTED(listing RESERVED) → COMPLETED(listing SOLD) / CANCELLED


async def _appointment_unlocked(db: AsyncSession, conv: DmConversation, user_id: uuid.UUID) -> bool:
    """약속잡기 게이트 — 판매자는 항상 가능. 구매자는 판매자의 거래진행 액션 이후에만:
    ① 이 대화에 ACCEPTED 가격제안 존재, 또는 ② 판매자가 제안한 약속 존재."""
    if conv.context_type != "listing" or conv.context_id is None:
        return False
    listing = await db.get(MarketplaceListing, conv.context_id)
    if listing is None:
        return False
    if user_id == listing.seller_id:
        return True
    accepted_offer = (
        await db.execute(
            select(MarketplacePriceOffer.id)
            .where(
                MarketplacePriceOffer.conversation_id == conv.id,
                MarketplacePriceOffer.status == "ACCEPTED",
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if accepted_offer is not None:
        return True
    seller_appt = (
        await db.execute(
            select(MarketplaceAppointment.id)
            .where(
                MarketplaceAppointment.conversation_id == conv.id,
                MarketplaceAppointment.proposer_id == listing.seller_id,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return seller_appt is not None


def _appt_out(a: MarketplaceAppointment, seller_id: uuid.UUID | None = None) -> AppointmentOut:
    return AppointmentOut(
        id=a.id,
        listing_id=a.listing_id,
        conversation_id=a.conversation_id,
        proposer_id=a.proposer_id,
        seller_id=seller_id,
        when_at=a.when_at,
        place_name=a.place_name,
        place_lat=float(a.place_lat) if a.place_lat is not None else None,
        place_lng=float(a.place_lng) if a.place_lng is not None else None,
        status=a.status,
    )


@router.post("/appointments", response_model=DmMessageOut, status_code=201, summary="거래 약속 제안")
async def propose_appointment(
    body: AppointmentProposeRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """약속을 제안한다. 같은 대화의 기존 PROPOSED 약속은 supersede(CANCELLED).
    채팅 타임라인 유지를 위해 message_type='appointment' DM 메시지도 함께 생성해 반환한다."""
    conv = await db.get(DmConversation, body.conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    counterpart_id = require_participant(conv, session_uid)
    await require_unblocked(db, session_uid, counterpart_id)
    if conv.context_type != "listing" or conv.context_id is None:
        raise HTTPException(status_code=400, detail="Conversation is not linked to a listing")

    listing = await db.get(MarketplaceListing, conv.context_id)
    if listing is None or listing.seller_id not in (conv.participant_1, conv.participant_2):
        raise HTTPException(status_code=403, detail="Invalid conversation context")

    # 구매자 게이팅 — 판매자의 거래진행 액션(가격제안 수락 or 판매자 약속 제안) 전에는 제안 불가
    if not await _appointment_unlocked(db, conv, session_uid):
        raise HTTPException(status_code=403, detail="Appointment locked until the seller moves the deal forward")

    now = datetime.now(UTC)
    # 대화당 활성 제안 1건 — 직전 PROPOSED 들은 무효화
    await db.execute(
        update(MarketplaceAppointment)
        .where(
            MarketplaceAppointment.conversation_id == conv.id,
            MarketplaceAppointment.status == "PROPOSED",
        )
        .values(status="CANCELLED", updated_at=now)
    )

    appt = MarketplaceAppointment(
        listing_id=conv.context_id,
        conversation_id=conv.id,
        proposer_id=session_uid,
        when_at=body.when_at,
        place_name=body.place_name,
        place_lat=body.place_lat,
        place_lng=body.place_lng,
        status="PROPOSED",
        created_at=now,
        updated_at=now,
    )
    db.add(appt)
    await db.flush()

    when_label = body.when_at.strftime("%Y-%m-%d %H:%M")
    summary = f"약속 제안: {when_label}" + (f" {body.place_name}" if body.place_name else "")
    msg = DmMessage(
        conversation_id=conv.id,
        sender_id=session_uid,
        content=summary,
        message_type="appointment",
        meta={"appointmentId": str(appt.id)},
        created_at=now,
    )
    db.add(msg)
    conv.last_message_at = now
    await db.commit()

    return DmMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        content=msg.content,
        image_url=None,
        read_at=msg.read_at,
        created_at=msg.created_at,
        message_type=msg.message_type,
        meta=msg.meta,
        appointment=_appt_out(appt, listing.seller_id if listing else None),
    )


async def _load_appointment(
    db: AsyncSession, appointment_id: uuid.UUID, session_uid: uuid.UUID
) -> tuple[MarketplaceAppointment, DmConversation, MarketplaceListing]:
    appt = await db.get(MarketplaceAppointment, appointment_id)
    if appt is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    conv = await db.get(DmConversation, appt.conversation_id)
    if conv is None:
        raise HTTPException(status_code=403, detail="Not a participant")
    counterpart_id = require_participant(conv, session_uid)
    await require_unblocked(db, session_uid, counterpart_id)
    # MKT-2: 상태 전이(accept/complete/cancel)는 매물 행을 잠그고 원자적으로 재검사한다
    # — 서로 다른 대화의 두 구매자가 동시에 ACCEPTED/COMPLETED 에 도달하는 경합 차단.
    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == appt.listing_id).with_for_update())
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if (
        conv.context_type != "listing"
        or conv.context_id != appt.listing_id
        or listing.seller_id not in (conv.participant_1, conv.participant_2)
        or appt.proposer_id not in (conv.participant_1, conv.participant_2)
    ):
        raise HTTPException(status_code=403, detail="Invalid conversation context")
    return appt, conv, listing


@router.patch("/appointments/{appointment_id}/accept", response_model=AppointmentOut, summary="약속 수락")
async def accept_appointment(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """제안 상대(제안자가 아닌 참여자)가 수락 → ACCEPTED, 매물 ON_SALE→RESERVED."""
    appt, _conv, listing = await _load_appointment(db, appointment_id, session_uid)
    if session_uid == appt.proposer_id:
        raise HTTPException(status_code=403, detail="Proposer cannot accept own appointment")
    if appt.status != "PROPOSED":
        raise HTTPException(status_code=409, detail=f"Cannot accept appointment in status {appt.status}")
    # MKT-2: 매물이 이미 다른 거래로 예약/판매됐으면 수락 불가 (잠근 행 기준 재검사)
    if listing.status != "ON_SALE":
        raise HTTPException(status_code=409, detail="Listing is no longer available")

    now = datetime.now(UTC)
    appt.status = "ACCEPTED"
    appt.updated_at = now
    listing.status = "RESERVED"
    listing.updated_at = now
    await db.commit()
    return _appt_out(appt, listing.seller_id)


@router.patch("/appointments/{appointment_id}/complete", response_model=AppointmentOut, summary="거래 완료")
async def complete_appointment(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """판매자만 거래 완료 처리 → COMPLETED, 매물 SOLD. (제안은 누가 했든 완료는 판매자)"""
    appt, conv, listing = await _load_appointment(db, appointment_id, session_uid)
    if listing.seller_id != session_uid:
        raise HTTPException(status_code=403, detail="Only the seller can complete the deal")
    if appt.status != "ACCEPTED":
        raise HTTPException(status_code=409, detail=f"Cannot complete appointment in status {appt.status}")
    # MKT-2: 매물이 이미 다른 거래로 판매됐으면 완료 불가 (잠근 행 기준 재검사)
    if listing.status == "SOLD":
        raise HTTPException(status_code=409, detail="Listing already sold")

    # MKT-7: 합의가 스냅샷 — 수락된 가격제안이 있으면 그 금액, 없으면 완료 시점의 매물가.
    # 이후 판매자가 가격을 바꿔도 거래 이력에는 합의가가 보존된다.
    accepted_offer_amount = (
        await db.execute(
            select(MarketplacePriceOffer.amount)
            .where(
                MarketplacePriceOffer.conversation_id == conv.id,
                MarketplacePriceOffer.status == "ACCEPTED",
            )
            .order_by(MarketplacePriceOffer.updated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    now = datetime.now(UTC)
    appt.status = "COMPLETED"
    appt.updated_at = now
    listing.status = "SOLD"
    listing.agreed_price_vnd = accepted_offer_amount if accepted_offer_amount is not None else listing.price_vnd
    listing.updated_at = now
    await db.commit()
    return _appt_out(appt, listing.seller_id)


@router.patch("/appointments/{appointment_id}/cancel", response_model=AppointmentOut, summary="약속 취소")
async def cancel_appointment(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """참여자 누구나 취소 → CANCELLED. 수락 상태였으면 매물 RESERVED→ON_SALE 복귀."""
    appt, _conv, listing = await _load_appointment(db, appointment_id, session_uid)
    # 멱등: 이미 취소됨(또는 supersede)면 그대로 반환. 완료된 건만 취소 불가.
    if appt.status == "CANCELLED":
        return _appt_out(appt, listing.seller_id)
    if appt.status == "COMPLETED":
        raise HTTPException(status_code=409, detail="Cannot cancel a completed appointment")

    now = datetime.now(UTC)
    was_accepted = appt.status == "ACCEPTED"
    appt.status = "CANCELLED"
    appt.updated_at = now
    if was_accepted and listing.status == "RESERVED":
        listing.status = "ON_SALE"
        listing.updated_at = now
    await db.commit()
    return _appt_out(appt, listing.seller_id)


# ── 가격 제안 (Price Offers) ───────────────────────────────────────
# DM 메시지 meta → 도메인 엔티티 승격. 거래 약속(Appointments)과 동일 원칙.
# 생명주기: PROPOSED → ACCEPTED / DECLINED / CANCELLED (매물 상태는 변경 없음)


def _offer_out(o: MarketplacePriceOffer, seller_id: uuid.UUID | None = None) -> PriceOfferOut:
    return PriceOfferOut(
        id=o.id,
        listing_id=o.listing_id,
        conversation_id=o.conversation_id,
        proposer_id=o.proposer_id,
        seller_id=seller_id,
        amount=o.amount,
        status=o.status,
    )


@router.post("/price-offers", response_model=DmMessageOut, status_code=201, summary="가격 제안")
async def propose_price_offer(
    body: PriceOfferProposeRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """가격을 제안한다. 같은 대화의 기존 PROPOSED 제안은 supersede(CANCELLED).
    채팅 타임라인 유지를 위해 message_type='price_offer' DM 메시지도 함께 생성해 반환한다."""
    conv = await db.get(DmConversation, body.conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    counterpart_id = require_participant(conv, session_uid)
    await require_unblocked(db, session_uid, counterpart_id)
    if conv.context_type != "listing" or conv.context_id is None:
        raise HTTPException(status_code=400, detail="Conversation is not linked to a listing")

    listing = await db.get(MarketplaceListing, conv.context_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.seller_id not in (conv.participant_1, conv.participant_2):
        raise HTTPException(status_code=403, detail="Invalid conversation context")
    if not listing.is_negotiable:
        raise HTTPException(status_code=403, detail="Listing does not accept price offers")
    # RESERVED 는 허용 (약속 수락 후에도 같은 대화에서 가격 협상 여지) — 판매 종결만 차단
    if listing.status == "SOLD":
        raise HTTPException(status_code=409, detail="Listing already sold")
    if session_uid == listing.seller_id:
        raise HTTPException(status_code=403, detail="Seller cannot make an offer")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    now = datetime.now(UTC)
    # 대화당 활성 제안 1건 — 직전 PROPOSED 들은 무효화
    await db.execute(
        update(MarketplacePriceOffer)
        .where(
            MarketplacePriceOffer.conversation_id == conv.id,
            MarketplacePriceOffer.status == "PROPOSED",
        )
        .values(status="CANCELLED", updated_at=now)
    )

    offer = MarketplacePriceOffer(
        listing_id=conv.context_id,
        conversation_id=conv.id,
        proposer_id=session_uid,
        amount=body.amount,
        status="PROPOSED",
        created_at=now,
        updated_at=now,
    )
    db.add(offer)
    await db.flush()

    msg = DmMessage(
        conversation_id=conv.id,
        sender_id=session_uid,
        content=f"가격 제안: {body.amount:,} VND",
        message_type="price_offer",
        meta={"priceOfferId": str(offer.id)},
        created_at=now,
    )
    db.add(msg)
    conv.last_message_at = now
    await db.commit()

    return DmMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        content=msg.content,
        image_url=None,
        read_at=msg.read_at,
        created_at=msg.created_at,
        message_type=msg.message_type,
        meta=msg.meta,
        price_offer=_offer_out(offer, listing.seller_id),
    )


async def _load_price_offer(
    db: AsyncSession, offer_id: uuid.UUID, session_uid: uuid.UUID
) -> tuple[MarketplacePriceOffer, DmConversation, MarketplaceListing]:
    offer = await db.get(MarketplacePriceOffer, offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Price offer not found")
    conv = await db.get(DmConversation, offer.conversation_id)
    if conv is None:
        raise HTTPException(status_code=403, detail="Not a participant")
    counterpart_id = require_participant(conv, session_uid)
    await require_unblocked(db, session_uid, counterpart_id)
    listing = await db.get(MarketplaceListing, offer.listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if (
        conv.context_type != "listing"
        or conv.context_id != offer.listing_id
        or listing.seller_id not in (conv.participant_1, conv.participant_2)
        or offer.proposer_id not in (conv.participant_1, conv.participant_2)
    ):
        raise HTTPException(status_code=403, detail="Invalid conversation context")
    return offer, conv, listing


@router.patch("/price-offers/{offer_id}/accept", response_model=PriceOfferOut, summary="가격 제안 수락")
async def accept_price_offer(
    offer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """제안 상대(제안자가 아닌 참여자)가 수락 → ACCEPTED. 매물 status 변경 없음."""
    offer, _conv, listing = await _load_price_offer(db, offer_id, session_uid)
    if session_uid == offer.proposer_id:
        raise HTTPException(status_code=403, detail="Proposer cannot accept own offer")
    if offer.status != "PROPOSED":
        raise HTTPException(status_code=409, detail=f"Cannot accept offer in status {offer.status}")

    now = datetime.now(UTC)
    offer.status = "ACCEPTED"
    offer.updated_at = now
    await db.commit()
    return _offer_out(offer, listing.seller_id)


@router.patch("/price-offers/{offer_id}/decline", response_model=PriceOfferOut, summary="가격 제안 거절")
async def decline_price_offer(
    offer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """제안 상대(제안자가 아닌 참여자)가 거절 → DECLINED."""
    offer, _conv, listing = await _load_price_offer(db, offer_id, session_uid)
    if session_uid == offer.proposer_id:
        raise HTTPException(status_code=403, detail="Proposer cannot decline own offer")
    if offer.status != "PROPOSED":
        raise HTTPException(status_code=409, detail=f"Cannot decline offer in status {offer.status}")

    now = datetime.now(UTC)
    offer.status = "DECLINED"
    offer.updated_at = now
    await db.commit()
    return _offer_out(offer, listing.seller_id)


@router.patch("/price-offers/{offer_id}/cancel", response_model=PriceOfferOut, summary="가격 제안 취소")
async def cancel_price_offer(
    offer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """제안자만 취소 → CANCELLED."""
    offer, _conv, listing = await _load_price_offer(db, offer_id, session_uid)
    if session_uid != offer.proposer_id:
        raise HTTPException(status_code=403, detail="Only the proposer can cancel the offer")
    # 멱등: 이미 취소됨(또는 supersede)면 그대로 반환.
    if offer.status == "CANCELLED":
        return _offer_out(offer, listing.seller_id)
    if offer.status != "PROPOSED":
        raise HTTPException(status_code=409, detail=f"Cannot cancel offer in status {offer.status}")

    now = datetime.now(UTC)
    offer.status = "CANCELLED"
    offer.updated_at = now
    await db.commit()
    return _offer_out(offer, listing.seller_id)


@router.get("/trades", response_model=list[TradeHistoryItem], summary="거래 이력 (완료된 거래)")
async def get_trades(
    user_id: uuid.UUID = Query(..., description="대상 사용자"),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """내가 참여한 COMPLETED 약속 = 완료 거래 목록. 역할(판매/구매)·상대·후기여부 포함."""
    if user_id != session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = (
        await db.execute(
            select(MarketplaceAppointment, DmConversation)
            .join(DmConversation, DmConversation.id == MarketplaceAppointment.conversation_id)
            .where(
                MarketplaceAppointment.status == "COMPLETED",
                or_(DmConversation.participant_1 == user_id, DmConversation.participant_2 == user_id),
            )
            .order_by(MarketplaceAppointment.updated_at.desc())
        )
    ).all()

    out: list[TradeHistoryItem] = []
    for appt, conv in rows:
        listing = await db.get(MarketplaceListing, appt.listing_id)
        if listing is None:
            continue
        counterpart_id = conv.participant_2 if conv.participant_1 == user_id else conv.participant_1
        counterpart = await db.get(User, counterpart_id)
        review = (
            (
                await db.execute(
                    select(MarketplaceReview).where(
                        MarketplaceReview.reviewer_id == user_id,
                        MarketplaceReview.listing_id == appt.listing_id,
                    )
                )
            )
            .scalars()
            .first()
        )
        out.append(
            TradeHistoryItem(
                appointment_id=appt.id,
                conversation_id=conv.id,
                listing_id=listing.id,
                listing_title=listing.title,
                thumbnail_url=_thumbnail_url(listing),
                # MKT-7: 합의가 스냅샷 우선(과거 완료건은 미기록 → 현재가 폴백)
                price_vnd=listing.agreed_price_vnd if listing.agreed_price_vnd is not None else listing.price_vnd,
                role="sold" if listing.seller_id == user_id else "bought",
                counterpart_id=counterpart_id,
                counterpart_nickname=counterpart.nickname if counterpart else None,
                counterpart_avatar_url=resolve_avatar_url(counterpart) if counterpart else None,
                completed_at=appt.updated_at,
                review_left=review is not None,
                my_review=ReviewBrief(
                    rating=review.rating,
                    manner_tags=review.manner_tags,
                    comment=review.comment,
                    created_at=review.created_at,
                )
                if review
                else None,
            )
        )
    return out


@router.get("/reviews/mine", response_model=ReviewBrief | None, summary="특정 매물에 내가 남긴 후기")
async def get_my_review(
    listing_id: uuid.UUID = Query(..., description="매물 id"),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """거래완료(DM) 화면에서 내가 그 매물에 남긴 후기 내용을 표시하기 위한 조회. 없으면 null."""
    review = (
        (
            await db.execute(
                select(MarketplaceReview).where(
                    MarketplaceReview.reviewer_id == session_uid,
                    MarketplaceReview.listing_id == listing_id,
                )
            )
        )
        .scalars()
        .first()
    )
    if review is None:
        return None
    return ReviewBrief(
        rating=review.rating,
        manner_tags=review.manner_tags,
        comment=review.comment,
        created_at=review.created_at,
    )
