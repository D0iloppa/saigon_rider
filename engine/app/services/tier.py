"""등급 평가 (business-rules §5)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TierDefinition, UserTier


async def evaluate(db: AsyncSession, *, user_id: int, lifetime_earned: int) -> None:
    """lifetime_earned 기준으로 tier를 재평가하고 변경 시 user_tier 갱신."""
    tiers = (
        await db.execute(
            select(TierDefinition).order_by(TierDefinition.sort_order.desc())
        )
    ).scalars().all()

    # lifetime distinct categories (§5.2): 간이 구현 — diversity_score에서 모든 월 합산
    # 정확한 lifetime count는 behavior_category_log distinct 쿼리로 가능하지만
    # 성능상 user_diversity_score의 최대 active_category_count를 사용
    from sqlalchemy import func
    from app.models import BehaviorCategoryLog

    dist_result = await db.execute(
        select(func.count(func.distinct(BehaviorCategoryLog.category_code))).where(
            BehaviorCategoryLog.user_id == user_id
        )
    )
    lifetime_categories = dist_result.scalar_one() or 0

    new_tier_code = tiers[-1].tier_code  # 최하위 등급 기본값
    for tier in tiers:
        if (lifetime_earned >= tier.min_lifetime_rp and
                lifetime_categories >= tier.min_diversity_count):
            new_tier_code = tier.tier_code
            break

    user_tier = await db.get(UserTier, user_id)
    if user_tier is None:
        user_tier = UserTier(user_id=user_id, current_tier_code=new_tier_code)
        db.add(user_tier)
    elif user_tier.current_tier_code != new_tier_code:
        user_tier.current_tier_code = new_tier_code
        user_tier.achieved_at = datetime.now(timezone.utc)

    await db.flush()
