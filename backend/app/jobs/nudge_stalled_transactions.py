"""F-X-01 FR-2 / F-S6-01 FR-4(260924 승인안, 알림 표 #7·#8 후반부) — 교착 출구 안내 넛지.

두 조건 중 하나면 양측에게 "문제가 있나요?" 출구 안내를 1회 보낸다(``stall_notice_sent_at`` 가드):
  ⓐ PAYMENT_REPORTED 후 24시간 동안 판매자 미확인(수신확인 없음)
  ⓑ ACCEPTED 약속 시각(when_at) 이후 3시간 동안 결제 신고도 없이 무응답

상태 자체를 바꾸지 않는다 — 사용자 수준 출구(신고 취소·취소 요청)로 넘어가는 안내일 뿐이다.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models import MarketplaceAppointment, MarketplaceListing, MarketplaceTransaction
from ..services import noti_events

log = logging.getLogger(__name__)

_PAYMENT_REPORTED_STALL_AFTER = timedelta(hours=24)
_ACCEPTED_NO_RESPONSE_STALL_AFTER = timedelta(hours=3)


async def nudge_stalled_transactions() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            now = datetime.now(UTC)
            await _nudge_payment_reported(db, now)
            await _nudge_accepted_no_response(db, now)
        return True
    except Exception:
        log.exception("Nudge stalled transactions batch failed")
        return False


async def _nudge_payment_reported(db, now: datetime) -> None:
    cutoff = now - _PAYMENT_REPORTED_STALL_AFTER
    rows = (
        await db.execute(
            select(MarketplaceTransaction, MarketplaceListing.title)
            .join(MarketplaceListing, MarketplaceListing.id == MarketplaceTransaction.listing_id)
            .where(
                MarketplaceTransaction.payment_status == "PAYMENT_REPORTED",
                MarketplaceTransaction.buyer_reported_at.is_not(None),
                MarketplaceTransaction.buyer_reported_at < cutoff,
                MarketplaceTransaction.stall_notice_sent_at.is_(None),
            )
        )
    ).all()
    for tx, listing_title in rows:
        tx.stall_notice_sent_at = now
        tx.updated_at = now
        for recipient_id in (tx.buyer_id, tx.seller_id):
            noti_events.enqueue(
                db,
                "market.transaction_stalled",
                {
                    "appointment_id": str(tx.appointment_id),
                    "conversation_id": str(tx.conversation_id),
                    "listing_title": listing_title,
                    "recipient_id": str(recipient_id),
                },
            )
    if rows:
        await db.commit()


async def _nudge_accepted_no_response(db, now: datetime) -> None:
    cutoff = now - _ACCEPTED_NO_RESPONSE_STALL_AFTER
    rows = (
        await db.execute(
            select(MarketplaceAppointment, MarketplaceTransaction, MarketplaceListing.title)
            .join(MarketplaceTransaction, MarketplaceTransaction.appointment_id == MarketplaceAppointment.id)
            .join(MarketplaceListing, MarketplaceListing.id == MarketplaceTransaction.listing_id)
            .where(
                MarketplaceAppointment.status == "ACCEPTED",
                MarketplaceAppointment.when_at < cutoff,
                MarketplaceTransaction.payment_status == "AWAITING_PAYMENT",
                MarketplaceTransaction.stall_notice_sent_at.is_(None),
            )
        )
    ).all()
    for appt, tx, listing_title in rows:
        tx.stall_notice_sent_at = now
        tx.updated_at = now
        for recipient_id in (tx.buyer_id, tx.seller_id):
            noti_events.enqueue(
                db,
                "market.transaction_stalled",
                {
                    "appointment_id": str(appt.id),
                    "conversation_id": str(tx.conversation_id),
                    "listing_title": listing_title,
                    "recipient_id": str(recipient_id),
                },
            )
    if rows:
        await db.commit()
