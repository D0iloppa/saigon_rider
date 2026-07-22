from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import District, RiderType, SafetyGrade, Ward
from ..schemas import DistrictOut, RiderTypeOut, SafetyGradeOut, WardOut
from ..services.service_area import geometry_contract, in_service_area
from ..utils import haversine_m

router = APIRouter(prefix="/master", tags=["마스터 데이터"])


@router.get("/service-area", summary="서비스 Ward geometry 계약")
async def get_service_area():
    return geometry_contract()


@router.get("/wards", response_model=list[WardOut], summary="Ward 목록 (2025 행정 통폐합)")
async def get_wards(
    city: str = Query("HCMC", description="도시 코드 (기본: HCMC)"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ward).where(Ward.is_active == True, Ward.city_code == city.upper()).order_by(Ward.sort_order)
    )
    return result.scalars().all()


@router.get("/wards/resolve", response_model=WardOut | None, summary="좌표 → 가장 가까운 Ward")
async def resolve_ward(
    lat: float = Query(..., description="위도"),
    lng: float = Query(..., description="경도"),
    city: str = Query("HCMC"),
    db: AsyncSession = Depends(get_db),
):
    if city.upper() == "HCMC" and not in_service_area(lat, lng):
        return None
    result = await db.execute(
        select(Ward).where(
            Ward.is_active == True,
            Ward.city_code == city.upper(),
            Ward.center_lat.isnot(None),
            Ward.center_lng.isnot(None),
        )
    )
    wards = result.scalars().all()
    if not wards:
        return None

    return min(wards, key=lambda w: haversine_m(lat, lng, w.center_lat, w.center_lng))


@router.get("/districts", response_model=list[DistrictOut], summary="District 목록 (deprecated — /wards 권장)")
async def get_districts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(District).where(District.is_active == True).order_by(District.sort_order))
    return result.scalars().all()


@router.get("/rider-types", response_model=list[RiderTypeOut], summary="라이더 타입 목록")
async def get_rider_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RiderType).order_by(RiderType.id))
    return result.scalars().all()


@router.get("/safety-grades", response_model=list[SafetyGradeOut], summary="안전등급 목록")
async def get_safety_grades(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SafetyGrade).order_by(SafetyGrade.id))
    return result.scalars().all()
