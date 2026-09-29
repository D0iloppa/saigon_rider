"""F-X-01 FR-2(260924 승인안): 거래 취소 요청(PENDING) 24h 무응답 자동 취소.

상대가 응답하지 않으면 요청 자체가 교착의 새 원인이 되지 않도록, 응답 없이 24시간이 지난
요청은 [동의]와 같은 효력(거래 초기화·세트 예약 항목 취소, 매물 ON_SALE 복귀)으로 자동 종료한다.
"""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import (
    MarketplaceListing,
    MarketplaceTransaction,
    MarketplaceTransactionCancelRequest,
    TradeSet,
)
from ..services import noti_events
from ..services.trade_sets import cancel_set_trade

log = logging.getLogger(__name__)


async def expire_transaction_cancel_requests() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            await _expire_all(db)
        return True
    except Exception:
        log.exception("Expire transaction cancel requests batch failed")
        return False


async def _expire_all(db: AsyncSession) -> None:
    now = datetime.now(UTC)
    expired_ids = (
        (
            await db.execute(
                select(MarketplaceTransactionCancelRequest.id).where(
                    MarketplaceTransactionCancelRequest.status == "PENDING",
                    MarketplaceTransactionCancelRequest.expires_at <= now,
                )
            )
        )
        .scalars()
        .all()
    )
    for request_id in expired_ids:
        await _expire_one(db, request_id, now)


async def _expire_one(db: AsyncSession, request_id: uuid.UUID, now: datetime) -> None:
    # 매물→거래 잠금 순서를 취소/결제 경로와 동일하게 유지한다(교착 회피, market.py 주석 참조).
    cancel_request = (
        await db.execute(
            select(MarketplaceTransactionCancelRequest)
            .where(MarketplaceTransactionCancelRequest.id == request_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if cancel_request is None or cancel_request.status != "PENDING" or cancel_request.expires_at > now:
        return
    transaction = (
        await db.get(MarketplaceTransaction, cancel_request.transaction_id) if cancel_request.transaction_id else None
    )
    ts = await db.get(TradeSet, transaction.trade_set_id) if transaction and transaction.trade_set_id else None
    if transaction is None or ts is None:
        cancel_request.status = "EXPIRED"
        cancel_request.responded_at = now
        cancel_request.updated_at = now
        await db.commit()
        return
    listing = (
        await db.execute(
            select(MarketplaceListing).where(MarketplaceListing.id == transaction.listing_id).with_for_update()
        )
    ).scalar_one_or_none()
    # [동의]와 같은 효력 — 거래 취소(세트 예약 항목 CANCELLED · 매물 ON_SALE 복귀 · 결제 초기화). 약속은 그대로(FR-7).
    # 운영자 롤백(admin_api/transactions.py::rollback_payment_report)과 동일하게 payment_status를 되돌려
    # 어드민 PAYMENT_REPORTED 큐(list_transactions)에 해결된 건이 계속 쌓이지 않게 한다.
    await cancel_set_trade(
        db, ts, transaction, actor_id=None, actor_type="system", reason="transaction_cancel_request_expired"
    )
    cancel_request.status = "EXPIRED"
    cancel_request.responded_at = now
    cancel_request.updated_at = now
    for recipient_id in (transaction.buyer_id, transaction.seller_id):
        noti_events.enqueue(
            db,
            "market.transaction_cancel_expired",
            {
                "trade_set_id": str(ts.id),
                "conversation_id": str(transaction.conversation_id),
                "listing_title": listing.title if listing else "",
                "recipient_id": str(recipient_id),
            },
        )
    await db.commit()
