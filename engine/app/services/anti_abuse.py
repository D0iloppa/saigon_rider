"""어뷰징 룰 평가.

룰 평가 순서 (business-rules §1.4):
  1. REJECT 룰 (GPS_SPEED_RANGE, DUPLICATE_RECEIPT)
  2. REDUCE 룰 (NEW_ACCOUNT_50)
  3. CAP 룰 (DAILY_RP_CAP)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import AbuseActionEnum
from app.models import AbuseEvent, AbuseRule, ActionEvent, SreUser


@dataclass
class AbuseResult:
    rejected: bool
    reject_reason_code: Optional[str]
    penalty_multiplier: float  # 1.0 = 페널티 없음, 0.5 = 50% 적립, 0.0 = RP 0


async def evaluate(
    db: AsyncSession,
    *,
    user: SreUser,
    action_code: str,
    occurred_at: datetime,
    payload: Optional[dict],
    daily_rp_so_far: int,
    daily_cap: int,
) -> AbuseResult:
    rules = (
        await db.execute(
            select(AbuseRule).where(AbuseRule.is_active.is_(True))
        )
    ).scalars().all()

    penalty = 1.0
    reject_reason: Optional[str] = None

    for rule in rules:
        cond = rule.condition_json or {}

        # ── REJECT 룰 ─────────────────────────────────────────
        if rule.action == AbuseActionEnum.REJECT:
            if rule.rule_code == "GPS_SPEED_RANGE" and payload:
                speed = payload.get("speed_kmh")
                if speed is not None:
                    min_k = cond.get("min_kmh", 5)
                    max_k = cond.get("max_kmh", 80)
                    if not (min_k <= speed <= max_k):
                        return AbuseResult(rejected=True, reject_reason_code="GPS_SPEED_OUT_OF_RANGE", penalty_multiplier=0.0)

            if rule.rule_code == "DUPLICATE_RECEIPT" and payload:
                receipt_hash = payload.get("receipt_hash")
                if receipt_hash:
                    window_days = cond.get("hash_window_days", 30)
                    since = occurred_at - timedelta(days=window_days)
                    dup = await db.execute(
                        select(ActionEvent.event_id).where(
                            ActionEvent.user_id == user.user_id,
                            ActionEvent.action_code == action_code,
                            ActionEvent.occurred_at >= since,
                            ActionEvent.payload["receipt_hash"].as_string() == receipt_hash,
                        ).limit(1)
                    )
                    if dup.scalar_one_or_none() is not None:
                        return AbuseResult(rejected=True, reject_reason_code="DUPLICATE_RECEIPT", penalty_multiplier=0.0)

        # ── REDUCE 룰 ─────────────────────────────────────────
        if rule.action == AbuseActionEnum.REDUCE:
            if rule.rule_code == "NEW_ACCOUNT_50":
                within_days = cond.get("within_days", 3)
                multiplier = cond.get("multiplier", 0.5)
                cutoff = user.created_at + timedelta(days=within_days)
                if occurred_at.replace(tzinfo=timezone.utc) < cutoff.replace(tzinfo=timezone.utc):
                    penalty = min(penalty, multiplier)

    # ── CAP 룰 ────────────────────────────────────────────────
    if daily_rp_so_far >= daily_cap:
        return AbuseResult(rejected=False, reject_reason_code="DAILY_CAP_EXCEEDED", penalty_multiplier=0.0)

    return AbuseResult(rejected=False, reject_reason_code=reject_reason, penalty_multiplier=penalty)


async def record_abuse_event(
    db: AsyncSession,
    *,
    user_id: int,
    rule_code: str,
    related_event_id: Optional[int],
    action_taken: AbuseActionEnum,
    detail: Optional[dict] = None,
) -> None:
    entry = AbuseEvent(
        user_id=user_id,
        rule_code=rule_code,
        related_event_id=related_event_id,
        action_taken=action_taken,
        detail=detail,
    )
    db.add(entry)
    await db.flush()
