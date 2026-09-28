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
