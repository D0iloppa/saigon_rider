from __future__ import annotations

from datetime import date

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.enums import ItemSlotEnum
from app.models import DailyFeaturedItem, ItemDefinition, SreUser, UserItem
from app.schemas import ShopPurchaseResult
from app.services.xp_ledger import get_or_create_user

# 상점 드릴다운 그룹 → 슬롯 집합 (프론트 ShopCatalog 그룹과 일치)
SHOP_GROUPS: dict[str, tuple[str, ...]] = {
    "rider": ("HELMET", "JACKET", "GLOVES", "EYEWEAR", "BOOTS", "PANTS", "KNEE"),
    "bike": ("BODY", "ENGINE", "SEAT", "STICKER", "HANDLE", "MIRROR", "LIGHT", "TAIL", "NUMBER", "WHEEL"),
    "effect": ("NAME", "RANK", "FRAME", "TITLE", "BACKDROP",
               "TRAIL", "START", "HORN", "BANNER", "EMOTE", "PET"),
}


async def list_shop_items(
    db: AsyncSession,
    *,
    collection: str | None = None,
    rarity: str | None = None,
    slot: str | None = None,
    group: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user_uuid: str | None = None,
) -> list[dict]:
    query = (
        select(ItemDefinition)
        .where(ItemDefinition.is_shop_visible.is_(True))
    )
    if collection:
        query = query.where(ItemDefinition.collection_code == collection)
    if rarity:
        query = query.where(ItemDefinition.rarity == rarity)
    if slot:
        # 알 수 없는 슬롯(폐기된 구 enum 값 등)은 빈 결과 반환 — invalid enum 으로 인한 500 방지
        if slot not in ItemSlotEnum.__members__:
            return []
        query = query.where(ItemDefinition.slot == slot)
    if group:
        # 알 수 없는 그룹은 빈 결과
        if group not in SHOP_GROUPS:
            return []
        query = query.where(ItemDefinition.slot.in_(SHOP_GROUPS[group]))

    query = query.order_by(
        ItemDefinition.rarity.asc(),
        ItemDefinition.collection_code.asc(),
    ).offset(offset).limit(limit)

    result = await db.execute(query)
    items = list(result.scalars().all())

    # user_uuid가 있으면 소유 여부 확인
    owned: set[str] = set()
    if user_uuid:
        uid_row = await db.execute(
            select(SreUser.user_id).where(SreUser.external_user_uuid == user_uuid)
        )
        uid = uid_row.scalar_one_or_none()
        if uid:
            owned_rows = await db.execute(
                select(UserItem.item_code).where(UserItem.user_id == uid)
            )
            owned = {row for (row,) in owned_rows.all()}

    return [
        {**item.__dict__, "is_owned": item.item_code in owned}
        for item in items
    ]


async def get_daily_featured(db: AsyncSession) -> list[DailyFeaturedItem]:
    today = date.today()
    result = await db.execute(
        select(DailyFeaturedItem)
        .options(selectinload(DailyFeaturedItem.item_def))
        .where(DailyFeaturedItem.featured_date == today)
        .order_by(DailyFeaturedItem.sort_order.asc())
    )
    return list(result.scalars().all())


async def purchase(
    db: AsyncSession,
    *,
    user_uuid: str,
    item_code: str,
    currency: str,
    skill_discount_pct: int = 0,
) -> ShopPurchaseResult:
    user = await get_or_create_user(db, user_uuid)

    row = await db.execute(
        text("SELECT purchase_shop_item(:uid, :item, :cur, :disc)"),
        {"uid": user.user_id, "item": item_code, "cur": currency,
         "disc": skill_discount_pct},
    )
    raw = row.scalar_one()
    await db.commit()

    return ShopPurchaseResult(
        item_code=raw["item_code"],
        cost_currency=raw["cost_currency"],
        base_price=raw["base_price"],
        discount_pct=raw["discount_pct"],
        cost_amount=raw["cost_amount"],
        was_featured=raw["was_featured"],
        user_item_id=raw["user_item_id"],
        spend_tx_id=raw["spend_tx_id"],
        purchase_log_id=raw["purchase_log_id"],
    )
