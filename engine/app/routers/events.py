from fastapi import APIRouter, Depends, HTTPException, status

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.exceptions import DuplicateEventError
from app.models import ActionEvent
from app.schemas import EventCreate, EventRead, EventResult
from app.services import event_bus

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


@router.get("/{event_id}", response_model=EventRead,
            dependencies=[Depends(verify_service_key)])
async def get_event(
    event_id: int,
    db: AsyncSession = Depends(get_session),
) -> ActionEvent:
    event = await db.get(ActionEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event
