"""admin JSON API — 매물 모더레이션 (HIDE/REMOVE/RESTORE).

조치 시 판매자에게 인앱 MODERATION 알림(사유 포함, 링크는 HIDE 만) + 감사로그를 단일 트랜잭션으로 커밋.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import MarketplaceListing, Notification, Report, User
from ...schemas import Page
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


class ModerateRequest(BaseModel):
    action: str
    reason: str
    report_id: uuid.UUID | None = None


class BulkModerateRequest(BaseModel):
    listing_ids: list[uuid.UUID]
    action: str
    reason: str


def _listing_row(listing: MarketplaceListing, report_count: int, flags: list[str]) -> AdminListingRow:
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
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(MarketplaceListing)
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

    total = (await db.execute(count_stmt)).scalar_one()
    listings = (
        (
            await db.execute(
                stmt.order_by(MarketplaceListing.created_at.desc(), MarketplaceListing.id.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )

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
        _listing_row(listing, counts.get(listing.id, 0), _flags_for(listing, duplicate_ids)) for listing in listings
    ]
    return Page(items=items, total=total, page=page, size=size)


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
) -> None:
    """단건/일괄 모더레이션이 공유하는 상태전이 + 알림 적재. db.add 만 하고 커밋은 호출부가 한다."""
    new_status, set_moderated, noti_title, with_link = _MODERATE_ACTIONS[action]
    listing.status = new_status
    listing.moderated_at = now if set_moderated else None
    listing.updated_at = now
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
    _apply_moderation(db, listing, body.action, reason, now)
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
    updated = []
    for listing in listings:
        _apply_moderation(db, listing, body.action, reason, now)
        await audit(db, session, request, f"LISTING_{body.action}", "listing", str(listing.id), {"reason": reason})
        updated.append({"id": listing.id, "status": listing.status})

    await db.commit()
    return {"updated": updated, "missing_ids": missing_ids}
