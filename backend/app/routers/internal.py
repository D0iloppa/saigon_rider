import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_service_key
from ..models import Badge, User, UserBadge

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(verify_service_key)])
log = logging.getLogger(__name__)


class GrantExpRequest(BaseModel):
    user_uuid: str
    amount: int


class GrantGoldRequest(BaseModel):
    user_uuid: str
    amount: int


class GrantBadgeRequest(BaseModel):
    user_uuid: str
    badge_id: str


class GrantResponse(BaseModel):
    ok: bool
    detail: str | None = None


@router.post("/grant-exp", response_model=GrantResponse)
async def grant_exp(body: GrantExpRequest, db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(body.user_uuid)
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.exp += body.amount
    await db.commit()
    log.info("internal grant-exp: user=%s +%d → %d", body.user_uuid, body.amount, user.exp)
    return GrantResponse(ok=True)


@router.post("/grant-gold", response_model=GrantResponse)
async def grant_gold(body: GrantGoldRequest, db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(body.user_uuid)
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.gold += body.amount
    await db.commit()
    log.info("internal grant-gold: user=%s +%d → %d", body.user_uuid, body.amount, user.gold)
    return GrantResponse(ok=True)


@router.post("/grant-badge", response_model=GrantResponse)
async def grant_badge(body: GrantBadgeRequest, db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(body.user_uuid)
    badge_uid = uuid.UUID(body.badge_id)

    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    badge = await db.get(Badge, badge_uid)
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")

    existing = await db.get(UserBadge, (uid, badge_uid))
    if existing:
        return GrantResponse(ok=True, detail="already_owned")

    db.add(UserBadge(user_id=uid, badge_id=badge_uid))
    await db.commit()
    log.info("internal grant-badge: user=%s badge=%s", body.user_uuid, body.badge_id)
    return GrantResponse(ok=True)
