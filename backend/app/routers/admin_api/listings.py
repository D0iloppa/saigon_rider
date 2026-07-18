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


class ModerateRequest(BaseModel):
    action: str
    reason: str
    report_id: uuid.UUID | None = None


def _listing_row(listing: MarketplaceListing, report_count: int) -> AdminListingRow:
    return AdminListingRow(
        id=listing.id,
        title=listing.title,
        price_vnd=listing.price_vnd,
        status=listing.status,
        seller=SellerBriefRow(id=listing.seller_id, nickname=listing.seller.nickname if listing.seller else None),
        report_count=report_count,
        created_at=listing.created_at,
        thumbnail_url=_thumbnail_url(listing),
    )


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

    items = [_listing_row(listing, counts.get(listing.id, 0)) for listing in listings]
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

    return {
        "id": listing.id,
        "title": listing.title,
        "description": listing.description,
        "price_vnd": listing.price_vnd,
        "status": listing.status,
        "seller": {"id": listing.seller_id, "nickname": listing.seller.nickname if listing.seller else None},
        "moderated_at": listing.moderated_at,
        "created_at": listing.created_at,
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

    new_status, set_moderated, noti_title, with_link = _MODERATE_ACTIONS[body.action]
    now = datetime.now(UTC)
    reason = body.reason.strip()

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
