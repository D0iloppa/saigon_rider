import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Badge, UserBadge
from ..schemas import BadgeOut, BadgeWithEarnedOut

router = APIRouter(prefix="/badges", tags=["배지 (Badges)"])


@router.get("", response_model=list[BadgeWithEarnedOut], summary="전체 배지 목록 (획득 여부 포함)")
async def list_badges(
    user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Badge).where(Badge.is_active == True).order_by(Badge.created_at))
    badges = result.scalars().all()

    earned_map: dict[uuid.UUID, UserBadge] = {}
    if user_id:
        ub_result = await db.execute(select(UserBadge).where(UserBadge.user_id == user_id))
        for ub in ub_result.scalars().all():
            earned_map[ub.badge_id] = ub

    return [
        BadgeWithEarnedOut(
            badge=BadgeOut.model_validate(b),
            earned=b.id in earned_map,
            acquired_at=earned_map[b.id].acquired_at if b.id in earned_map else None,
        )
        for b in badges
    ]
