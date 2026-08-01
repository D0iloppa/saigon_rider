from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.schemas import (
    ClaimSeasonRewardRequest, ClaimSeasonRewardResult,
    SeasonLevelRead, SeasonRead, UserSeasonPassRead,
)
from app.services import season as season_svc

router = APIRouter(prefix="/v1/season", tags=["season"])


@router.get("/current", response_model=SeasonRead,
            dependencies=[Depends(verify_service_key)])
async def get_current_season(
    db: AsyncSession = Depends(get_session),
):
    season = await season_svc.get_current(db)
    if season is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active season",
        )
    return season


@router.get("/{user_uuid}/pass", response_model=UserSeasonPassRead,
            dependencies=[Depends(verify_service_key)])
async def get_season_pass(
    user_uuid: str,
    db: AsyncSession = Depends(get_session),
):
    sp = await season_svc.get_user_pass(db, user_uuid)
    if sp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No season pass found",
        )
    return sp


@router.get("/levels/{season_code}", response_model=list[SeasonLevelRead],
            dependencies=[Depends(verify_service_key)])
async def get_season_levels(
    season_code: str,
    user_uuid: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session),
):
    return await season_svc.get_season_levels(db, season_code, user_uuid)


@router.post("/{user_uuid}/claim", response_model=ClaimSeasonRewardResult,
             dependencies=[Depends(verify_service_key)])
async def claim_season_reward(
    user_uuid: str,
    body: ClaimSeasonRewardRequest,
    db: AsyncSession = Depends(get_session),
):
    return await season_svc.claim_reward(db, user_uuid, body.level, body.track)
