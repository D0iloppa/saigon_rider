import re

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.schemas import (
    GachaDefinitionRead,
    GachaEligibility,
    GachaPityRead,
    GachaPullLogRead,
    GachaPullRequest,
    GachaPullResult,
)
from app.services import gacha as gacha_svc

router = APIRouter(prefix="/v1/gacha", tags=["gacha"])


@router.get("/list", response_model=list[GachaDefinitionRead],
            dependencies=[Depends(verify_service_key)])
async def list_gacha(
    db: AsyncSession = Depends(get_session),
) -> list:
    return await gacha_svc.list_active(db)


@router.get("/pity/{gacha_code}", response_model=GachaPityRead,
            dependencies=[Depends(verify_service_key)])
async def get_pity(
    gacha_code: str,
    user_uuid: str,
    db: AsyncSession = Depends(get_session),
) -> GachaPityRead:
    pity = await gacha_svc.get_pity(db, user_uuid, gacha_code)
    if pity is None:
        return GachaPityRead(gacha_code=gacha_code, pity_count=0, total_pulls=0)
    return pity


@router.get("/log/{user_uuid}", response_model=list[GachaPullLogRead],
            dependencies=[Depends(verify_service_key)])
async def get_pull_log(
    user_uuid: str,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
) -> list:
    return await gacha_svc.get_pull_log(db, user_uuid, limit=limit, offset=offset)


@router.get("/eligibility/{gacha_code}", response_model=GachaEligibility,
            dependencies=[Depends(verify_service_key)])
async def check_gacha_eligibility(
    gacha_code: str,
    user_uuid: str,
    db: AsyncSession = Depends(get_session),
) -> GachaEligibility:
    try:
        return await gacha_svc.check_eligibility(db, user_uuid, gacha_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/pull", response_model=GachaPullResult,
             status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(verify_service_key)])
async def pull_gacha(
    data: GachaPullRequest,
    db: AsyncSession = Depends(get_session),
) -> GachaPullResult:
    try:
        return await gacha_svc.pull(
            db,
            user_uuid=data.user_uuid,
            gacha_code=data.gacha_code,
            is_10_pull=data.is_10_pull,
            skill_discount_pct=data.skill_discount_pct,
        )
    except Exception as e:
        msg = str(e)
        if "insufficient" in msg.lower():
            match = re.search(r'insufficient \w+ balance: have \d+, need \d+', msg, re.IGNORECASE)
            detail = match.group(0) if match else "Insufficient balance"
            raise HTTPException(status_code=402, detail=detail)
        if "not found" in msg.lower() or "not active" in msg.lower():
            raise HTTPException(status_code=400, detail=msg)
        raise
