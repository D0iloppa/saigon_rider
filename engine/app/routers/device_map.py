import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
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

    now = datetime.now(timezone.utc)

    # 단말 양도: 신규 device_uuid 가 다른 user 에 묶여 있으면 먼저 해제.
    # (device_uuid 가 PK 라 ON CONFLICT(user_id) 만으로는 PK 충돌을 피할 수 없음.)
    existing_device_user_id = (
        await db.execute(
            select(DeviceUserMap.user_id).where(DeviceUserMap.device_uuid == body.device_uuid)
        )
    ).scalar_one_or_none()
    if existing_device_user_id is not None and existing_device_user_id != sre_user.user_id:
        await db.execute(delete(DeviceUserMap).where(DeviceUserMap.device_uuid == body.device_uuid))
        await db.flush()
        invalidate_device_cache(body.device_uuid)

    # user_id 기준 UPSERT — uq_device_user_map_user_id 제약을 키로 사용.
    # 기존 행이 있으면 device_uuid + logged_in_at 갱신, 없으면 INSERT.
    old_uuid = (
        await db.execute(
            select(DeviceUserMap.device_uuid).where(DeviceUserMap.user_id == sre_user.user_id)
        )
    ).scalar_one_or_none()

    stmt = pg_insert(DeviceUserMap).values(
        device_uuid=body.device_uuid,
        user_id=sre_user.user_id,
        logged_in_at=now,
    ).on_conflict_do_update(
        constraint="uq_device_user_map_user_id",
        set_={"device_uuid": body.device_uuid, "logged_in_at": now},
    )
    await db.execute(stmt)
    await db.commit()

    if old_uuid is not None and old_uuid != body.device_uuid:
        invalidate_device_cache(old_uuid)
    invalidate_device_cache(body.device_uuid)

    log.info("device_map: user_id=%d device_uuid=%s (prev=%s)", sre_user.user_id, body.device_uuid, old_uuid)

    return DeviceMapResponse(
        device_uuid=body.device_uuid,
        user_id=sre_user.user_id,
        logged_in_at=now.isoformat(),
    )
