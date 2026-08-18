"""admin JSON API — 매물 모더레이션 (HIDE/REMOVE/RESTORE).

조치 시 판매자에게 인앱 MODERATION 알림(사유 포함, 링크는 HIDE 만) + 감사로그를 단일 트랜잭션으로 커밋.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import (
    Content,
    ContentFingerprintWhitelist,
    DealResultPingLog,
    MarketplaceListing,
    MarketplaceListingImage,
    Notification,
    Report,
    User,
)
from ...schemas import Page
from ...services import seller_pattern
from ...services.listing_risk import risk_score_sql
from ...services.listing_state import log_transition
from ...utils import build_imgproxy_url
from ..market import _thumbnail_url
from ._audit import audit

router = APIRouter(prefix="/listings")

_LISTING_STATUSES = {"ON_SALE", "RESERVED", "SOLD", "HIDDEN", "REMOVED"}

# action → (신규 status, moderated_at, 알림 제목, 매물 링크 포함 여부)
_MODERATE_ACTIONS = {
    "HIDE": ("HIDDEN", True, "매물 비공개 처리 안내", True),
    "REMOVE": ("REMOVED", True, "매물 삭제 처리 안내", False),
    "RESTORE": ("ON_SALE", False, "매물 공개 복원 안내", False),
}


class SellerBriefRow(BaseModel):
    id: uuid.UUID
    nickname: str | None


class AdminListingRow(BaseModel):
    id: uuid.UUID
    title: str
    price_vnd: int
    status: str
    seller: SellerBriefRow
    report_count: int
    created_at: datetime
    thumbnail_url: str | None
    flags: list[str]
    # 016 §4-4 #39 — 정렬 가중치 전용 점수(자동 조치 없음, M1). sort_by=risk 로 요청 시 이 값 순 정렬.
    risk_score: float


class ModerateRequest(BaseModel):
    action: str
    reason: str
    report_id: uuid.UUID | None = None


class BulkModerateRequest(BaseModel):
    listing_ids: list[uuid.UUID]
    action: str
    reason: str


def _admin_uuid(session: AdminSession) -> uuid.UUID | None:
    """AdminSession.account_id 는 str|None(root 는 .env 정적 계정이라 UUID 가 아닐 수 있다) —
    listing_state_log.actor_id 는 UUID 컬럼이라 파싱 가능할 때만 채운다. getattr 기본값 사용:
    테스트 더블(SimpleNamespace 등)이 account_id 를 안 가진 경우도 있다."""
    account_id = getattr(session, "account_id", None)
    if account_id is None:
        return None
    try:
        return uuid.UUID(account_id)
    except ValueError:
        return None


def _listing_row(
    listing: MarketplaceListing, report_count: int, flags: list[str], risk_score: float
) -> AdminListingRow:
    return AdminListingRow(
        id=listing.id,
        title=listing.title,
        price_vnd=listing.price_vnd,
        status=listing.status,
        seller=SellerBriefRow(id=listing.seller_id, nickname=listing.seller.nickname if listing.seller else None),
        report_count=report_count,
        created_at=listing.created_at,
        thumbnail_url=_thumbnail_url(listing),
        flags=flags,
        risk_score=risk_score,
    )


# T-4: 검수 6기준 중 기계 판정 가능한 것을 자동 플래그. 나머지 2기준("실물 사진인가" /
# "거래 장소가 실제 가게인가")은 사람 판단이 필요해 여기서 다루지 않는다.
# "업체당 5건 초과"는 여기 없다 — T-3(market.py 등록/재판매 게이트)가 6건째부터 422로 이미
# 막아서, 노출 중인 매물이 5건을 넘는 상태 자체가 서버를 거치는 한 발생할 수 없다(불가능한
# 조건을 판정하는 죽은 코드를 추가하지 않는다).
def _flags_for(listing: MarketplaceListing, duplicate_ids: set[uuid.UUID]) -> list[str]:
    flags: list[str] = []
    if len(listing.images or []) < 2:
        flags.append("LOW_PHOTOS")
    if listing.price_vnd == 0:
        flags.append("ZERO_PRICE")
    if listing.category_id is None:
        flags.append("NO_CATEGORY")
    if listing.id in duplicate_ids:
        flags.append("DUPLICATE")
    return flags


async def _duplicate_ids(db: AsyncSession, listings: list[MarketplaceListing]) -> set[uuid.UUID]:
    """같은 업체 프로필 안에서 제목 + 첫 사진 content_id 가 완전히 같은 매물을 근접중복으로 본다.
    현재 페이지 범위만으로는 같은 업체의 다른 페이지에 있는 원본을 놓치므로, 페이지에 등장한
    business_profile_id 전체의 매물을 다시 조회해 비교한다(퍼지매칭 없음, 문자열/UUID 완전일치)."""
    business_ids = {listing.business_profile_id for listing in listings if listing.business_profile_id is not None}
    if not business_ids:
        return set()
    siblings = (
        (await db.execute(select(MarketplaceListing).where(MarketplaceListing.business_profile_id.in_(business_ids))))
        .scalars()
        .all()
    )
    groups: dict[tuple[uuid.UUID, str, uuid.UUID], list[uuid.UUID]] = {}
    for sibling in siblings:
        if not sibling.images:
            continue
        key = (sibling.business_profile_id, sibling.title, sibling.images[0].content_id)
        groups.setdefault(key, []).append(sibling.id)
    duplicate_ids: set[uuid.UUID] = set()
    for ids in groups.values():
        if len(ids) >= 2:
            duplicate_ids.update(ids)
    return duplicate_ids


@router.get("", response_model=Page[AdminListingRow])
async def list_listings(
    q: str | None = Query(None),
    status: str | None = Query(None),
    seller_id: uuid.UUID | None = Query(None),
    sort_by: str = Query("created_desc", description="created_desc | risk — risk=016 §4-4 #39 risk_score 내림차순"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if sort_by not in ("created_desc", "risk"):
        raise HTTPException(status_code=400, detail="invalid sort_by")

    # 016 §4-4 #39: risk_score 는 매 요청 SELECT 컬럼에 항상 포함한다(정렬 여부와 무관하게 응답에
    # 노출 — 운영자가 검수 큐를 created_desc 로 보다가도 각 행의 점수를 참고할 수 있어야 한다).
    risk_score_col = literal_column(risk_score_sql()).label("risk_score")
    stmt = select(MarketplaceListing, risk_score_col)
    count_stmt = select(func.count()).select_from(MarketplaceListing)
    if q:
        stmt = stmt.where(MarketplaceListing.title.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(MarketplaceListing.title.ilike(f"%{q}%"))
    if status:
        if status not in _LISTING_STATUSES:
            raise HTTPException(status_code=400, detail="invalid status")
        stmt = stmt.where(MarketplaceListing.status == status)
        count_stmt = count_stmt.where(MarketplaceListing.status == status)
    if seller_id is not None:
        stmt = stmt.where(MarketplaceListing.seller_id == seller_id)
        count_stmt = count_stmt.where(MarketplaceListing.seller_id == seller_id)

    if sort_by == "risk":
        stmt = stmt.order_by(risk_score_col.desc(), MarketplaceListing.id.desc())
    else:
        stmt = stmt.order_by(MarketplaceListing.created_at.desc(), MarketplaceListing.id.desc())

    total = (await db.execute(count_stmt)).scalar_one()
    rows = (await db.execute(stmt.offset((page - 1) * size).limit(size))).all()
    listings = [row[0] for row in rows]
    risk_scores: dict[uuid.UUID, float] = {row[0].id: float(row[1]) for row in rows}

    listing_ids = [listing.id for listing in listings]
    counts: dict[uuid.UUID, int] = {}
    if listing_ids:
        count_rows = (
            await db.execute(
                select(Report.listing_id, func.count())
                .where(Report.listing_id.in_(listing_ids))
                .group_by(Report.listing_id)
            )
        ).all()
        counts = {lid: cnt for lid, cnt in count_rows}

    duplicate_ids = await _duplicate_ids(db, listings)
    items = [
        _listing_row(
            listing, counts.get(listing.id, 0), _flags_for(listing, duplicate_ids), risk_scores.get(listing.id, 0.0)
        )
        for listing in listings
    ]
    return Page(items=items, total=total, page=page, size=size)


@router.get("/fingerprint-collisions")
async def fingerprint_collisions(
    limit: int = Query(50, ge=1, le=200),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """016 §4-3 #38 — 동일 지문(이미지 phash / 텍스트 simhash)의 매물 그룹 조회.
    판정은 하지 않는다(D-34=(a), M1) — 사진 도용·재등록 어뷰징·물품 순환(업자 위장/장물) 중 무엇인지는
    운영자가 계정·시간·지역을 함께 보고 판단한다(016 §4-3 오탐 주의: 지문 일치는 단독 근거 불가).
    카탈로그 화이트리스트(content_fingerprint_whitelist)에 등록된 phash는 제외한다."""
    text_groups = (
        (
            await db.execute(
                select(MarketplaceListing.text_fingerprint)
                .where(MarketplaceListing.text_fingerprint.isnot(None))
                .group_by(MarketplaceListing.text_fingerprint)
                .having(func.count() >= 2)
                .order_by(func.count().desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    text_collisions = []
    for fp in text_groups:
        rows = (
            await db.execute(
                select(MarketplaceListing.id, MarketplaceListing.title, MarketplaceListing.seller_id).where(
                    MarketplaceListing.text_fingerprint == fp
                )
            )
        ).all()
        text_collisions.append(
            {"fingerprint": fp, "listings": [{"id": r.id, "title": r.title, "seller_id": r.seller_id} for r in rows]}
        )

    whitelisted = select(ContentFingerprintWhitelist.phash)
    image_groups = (
        (
            await db.execute(
                select(Content.phash)
                .join(MarketplaceListingImage, MarketplaceListingImage.content_id == Content.id)
                .where(Content.phash.isnot(None), Content.phash.notin_(whitelisted))
                .group_by(Content.phash)
                .having(func.count(func.distinct(MarketplaceListingImage.listing_id)) >= 2)
                .order_by(func.count(func.distinct(MarketplaceListingImage.listing_id)).desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    image_collisions = []
    for phash in image_groups:
        rows = (
            await db.execute(
                select(MarketplaceListing.id, MarketplaceListing.title, MarketplaceListing.seller_id)
                .join(MarketplaceListingImage, MarketplaceListingImage.listing_id == MarketplaceListing.id)
                .join(Content, Content.id == MarketplaceListingImage.content_id)
                .where(Content.phash == phash)
                .distinct()
            )
        ).all()
        image_collisions.append(
            {"phash": phash, "listings": [{"id": r.id, "title": r.title, "seller_id": r.seller_id} for r in rows]}
        )

    return {"text_collisions": text_collisions, "image_collisions": image_collisions}


@router.get("/deal-result-stats")
async def deal_result_stats(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """016 §4-7 #42 완료조건 — "다른 데서 판매" 비율(경쟁 플랫폼 유출률) 집계.
    deal_result_ping_log 는 응답 시 result 를 채운다(jobs.deal_result_ping 발송, market.py
    respond_deal_result 응답). result IS NULL = 미응답(분모 제외 — 자기신고 누락 보정이 목적이라
    응답하지 않은 건은 어느 쪽으로도 셀 수 없다)."""
    rows = (
        await db.execute(
            select(DealResultPingLog.result, func.count())
            .where(DealResultPingLog.result.isnot(None))
            .group_by(DealResultPingLog.result)
        )
    ).all()
    counts = {result: count for result, count in rows}
    total_responded = sum(counts.values())
    sold_elsewhere = counts.get("SOLD_ELSEWHERE", 0)
    return {
        "counts": counts,
        "total_responded": total_responded,
        "sold_elsewhere_rate": (sold_elsewhere / total_responded) if total_responded else None,
    }


@router.get("/dealer-candidates")
async def dealer_candidates(
    limit: int = Query(50, ge=1, le=200),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """016 §4-5 #40, D-33=(a) — 업자 후보 목록(라벨링 + 비즈 프로필 전환 유도 전용).
    자동 제재 없음(M1) — 목록 표시와 /nudge 발송만 제공한다. 업체 프로필로 이미 등록된
    매물(business_profile_id NOT NULL)은 이미 양성화된 판매자라 후보에서 제외한다."""
    active_filter = (
        MarketplaceListing.business_profile_id.is_(None),
        MarketplaceListing.status.notin_(("HIDDEN", "REMOVED")),
    )

    # 동일 카테고리 동시보유 최대치 — (seller, category) 별 건수의 seller 당 최댓값(2단계 집계).
    category_counts = (
        select(
            MarketplaceListing.seller_id.label("seller_id"),
            func.count().label("cat_count"),
        )
        .where(*active_filter, MarketplaceListing.category_id.isnot(None))
        .group_by(MarketplaceListing.seller_id, MarketplaceListing.category_id)
        .subquery()
    )
    category_repeat = (
        select(
            category_counts.c.seller_id,
            func.max(category_counts.c.cat_count).label("max_category_repeat"),
        )
        .group_by(category_counts.c.seller_id)
        .subquery()
    )

    cutoff = datetime.now(UTC) - timedelta(days=seller_pattern.REGISTRATION_VELOCITY_WINDOW_DAYS)
    biz_vocab_cond = or_(
        *[MarketplaceListing.title.ilike(f"%{kw}%") for kw in seller_pattern.BIZ_VOCAB_PATTERNS],
        *[MarketplaceListing.description.ilike(f"%{kw}%") for kw in seller_pattern.BIZ_VOCAB_PATTERNS],
    )
    agg = (
        select(
            MarketplaceListing.seller_id,
            func.count().label("active_count"),
            func.count(func.distinct(MarketplaceListing.district_id)).label("district_count"),
            func.count().filter(MarketplaceListing.created_at >= cutoff).label("recent_count"),
            func.count().filter(biz_vocab_cond).label("biz_vocab_count"),
        )
        .where(*active_filter)
        .group_by(MarketplaceListing.seller_id)
        .subquery()
    )

    rows = (
        await db.execute(
            select(
                agg.c.seller_id,
                agg.c.active_count,
                agg.c.district_count,
                agg.c.recent_count,
                agg.c.biz_vocab_count,
                func.coalesce(category_repeat.c.max_category_repeat, 0).label("max_category_repeat"),
                User.nickname,
            )
            .join(User, User.id == agg.c.seller_id)
            .outerjoin(category_repeat, category_repeat.c.seller_id == agg.c.seller_id)
        )
    ).all()

    candidates = []
    for row in rows:
        signals = {
            "registration_velocity": row.recent_count >= seller_pattern.REGISTRATION_VELOCITY_THRESHOLD,
            "same_category_repeat": row.max_category_repeat >= seller_pattern.SAME_CATEGORY_REPEAT_THRESHOLD,
            "multi_district": row.district_count >= seller_pattern.MULTI_DISTRICT_THRESHOLD,
        }
        signal_count = sum(signals.values())
        if signal_count < seller_pattern.CANDIDATE_MIN_SIGNALS:
            continue
        candidates.append(
            {
                "seller_id": row.seller_id,
                "seller_nickname": row.nickname,
                "active_listing_count": row.active_count,
                "signals": signals,
                "signal_count": signal_count,
                "biz_vocab_count": row.biz_vocab_count,
            }
        )

    candidates.sort(key=lambda c: c["signal_count"], reverse=True)
    return candidates[:limit]


@router.post("/dealer-candidates/{seller_id}/nudge")
async def nudge_dealer_candidate(
    seller_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """016 §4-5 #40, D-33=(a) — 업자 후보에게 비즈 프로필 전환 안내 발송. 제재가 아니라 초대다."""
    seller = await db.get(User, seller_id)
    if seller is None:
        raise HTTPException(status_code=404, detail="Seller not found")

    now = datetime.now(UTC)
    db.add(
        Notification(
            user_id=seller_id,
            type="BIZ",
            title="비즈니스 프로필 전환 안내",
            body="여러 매물을 등록하고 계시네요! 비즈니스 프로필로 전환하면 매물 상한 확대·공식 배지 등"
            " 혜택을 받을 수 있습니다.",
            link="biz",
            created_at=now,
        )
    )
    await audit(db, session, request, "DEALER_CANDIDATE_NUDGE", "user", str(seller_id), {})
    await db.commit()
    return {"seller_id": seller_id, "sent": True}


@router.get("/{listing_id}")
async def get_listing(
    listing_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    listing = await db.get(MarketplaceListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    reports = (
        (await db.execute(select(Report).where(Report.listing_id == listing_id).order_by(Report.created_at.desc())))
        .scalars()
        .all()
    )
    reporter_ids = {r.reporter_id for r in reports}
    nicknames: dict[uuid.UUID, str | None] = {}
    if reporter_ids:
        nickname_rows = (await db.execute(select(User.id, User.nickname).where(User.id.in_(reporter_ids)))).all()
        nicknames = {uid: nick for uid, nick in nickname_rows}

    duplicate_ids = await _duplicate_ids(db, [listing])

    return {
        "id": listing.id,
        "title": listing.title,
        "description": listing.description,
        "price_vnd": listing.price_vnd,
        "status": listing.status,
        "seller": {"id": listing.seller_id, "nickname": listing.seller.nickname if listing.seller else None},
        "moderated_at": listing.moderated_at,
        "created_at": listing.created_at,
        "flags": _flags_for(listing, duplicate_ids),
        "image_urls": [
            build_imgproxy_url(img.content.file_path)
            for img in listing.images or []
            if img.content and img.content.file_path
        ],
        "reports": [
            {
                "id": r.id,
                "reporter": {"id": r.reporter_id, "nickname": nicknames.get(r.reporter_id)},
                "reason": r.reason,
                "note": r.note,
                "status": r.status,
                "created_at": r.created_at,
            }
            for r in reports
        ],
    }


def _apply_moderation(
    db: AsyncSession,
    listing: MarketplaceListing,
    action: str,
    reason: str,
    now: datetime,
    admin_id: uuid.UUID | None,
) -> None:
    """단건/일괄 모더레이션이 공유하는 상태전이 + 알림 적재. db.add 만 하고 커밋은 호출부가 한다."""
    new_status, set_moderated, noti_title, with_link = _MODERATE_ACTIONS[action]
    prev_status = listing.status
    listing.status = new_status
    listing.moderated_at = now if set_moderated else None
    listing.updated_at = now
    # 016 §4-1 #36: 모더레이션도 전이 로그 대상 — actor_type='admin'. root 계정은 DB 행이 아니라
    # account_id 가 UUID 가 아닐 수 있어(.env 정적 계정) actor_id 는 None 으로 남긴다(reason 은 유지).
    log_transition(db, listing.id, prev_status, new_status, actor_type="admin", actor_id=admin_id, reason=action)
    db.add(
        Notification(
            user_id=listing.seller_id,
            type="MODERATION",
            title=noti_title,
            body=f"'{listing.title}' 매물이 운영정책에 따라 처리되었습니다. 사유: {reason}",
            link=f"market&id={listing.id}" if with_link else None,
            created_at=now,
        )
    )


@router.post("/{listing_id}/moderate")
async def moderate_listing(
    listing_id: uuid.UUID,
    body: ModerateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if body.action not in _MODERATE_ACTIONS:
        raise HTTPException(status_code=400, detail="invalid action")
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if body.report_id is not None and await db.get(Report, body.report_id) is None:
        raise HTTPException(status_code=400, detail="report not found")

    listing = await db.get(MarketplaceListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    now = datetime.now(UTC)
    reason = body.reason.strip()
    admin_id = _admin_uuid(session)
    _apply_moderation(db, listing, body.action, reason, now, admin_id)
    await audit(
        db,
        session,
        request,
        f"LISTING_{body.action}",
        "listing",
        str(listing_id),
        {"reason": reason, "report_id": str(body.report_id) if body.report_id else None},
    )
    await db.commit()
    return {"id": listing.id, "status": listing.status, "moderated_at": listing.moderated_at}


@router.post("/bulk-moderate")
async def bulk_moderate_listings(
    body: BulkModerateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """T-4: 검수 큐 일괄 승인/반려. 단건 `/{listing_id}/moderate` 와 같은 인가(verify_admin_api)·
    같은 상태전이(_apply_moderation)·같은 감사로그(audit, 대상별 1행)를 그대로 재사용한다."""
    if body.action not in _MODERATE_ACTIONS:
        raise HTTPException(status_code=400, detail="invalid action")
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if not body.listing_ids:
        raise HTTPException(status_code=400, detail="listing_ids is required")

    listings = (
        (await db.execute(select(MarketplaceListing).where(MarketplaceListing.id.in_(body.listing_ids))))
        .scalars()
        .all()
    )
    found_ids = {listing.id for listing in listings}
    missing_ids = [str(lid) for lid in body.listing_ids if lid not in found_ids]

    now = datetime.now(UTC)
    reason = body.reason.strip()
    admin_id = _admin_uuid(session)
    updated = []
    for listing in listings:
        _apply_moderation(db, listing, body.action, reason, now, admin_id)
        await audit(db, session, request, f"LISTING_{body.action}", "listing", str(listing.id), {"reason": reason})
        updated.append({"id": listing.id, "status": listing.status})

    await db.commit()
    return {"updated": updated, "missing_ids": missing_ids}
