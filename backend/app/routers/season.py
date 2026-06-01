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
        season = await engine_client.get_season_current()
        pass_data = await engine_client.get_season_pass(str(uid))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None

    level = pass_data.get("current_level", 0)
    max_lvl = season.get("max_level", 30)
    sxp_per = season.get("sxp_per_level", 100)
    claimed = pass_data.get("claimed_levels", [])

    tier = "ROOKIE"
    if level >= 25:
        tier = "LEGEND"
    elif level >= 15:
        tier = "VETERAN"
    elif level >= 5:
        tier = "EXPLORER"

    reward_levels = [1, 5, 10, 15, 20, 25, 30]
    rewards = []
    for lv in reward_levels:
        if lv > max_lvl:
            break
        rewards.append(
            {
                "level": lv,
                "free_reward": {"type": "GOLD", "label": f"Gold {lv * 50}"},
                "premium_reward": {"type": "ITEM", "label": f"Item Lv.{lv}", "rarity": "R" if lv >= 15 else "E"},
                "is_claimed_free": lv in claimed,
                "is_claimed_premium": lv in claimed,
            }
        )

    return {
        "season": {
            "id": season["season_code"],
            "name": season["display_name"],
            "status": season["status"],
            "ends_at": season["ends_at"],
            "total_levels": max_lvl,
        },
        "current_level": level,
        "current_sxp": pass_data.get("sxp_balance", 0),
        "sxp_to_next": sxp_per,
        "is_premium": pass_data.get("has_premium", False),
        "tier_label": tier,
        "rewards": rewards,
    }


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
