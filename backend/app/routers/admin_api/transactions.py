"""admin JSON API — 수동 QR 거래 조회·분쟁 개입 (F033).

당근 비교 트리아지(260909)에서 기능은 있으나(8c5c7493) 운영자 조회 화면이 없다고 지적된 부분.
**조회 + 운영자 메모까지만** — 자금 상태(payment_status)를 운영자가 임의로 바꾸는 경로는 여기
없다(232_marketplace_transactions.sql 주석: 플랫폼은 결제를 보증하지 않는다). 상태변경이 필요하면
이 파일을 건드리지 말고 새 설계를 검토한다.

QR 이미지 자체는 노출하지 않는다 — 등록 여부(있음/없음)만 `_current_payment_qr_message_id` 로 판단.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import AdminAuditLog, MarketplaceAppointment, MarketplaceListing, MarketplaceTransaction, User
from ...schemas import Page
from ..market import _current_payment_qr_message_id
from ._audit import audit

router = APIRouter(prefix="/transactions")

_STATUSES = {"AWAITING_PAYMENT", "PAYMENT_REPORTED", "PAYMENT_CONFIRMED"}
_TARGET_TYPE = "marketplace_transaction"


class PartyRow(BaseModel):
    id: uuid.UUID | None
    nickname: str | None


class AdminTransactionRow(BaseModel):
    appointment_id: uuid.UUID
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
    appointment_status: str
    when_at: datetime
    buyer_reported_at: datetime | None
    seller_confirmed_at: datetime | None
    qr_registered: bool
    memos: list[MemoRow]


class MemoRequest(BaseModel):
    note: str = Field(min_length=1, max_length=500)


def _party(user: User | None) -> PartyRow:
    return PartyRow(id=user.id if user else None, nickname=user.nickname if user else None)


def _row(
    tx: MarketplaceTransaction, listing_title: str, buyer: User | None, seller: User | None
) -> AdminTransactionRow:
    return AdminTransactionRow(
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


@router.get("/{appointment_id}", response_model=AdminTransactionDetail)
async def get_transaction(
    appointment_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    tx = await db.get(MarketplaceTransaction, appointment_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    appt = await db.get(MarketplaceAppointment, appointment_id)
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
                    AdminAuditLog.target_id == str(appointment_id),
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
        appointment_status=appt.status if appt else "",
        when_at=appt.when_at if appt else tx.created_at,
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


@router.post("/{appointment_id}/memo", status_code=204)
async def add_transaction_memo(
    appointment_id: uuid.UUID,
    body: MemoRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """운영자 메모만 남긴다 — payment_status 등 자금 상태는 여기서 변경하지 않는다."""
    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="note is required")
    tx = await db.get(MarketplaceTransaction, appointment_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    await audit(
        db,
        session,
        request,
        "transaction.memo_added",
        target_type=_TARGET_TYPE,
        target_id=str(appointment_id),
        detail={"note": note},
    )
    await db.commit()
