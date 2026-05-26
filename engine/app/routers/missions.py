from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.enums import MissionStatusEnum
from app.models import MissionDefinition, UserMissionProgress
from app.schemas import MissionProgressRead

router = APIRouter(prefix="/v1/users", tags=["missions"])


@router.get("/{user_id}/missions", response_model=list[MissionProgressRead],
            dependencies=[Depends(verify_service_key)])
async def list_missions(
    user_id: int,
    mission_status: MissionStatusEnum = Query(MissionStatusEnum.ACTIVE, alias="status"),
    category: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
) -> list[UserMissionProgress]:
    query = (
        select(UserMissionProgress)
        .join(MissionDefinition)
        .where(
            UserMissionProgress.user_id == user_id,
            UserMissionProgress.status == mission_status,
            MissionDefinition.is_active.is_(True),
        )
    )
    if category:
        query = query.where(MissionDefinition.category_code == category)
    query = query.limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{user_id}/missions/{progress_id}", response_model=MissionProgressRead,
            dependencies=[Depends(verify_service_key)])
async def get_mission_progress(
    user_id: int,
    progress_id: int,
    db: AsyncSession = Depends(get_session),
) -> UserMissionProgress:
    prog = await db.get(UserMissionProgress, progress_id)
    if prog is None or prog.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission progress not found")
    return prog


@router.post("/{user_id}/missions/{progress_id}/abandon", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(verify_service_key)])
async def abandon_mission(
    user_id: int,
    progress_id: int,
    db: AsyncSession = Depends(get_session),
) -> None:
    prog = await db.get(UserMissionProgress, progress_id)
    if prog is None or prog.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission progress not found")
    if prog.status != MissionStatusEnum.ACTIVE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mission is not active")
    prog.status = MissionStatusEnum.CANCELLED
    await db.commit()
