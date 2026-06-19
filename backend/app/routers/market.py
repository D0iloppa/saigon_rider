import logging
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, literal_column, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import (
    District,
    MarketplaceAd,
    MarketplaceCategory,
    MarketplaceKeywordAlert,
    MarketplaceListing,
    MarketplaceListingImage,
    MarketplaceListingLike,
    MarketplaceListingReport,
    MarketplaceReview,
    User,
    UserBlock,
    UserFollow,
)
from ..schemas import (
    DistrictBrief,
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
    SellerBrief,
)
from ..services.translate import lookup_lang_batch, translate_all, translate_to, warm_translations
from ..utils import build_imgproxy_url, default_avatar_url, resolve_avatar_url

router = APIRouter(prefix="/market", tags=["거래 플랫폼 (Marketplace)"])
log = logging.getLogger(__name__)

_VALID_STATUSES = {"ON_SALE", "RESERVED", "SOLD"}
_BUMP_COOLDOWN = timedelta(hours=4)  # 끌올 쿨다운


async def _notify_keyword_matches(db: AsyncSession, listing: MarketplaceListing) -> None:
    """등록된 매물 제목에 매칭되는 키워드 구독자에게 푸시(본인 제외). 실패해도 등록은 성공."""
    title_lower = (listing.title or "").lower()
    if not title_lower:
        return
    alerts = (await db.execute(select(MarketplaceKeywordAlert))).scalars().all()
    seen: set[uuid.UUID] = set()
    for alert in alerts:
        if alert.user_id == listing.seller_id or alert.user_id in seen:
            continue
        if alert.keyword.lower() in title_lower:
            seen.add(alert.user_id)
            try:
                await engine_client.notify_user_push(
                    str(alert.user_id),
                    title=f"🔔 {alert.keyword}",
                    body=listing.title,
                    data={"navigateTo": f"market&id={listing.id}"},
                )
            except (httpx.HTTPError, httpx.RequestError) as exc:
                log.warning("keyword-alert push failed user=%s: %s", alert.user_id, exc)


_MANNER_BASE = 36.5


async def _recompute_manner_temp(db: AsyncSession, target_id) -> float:
    """대상 유저의 후기로 매너온도 재계산: 36.5 + 0.5·좋아요 - 1.0·별로 (0~99)."""
    good = (
        await db.execute(
            select(func.count())
            .select_from(MarketplaceReview)
            .where(MarketplaceReview.target_id == target_id, MarketplaceReview.rating == "GOOD")
        )
    ).scalar_one()
    bad = (
        await db.execute(
            select(func.count())
            .select_from(MarketplaceReview)
            .where(MarketplaceReview.target_id == target_id, MarketplaceReview.rating == "BAD")
        )
    ).scalar_one()
    temp = max(0.0, min(99.0, round(_MANNER_BASE + 0.5 * good - 1.0 * bad, 1)))
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


def _card(listing: MarketplaceListing, distance_m: int | None = None) -> MarketplaceListingCard:
    return MarketplaceListingCard(
        id=listing.id,
        title=listing.title,
        price_vnd=listing.price_vnd,
        original_price_vnd=listing.original_price_vnd,
        is_negotiable=listing.is_negotiable,
        status=listing.status,
        category_code=listing.category.code if listing.category else None,
        thumbnail_url=_thumbnail_url(listing),
        district=_district_brief(listing.district),
        like_count=listing.like_count,
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


# M-8 제휴광고 (활성·지역 타게팅: 해당 구 + 전역). 피드 중간 삽입용.
@router.get("/ads", response_model=list[MarketplaceAdOut], summary="제휴 광고 목록")
async def get_ads(
    district_id: int | None = Query(None, description="지역 타게팅 (해당 구 + 전역 광고)"),
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 제목·본문을 캐시된 번역으로 표기"),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(UTC)
    q = select(MarketplaceAd).where(MarketplaceAd.is_active == True)
    if district_id is not None:
        q = q.where(or_(MarketplaceAd.district_id == district_id, MarketplaceAd.district_id.is_(None)))
    q = q.where(or_(MarketplaceAd.starts_at.is_(None), MarketplaceAd.starts_at <= now))
    q = q.where(or_(MarketplaceAd.ends_at.is_(None), MarketplaceAd.ends_at >= now))
    q = q.order_by(MarketplaceAd.sort_order)
    ads = (await db.execute(q)).scalars().all()
    if not lang:
        return ads
    # 조회 언어로 제목·본문 표기(캐시 히트만, 없으면 원문). 배치 — API 호출 안 함.
    out = [MarketplaceAdOut.model_validate(a) for a in ads]
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
        await db.execute(select(MarketplaceAd).where(MarketplaceAd.id == ad_id, MarketplaceAd.is_active == True))
    ).scalar_one_or_none()
    if ad is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    if not lang:
        return ad
    out = MarketplaceAdOut.model_validate(ad)
    out.title = await translate_to(ad.title, lang, db)
    if ad.body:
        out.body = await translate_to(ad.body, lang, db)
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
    lat: float | None = Query(None, description="내 위치 위도 (거리 계산·거리순)"),
    lng: float | None = Query(None, description="내 위치 경도"),
    district_id: int | None = Query(None, description="구 id — 해당 구 매물만 조회"),
    viewer_id: uuid.UUID | None = Query(None, description="조회자(차단 사용자 매물 제외용)"),
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 제목을 캐시된 번역으로 표기"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
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

    if district_id is not None:
        q = q.where(MarketplaceListing.district_id == district_id)
        count_q = count_q.where(MarketplaceListing.district_id == district_id)

    if viewer_id is not None:
        # 내가 차단한 사용자의 매물 제외
        blocked = select(UserBlock.blocked_id).where(UserBlock.blocker_id == viewer_id)
        q = q.where(MarketplaceListing.seller_id.notin_(blocked))
        count_q = count_q.where(MarketplaceListing.seller_id.notin_(blocked))

    if hide_sold:
        q = q.where(MarketplaceListing.status != "SOLD")
        count_q = count_q.where(MarketplaceListing.status != "SOLD")

    if sort == "price_low":
        q = q.order_by(MarketplaceListing.price_vnd.asc(), MarketplaceListing.bumped_at.desc())
    elif sort == "price_high":
        q = q.order_by(MarketplaceListing.price_vnd.desc(), MarketplaceListing.bumped_at.desc())
    elif sort == "distance" and has_loc:
        q = q.order_by(text("distance_m ASC NULLS LAST"))
    else:
        q = q.order_by(MarketplaceListing.bumped_at.desc())

    total = (await db.execute(count_q)).scalar_one()
    rows = (await db.execute(q.offset(offset).limit(size))).all()

    if has_loc:
        items = [_card(row[0], int(row[1]) if row[1] is not None else None) for row in rows]
    else:
        items = [_card(row[0]) for row in rows]

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
    user_id: uuid.UUID | None = Query(None, description="조회자(찜 여부 판정용)"),
    lang: str | None = Query(None, description="조회 언어(ko|en|vi). 제목·설명을 번역해 표기(미스 시 번역·워밍)"),
    db: AsyncSession = Depends(get_db),
):
    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    listing.view_count += 1

    liked = False
    if user_id is not None:
        liked = (await db.get(MarketplaceListingLike, {"listing_id": listing_id, "user_id": user_id})) is not None

    image_urls = [
        build_imgproxy_url(img.content.file_path)
        for img in listing.images or []
        if img.content and img.content.file_path
    ]

    seller = listing.seller
    is_following = False
    if user_id is not None and user_id != seller.id:
        is_following = (await db.get(UserFollow, {"follower_id": user_id, "following_id": seller.id})) is not None
    seller_brief = SellerBrief(
        id=seller.id,
        nickname=seller.nickname,
        avatar_url=resolve_avatar_url(seller) or default_avatar_url(seed=str(seller.id)),
        level=seller.level,
        manner_temp=float(seller.manner_temp),
        is_following=is_following,
    )

    others = (
        (
            await db.execute(
                select(MarketplaceListing)
                .where(MarketplaceListing.seller_id == listing.seller_id, MarketplaceListing.id != listing.id)
                .order_by(MarketplaceListing.bumped_at.desc())
                .limit(10)
            )
        )
        .scalars()
        .all()
    )

    title_out = listing.title
    desc_out = listing.description
    if lang:
        title_out = await translate_to(listing.title, lang, db)
        if listing.description:
            desc_out = await translate_to(listing.description, lang, db)

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
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="title is required")

    if body.latitude is not None and body.longitude is not None:
        point_wkt = f"SRID=4326;POINT({float(body.longitude)} {float(body.latitude)})"
        in_hcmc = await db.scalar(
            select(func.count())
            .select_from(District)
            .where(
                District.boundary.isnot(None),
                func.ST_Contains(
                    func.ST_GeomFromEWKT(func.ST_AsEWKT(District.boundary)),
                    func.ST_GeomFromText(point_wkt),
                ),
            )
        )
        if not in_hcmc:
            raise HTTPException(status_code=422, detail="location must be within Ho Chi Minh City")

    now = datetime.now(UTC)
    listing = MarketplaceListing(
        seller_id=body.seller_id,
        category_id=body.category_id,
        title=body.title.strip(),
        description=body.description,
        price_vnd=body.price_vnd,
        is_negotiable=body.is_negotiable,
        status="ON_SALE",
        district_id=body.district_id,
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

    await db.commit()
    await _notify_keyword_matches(db, listing)
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

    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.seller_id != session_uid:
        raise HTTPException(status_code=403, detail="Not the seller")

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

    dup = (
        await db.execute(
            select(MarketplaceListingReport.id).where(
                MarketplaceListingReport.listing_id == listing_id,
                MarketplaceListingReport.reporter_id == session_uid,
            )
        )
    ).first()
    if dup is not None:
        raise HTTPException(status_code=409, detail="already reported")

    db.add(
        MarketplaceListingReport(
            listing_id=listing_id,
            reporter_id=session_uid,
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


# M-6 거래 후기 (만족도+칭찬+텍스트 → 대상 매너온도 재계산). '별로예요'는 미노출.
@router.post("/reviews", response_model=MarketplaceReviewResult, status_code=201, summary="거래 후기 작성")
async def create_review(
    body: MarketplaceReviewCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.rating not in ("GOOD", "BAD"):
        raise HTTPException(status_code=400, detail="invalid rating")
    if body.reviewer_id == body.target_id:
        raise HTTPException(status_code=400, detail="cannot review yourself")
    if body.reviewer_id != session_uid:
        raise HTTPException(status_code=403, detail="reviewer mismatch")

    # 무결성: 후기는 실제 매물의 판매자에게만 (임의 유저 대상 매너온도 어뷰징 차단)
    listing = (
        (
            await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == body.listing_id))
        ).scalar_one_or_none()
        if body.listing_id is not None
        else None
    )
    if listing is None or listing.seller_id != body.target_id:
        raise HTTPException(status_code=400, detail="review target must be the listing seller")

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
async def get_wishlist(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
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
async def get_keyword_alerts(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
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
