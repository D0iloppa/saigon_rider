from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import District, RiderType, Ward
from ..schemas import DistrictOut, RiderTypeOut, WardOut

router = APIRouter(prefix="/master", tags=["마스터 데이터"])


@router.get("/wards", response_model=list[WardOut], summary="Ward 목록 (2025 행정 통폐합)")
async def get_wards(
    city: str = Query("HCMC", description="도시 코드 (기본: HCMC)"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ward).where(Ward.is_active == True, Ward.city_code == city.upper()).order_by(Ward.sort_order)
    )
    return result.scalars().all()


@router.get("/districts", response_model=list[DistrictOut], summary="District 목록 (deprecated — /wards 권장)")
async def get_districts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(District).where(District.is_active == True).order_by(District.sort_order))
    return result.scalars().all()


@router.get("/rider-types", response_model=list[RiderTypeOut], summary="라이더 타입 목록")
async def get_rider_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RiderType).order_by(RiderType.id))
    return result.scalars().all()
