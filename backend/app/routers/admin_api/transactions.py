"""admin JSON API — 수동 QR 거래 조회·제한된 분쟁 복구 (F033).

당근 비교 트리아지(260909)에서 기능은 있으나(8c5c7493) 운영자 조회 화면이 없다고 지적된 부분.
플랫폼은 결제를 보증하지 않는다. 예외적으로 PAYMENT_REPORTED 직후 거래가 깨진 경우만 운영자가
세트의 예약 항목과 매물을 되돌릴 수 있다(약속은 건드리지 않는다 — F-N-02 FR-7 ④). 거래는 세트 소유이며
경로·감사 target_id 는 거래 id 다. PAYMENT_CONFIRMED 이후에는 자금 상태를 바꾸지 않는다.

QR 이미지 자체는 노출하지 않는다 — 등록 여부(있음/없음)만 `_current_payment_qr_message_id` 로 판단.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import (
    AdminAuditLog,
    MarketplaceListing,
    MarketplaceTransaction,
    MarketplaceTransactionCancelRequest,
    TradeSet,
    User,
)
from ...schemas import Page
from ...services import noti_events
from ...services.trade_sets import cancel_set_trade, latest_accepted_appointment
from ..market import _current_payment_qr_message_id
from ._audit import audit

router = APIRouter(prefix="/transactions")

_STATUSES = {"AWAITING_PAYMENT", "PAYMENT_REPORTED", "PAYMENT_CONFIRMED"}
_TARGET_TYPE = "marketplace_transaction"


class PartyRow(BaseModel):
    id: uuid.UUID | None
    nickname: str | None


class AdminTransactionRow(BaseModel):
    id: uuid.UUID
    trade_set_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None
    listing_id: uuid.UUID
    listing_title: str
    amount_vnd: int
    payment_status: str
    buyer: PartyRow
    seller: PartyRow
    created_at: datetime
    updated_at: datetime


class MemoRow(BaseModel):
    admin_username: str
    note: str
    created_at: datetime


class AdminTransactionDetail(AdminTransactionRow):
    conversation_id: uuid.UUID
    payment_method: str
    appointment_status: str | None = None
    when_at: datetime | None = None
    buyer_reported_at: datetime | None
    seller_confirmed_at: datetime | None
    qr_registered: bool
    memos: list[MemoRow]


class MemoRequest(BaseModel):
    note: str = Field(min_length=1, max_length=500)


class RollbackRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


def _party(user: User | None) -> PartyRow:
    return PartyRow(id=user.id if user else None, nickname=user.nickname if user else None)


def _row(
    tx: MarketplaceTransaction, listing_title: str, buyer: User | None, seller: User | None
) -> AdminTransactionRow:
    return AdminTransactionRow(
        id=tx.id,
        trade_set_id=tx.trade_set_id,
        appointment_id=tx.appointment_id,
        listing_id=tx.listing_id,
        listing_title=listing_title,
        amount_vnd=tx.amount_vnd,
        payment_status=tx.payment_status,
        buyer=_party(buyer),
        seller=_party(seller),
        created_at=tx.created_at,
        updated_at=tx.updated_at,
    )


@router.get("", response_model=Page[AdminTransactionRow])
async def list_transactions(
    payment_status: str | None = Query(None),
    date_from: datetime | None = Query(None, description="created_at >= (inclusive)"),
    date_to: datetime | None = Query(None, description="created_at <= (inclusive)"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if payment_status is not None and payment_status not in _STATUSES:
        raise HTTPException(status_code=400, detail="invalid payment_status")

    conds = []
    if payment_status is not None:
        conds.append(MarketplaceTransaction.payment_status == payment_status)
    if date_from is not None:
        conds.append(MarketplaceTransaction.created_at >= date_from)
    if date_to is not None:
        conds.append(MarketplaceTransaction.created_at <= date_to)

    total = (await db.execute(select(func.count()).select_from(MarketplaceTransaction).where(*conds))).scalar_one()

    Buyer = aliased(User)
    Seller = aliased(User)
    rows = (
        await db.execute(
            select(MarketplaceTransaction, MarketplaceListing, Buyer, Seller)
            .outerjoin(MarketplaceListing, MarketplaceListing.id == MarketplaceTransaction.listing_id)
            .outerjoin(Buyer, Buyer.id == MarketplaceTransaction.buyer_id)
            .outerjoin(Seller, Seller.id == MarketplaceTransaction.seller_id)
            .where(*conds)
            .order_by(MarketplaceTransaction.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()

    items = [_row(tx, listing.title if listing else "", buyer, seller) for tx, listing, buyer, seller in rows]

    return Page(items=items, total=total, page=page, size=size)


@router.get("/{transaction_id}", response_model=AdminTransactionDetail)
async def get_transaction(
    transaction_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    tx = await db.get(MarketplaceTransaction, transaction_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    # 표시 전용 — 방의 최신 ACCEPTED 약속(없을 수 있음)
    appt = await latest_accepted_appointment(db, tx.conversation_id)
    listing = await db.get(MarketplaceListing, tx.listing_id)
    buyer = await db.get(User, tx.buyer_id)
    seller = await db.get(User, tx.seller_id)
    qr_message_id = await _current_payment_qr_message_id(db, tx)

    memo_logs = (
        (
            await db.execute(
                select(AdminAuditLog)
                .where(
                    AdminAuditLog.target_type == _TARGET_TYPE,
                    AdminAuditLog.target_id == str(transaction_id),
                    AdminAuditLog.action == "transaction.memo_added",
                )
                .order_by(AdminAuditLog.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    base = _row(tx, listing.title if listing else "", buyer, seller)
    return AdminTransactionDetail(
        **base.model_dump(),
        conversation_id=tx.conversation_id,
        payment_method=tx.payment_method,
        appointment_status=appt.status if appt else None,
        when_at=appt.when_at if appt else None,
        buyer_reported_at=tx.buyer_reported_at,
        seller_confirmed_at=tx.seller_confirmed_at,
        qr_registered=qr_message_id is not None,
        memos=[
            MemoRow(
                admin_username=log.admin_username,
                note=(log.detail or {}).get("note", ""),
                created_at=log.created_at,
            )
            for log in memo_logs
        ],
    )


@router.post("/{transaction_id}/memo", status_code=204)
async def add_transaction_memo(
    transaction_id: uuid.UUID,
    body: MemoRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """운영자 메모만 남긴다 — payment_status 등 자금 상태는 여기서 변경하지 않는다."""
    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="note is required")
    tx = await db.get(MarketplaceTransaction, transaction_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    await audit(
        db,
        session,
        request,
        "transaction.memo_added",
        target_type=_TARGET_TYPE,
        target_id=str(transaction_id),
        detail={"note": note},
    )
    await db.commit()


@router.post("/{transaction_id}/rollback-payment-report", status_code=204)
async def rollback_payment_report(
    transaction_id: uuid.UUID,
    body: RollbackRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a PAYMENT_REPORTED deadlock by releasing the set's reserved items and reopening the listings.

    This does not assert that money moved. It is deliberately unavailable once the seller has
    confirmed receipt, and records both an audit fact and peer notifications in the same commit.
    Appointments are independent of the trade and are left untouched (F-N-02 FR-7).
    """
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason is required")
    # Payment and cancellation paths consistently lock the listing before its transaction.
    # Read the listing id first, then re-read the transaction under the ordered locks so
    # neither a concurrent cancellation nor payment confirmation can slip past this guard.
    tx = await db.get(MarketplaceTransaction, transaction_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == tx.listing_id).with_for_update())
    ).scalar_one_or_none()
    if listing is None:
        raise HTTPException(status_code=409, detail="Transaction is no longer an active reserved trade")
    tx = (
        await db.execute(
            select(MarketplaceTransaction)
            .where(MarketplaceTransaction.id == transaction_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if tx is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    ts = await db.get(TradeSet, tx.trade_set_id) if tx.trade_set_id else None
    # 결제 게이트와 동일하게 결제 신고 상태(+세트 소유 거래)만으로 판정한다. 세트에 매칭되지 않는 레거시 행은 읽기 전용.
    if tx.payment_status != "PAYMENT_REPORTED" or ts is None:
        raise HTTPException(status_code=409, detail="Transaction is no longer an active reserved trade")

    now = datetime.now(UTC)
    await cancel_set_trade(db, ts, tx, actor_id=None, reason="payment_report_rollback", actor_type="admin")
    # F-X-01 FR-2: 운영자 롤백이 사용자 취소 요청보다 먼저 도착하면(양측 합의 취소가 PENDING인 채로
    # 운영자가 개입) 그 요청을 열어두지 않는다 — 이미 초기화된 거래에 나중에 동의/거절해봤자
    # 의미가 없으므로 여기서 EXPIRED로 닫아 "응답 없이 종료"와 같은 의미로 정리한다.
    pending_cancel_request = (
        await db.execute(
            select(MarketplaceTransactionCancelRequest)
            .where(
                MarketplaceTransactionCancelRequest.transaction_id == transaction_id,
                MarketplaceTransactionCancelRequest.status == "PENDING",
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if pending_cancel_request is not None:
        pending_cancel_request.status = "EXPIRED"
        pending_cancel_request.responded_at = now
        pending_cancel_request.updated_at = now
    await audit(
        db,
        session,
        request,
        "transaction.payment_report_rolled_back",
        target_type=_TARGET_TYPE,
        target_id=str(transaction_id),
        detail={"reason": reason, "previous_payment_status": "PAYMENT_REPORTED"},
    )
    for recipient_id in (tx.buyer_id, tx.seller_id):
        noti_events.enqueue(
            db,
            "market.payment_report_rolled_back",
            {
                "trade_set_id": str(ts.id),
                "conversation_id": str(tx.conversation_id),
                "listing_title": listing.title,
                "recipient_id": str(recipient_id),
            },
        )
    await db.commit()
