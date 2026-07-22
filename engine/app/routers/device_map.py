import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_session, verify_service_key
from app.models import DeviceUserMap, SreUser
from app.services.mileage import invalidate_device_cache

router = APIRouter(prefix="/v1/device-map", tags=["device-map"])
push_router = APIRouter(prefix="/v1/push", tags=["push"])
log = logging.getLogger(__name__)


class DeviceMapRequest(BaseModel):
    device_uuid: str
    external_user_uuid: str
    fcm_token: str | None = None


class DeviceMapResponse(BaseModel):
    device_uuid: str
    user_id: int
    logged_in_at: str


class DeviceMapDetailResponse(BaseModel):
    device_uuid: str | None = None
    fcm_token: str | None = None
    logged_in_at: str | None = None


class DeviceMapDeleteRequest(BaseModel):
    device_uuid: str
    external_user_uuid: str


class DeviceMapDeleteResponse(BaseModel):
    removed: bool


class PushNotifyRequest(BaseModel):
    external_user_uuid: str
    title: str
    body: str
    data: dict[str, str] | None = None


class PushNotifyResponse(BaseModel):
    sent: int
    failed: int


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
    cache_keys_to_invalidate: set[str] = set()

    # FCM 토큰은 한 사용자에게만 귀속한다. 다른 소유자의 토큰을 비운 뒤 아래
    # device-map UPSERT와 함께 commit하여 계정 전환 중 중복 푸시를 막는다.
    if body.fcm_token:
        previous_token_devices = (
            await db.execute(
                select(DeviceUserMap.device_uuid).where(
                    DeviceUserMap.fcm_token == body.fcm_token,
                    DeviceUserMap.user_id != sre_user.user_id,
                )
            )
        ).scalars().all()
        if previous_token_devices:
            await db.execute(
                update(DeviceUserMap)
                .where(
                    DeviceUserMap.fcm_token == body.fcm_token,
                    DeviceUserMap.user_id != sre_user.user_id,
                )
                .values(fcm_token=None)
            )
            cache_keys_to_invalidate.update(previous_token_devices)

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
        cache_keys_to_invalidate.add(body.device_uuid)

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
        fcm_token=body.fcm_token,
        logged_in_at=now,
    ).on_conflict_do_update(
        constraint="uq_device_user_map_user_id",
        set_={"device_uuid": body.device_uuid, "fcm_token": body.fcm_token, "logged_in_at": now},
    )
    await db.execute(stmt)
    await db.commit()

    if old_uuid is not None and old_uuid != body.device_uuid:
        cache_keys_to_invalidate.add(old_uuid)
    cache_keys_to_invalidate.add(body.device_uuid)
    for device_uuid in cache_keys_to_invalidate:
        invalidate_device_cache(device_uuid)

    try:
        from app.services.fcm_push import reset_badge
        await reset_badge(sre_user.user_id)
    except Exception:
        log.debug("badge reset skipped for user_id=%d", sre_user.user_id)

    log.info("device_map: user_id=%d device_uuid=%s (prev=%s)", sre_user.user_id, body.device_uuid, old_uuid)

    return DeviceMapResponse(
        device_uuid=body.device_uuid,
        user_id=sre_user.user_id,
        logged_in_at=now.isoformat(),
    )


@router.delete("", dependencies=[Depends(verify_service_key)], response_model=DeviceMapDeleteResponse)
async def delete_device_map(
    body: DeviceMapDeleteRequest,
    db: AsyncSession = Depends(get_session),
) -> DeviceMapDeleteResponse:
    """단말과 외부 사용자 소유권이 모두 일치할 때만 매핑을 해제한다."""
    user_id = select(SreUser.user_id).where(SreUser.external_user_uuid == body.external_user_uuid).scalar_subquery()
    result = await db.execute(
        delete(DeviceUserMap).where(
            DeviceUserMap.device_uuid == body.device_uuid,
            DeviceUserMap.user_id == user_id,
        )
    )
    removed = bool(result.rowcount)
    if removed:
        await db.commit()
        invalidate_device_cache(body.device_uuid)
    return DeviceMapDeleteResponse(removed=removed)


@router.get("/lookup", dependencies=[Depends(verify_service_key)], response_model=DeviceMapDetailResponse)
async def lookup_device_map(
    external_user_uuid: str = Query(...),
    db: AsyncSession = Depends(get_session),
) -> DeviceMapDetailResponse:
    row = (
        await db.execute(
            select(DeviceUserMap)
            .join(SreUser, SreUser.user_id == DeviceUserMap.user_id)
            .where(SreUser.external_user_uuid == external_user_uuid)
        )
    ).scalar_one_or_none()

    if row is None:
        return DeviceMapDetailResponse()

    return DeviceMapDetailResponse(
        device_uuid=row.device_uuid,
        fcm_token=row.fcm_token,
        logged_in_at=row.logged_in_at.isoformat() if row.logged_in_at else None,
    )


@push_router.post("/notify", dependencies=[Depends(verify_service_key)], response_model=PushNotifyResponse)
async def notify_user(
    body: PushNotifyRequest,
    db: AsyncSession = Depends(get_session),
) -> PushNotifyResponse:
    """외부 UUID 기준 단건 푸시 (DM 등). 토큰 없으면 무발송(에러 아님). 이력 미적재."""
    from app.services.fcm_push import RetryablePushError, send_push

    row = (
        await db.execute(
            select(DeviceUserMap.user_id, DeviceUserMap.fcm_token)
            .join(SreUser, SreUser.user_id == DeviceUserMap.user_id)
            .where(SreUser.external_user_uuid == body.external_user_uuid)
            .where(DeviceUserMap.fcm_token.isnot(None))
            .where(DeviceUserMap.fcm_token != "")
        )
    ).first()

    if row is None:
        return PushNotifyResponse(sent=0, failed=0)

    try:
        result = await send_push(
            title=body.title, body=body.body, mode="individual",
            targets=[{"user_id": row.user_id, "fcm_token": row.fcm_token}],
            data=body.data, sender="dm", log_history=False,
        )
    except RetryablePushError as exc:
        raise HTTPException(status_code=503, detail="Push provider temporarily unavailable") from exc
    if result.invalid_tokens:
        await db.execute(
            update(DeviceUserMap).where(DeviceUserMap.fcm_token.in_(result.invalid_tokens)).values(fcm_token=None)
        )
        await db.commit()
    return PushNotifyResponse(sent=result.sent, failed=result.failed)
