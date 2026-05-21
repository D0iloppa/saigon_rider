from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.enums import SeasonStatusEnum
from app.models import Season, UserSeasonPass
from app.schemas import ClaimSeasonRewardResult, SeasonLevelRead
from app.services.xp_ledger import get_or_create_user


async def get_current(db: AsyncSession) -> Season | None:
    result = await db.execute(
        select(Season)
        .where(Season.status == SeasonStatusEnum.ACTIVE)
        .order_by(Season.starts_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_user_pass(
    db: AsyncSession, user_uuid: str, season_code: str | None = None,
) -> UserSeasonPass | None:
    user = await get_or_create_user(db, user_uuid)

    if season_code is None:
        current = await get_current(db)
        if current is None:
            return None
        season_code = current.season_code

    result = await db.execute(
        select(UserSeasonPass)
        .options(selectinload(UserSeasonPass.season))
        .where(
            UserSeasonPass.user_id == user.user_id,
            UserSeasonPass.season_code == season_code,
        )
    )
    return result.scalar_one_or_none()


async def get_season_levels(
    db: AsyncSession,
    season_code: str,
    user_uuid: str | None = None,
) -> list[SeasonLevelRead]:
    season_result = await db.execute(
        select(Season).where(Season.season_code == season_code)
    )
    season = season_result.scalar_one_or_none()
    if season is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")

    user_level = 0
    claimed: list[int] = []
    if user_uuid:
        user = await get_or_create_user(db, user_uuid)
        sp_result = await db.execute(
            select(UserSeasonPass).where(
                UserSeasonPass.user_id == user.user_id,
                UserSeasonPass.season_code == season_code,
            )
        )
        sp = sp_result.scalar_one_or_none()
        if sp:
            user_level = sp.current_level
            claimed = list(sp.claimed_levels or [])

    levels = []
    for lvl in range(1, season.max_level + 1):
        levels.append(SeasonLevelRead(
            season_code=season_code,
            level=lvl,
            sxp_threshold=lvl * season.sxp_per_level,
            is_locked=lvl > user_level,
            is_claimed=lvl in claimed,
        ))
    return levels


async def claim_reward(
    db: AsyncSession,
    user_uuid: str,
    level: int,
    track: str,
) -> ClaimSeasonRewardResult:
    user = await get_or_create_user(db, user_uuid)

    current_season = await get_current(db)
    if current_season is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active season")

    sp_result = await db.execute(
        select(UserSeasonPass).where(
            UserSeasonPass.user_id == user.user_id,
            UserSeasonPass.season_code == current_season.season_code,
        )
    )
    sp = sp_result.scalar_one_or_none()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No season pass found")

    if level > sp.current_level:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Level locked: current={sp.current_level}, required={level}",
        )
    if track == "PREMIUM" and not sp.has_premium:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Premium pass not owned")

    claimed = list(sp.claimed_levels or [])
    if level in claimed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reward already claimed")

    sp.claimed_levels = claimed + [level]
    await db.commit()

    return ClaimSeasonRewardResult(
        ok=True,
        season_code=current_season.season_code,
        level=level,
        track=track,
        claimed_levels=sp.claimed_levels,
    )
