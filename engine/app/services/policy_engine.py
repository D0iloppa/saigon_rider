import logging
import operator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.enums import RewardActionTypeEnum
from app.models import RewardPolicy, RewardPolicyAction, SreUser, UserPolicyLog
from app.services import xp_ledger

log = logging.getLogger(__name__)

_OPS = {
    ">=": operator.ge,
    ">": operator.gt,
    "==": operator.eq,
    "<=": operator.le,
    "<": operator.lt,
}


def _resolve_metric(user: SreUser, metric: str):
    if metric == "total_distance_m":
        return user.total_distance_m
    if metric == "total_exp_granted":
        return user.total_exp_granted
    if metric == "level":
        return (user.total_exp_granted or 0) // settings.sre_exp_per_level
    return None


def _check_conditions(conditions: list[dict], user: SreUser) -> bool:
    for cond in conditions:
        metric = cond.get("metric")
        op_str = cond.get("op")
        target = cond.get("value")
        actual = _resolve_metric(user, metric)
        if actual is None:
            return False

        if op_str == "in":
            if actual not in target:
                return False
        else:
            fn = _OPS.get(op_str)
            if fn is None:
                return False
            if not fn(actual, target):
                return False
    return True


async def _already_rewarded(
    db: AsyncSession,
    user_id: int,
    policy: RewardPolicy,
    user: SreUser,
) -> bool:
    stmt = (
        select(UserPolicyLog)
        .where(UserPolicyLog.user_id == user_id, UserPolicyLog.policy_id == policy.id)
        .order_by(UserPolicyLog.rewarded_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    last_log = result.scalar_one_or_none()
    if last_log is None:
        return False

    if not policy.is_repeatable:
        return True

    if policy.repeat_metric and policy.repeat_metric_interval:
        last_value = (last_log.trigger_snapshot or {}).get(policy.repeat_metric, 0)
        current_value = _resolve_metric(user, policy.repeat_metric)
        if current_value is None:
            return True
        return (current_value - last_value) < policy.repeat_metric_interval

    if policy.repeat_interval is not None:
        elapsed = (datetime.now(timezone.utc) - last_log.rewarded_at).total_seconds()
        if elapsed < policy.repeat_interval:
            return True

    return False


def _build_snapshot(user: SreUser) -> dict:
    return {
        "total_distance_m": user.total_distance_m,
        "total_exp_granted": user.total_exp_granted or 0,
        "level": (user.total_exp_granted or 0) // settings.sre_exp_per_level,
    }


async def _dispatch_action(
    db: AsyncSession,
    user: SreUser,
    action: RewardPolicyAction,
    policy_id: int,
) -> None:
    if action.action_type == RewardActionTypeEnum.GRANT_XP:
        await xp_ledger.credit(
            db,
            user_id=user.user_id,
            amount=action.value,
            source_type="POLICY",
            source_id=policy_id,
            memo=f"policy#{policy_id}",
        )
        return

    from app.bff_client import bff_client

    ext_uuid = user.external_user_uuid
    if action.action_type == RewardActionTypeEnum.GRANT_EXP:
        await bff_client.grant_exp(ext_uuid, action.value)
        user.total_exp_granted = (user.total_exp_granted or 0) + action.value
        await db.flush()
    elif action.action_type == RewardActionTypeEnum.GRANT_GOLD:
        await bff_client.grant_gold(ext_uuid, action.value)
    elif action.action_type == RewardActionTypeEnum.GRANT_BADGE:
        await bff_client.grant_badge(ext_uuid, action.ref_id)


async def evaluate_policies(user_id: int) -> list[int]:
    """활성 정책을 평가하고 조건 충족 시 보상 실행. 발동된 policy_id 목록 반환."""
    triggered: list[int] = []

    async with AsyncSessionLocal() as db:
        user = await db.get(SreUser, user_id)
        if user is None:
            return triggered

        policies_result = await db.execute(
            select(RewardPolicy)
            .where(RewardPolicy.is_active.is_(True))
            .order_by(RewardPolicy.priority.desc())
        )
        policies = policies_result.scalars().all()

        for policy in policies:
            if not _check_conditions(policy.conditions, user):
                continue
            if await _already_rewarded(db, user_id, policy, user):
                continue

            actions_result = await db.execute(
                select(RewardPolicyAction)
                .where(RewardPolicyAction.policy_id == policy.id)
                .order_by(RewardPolicyAction.sort_order)
            )
            actions = actions_result.scalars().all()

            for action in actions:
                try:
                    await _dispatch_action(db, user, action, policy.id)
                except Exception:
                    log.exception("policy#%d action#%d dispatch failed", policy.id, action.id)

            db.add(UserPolicyLog(
                user_id=user_id,
                policy_id=policy.id,
                trigger_snapshot=_build_snapshot(user),
            ))
            triggered.append(policy.id)

        await db.commit()

    if triggered:
        log.info("policy evaluated: user_id=%d triggered=%s", user_id, triggered)
    return triggered
