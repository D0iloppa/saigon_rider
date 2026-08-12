"""admin JSON API — 거래 완료 이의 큐 (S-16 / D-7).

구매자가 완료를 요청했는데도 판매자가 확인하지 않거나 거절한 건을 운영자가 판단한다.
**자동 완료는 없다**(D-7) — 완료가 되려면 판매자 확인 또는 여기의 운영자 강제완료 중 하나를 거친다.

조치 시 양측 인앱 MODERATION 알림 + 감사로그를 단일 트랜잭션으로 커밋한다
(listings.py 모더레이션 패턴 미러).
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import (
    MarketplaceAppointment,
    MarketplaceListing,
    MarketplacePriceOffer,
    Notification,
    User,
)
from ...schemas import Page
from ._audit import audit

router = APIRouter(prefix="/trades")

_STATES = {"pending", "declined", "all"}


class TradePartyRow(BaseModel):
    id: uuid.UUID | None
    nickname: str | None


class AdminCompletionRequestRow(BaseModel):
    appointment_id: uuid.UUID
    listing_id: uuid.UUID
    listing_title: str
    listing_status: str
    price_vnd: int
    when_at: datetime
    seller: TradePartyRow
    buyer: TradePartyRow
    completion_requested_at: datetime
    completion_declined_at: datetime | None
    # 요청 후 경과 시간(시간 단위) — 운영자가 방치 정도를 바로 읽을 수 있게 서버에서 계산한다.
    pending_hours: int


class ResolveRequest(BaseModel):
    reason: str


def _party(user: User | None) -> TradePartyRow:
    return TradePartyRow(id=user.id if user else None, nickname=user.nickname if user else None)


@router.get("/completion-requests", response_model=Page[AdminCompletionRequestRow])
async def list_completion_requests(
    state: str = Query("pending", description="pending=판매자 미응답 / declined=판매자 거절 / all"),
    min_pending_hours: int = Query(0, ge=0, description="요청 후 경과 시간 하한 — 방치된 건만 보기"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """완료 요청은 있으나 아직 완료되지 않은 약속 목록. status='ACCEPTED' 로 한정한다 —
    COMPLETED 는 이미 해소된 건이고 CANCELLED 는 거래 자체가 없어졌다."""
    if state not in _STATES:
        raise HTTPException(status_code=400, detail="invalid state")

    now = datetime.now(UTC)
    conds = [
        MarketplaceAppointment.completion_requested_at.is_not(None),
        MarketplaceAppointment.status == "ACCEPTED",
    ]
    if state == "pending":
        conds.append(MarketplaceAppointment.completion_declined_at.is_(None))
    elif state == "declined":
        conds.append(MarketplaceAppointment.completion_declined_at.is_not(None))
    if min_pending_hours > 0:
        conds.append(MarketplaceAppointment.completion_requested_at <= now - timedelta(hours=min_pending_hours))

    total = (await db.execute(select(func.count()).select_from(MarketplaceAppointment).where(*conds))).scalar_one()
    appts = (
        (
            await db.execute(
                select(MarketplaceAppointment)
                .where(*conds)
                .order_by(MarketplaceAppointment.completion_requested_at.asc())
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )

    rows: list[AdminCompletionRequestRow] = []
    for appt in appts:
        # listing_id 는 ON DELETE CASCADE 라 매물이 지워지면 약속 행도 함께 사라진다 — 즉 여기서
        # None 은 구조적으로 불가능하다. 조용히 skip 하면 total(=conds 로 센 값)과 실제 행 수가
        # 어긋나 페이지네이션이 빈 다음 페이지를 계속 제시하므로, 건너뛰지 않고 드러낸다.
        listing = await db.get(MarketplaceListing, appt.listing_id)
        if listing is None:
            raise HTTPException(status_code=500, detail="listing missing for appointment")
        seller = await db.get(User, listing.seller_id)
        buyer = await db.get(User, appt.completion_requested_by) if appt.completion_requested_by else None
        requested_at = appt.completion_requested_at
        rows.append(
            AdminCompletionRequestRow(
                appointment_id=appt.id,
                listing_id=listing.id,
                listing_title=listing.title,
                listing_status=listing.status,
                price_vnd=listing.price_vnd,
                when_at=appt.when_at,
                seller=_party(seller),
                buyer=_party(buyer),
                completion_requested_at=requested_at,
                completion_declined_at=appt.completion_declined_at,
                pending_hours=int((now - requested_at).total_seconds() // 3600),
            )
        )

    return Page(items=rows, total=total, page=page, size=size)


async def _load_pending(
    db: AsyncSession, appointment_id: uuid.UUID, reason: str
) -> tuple[MarketplaceAppointment, MarketplaceListing]:
    # 사유는 양측 알림 본문으로 그대로 나가고 감사로그에도 남는다 — 빈 사유는 받지 않는다
    # (listings.py 모더레이션과 동일 규약).
    if not reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    appt = await db.get(MarketplaceAppointment, appointment_id)
    if appt is None:
        raise HTTPException(status_code=404, detail="appointment not found")
    if appt.completion_requested_at is None:
        raise HTTPException(status_code=409, detail={"code": "no_completion_request"})
    if appt.status != "ACCEPTED":
        raise HTTPException(status_code=409, detail=f"appointment is {appt.status}")
    # 앱 경로(market.complete_appointment)와 동일하게 매물 행을 잠근다 — 동시 완료 경합 차단.
    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == appt.listing_id).with_for_update())
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=404, detail="listing not found")
    # SOLD 가드는 여기 두지 않는다 — 판매자가 다른 대화로 먼저 팔아 매물이 SOLD 인 건은 강제완료는
    # 불가하지만 **기각은 가능해야** 한다. 공용 가드로 두면 그 행이 큐에서 나갈 방법이 없어진다.
    return appt, listing


@router.post("/completion-requests/{appointment_id}/force-complete")
async def force_complete(
    appointment_id: uuid.UUID,
    body: ResolveRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """운영자가 거래를 완료로 확정한다 → 약속 COMPLETED, 매물 SOLD.
    합의가 스냅샷은 앱 경로(MKT-7)와 동일 규칙으로 남긴다."""
    appt, listing = await _load_pending(db, appointment_id, body.reason)
    if listing.status == "SOLD":
        raise HTTPException(status_code=409, detail="listing already sold")

    accepted_offer_amount = (
        await db.execute(
            select(MarketplacePriceOffer.amount)
            .where(
                MarketplacePriceOffer.conversation_id == appt.conversation_id,
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

    body_text = f"'{listing.title}' 거래가 운영 검토에 따라 완료 처리되었습니다. 사유: {body.reason}"
    for user_id in {listing.seller_id, appt.completion_requested_by} - {None}:
        db.add(
            Notification(
                user_id=user_id,
                type="MODERATION",
                title="거래 완료 처리 안내",
                body=body_text,
                link=f"market&id={listing.id}",
                created_at=now,
            )
        )
    await audit(
        db,
        session,
        request,
        "trade.completion_force_complete",
        target_type="appointment",
        target_id=str(appt.id),
        detail={"listing_id": str(listing.id), "reason": body.reason},
    )
    await db.commit()
    return {"ok": True, "appointment_id": str(appt.id), "listing_status": listing.status}


@router.post("/completion-requests/{appointment_id}/dismiss")
async def dismiss_completion_request(
    appointment_id: uuid.UUID,
    body: ResolveRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """운영자가 완료 요청을 기각한다 — 거래는 완료되지 않고 요청만 큐에서 내려간다.
    요청 이력(`completion_requested_at`)은 지우지 않는다(반복 요청 판단 근거)."""
    appt, listing = await _load_pending(db, appointment_id, body.reason)

    now = datetime.now(UTC)
    # 큐에서 내리는 수단은 앱의 판매자 거절과 같은 필드를 쓴다(구매자 화면의 "거절됨 → 재요청 가능"
    # 표현을 재사용). 단 **행위자는 비워 둔다** — 판매자가 거절한 것이 아니므로 구매자에게 "판매자가
    # 거절했다"고 말하면 사실과 다르고 연락할 상대도 잘못 가리킨다(프론트가 이 값으로 문구를 분기).
    appt.completion_declined_at = now
    appt.completion_declined_by = None
    appt.updated_at = now

    if appt.completion_requested_by is not None:
        db.add(
            Notification(
                user_id=appt.completion_requested_by,
                type="MODERATION",
                title="거래 완료 요청 검토 결과",
                body=f"'{listing.title}' 완료 요청이 운영 검토에서 기각되었습니다. 사유: {body.reason}",
                link=f"market&id={listing.id}",
                created_at=now,
            )
        )
    await audit(
        db,
        session,
        request,
        "trade.completion_dismiss",
        target_type="appointment",
        target_id=str(appt.id),
        detail={"listing_id": str(listing.id), "reason": body.reason},
    )
    await db.commit()
    return {"ok": True, "appointment_id": str(appt.id)}
