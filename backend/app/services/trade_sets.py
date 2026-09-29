"""거래 세트(trade_sets/trade_set_items) 도메인 헬퍼 (260928_trade-request-flow-design.md §3).

방 하나(구매자 1 · 판매자 1)의 거래 묶음 조회·항목 추가/제거·판매자 상태 변경(판매중/예약중/
거래완료)을 한 곳에 모아 dm.py(방 안 상태 시트)와 market.py(매물 상세 예약자 선택)가 공유한다.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    DmMessage,
    ListingAvailabilitySubscription,
    MarketplaceAppointment,
    MarketplaceListing,
    MarketplacePriceOffer,
    MarketplaceTransaction,
    TradeSet,
    TradeSetItem,
)
from ..schemas import TradeSetItemOut, TradeSetOut
from ..utils import build_imgproxy_url
from . import noti_events
from .listing_state import log_transition

_ACTIVE_ITEM_STATUSES = ("INQUIRY", "RESERVED", "COMPLETED")


def _thumbnail(listing: MarketplaceListing) -> str | None:
    img = listing.images[0] if listing.images else None
    return build_imgproxy_url(img.content.file_path) if img and img.content else None


async def get_active_set(db: AsyncSession, conversation_id: uuid.UUID) -> TradeSet | None:
    return (
        await db.execute(
            select(TradeSet).where(TradeSet.conversation_id == conversation_id, TradeSet.status == "ACTIVE")
        )
    ).scalar_one_or_none()


async def is_reserved_for(db: AsyncSession, listing_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    """d1(260928) — 이 매물이 user_id 본인에게 RESERVED 된 세트의 구매자 몫이면 True.
    LISTING_RESERVED 409 가드에서 예약 당사자 본인은 예외로 둔다(리뷰어 지적 #5) —
    dm.py create_conversation 의 reserved_for_me 카브아웃과 동일 조건을 공유한다."""
    return (
        await db.execute(
            select(TradeSetItem.id)
            .join(TradeSet, TradeSet.id == TradeSetItem.set_id)
            .where(
                TradeSetItem.listing_id == listing_id, TradeSetItem.status == "RESERVED", TradeSet.buyer_id == user_id
            )
            .limit(1)
        )
    ).scalar_one_or_none() is not None


async def is_item_reserved(db: AsyncSession, conversation_id: uuid.UUID, listing_id: uuid.UUID) -> bool:
    """이 방의 활성 세트에서 해당 매물 항목이 이미 RESERVED 인지 — 약속 수락 시 예약 프롬프트 중복 방지."""
    ts = await get_active_set(db, conversation_id)
    if ts is None:
        return False
    return (
        await db.execute(
            select(TradeSetItem.id).where(
                TradeSetItem.set_id == ts.id, TradeSetItem.listing_id == listing_id, TradeSetItem.status == "RESERVED"
            )
        )
    ).scalar_one_or_none() is not None


async def accepted_offer_amount(db: AsyncSession, conversation_id: uuid.UUID, listing_id: uuid.UUID) -> int | None:
    return (
        await db.execute(
            select(MarketplacePriceOffer.amount)
            .where(
                MarketplacePriceOffer.conversation_id == conversation_id,
                MarketplacePriceOffer.listing_id == listing_id,
                MarketplacePriceOffer.status == "ACCEPTED",
            )
            .order_by(MarketplacePriceOffer.updated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def set_total_vnd(db: AsyncSession, ts: TradeSet) -> int:
    items = (
        (
            await db.execute(
                select(TradeSetItem).where(TradeSetItem.set_id == ts.id, TradeSetItem.status.in_(_ACTIVE_ITEM_STATUSES))
            )
        )
        .scalars()
        .all()
    )
    total = 0
    for it in items:
        listing = await db.get(MarketplaceListing, it.listing_id)
        if listing is None:
            continue
        offer_amount = await accepted_offer_amount(db, ts.conversation_id, it.listing_id)
        total += offer_amount if offer_amount is not None else listing.price_vnd
    return total


async def set_has_reserved_item(db: AsyncSession, set_id: uuid.UUID) -> bool:
    return (
        await db.execute(
            select(TradeSetItem.id).where(TradeSetItem.set_id == set_id, TradeSetItem.status == "RESERVED").limit(1)
        )
    ).scalar_one_or_none() is not None


async def ensure_set_transaction(db: AsyncSession, ts: TradeSet) -> MarketplaceTransaction | None:
    """세트 소유 결제 거래(F-N-02 FR-7 ④⑤) — 세트에 RESERVED 항목이 생기면 1건 만들고, 송금 전
    (AWAITING_PAYMENT)에는 항목 변동마다 금액(set_total_vnd)·대표 매물을 다시 맞춘다. 세트 항목이
    바뀌는 모든 경로(담기·빼기·상태 변경·예약)가 부르는 단일 진입점. commit 은 호출부 몫."""
    await db.flush()  # 방금 바뀐 항목 상태를 아래 조회에 반영
    # 세트 행 잠금 — 첫 거래 행 INSERT 경합 직렬화(uq_marketplace_transactions_trade_set 위반 방지)
    await db.execute(select(TradeSet.id).where(TradeSet.id == ts.id).with_for_update())
    tx = (
        await db.execute(select(MarketplaceTransaction).where(MarketplaceTransaction.trade_set_id == ts.id))
    ).scalar_one_or_none()
    if tx is None and not await set_has_reserved_item(db, ts.id):
        return None
    if tx is not None and tx.payment_status != "AWAITING_PAYMENT":
        return tx
    first_item = (
        await db.execute(
            select(TradeSetItem.listing_id)
            .where(TradeSetItem.set_id == ts.id, TradeSetItem.status.in_(_ACTIVE_ITEM_STATUSES))
            .order_by(TradeSetItem.created_at)
            .limit(1)
        )
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    amount = await set_total_vnd(db, ts)
    if tx is None:
        tx = MarketplaceTransaction(
            trade_set_id=ts.id,
            conversation_id=ts.conversation_id,
            listing_id=first_item,
            buyer_id=ts.buyer_id,
            seller_id=ts.seller_id,
            amount_vnd=amount,
            payment_method="zalopay_qr_manual",
            payment_status="AWAITING_PAYMENT",
            created_at=now,
            updated_at=now,
        )
        db.add(tx)
    else:
        # 검수(buyer_inspected_at) 후 금액이 바뀌었거나 검수 이후 새로 예약된 항목이 있으면 다른 물건을
        # 본 것이므로 검수를 무효화한다(보수적).
        if tx.buyer_inspected_at is not None:
            reserved_after_inspection = (
                await db.execute(
                    select(TradeSetItem.id)
                    .where(
                        TradeSetItem.set_id == ts.id,
                        TradeSetItem.status == "RESERVED",
                        TradeSetItem.updated_at > tx.buyer_inspected_at,
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if tx.amount_vnd != amount or reserved_after_inspection is not None:
                tx.buyer_inspected_at = None
        tx.amount_vnd = amount
        if first_item is not None:
            tx.listing_id = first_item
        tx.updated_at = now
    await db.flush()
    return tx


async def cancel_set_trade(
    db: AsyncSession,
    ts: TradeSet,
    tx: MarketplaceTransaction,
    *,
    actor_id: uuid.UUID | None,
    reason: str,
    actor_type: str = "user",
) -> None:
    """거래 취소(양측 합의·만료·운영자 롤백) — 세트의 RESERVED 항목을 모두 CANCELLED 로 종결하고 매물을
    판매중으로 되돌린 뒤(d1 알림 포함) 결제 상태를 초기화한다. 약속은 건드리지 않는다(FR-7 독립)."""
    now = datetime.now(UTC)
    items = (
        (await db.execute(select(TradeSetItem).where(TradeSetItem.set_id == ts.id, TradeSetItem.status == "RESERVED")))
        .scalars()
        .all()
    )
    for item in items:
        listing = (
            await db.execute(
                select(MarketplaceListing).where(MarketplaceListing.id == item.listing_id).with_for_update()
            )
        ).scalar_one_or_none()
        if listing is not None:
            await release_listing_to_on_sale(db, listing, actor_id=actor_id, reason=reason, actor_type=actor_type)
        item.status = "CANCELLED"
        item.updated_at = now
    tx.payment_status = "AWAITING_PAYMENT"
    tx.buyer_reported_at = None
    tx.buyer_inspected_at = None
    tx.stall_notice_sent_at = None
    tx.updated_at = now


async def latest_accepted_appointment(db: AsyncSession, conversation_id: uuid.UUID) -> MarketplaceAppointment | None:
    """표시 전용 — 방의 가장 최근 ACCEPTED 약속(결제와 무관, FR-7)."""
    return (
        await db.execute(
            select(MarketplaceAppointment)
            .where(
                MarketplaceAppointment.conversation_id == conversation_id, MarketplaceAppointment.status == "ACCEPTED"
            )
            .order_by(MarketplaceAppointment.updated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def trade_set_out(db: AsyncSession, ts: TradeSet) -> TradeSetOut:
    items = (
        (
            await db.execute(
                select(TradeSetItem)
                .where(TradeSetItem.set_id == ts.id, TradeSetItem.status.in_(_ACTIVE_ITEM_STATUSES))
                .order_by(TradeSetItem.created_at)
            )
        )
        .scalars()
        .all()
    )
    out_items: list[TradeSetItemOut] = []
    total = 0
    for it in items:
        listing = await db.get(MarketplaceListing, it.listing_id)
        if listing is None:
            continue
        offer_amount = await accepted_offer_amount(db, ts.conversation_id, it.listing_id)
        price = offer_amount if offer_amount is not None else listing.price_vnd
        total += price
        out_items.append(
            TradeSetItemOut(
                listing_id=listing.id,
                title=listing.title,
                price_vnd=listing.price_vnd,
                thumbnail_url=_thumbnail(listing),
                status=it.status,
                agreed_price_vnd=offer_amount,
            )
        )
    return TradeSetOut(
        id=ts.id,
        conversation_id=ts.conversation_id,
        buyer_id=ts.buyer_id,
        seller_id=ts.seller_id,
        status=ts.status,
        items=out_items,
        total_vnd=total,
    )


async def bundle_snapshot_meta(db: AsyncSession, ts: TradeSet) -> dict:
    """묶음 카드 meta 스냅샷(listingIds/titles/totalVnd) — 세트의 활성 항목(INQUIRY/RESERVED)만
    포함한다. 수동 전송([묶음 정보 보내기], FR-6)과 자동 담기 카드가 같은 모양을 공유한다."""
    items = (
        (
            await db.execute(
                select(TradeSetItem)
                .where(TradeSetItem.set_id == ts.id, TradeSetItem.status.in_(("INQUIRY", "RESERVED")))
                .order_by(TradeSetItem.created_at)
            )
        )
        .scalars()
        .all()
    )
    listings: list[MarketplaceListing] = []
    for it in items:
        listing = await db.get(MarketplaceListing, it.listing_id)
        if listing is not None:
            listings.append(listing)
    total = await set_total_vnd(db, ts)
    return {
        "subtype": "bundle",
        "listingIds": [str(listing.id) for listing in listings],
        "titles": [listing.title for listing in listings],
        "totalVnd": total,
    }


async def get_or_create_active_set(
    db: AsyncSession, conversation_id: uuid.UUID, buyer_id: uuid.UUID, seller_id: uuid.UUID
) -> TradeSet:
    ts = await get_active_set(db, conversation_id)
    if ts is not None:
        return ts
    now = datetime.now(UTC)
    ts = TradeSet(
        conversation_id=conversation_id,
        buyer_id=buyer_id,
        seller_id=seller_id,
        status="ACTIVE",
        created_at=now,
        updated_at=now,
    )
    db.add(ts)
    await db.flush()
    return ts


async def upsert_item(db: AsyncSession, set_id: uuid.UUID, listing_id: uuid.UUID, added_by: uuid.UUID) -> TradeSetItem:
    """항목을 INQUIRY 로 추가한다. 이미 REMOVED/CANCELLED 였던 항목은 되살리고, 이미
    활성(INQUIRY/RESERVED/COMPLETED)인 항목은 그대로 둔다."""
    existing = (
        await db.execute(
            select(TradeSetItem).where(TradeSetItem.set_id == set_id, TradeSetItem.listing_id == listing_id)
        )
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if existing is None:
        item = TradeSetItem(
            set_id=set_id,
            listing_id=listing_id,
            status="INQUIRY",
            added_by=added_by,
            created_at=now,
            updated_at=now,
        )
        db.add(item)
        await db.flush()
        return item
    if existing.status in ("REMOVED", "CANCELLED"):
        existing.status = "INQUIRY"
        existing.added_by = added_by
        existing.updated_at = now
    return existing


async def release_listing_to_on_sale(
    db: AsyncSession,
    listing: MarketplaceListing,
    *,
    actor_id: uuid.UUID | None,
    reason: str,
    actor_type: str = "user",
) -> None:
    """예약중 매물을 판매중으로 되돌리고, d1 opt-in 구독자에게 알림을 적재한다(§3.6 #14)."""
    now = datetime.now(UTC)
    if listing.status == "RESERVED":
        listing.status = "ON_SALE"
        listing.updated_at = now
        log_transition(db, listing.id, "RESERVED", "ON_SALE", actor_type=actor_type, actor_id=actor_id, reason=reason)
    subs = (
        (
            await db.execute(
                select(ListingAvailabilitySubscription.user_id).where(
                    ListingAvailabilitySubscription.listing_id == listing.id,
                    ListingAvailabilitySubscription.notified_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for user_id in subs:
        noti_events.enqueue(
            db,
            "market.listing_available",
            {"listing_id": str(listing.id), "title": listing.title, "recipient_id": str(user_id)},
        )
    if subs:
        await db.execute(
            update(ListingAvailabilitySubscription)
            .where(
                ListingAvailabilitySubscription.listing_id == listing.id,
                ListingAvailabilitySubscription.user_id.in_(subs),
            )
            .values(notified_at=now)
        )


async def reserve_listing_for_set(
    db: AsyncSession, listing: MarketplaceListing, ts: TradeSet, *, actor_id: uuid.UUID
) -> None:
    """이 세트의 항목을 RESERVED 로 바꾸고, 같은 매물을 담은 다른 세트의 항목을 밀어낸다
    (§3.1 "다른 분과 거래가 진행돼 빠졌어요")."""
    now = datetime.now(UTC)
    if listing.status != "RESERVED":
        prev = listing.status
        listing.status = "RESERVED"
        listing.updated_at = now
        log_transition(
            db, listing.id, prev, "RESERVED", actor_type="user", actor_id=actor_id, reason="trade_set_reserved"
        )

    item = (
        await db.execute(
            select(TradeSetItem).where(TradeSetItem.set_id == ts.id, TradeSetItem.listing_id == listing.id)
        )
    ).scalar_one_or_none()
    # 리뷰어 지적 #4 — INQUIRY 에서만 RESERVED 로 전이한다. REMOVED/CANCELLED 항목까지 되살리면
    # 이미 빠진(또는 취소된) 항목이 부활해버린다.
    if item is not None and item.status == "INQUIRY":
        item.status = "RESERVED"
        item.updated_at = now

    # 다른 세트(다른 대화방)의 같은 매물 항목 — 밀어내기
    other_items = (
        await db.execute(
            select(TradeSetItem, TradeSet)
            .join(TradeSet, TradeSet.id == TradeSetItem.set_id)
            .where(
                TradeSetItem.listing_id == listing.id,
                TradeSetItem.set_id != ts.id,
                TradeSetItem.status == "INQUIRY",
                TradeSet.status == "ACTIVE",
            )
        )
    ).all()
    for other_item, other_set in other_items:
        other_item.status = "REMOVED"
        other_item.updated_at = now
        await db.execute(
            update(MarketplacePriceOffer)
            .where(
                MarketplacePriceOffer.conversation_id == other_set.conversation_id,
                MarketplacePriceOffer.listing_id == listing.id,
                MarketplacePriceOffer.status == "PROPOSED",
            )
            .values(status="DECLINED", updated_at=now)
        )
        # 프론트가 dm.tradeSetItemRemovedCompeting(listingTitle) 로 렌더 — i18n, content 미저장.
        msg = DmMessage(
            conversation_id=other_set.conversation_id,
            sender_id=listing.seller_id,
            content=None,
            message_type="text",
            meta={
                "kind": "trade_set_item_removed_competing",
                "listingId": str(listing.id),
                "listingTitle": listing.title,
            },
            created_at=now,
        )
        db.add(msg)

    await ensure_set_transaction(db, ts)


async def find_accepted_appointment(
    db: AsyncSession, conversation_id: uuid.UUID, listing_id: uuid.UUID
) -> MarketplaceAppointment | None:
    return (
        await db.execute(
            select(MarketplaceAppointment).where(
                MarketplaceAppointment.conversation_id == conversation_id,
                MarketplaceAppointment.listing_id == listing_id,
                MarketplaceAppointment.status == "ACCEPTED",
            )
        )
    ).scalar_one_or_none()


async def cancel_reserved_item(db: AsyncSession, conversation_id: uuid.UUID, listing_id: uuid.UUID) -> None:
    """거래가 취소돼(차단·양측 합의 취소·만료) 예약중 항목을 되돌릴 때 — 판매자의 자발적
    판매중 전환(INQUIRY 복귀)과 달리 취소된 거래는 CANCELLED 로 종결한다(리뷰어 지적 #2)."""
    ts = await get_active_set(db, conversation_id)
    if ts is None:
        return
    item = (
        await db.execute(
            select(TradeSetItem).where(
                TradeSetItem.set_id == ts.id, TradeSetItem.listing_id == listing_id, TradeSetItem.status == "RESERVED"
            )
        )
    ).scalar_one_or_none()
    if item is not None:
        item.status = "CANCELLED"
        item.updated_at = datetime.now(UTC)


async def complete_trade_set(
    db: AsyncSession, ts: TradeSet, actor_id: uuid.UUID | None, *, actor_type: str = "user"
) -> list[MarketplaceAppointment]:
    """세트의 INQUIRY/RESERVED 항목을 모두 거래완료(매물 SOLD, 세트 CLOSED)로 만든다. 세트 상태 변경과
    약속 완료(complete_appointment)가 공유하는 유일한 완료 경로(F-N-02 FR-7 ④). commit 은 호출부 몫.
    함께 COMPLETED 로 옮긴 ACCEPTED 약속을 돌려줘 호출부가 알림·라이브 액티비티를 붙일 수 있게 한다."""
    now = datetime.now(UTC)
    completed_appts: list[MarketplaceAppointment] = []
    items = (
        (
            await db.execute(
                select(TradeSetItem).where(
                    TradeSetItem.set_id == ts.id, TradeSetItem.status.in_(["INQUIRY", "RESERVED"])
                )
            )
        )
        .scalars()
        .all()
    )
    for item in items:
        listing = (
            await db.execute(
                select(MarketplaceListing).where(MarketplaceListing.id == item.listing_id).with_for_update()
            )
        ).scalar_one_or_none()
        if listing is None:
            continue
        offer_amount = (
            await db.execute(
                select(MarketplacePriceOffer.amount)
                .where(
                    MarketplacePriceOffer.listing_id == listing.id,
                    MarketplacePriceOffer.status == "ACCEPTED",
                )
                .order_by(MarketplacePriceOffer.updated_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        prev_status = listing.status
        listing.status = "SOLD"
        listing.agreed_price_vnd = offer_amount if offer_amount is not None else listing.price_vnd
        listing.updated_at = now
        log_transition(
            db,
            listing.id,
            prev_status,
            "SOLD",
            actor_type=actor_type,
            actor_id=actor_id,
            reason="trade_set_completed",
        )
        item.status = "COMPLETED"
        item.updated_at = now
        appt = await find_accepted_appointment(db, ts.conversation_id, listing.id)
        if appt is not None:
            appt.status = "COMPLETED"
            appt.updated_at = now
            completed_appts.append(appt)
    ts.status = "CLOSED"
    ts.updated_at = now
    return completed_appts
