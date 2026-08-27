"""SOLD 매물의 명의이전 D+7 / D+25 리마인더 — 016 §4-6 #41, D-35=(a).

⚠ L-6 법무 미확인: 30일 기한·과태료 등은 2차 출처 기반이다. 알림 문구 자체는 기한을
단정하지 않고 체크리스트 화면(프론트)으로 유도만 한다 — 조문 인용은 체크리스트 쪽 i18n
고지("관할 기관 확인 요망")를 참조.

앵커는 listing_state_log 의 SOLD 전이 시각(complete_appointment 가 남긴다) — SOLD 는 종결
상태라 리스팅당 전이가 하나뿐이다. title_transfer_reminder_log(listing_id, reminder_type)
UNIQUE 로 중복 발송을 막는다(expire_stale_listings.py 잡 선례와 동일 패턴 — 매일 01:05 ICT).
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..database import AsyncSessionLocal
from ..models import (
    DmConversation,
    ListingStateLog,
    MarketplaceAppointment,
    MarketplaceListing,
    TitleTransferReminderLog,
)
from ..services import noti_events

log = logging.getLogger(__name__)

_REMINDER_OFFSETS = {"D7": timedelta(days=7), "D25": timedelta(days=25)}


async def _find_buyer_id(db, listing_id: uuid.UUID, seller_id: uuid.UUID) -> uuid.UUID | None:
    """완료된 약속의 대화 상대 = 구매자. 못 찾으면 None(그래도 판매자에게는 보낸다)."""
    row = (
        await db.execute(
            select(DmConversation.participant_1, DmConversation.participant_2)
            .join(MarketplaceAppointment, MarketplaceAppointment.conversation_id == DmConversation.id)
            .where(
                MarketplaceAppointment.listing_id == listing_id,
                MarketplaceAppointment.status == "COMPLETED",
                DmConversation.conversation_type == "direct",
            )
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    p1, p2 = row
    return p2 if p1 == seller_id else p1


async def _process_reminder_type(db, reminder_type: str) -> int:
    cutoff = datetime.now(UTC) - _REMINDER_OFFSETS[reminder_type]
    due = (
        await db.execute(
            select(ListingStateLog.listing_id, MarketplaceListing.seller_id, MarketplaceListing.title)
            .join(MarketplaceListing, MarketplaceListing.id == ListingStateLog.listing_id)
            .where(
                ListingStateLog.to_state == "SOLD",
                ListingStateLog.created_at <= cutoff,
                MarketplaceListing.status == "SOLD",
            )
        )
    ).all()

    sent = 0
    for listing_id, seller_id, title in due:
        inserted_id = await db.scalar(
            pg_insert(TitleTransferReminderLog)
            .values(listing_id=listing_id, reminder_type=reminder_type)
            .on_conflict_do_nothing(
                index_elements=[TitleTransferReminderLog.listing_id, TitleTransferReminderLog.reminder_type]
            )
            .returning(TitleTransferReminderLog.id)
        )
        if inserted_id is None:
            continue  # 이미 발송됨

        buyer_id = await _find_buyer_id(db, listing_id, seller_id)
        recipients = {seller_id} | ({buyer_id} if buyer_id else set())
        for recipient_id in recipients:
            noti_events.enqueue(
                db,
                "market.title_transfer_reminder",
                {
                    "user_id": str(recipient_id),
                    "listing_id": str(listing_id),
                    "title": title,
                    "reminder_type": reminder_type,
                },
            )
        sent += 1
    return sent


async def send_title_transfer_reminders() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            for reminder_type in ("D7", "D25"):
                await _process_reminder_type(db, reminder_type)
            await db.commit()
        return True
    except Exception:
        log.exception("Title transfer reminders batch failed")
        return False
