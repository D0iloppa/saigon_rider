from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import User
from ..utils import skill_cost_discount_pct


class ShopPurchaseRequest(BaseModel):
    item_code: str
    currency: str


router = APIRouter(prefix="/shop", tags=["상점 (Shop)"])


@router.get("/items")
async def list_shop_items(
    collection: str | None = Query(None),
    rarity: str | None = Query(None),
    slot: str | None = Query(None),
    group: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    uid: uuid.UUID = Depends(verify_user_session),
) -> list[dict]:
    return await engine_client.get_shop_items(
        collection=collection,
        rarity=rarity,
        slot=slot,
        group=group,
        limit=limit,
        offset=offset,
        user_uuid=str(uid),
    )


@router.get("/daily-featured")
async def get_daily_featured(
    _uid: uuid.UUID = Depends(verify_user_session),
) -> dict | None:
    return await engine_client.get_daily_featured()


_CURRENCY_TO_ENGINE = {"GOLD": "GP", "XP": "GC", "GP": "GP", "GC": "GC"}


@router.post("/purchase")
async def purchase_item(
    payload: ShopPurchaseRequest,
    uid: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
) -> dict:
    engine_currency = _CURRENCY_TO_ENGINE.get(payload.currency, payload.currency)
    user = await db.get(User, uid)
    skill_disc = skill_cost_discount_pct(user)
    try:
        return await engine_client.purchase_shop_item(
            user_uuid=str(uid),
            item_code=payload.item_code,
            currency=engine_currency,
            skill_discount_pct=skill_disc,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None
