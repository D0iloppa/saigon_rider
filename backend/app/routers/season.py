import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import verify_user_session
from ..engine_client import engine_client

router = APIRouter(prefix="/season", tags=["시즌 (Season)"])


class ClaimRewardBody(BaseModel):
    level: int = Field(ge=1)
    track: str = Field(pattern=r"^(FREE|PREMIUM)$")


@router.get("/current")
async def get_current_season(
    _uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    try:
        return await engine_client.get_season_current()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None


@router.get("/pass")
async def get_season_pass(
    uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    try:
        return await engine_client.get_season_pass(str(uid))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None


@router.get("/levels/{season_code}")
async def get_season_levels(
    season_code: str,
    uid: uuid.UUID = Depends(verify_user_session),
) -> list:
    try:
        return await engine_client.get_season_levels(season_code, str(uid))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None


@router.post("/claim")
async def claim_season_reward(
    body: ClaimRewardBody,
    uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    try:
        return await engine_client.claim_season_reward(str(uid), body.level, body.track)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None
