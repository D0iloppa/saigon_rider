from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.exceptions import DuplicateEventError
from app.models import ActionEvent
from app.schemas import ActionEventRead, EventCreate, EventResult
from app.services import event_bus
from app.services.xp_ledger import get_or_create_user

router = APIRouter(prefix="/v1/events", tags=["events"])


@router.post("", response_model=EventResult, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(verify_service_key)])
async def create_event(
    data: EventCreate,
    db: AsyncSession = Depends(get_session),
) -> EventResult:
    try:
        return await event_bus.process_event(db, data)
    except DuplicateEventError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get("/{user_uuid}", response_model=list[ActionEventRead],
            dependencies=[Depends(verify_service_key)])
async def list_user_action_events(
    user_uuid: str,
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list[ActionEvent]:
    """특정 유저의 행동 이벤트 타임라인 — 최근 N건 시간 역순 (어드민 유저 상세 화면용).

    idx_event_user_occurred(user_id, occurred_at) 인덱스로 커버되므로 기간 미지정 시에도
    limit 만으로 스캔 범위가 제한된다.
    """
    user = await get_or_create_user(db, user_uuid)
    query = select(ActionEvent).where(ActionEvent.user_id == user.user_id)
    if from_dt:
        query = query.where(ActionEvent.occurred_at >= from_dt)
    if to_dt:
        query = query.where(ActionEvent.occurred_at <= to_dt)
    query = query.order_by(ActionEvent.occurred_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()
