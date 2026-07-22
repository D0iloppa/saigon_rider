import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.schemas import (
    DailyFeaturedItemRead,
    ItemDefinitionRead,
    ShopPurchaseRequest,
    ShopPurchaseResult,
)
from app.services import shop as shop_svc
from app.services.operation_idempotency import IdempotencyConflictError

router = APIRouter(prefix="/v1/shop", tags=["shop"])


@router.get("/items", response_model=list[ItemDefinitionRead],
            dependencies=[Depends(verify_service_key)])
async def list_shop_items(
    collection: Optional[str] = Query(None),
    rarity: Optional[str] = Query(None),
    slot: Optional[str] = Query(None),
    group: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user_uuid: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session),
) -> list:
    return await shop_svc.list_shop_items(
        db, collection=collection, rarity=rarity, slot=slot, group=group,
        limit=limit, offset=offset, user_uuid=user_uuid,
    )


@router.get("/daily-featured", response_model=list[DailyFeaturedItemRead],
            dependencies=[Depends(verify_service_key)])
async def get_daily_featured(
    db: AsyncSession = Depends(get_session),
) -> list:
    return await shop_svc.get_daily_featured(db)


@router.post("/purchase", response_model=ShopPurchaseResult,
             status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(verify_service_key)])
async def purchase_item(
    data: ShopPurchaseRequest,
    db: AsyncSession = Depends(get_session),
) -> ShopPurchaseResult:
    try:
        return await shop_svc.purchase(
            db,
            user_uuid=data.user_uuid,
            idempotency_key=data.idempotency_key,
            item_code=data.item_code,
            currency=data.currency,
            skill_discount_pct=data.skill_discount_pct,
        )
    except IdempotencyConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from None
    except Exception as e:
        # asyncpg RaiseError 원문(SQL 전문 포함)을 클라이언트에 노출하지 않도록 RAISE 메시지만 추출
        raw = str(e)
        m = re.search(r"RaiseError'>: ([^\n]+)", raw)
        msg = m.group(1) if m else raw.split("\n")[0]
        low = msg.lower()
        if "insufficient" in low:
            raise HTTPException(status_code=402, detail=msg)
        if "already owned" in low:
            raise HTTPException(status_code=409, detail=msg)
        if "not found" in low or "not available" in low:
            raise HTTPException(status_code=400, detail=msg)
        raise
