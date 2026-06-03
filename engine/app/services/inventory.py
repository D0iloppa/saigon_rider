from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.enums import ItemSlotEnum
from app.exceptions import raise_not_found
from app.models import (
    ItemCollection, ItemDefinition, ItemEffectValue, UserEquipment, UserItem,
)
from app.schemas import CollectionProgressRead
from app.services.xp_ledger import get_or_create_user


async def _effect_value_lookup(db: AsyncSession) -> dict[tuple, int]:
    """(effect_type, rarity) → stat_value 룩업. 정적 20행 테이블."""
    rows = await db.execute(
        select(
            ItemEffectValue.effect_type,
            ItemEffectValue.rarity,
            ItemEffectValue.stat_value,
        )
    )
    return {(et, r): v for et, r, v in rows.all()}


async def get_items(db: AsyncSession, user_uuid: str) -> list[UserItem]:
    user = await get_or_create_user(db, user_uuid)
    result = await db.execute(
        select(UserItem)
        .options(selectinload(UserItem.item_def))
        .where(UserItem.user_id == user.user_id)
        .order_by(UserItem.acquired_at.desc())
    )
    items = list(result.scalars().all())

    lookup = await _effect_value_lookup(db)
    for ui in items:
        defn = ui.item_def
        if defn is not None and defn.effect_type is not None:
            defn.effect_value = lookup.get((defn.effect_type, defn.rarity))

    return items


async def get_equipment(db: AsyncSession, user_uuid: str) -> list[UserEquipment]:
    user = await get_or_create_user(db, user_uuid)
    result = await db.execute(
        select(UserEquipment)
        .options(selectinload(UserEquipment.item_def))
        .where(UserEquipment.user_id == user.user_id)
        .order_by(UserEquipment.slot.asc())
    )
    return list(result.scalars().all())


async def equip_item(
    db: AsyncSession,
    user_uuid: str,
    item_code: str,
) -> UserEquipment:
    user = await get_or_create_user(db, user_uuid)

    ui_result = await db.execute(
        select(UserItem)
        .where(UserItem.user_id == user.user_id, UserItem.item_code == item_code)
    )
    user_item = ui_result.scalar_one_or_none()
    if user_item is None:
        raise_not_found(f"User does not own item: {item_code}")

    item_def = await db.get(ItemDefinition, item_code)
    if item_def is None:
        raise_not_found(f"Item definition not found: {item_code}")

    slot = item_def.slot

    eq_result = await db.execute(
        select(UserEquipment).where(
            UserEquipment.user_id == user.user_id,
            UserEquipment.slot == slot,
        )
    )
    equip = eq_result.scalar_one_or_none()

    if equip is None:
        equip = UserEquipment(
            user_id=user.user_id,
            slot=slot,
            item_code=item_code,
        )
        db.add(equip)
    else:
        equip.item_code = item_code

    await db.commit()
    await db.refresh(equip, ["item_def"])
    return equip


async def get_collection_progress(
    db: AsyncSession, user_uuid: str,
) -> list[CollectionProgressRead]:
    user = await get_or_create_user(db, user_uuid)

    total_subq = (
        select(
            ItemDefinition.collection_code,
            func.count(ItemDefinition.item_code).label("total_items"),
        )
        .group_by(ItemDefinition.collection_code)
        .subquery()
    )

    owned_subq = (
        select(
            ItemDefinition.collection_code,
            func.count(UserItem.item_code).label("owned_items"),
        )
        .join(
            UserItem,
            (UserItem.item_code == ItemDefinition.item_code)
            & (UserItem.user_id == user.user_id),
        )
        .group_by(ItemDefinition.collection_code)
        .subquery()
    )

    result = await db.execute(
        select(
            ItemCollection.collection_code,
            ItemCollection.display_name,
            ItemCollection.theme_color_hex,
            func.coalesce(total_subq.c.total_items, 0).label("total_items"),
            func.coalesce(owned_subq.c.owned_items, 0).label("owned_items"),
        )
        .outerjoin(total_subq, total_subq.c.collection_code == ItemCollection.collection_code)
        .outerjoin(owned_subq, owned_subq.c.collection_code == ItemCollection.collection_code)
        .order_by(ItemCollection.sort_order.asc().nulls_last())
    )

    rows = result.all()
    return [
        CollectionProgressRead(
            collection_code=row.collection_code,
            display_name=row.display_name,
            theme_color_hex=row.theme_color_hex,
            total_items=row.total_items,
            owned_items=row.owned_items,
            progress_pct=round(row.owned_items / row.total_items * 100, 1) if row.total_items > 0 else 0.0,
        )
        for row in rows
    ]


async def unequip_slot(
    db: AsyncSession,
    user_uuid: str,
    slot: ItemSlotEnum,
) -> None:
    user = await get_or_create_user(db, user_uuid)
    result = await db.execute(
        select(UserEquipment).where(
            UserEquipment.user_id == user.user_id,
            UserEquipment.slot == slot,
        )
    )
    equip = result.scalar_one_or_none()
    if equip is None:
        raise_not_found(f"No item equipped in slot: {slot.value}")
    await db.delete(equip)
    await db.commit()
