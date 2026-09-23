"""F-X-01 FR-2(260924 승인안): 거래 취소 요청(PENDING) 24h 무응답 자동 취소.

상대가 응답하지 않으면 요청 자체가 교착의 새 원인이 되지 않도록, 응답 없이 24시간이 지난
요청은 [동의]와 같은 효력(약속·거래 CANCELLED, 매물 ON_SALE 복귀)으로 자동 종료한다.
"""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import (
    MarketplaceAppointment,
    MarketplaceListing,
    MarketplaceTransaction,
    MarketplaceTransactionCancelRequest,
)
from ..services import noti_events
from ..services.listing_state import log_transition

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
    appt = await db.get(MarketplaceAppointment, cancel_request.appointment_id)
    transaction = await db.get(MarketplaceTransaction, cancel_request.appointment_id)
    if appt is None or transaction is None:
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
    if listing is not None and appt.status == "ACCEPTED" and listing.status == "RESERVED":
        listing.status = "ON_SALE"
        listing.updated_at = now
        log_transition(
            db,
            listing.id,
            "RESERVED",
            "ON_SALE",
            actor_type="system",
            reason="transaction_cancel_request_expired",
        )
    if appt.status == "ACCEPTED":
        appt.status = "CANCELLED"
        appt.cancel_reason = cancel_request.reason
        appt.updated_at = now
    cancel_request.status = "EXPIRED"
    cancel_request.responded_at = now
    cancel_request.updated_at = now
    for recipient_id in (transaction.buyer_id, transaction.seller_id):
        noti_events.enqueue(
            db,
            "market.transaction_cancel_expired",
            {
                "appointment_id": str(appt.id),
                "conversation_id": str(transaction.conversation_id),
                "listing_title": listing.title if listing else "",
                "recipient_id": str(recipient_id),
            },
        )
    await db.commit()
