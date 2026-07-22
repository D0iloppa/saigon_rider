import logging
from decimal import Decimal

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import AsyncSessionLocal
from app.models import DeviceUserMap, SreUser, UserMileageLog

log = logging.getLogger(__name__)

async def resolve_user_id(device_uuid: str) -> int | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DeviceUserMap.user_id).where(DeviceUserMap.device_uuid == device_uuid)
        )
        row = result.scalar_one_or_none()

    return row


def invalidate_device_cache(device_uuid: str) -> None:
    # 매 이벤트가 DB mapping을 조회하므로 프로세스 간 stale cache가 존재하지 않는다.
    return None


def _apply_event_time_policy(distance_m: float, previous_at: datetime | None, measured_at: datetime) -> tuple[bool, float]:
    """역순은 진행도 미반영, 정상 순서는 측정시각 간 속도 범위로 거리 판정."""
    ordered = previous_at is None or measured_at > previous_at
    accepted_distance = distance_m if ordered and distance_m > 0 else 0.0
    if accepted_distance > 0 and previous_at is not None:
        speed_ms = accepted_distance / (measured_at - previous_at).total_seconds()
        if speed_ms < 3 * 1000 / 3600 or speed_ms > 150 * 1000 / 3600:
            accepted_distance = 0.0
    return ordered, accepted_distance


async def process_gps_event(
    *, msg_id: str, device_uuid: str, latitude: float, longitude: float,
    distance_m: float, measured_at: datetime,
) -> tuple[int | None, int | None, list[int], bool]:
    """GPS 이벤트 하나를 mileage와 모든 quest에 정확히 한 번 원자 반영한다."""
    async with AsyncSessionLocal() as db:
        user_id = (
            await db.execute(
                select(DeviceUserMap.user_id)
                .where(DeviceUserMap.device_uuid == device_uuid)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if user_id is None:
            return None, None, [], False

        previous_at = (
            await db.execute(
                select(func.max(UserMileageLog.recorded_at)).where(UserMileageLog.device_uuid == device_uuid)
            )
        ).scalar_one_or_none()
        ordered, accepted_distance = _apply_event_time_policy(distance_m, previous_at, measured_at)

        ins = (
            pg_insert(UserMileageLog)
            .values(
                user_id=user_id,
                distance_m=Decimal(str(accepted_distance)),
                device_uuid=device_uuid,
                msg_id=msg_id,
                recorded_at=measured_at,
            )
            .on_conflict_do_nothing(index_elements=["msg_id"])
        )
        if (await db.execute(ins)).rowcount == 0:
            return user_id, None, [], True

        new_total: int | None = None
        if accepted_distance > 0:
            new_total = (
                await db.execute(
                    update(SreUser)
                    .where(SreUser.user_id == user_id)
                    .values(total_distance_m=SreUser.total_distance_m + int(accepted_distance))
                    .returning(SreUser.total_distance_m)
                )
            ).scalar_one()

        completed: list[int] = []
        if ordered:
            from app.services.quest_tracker import dispatch_in_session
            from app.services.quest_validators import GpsSignal

            completed = await dispatch_in_session(
                db,
                user_id,
                GpsSignal(
                    lat=latitude,
                    lng=longitude,
                    distance_m=accepted_distance,
                    measured_at=measured_at,
                ),
            )
        await db.commit()

    if accepted_distance > 0:
        try:
            from app.services.policy_engine import evaluate_policies
            await evaluate_policies(user_id)
        except Exception:
            log.exception("policy evaluation failed for user_id=%d", user_id)
    return user_id, new_total, completed, False


async def update_mileage(
    user_id: int,
    distance_m: float,
    device_uuid: str | None = None,
    msg_id: str | None = None,
) -> int:
    """마일리지 누적. 갱신된 total_distance_m을 반환.

    msg_id(스트림 메시지 id)가 주어지면 멱등 — 같은 메시지의 재전달(워커 재클레임,
    xack 실패 등 at-least-once 창)에서는 로그도 총계도 다시 적립하지 않는다. (sre055)
    """
    if distance_m <= 0:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SreUser.total_distance_m).where(SreUser.user_id == user_id)
            )
            return result.scalar_one_or_none() or 0

    async with AsyncSessionLocal() as db:
        if msg_id:
            ins = (
                pg_insert(UserMileageLog)
                .values(
                    user_id=user_id,
                    distance_m=Decimal(str(distance_m)),
                    device_uuid=device_uuid,
                    msg_id=msg_id,
                )
                .on_conflict_do_nothing(index_elements=["msg_id"])
            )
            inserted = (await db.execute(ins)).rowcount
            if inserted == 0:
                # 이미 처리된 메시지 — 총계 갱신 없이 현재값만 반환
                log.info("mileage: duplicate msg %s for user_id=%d — skipped", msg_id, user_id)
                result = await db.execute(
                    select(SreUser.total_distance_m).where(SreUser.user_id == user_id)
                )
                return result.scalar_one_or_none() or 0
        else:
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
