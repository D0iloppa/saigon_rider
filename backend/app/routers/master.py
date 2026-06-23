import math

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import District, RiderType, SafetyGrade, Ward
from ..schemas import DistrictOut, RiderTypeOut, SafetyGradeOut, WardOut

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


@router.get("/wards/resolve", response_model=WardOut | None, summary="좌표 → 가장 가까운 Ward")
async def resolve_ward(
    lat: float = Query(..., description="위도"),
    lng: float = Query(..., description="경도"),
    city: str = Query("HCMC"),
    db: AsyncSession = Depends(get_db),
):
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

    def _haversine(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
        R = 6_371_000
        d_lat = math.radians(b_lat - a_lat)
        d_lng = math.radians(b_lng - a_lng)
        a = (
            math.sin(d_lat / 2) ** 2
            + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(d_lng / 2) ** 2
        )
        return 2 * R * math.asin(math.sqrt(a))

    return min(wards, key=lambda w: _haversine(lat, lng, w.center_lat, w.center_lng))


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
