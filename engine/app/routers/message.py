from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.models import SreMessage
from app.schemas import SreMessageRead

router = APIRouter(prefix="/v1/sreMessage", tags=["message"])


@router.get("", response_model=SreMessageRead,
            dependencies=[Depends(verify_service_key)])
async def sre_message(
    uuid: str = Query(...),
    message: str = Query(...),
    _extra: Optional[str] = Query(None, description="JSON string. e.g. {\"key\":\"value\"}"),
    db: AsyncSession = Depends(get_session),
) -> SreMessage:
    import json

    extra_val: dict[str, Any] = {}
    if _extra:
        extra_val = json.loads(_extra)

    row = SreMessage(uuid=uuid, message=message, _extra=extra_val)
    db.add(row)
    await db.flush()
    result = await db.get(SreMessage, row.id)
    await db.commit()
    return result
