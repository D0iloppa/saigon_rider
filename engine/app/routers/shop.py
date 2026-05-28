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

router = APIRouter(prefix="/v1/shop", tags=["shop"])


@router.get("/items", response_model=list[ItemDefinitionRead],
            dependencies=[Depends(verify_service_key)])
async def list_shop_items(
    collection: Optional[str] = Query(None),
    rarity: Optional[str] = Query(None),
    slot: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    user_uuid: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session),
) -> list:
    return await shop_svc.list_shop_items(
        db, collection=collection, rarity=rarity, slot=slot, limit=limit,
        user_uuid=user_uuid,
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
            item_code=data.item_code,
            currency=data.currency,
        )
    except Exception as e:
        msg = str(e)
        if "insufficient" in msg.lower():
            raise HTTPException(status_code=402, detail=msg)
        if "already owned" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        if "not found" in msg.lower() or "not available" in msg.lower():
            raise HTTPException(status_code=400, detail=msg)
        raise
