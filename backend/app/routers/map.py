from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import District, FeedPost, MarketplaceListing

router = APIRouter(prefix="/map", tags=["지도 (Map)"])


@router.get("/district-counts")
async def get_district_counts(
    tab: str = Query(..., pattern="^(listings|feed)$"),
    db: AsyncSession = Depends(get_db),
):
    if tab == "listings":
        stmt = (
            select(
                District.id,
                District.center_lat,
                District.center_lng,
                func.count().label("count"),
            )
            .join(MarketplaceListing, MarketplaceListing.district_id == District.id)
            .where(MarketplaceListing.status == "ON_SALE")
            .group_by(District.id, District.center_lat, District.center_lng)
        )
    else:
        stmt = (
            select(
                District.id,
                District.center_lat,
                District.center_lng,
                func.count().label("count"),
            )
            .join(FeedPost, FeedPost.district_id == District.id)
            .where(FeedPost.district_id.isnot(None))
            .group_by(District.id, District.center_lat, District.center_lng)
        )

    rows = (await db.execute(stmt)).all()
    return {
        "counts": [
            {
                "district_id": r.id,
                "lat": r.center_lat,
                "lng": r.center_lng,
                "count": r.count,
            }
            for r in rows
            if r.center_lat is not None and r.center_lng is not None
        ]
    }
