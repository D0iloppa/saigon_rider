"""미션 진행도 갱신 (business-rules §4)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import MissionStatusEnum, TxTypeEnum
from app.models import MissionDefinition, RpTransaction, UserMissionProgress


async def update_progress(
    db: AsyncSession,
    *,
    user_id: int,
    action_code: str,
    occurred_at: datetime,
    payload: Optional[dict],
    event_id: int,
) -> list[RpTransaction]:
    """PROCESSED 이벤트 후 해당 user의 활성 미션 진행도를 갱신하고
    완료된 미션에 대한 보상 적립 트랜잭션 리스트를 반환한다."""
    progresses = (
        await db.execute(
            select(UserMissionProgress)
            .join(MissionDefinition)
            .where(
                UserMissionProgress.user_id == user_id,
                UserMissionProgress.status == MissionStatusEnum.ACTIVE,
                MissionDefinition.is_active.is_(True),
            )
        )
    ).scalars().all()

    reward_txs: list[RpTransaction] = []

    for prog in progresses:
        mission = await db.get(MissionDefinition, prog.mission_id)
        if mission is None:
            continue

        rule = mission.target_rule or {}
        if rule.get("action_code") != action_code:
            continue

        filters = rule.get("filters", {})
        if not _matches_filters(payload, filters):
            continue

        increment = _compute_increment(rule, payload)
        prog.current_value += increment

        if prog.current_value >= prog.target_value:
            prog.status = MissionStatusEnum.COMPLETED
            prog.completed_at = occurred_at

            # 미션 보상 적립 (point_ledger.credit 직접 호출 대신 TX 생성)
            from app.services import point_ledger
            tx = await point_ledger.credit(
                db,
                user_id=user_id,
                amount=mission.reward_rp,
                source_type="MISSION",
                source_id=mission.mission_id,
                related_event_id=event_id,
                memo=f"미션 완료: {mission.title}",
                occurred_at=occurred_at,
            )
            reward_txs.append(tx)

    await db.flush()
    return reward_txs


def _compute_increment(rule: dict, payload: Optional[dict]) -> int:
    agg = rule.get("agg", "count_event")
    if agg == "sum_field" and payload:
        field = rule.get("field", "")
        val = payload.get(field, 0)
        try:
            return int(float(val))
        except (TypeError, ValueError):
            return 0
    return 1


def _matches_filters(payload: Optional[dict], filters: dict) -> bool:
    if not filters or not payload:
        return True
    for key, expected in filters.items():
        if payload.get(key) != expected:
            return False
    return True
