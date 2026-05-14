import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Badge
from ..schemas import BadgeOut

router = APIRouter(prefix="/badges", tags=["배지 (Badges)"])


# U-2
@router.get("/{badge_id}", response_model=BadgeOut, summary="배지 단건 조회")
async def get_badge(badge_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Badge).where(Badge.id == badge_id))
    badge = result.scalar_one_or_none()
    if badge is None:
        raise HTTPException(status_code=404, detail="Badge not found")
    return BadgeOut.model_validate(badge)
