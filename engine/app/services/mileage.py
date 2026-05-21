import logging
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import DeviceUserMap, SreUser, UserMileageLog

log = logging.getLogger(__name__)

_device_cache: dict[str, int] = {}


async def resolve_user_id(device_uuid: str) -> int | None:
    cached = _device_cache.get(device_uuid)
    if cached is not None:
        return cached

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DeviceUserMap.user_id).where(DeviceUserMap.device_uuid == device_uuid)
        )
        row = result.scalar_one_or_none()

    if row is not None:
        _device_cache[device_uuid] = row
    return row


def invalidate_device_cache(device_uuid: str) -> None:
    _device_cache.pop(device_uuid, None)


async def update_mileage(
    user_id: int,
    distance_m: float,
    device_uuid: str | None = None,
) -> int:
    """마일리지 누적. 갱신된 total_distance_m을 반환."""
    if distance_m <= 0:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SreUser.total_distance_m).where(SreUser.user_id == user_id)
            )
            return result.scalar_one_or_none() or 0

    async with AsyncSessionLocal() as db:
        db.add(UserMileageLog(
            user_id=user_id,
            distance_m=Decimal(str(distance_m)),
            device_uuid=device_uuid,
        ))

        result = await db.execute(
            update(SreUser)
            .where(SreUser.user_id == user_id)
            .values(total_distance_m=SreUser.total_distance_m + int(distance_m))
            .returning(SreUser.total_distance_m)
        )
        new_total = result.scalar_one()
        await db.commit()

    log.info("mileage: user_id=%d +%dm = %dm", user_id, int(distance_m), new_total)

    try:
        from app.services.policy_engine import evaluate_policies
        await evaluate_policies(user_id)
    except Exception:
        log.exception("policy evaluation failed for user_id=%d", user_id)

    return new_total
