from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.models import RewardCatalog
from app.schemas import CatalogItemRead

router = APIRouter(prefix="/v1/catalog", tags=["rewards"])


@router.get("", response_model=list[CatalogItemRead],
            dependencies=[Depends(verify_service_key)])
async def list_catalog(
    category: Optional[str] = Query(None),
    partner_code: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
) -> list[RewardCatalog]:
    now = datetime.now(timezone.utc)
    query = select(RewardCatalog).where(RewardCatalog.is_active.is_(True))

    # 노출 기간 필터
    query = query.where(
        (RewardCatalog.visible_from.is_(None)) | (RewardCatalog.visible_from <= now),
        (RewardCatalog.visible_until.is_(None)) | (RewardCatalog.visible_until >= now),
    )

    if category:
        query = query.where(RewardCatalog.category_code == category)
    if partner_code:
        from app.models import RewardPartner
        query = query.join(RewardPartner).where(RewardPartner.partner_code == partner_code)

    query = query.order_by(RewardCatalog.required_xp.asc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{catalog_id}", response_model=CatalogItemRead,
            dependencies=[Depends(verify_service_key)])
async def get_catalog_item(
    catalog_id: int,
    db: AsyncSession = Depends(get_session),
) -> RewardCatalog:
    item = await db.get(RewardCatalog, catalog_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog item not found")
    return item
