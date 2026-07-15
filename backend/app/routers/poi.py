from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Poi
from ..schemas import POIMapItemOut
from ..utils import build_imgproxy_url

router = APIRouter(prefix="/poi", tags=["POI"])


@router.get("/public/map", response_model=list[POIMapItemOut], summary="POI 지도 공개 조회 (bbox)")
async def get_public_map(
    min_lat: Decimal,
    max_lat: Decimal,
    min_lng: Decimal,
    max_lng: Decimal,
    category: str | None = None,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """지형·랜드마크/행정·생활 POI 핀 레이어 — published + 좌표 보유 항목만 bbox 범위로 노출."""
    stmt = select(Poi).where(
        Poi.published == True,
        Poi.latitude.is_not(None),
        Poi.longitude.is_not(None),
        Poi.latitude >= min_lat,
        Poi.latitude <= max_lat,
        Poi.longitude >= min_lng,
        Poi.longitude <= max_lng,
    )
    if category:
        stmt = stmt.where(Poi.category == category)
    if q:
        stmt = stmt.where(
            or_(
                Poi.name_ko.ilike(f"%{q}%"),
                Poi.name_vi.ilike(f"%{q}%"),
                Poi.name_en.ilike(f"%{q}%"),
            )
        )
    rows = (await db.execute(stmt.limit(200))).scalars().all()

    return [
        POIMapItemOut(
            id=p.id,
            category=p.category,
            name_ko=p.name_ko,
            name_vi=p.name_vi,
            name_en=p.name_en,
            address=p.address,
            lat=p.latitude,
            lng=p.longitude,
            photo_url=build_imgproxy_url(p.photo_content.file_path) if p.photo_content else None,
        )
        for p in rows
    ]
