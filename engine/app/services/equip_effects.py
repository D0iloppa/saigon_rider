from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import ItemEffectEnum
from app.models import ItemDefinition, ItemEffectValue, UserEquipment
from app.services.xp_ledger import get_or_create_user


@dataclass
class EquipEffects:
    rp_mult_pct: int = 0
    gold_mult_pct: int = 0
    quest_slot_bonus: int = 0
    cost_discount_pct: int = 0


_FIELD_BY_EFFECT = {
    ItemEffectEnum.RP_MULT: "rp_mult_pct",
    ItemEffectEnum.GOLD_MULT: "gold_mult_pct",
    ItemEffectEnum.QUEST_SLOT: "quest_slot_bonus",
    ItemEffectEnum.COST_DISCOUNT: "cost_discount_pct",
}


async def _resolve_by_user_id(db: AsyncSession, user_id: int) -> EquipEffects:
    """착용 아이템의 효과를 effect_type별로 가산 합산한다."""
    result = await db.execute(
        select(
            ItemDefinition.effect_type,
            func.sum(ItemEffectValue.stat_value),
        )
        .select_from(UserEquipment)
        .join(ItemDefinition, ItemDefinition.item_code == UserEquipment.item_code)
        .join(
            ItemEffectValue,
            and_(
                ItemEffectValue.effect_type == ItemDefinition.effect_type,
                ItemEffectValue.rarity == ItemDefinition.rarity,
            ),
        )
        .where(
            UserEquipment.user_id == user_id,
            UserEquipment.item_code.isnot(None),
        )
        .group_by(ItemDefinition.effect_type)
    )
    effects = EquipEffects()
    for effect_type, total in result.all():
        field = _FIELD_BY_EFFECT.get(effect_type)
        if field:
            setattr(effects, field, int(total or 0))
    return effects


async def resolve_effects(db: AsyncSession, user_uuid: str) -> EquipEffects:
    user = await get_or_create_user(db, user_uuid)
    return await _resolve_by_user_id(db, user.user_id)
