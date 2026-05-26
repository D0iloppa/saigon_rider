import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_session, verify_service_key
from app.models import DeviceUserMap, SreUser
from app.services.mileage import invalidate_device_cache

router = APIRouter(prefix="/v1/device-map", tags=["device-map"])
log = logging.getLogger(__name__)


class DeviceMapRequest(BaseModel):
    device_uuid: str
    external_user_uuid: str


class DeviceMapResponse(BaseModel):
    device_uuid: str
    user_id: int
    logged_in_at: str


@router.post("", dependencies=[Depends(verify_service_key)], response_model=DeviceMapResponse)
async def upsert_device_map(
    body: DeviceMapRequest,
    db: AsyncSession = Depends(get_session),
) -> DeviceMapResponse:
    result = await db.execute(
        select(SreUser).where(SreUser.external_user_uuid == body.external_user_uuid)
    )
    sre_user = result.scalar_one_or_none()

    if sre_user is None:
        sre_user = SreUser(external_user_uuid=body.external_user_uuid)
        db.add(sre_user)
        await db.flush()
        log.info("Auto-created sre_user for %s → user_id=%d", body.external_user_uuid, sre_user.user_id)

    existing = await db.get(DeviceUserMap, body.device_uuid)
    now = datetime.now(timezone.utc)

    if existing is None:
        mapping = DeviceUserMap(
            device_uuid=body.device_uuid,
            user_id=sre_user.user_id,
            logged_in_at=now,
        )
        db.add(mapping)
    else:
        existing.user_id = sre_user.user_id
        existing.logged_in_at = now

    await db.commit()
    invalidate_device_cache(body.device_uuid)

    log.info("device_map: %s → user_id=%d", body.device_uuid, sre_user.user_id)

    return DeviceMapResponse(
        device_uuid=body.device_uuid,
        user_id=sre_user.user_id,
        logged_in_at=now.isoformat(),
    )
