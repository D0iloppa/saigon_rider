from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import District, FeedPost, MarketplaceListing, Ward

router = APIRouter(prefix="/map", tags=["지도 (Map)"])


@router.get("/district-counts")
async def get_district_counts(
    tab: str = Query(..., pattern="^(listings|feed)$"),
    level: str = Query(
        "ward",
        pattern="^(ward|district)$",
        description="listings 탭 집계 단위 — 도시 전체 뷰는 district, 확대 후는 ward",
    ),
    db: AsyncSession = Depends(get_db),
):
    if tab == "listings" and level == "district":
        # 도시 전체 축소 뷰 — ward 단위(30개+)는 뱃지가 서로 겹쳐 도시 전체에서는 district 단위로 집계
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
    elif tab == "listings":
        # 동네지도 폴리곤은 ward(depth1) 단위로 그려지므로 확대 후 뱃지는 ward 기준 집계.
        stmt = (
            select(
                Ward.id,
                Ward.center_lat,
                Ward.center_lng,
                func.count().label("count"),
            )
            .join(MarketplaceListing, MarketplaceListing.ward_id == Ward.id)
            .where(MarketplaceListing.status == "ON_SALE")
            .group_by(Ward.id, Ward.center_lat, Ward.center_lng)
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
    # region_id: tab=listings는 Ward.id, tab=feed는 District.id — 집계 단위가 탭마다 다르므로
    # 특정 테이블을 암시하는 이름(district_id)을 쓰지 않는다. 프론트는 lat/lng/count만 사용.
    return {
        "counts": [
            {
                "region_id": r.id,
                "lat": r.center_lat,
                "lng": r.center_lng,
                "count": r.count,
            }
            for r in rows
            if r.center_lat is not None and r.center_lng is not None
        ]
    }
