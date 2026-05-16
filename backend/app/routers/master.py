from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import District, RiderType, SafetyGrade
from ..schemas import DistrictOut, RiderTypeOut, SafetyGradeOut

router = APIRouter(prefix="/master", tags=["마스터 데이터"])


@router.get("/districts", response_model=list[DistrictOut], summary="District 목록")
async def get_districts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(District).where(District.is_active == True).order_by(District.sort_order)
    )
    return result.scalars().all()


@router.get("/rider-types", response_model=list[RiderTypeOut], summary="라이더 타입 목록")
async def get_rider_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RiderType).order_by(RiderType.id))
    return result.scalars().all()


@router.get("/safety-grades", response_model=list[SafetyGradeOut], summary="안전등급 목록")
async def get_safety_grades(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SafetyGrade).order_by(SafetyGrade.id))
    return result.scalars().all()
