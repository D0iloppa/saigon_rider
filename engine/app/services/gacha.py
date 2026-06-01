from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import GachaStatusEnum
from app.models import GachaDefinition, GachaPullLog, UserGachaPity
from app.schemas import GachaEligibility, GachaPullResult, GachaPullResultItem
from app.services.xp_ledger import get_or_create_balance, get_or_create_user


async def list_active(db: AsyncSession) -> list[GachaDefinition]:
    result = await db.execute(
        select(GachaDefinition)
        .where(
            GachaDefinition.status == GachaStatusEnum.ACTIVE,
            GachaDefinition.is_listed.is_(True),
        )
        .order_by(GachaDefinition.sort_order.asc().nulls_last())
    )
    return list(result.scalars().all())


async def get_pity(
    db: AsyncSession, user_uuid: str, gacha_code: str,
) -> UserGachaPity | None:
    user = await get_or_create_user(db, user_uuid)
    result = await db.execute(
        select(UserGachaPity).where(
            UserGachaPity.user_id == user.user_id,
            UserGachaPity.gacha_code == gacha_code,
        )
    )
    return result.scalar_one_or_none()


async def get_pull_log(
    db: AsyncSession,
    user_uuid: str,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[GachaPullLog]:
    user = await get_or_create_user(db, user_uuid)
    result = await db.execute(
        select(GachaPullLog)
        .where(GachaPullLog.user_id == user.user_id)
        .order_by(GachaPullLog.pulled_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def check_eligibility(
    db: AsyncSession, user_uuid: str, gacha_code: str,
) -> GachaEligibility:
    result = await db.execute(
        select(GachaDefinition).where(GachaDefinition.gacha_code == gacha_code)
    )
    gacha = result.scalar_one_or_none()
    if gacha is None or gacha.status != GachaStatusEnum.ACTIVE:
        raise ValueError(f"Gacha '{gacha_code}' not found or not active")

    user = await get_or_create_user(db, user_uuid)
    bal = await get_or_create_balance(db, user.user_id)
    await db.commit()
    await db.refresh(bal)
    gp_balance = bal.current_balance
    gc_balance = bal.gc_balance

    cost_single = gacha.cost_per_pull
    cost_10 = gacha.cost_per_10_pull
    currency = gacha.cost_currency
    available = gp_balance if currency == "GP" else gc_balance

    return GachaEligibility(
        gacha_code=gacha_code,
        can_pull_single=available >= cost_single,
        can_pull_10=available >= cost_10,
        gp_balance=gp_balance,
        gc_balance=gc_balance,
        cost_single=cost_single,
        cost_10=cost_10,
        cost_currency=currency,
    )


async def pull(
    db: AsyncSession,
    *,
    user_uuid: str,
    gacha_code: str,
    is_10_pull: bool = False,
) -> GachaPullResult:
    user = await get_or_create_user(db, user_uuid)
    await get_or_create_balance(db, user.user_id)
    await db.flush()

    row = await db.execute(
        text("SELECT pull_gacha(:uid, :code, :ten)"),
        {"uid": user.user_id, "code": gacha_code, "ten": is_10_pull},
    )
    raw = row.scalar_one()
    await db.commit()

    results = []
    for r in raw["results"]:
        results.append(GachaPullResultItem(
            pull_index=r["pull_index"],
            rarity=r["rarity"],
            item_code=r["item_code"],
            was_pity_hit=r.get("was_pity_hit", False),
            was_guarantee=r.get("was_guarantee", False),
            grant_status=r.get("grant_status", "GRANTED"),
            refund_currency=r.get("refund_currency"),
            refund_amount=r.get("refund_amount"),
        ))

    return GachaPullResult(
        gacha_code=raw["gacha_code"],
        is_10_pull=raw["is_10_pull"],
        batch_id=raw["batch_id"],
        cost_currency=raw["cost_currency"],
        cost_amount=raw["cost_amount"],
        results=results,
        pity_count_after=raw["pity_count_after"],
        total_pulls_after=raw["total_pulls_after"],
    )
