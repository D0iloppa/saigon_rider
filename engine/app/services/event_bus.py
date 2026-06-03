"""XP 계산 파이프라인 오케스트레이터 (business-rules §1.4).

파이프라인 순서:
  1. idempotency_key 중복 검사
  2. 기본 검증 (action_definition, user 상태)
  3. 어뷰징 룰 평가 (REJECT / REDUCE / CAP)
  4. daily_count_limit 검사
  5. 다양성 계수 조회
  6. XP 계산
  7. xp_transaction INSERT (credit)
  8. behavior_category_log INSERT
  9. user_mission_progress 갱신
 10. user_tier 재평가
 11. idempotency_key INSERT + audit_log INSERT
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.enums import EventStatusEnum, UserStatusEnum
from app.exceptions import DuplicateEventError
from app.metrics import events_processed_total
from app.models import ActionDefinition, ActionEvent, IdempotencyKey, SreUser
from app.schemas import EventCreate, EventResult
from app.services import anti_abuse, audit, diversity, mission, xp_ledger, tier as tier_svc


async def process_event(db: AsyncSession, data: EventCreate) -> EventResult:  # noqa: C901
    # ── 1. 멱등성 키 중복 검사 ────────────────────────────────
    existing_idem = await db.get(IdempotencyKey, data.idempotency_key)
    if existing_idem is not None:
        # 원본 이벤트 응답 재현
        orig_event = (
            await db.execute(
                select(ActionEvent).where(
                    ActionEvent.idempotency_key == data.idempotency_key
                )
            )
        ).scalar_one_or_none()
        if orig_event:
            return _build_result_from_event(orig_event)
        raise DuplicateEventError(f"idempotency_key={data.idempotency_key} already processed")

    # ── 2. 기본 검증 ──────────────────────────────────────────
    action_def = await db.get(ActionDefinition, data.action_code)
    if action_def is None or not action_def.is_active:
        return await _reject_event(db, data, reason="UNKNOWN_ACTION")

    user = await xp_ledger.get_or_create_user(db, str(data.user_id))
    if user.status != UserStatusEnum.ACTIVE:
        return await _reject_event(db, data, reason="USER_SUSPENDED", user=user)

    occurred_at = data.occurred_at
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)

    # ── 3. 어뷰징 룰 평가 ────────────────────────────────────
    daily_cap = (
        settings.sre_daily_cap_driver
        if user.is_driver_verified
        else settings.sre_daily_cap_standard
    )
    daily_earned = await xp_ledger.get_daily_earned(db, user_id=user.user_id, date_vn=occurred_at)

    abuse_result = await anti_abuse.evaluate(
        db,
        user=user,
        action_code=data.action_code,
        occurred_at=occurred_at,
        payload=data.payload,
        daily_rp_so_far=daily_earned,
        daily_cap=daily_cap,
    )

    if abuse_result.rejected:
        return await _reject_event(db, data, reason=abuse_result.reject_reason_code, user=user)

    # ── 4. daily_count_limit 검사 ─────────────────────────────
    if action_def.daily_count_limit is not None:
        from zoneinfo import ZoneInfo
        VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
        day_start = occurred_at.astimezone(VN_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        count_result = await db.execute(
            select(func.count(ActionEvent.event_id)).where(
                ActionEvent.user_id == user.user_id,
                ActionEvent.action_code == data.action_code,
                ActionEvent.occurred_at >= day_start,
                ActionEvent.process_status == EventStatusEnum.PROCESSED,
            )
        )
        daily_count = count_result.scalar_one() or 0
        if daily_count >= action_def.daily_count_limit:
            return await _reject_event(db, data, reason="DAILY_COUNT_LIMIT", user=user)

    # ── 5. 다양성 계수 조회 ───────────────────────────────────
    mk = diversity.month_key(occurred_at)
    diversity_mult = await diversity.get_multiplier(db, user.user_id, mk)

    # ── 6. RP 계산 ────────────────────────────────────────────
    payload = data.payload or {}
    volume = _extract_volume(data.action_code, payload)
    total_multiplier = Decimal(str(diversity_mult)) * Decimal(str(abuse_result.penalty_multiplier))
    raw_xp = Decimal(str(action_def.base_xp)) * Decimal(str(volume)) * total_multiplier
    final_xp = xp_ledger.round_xp(raw_xp)

    # ── 7. action_event INSERT ───────────────────────────────
    event = ActionEvent(
        user_id=user.user_id,
        action_code=data.action_code,
        occurred_at=occurred_at,
        payload=data.payload,
        idempotency_key=data.idempotency_key,
        calculated_xp=raw_xp,
        applied_multiplier=float(total_multiplier),
        process_status=EventStatusEnum.PROCESSED,
        reject_reason_code=abuse_result.reject_reason_code,
    )
    db.add(event)
    await db.flush()

    # 골드(current_balance) 적립 (> 0 일 때만)
    tx = None
    if final_xp > 0:
        tx = await xp_ledger.credit(
            db,
            user_id=user.user_id,
            amount=final_xp,
            source_type="ACTION",
            source_id=event.event_id,
            related_event_id=event.event_id,
            occurred_at=occurred_at,
        )

    # RP(gc_balance) 적립 — 성취 보상, 상한 없음 (SGR-213).
    # 퀘스트는 per-quest 값을 payload.rp 로 전달(표시 rewardXpPoints와 일치), 그 외는 action_def.rp_grant 폴백.
    rp_amount = (
        int(payload["rp"]) if isinstance(payload.get("rp"), (int, float))
        else (action_def.rp_grant or 0)
    )
    if rp_amount > 0:
        await xp_ledger.credit_gc(db, user_id=user.user_id, amount=rp_amount)

    # ── 8. 다양성 카테고리 로그 ───────────────────────────────
    await diversity.log_category(
        db,
        user_id=user.user_id,
        category_code=action_def.category_code,
        related_event_id=event.event_id,
        occurred_at=occurred_at,
    )

    # ── 9. 미션 진행도 갱신 ───────────────────────────────────
    await mission.update_progress(
        db,
        user_id=user.user_id,
        action_code=data.action_code,
        occurred_at=occurred_at,
        payload=data.payload,
        event_id=event.event_id,
    )

    # ── 10. 등급 재평가 ───────────────────────────────────────
    if tx is not None:
        balance = await db.get(xp_ledger.XpBalance, user.user_id)
        lifetime = balance.lifetime_earned if balance else final_xp
        await tier_svc.evaluate(db, user_id=user.user_id, lifetime_earned=lifetime)

    # ── 11. 멱등성 키 등록 + 감사 로그 ──────────────────────
    idem = IdempotencyKey(
        idempotency_key=data.idempotency_key,
        resource_type="EVENT",
        resource_id=event.event_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.sre_idempotency_ttl_days),
    )
    db.add(idem)

    await audit.record(
        db,
        entity_type="action_event",
        entity_id=event.event_id,
        action_code="PROCESS_EVENT",
        after={"rp_awarded": final_xp, "process_status": "PROCESSED"},
    )

    await db.commit()

    events_processed_total.labels(action_code=data.action_code, status="PROCESSED").inc()

    return EventResult(
        event_id=event.event_id,
        process_status=EventStatusEnum.PROCESSED,
        xp_awarded=final_xp,
        applied_multiplier=float(total_multiplier),
        diversity_multiplier=diversity_mult,
        transaction_id=tx.transaction_id if tx else None,
        reject_reason_code=abuse_result.reject_reason_code,
    )


# ── 헬퍼 ─────────────────────────────────────────────────────

def _extract_volume(action_code: str, payload: dict) -> float:
    """액션별 volume 계수 추출. RIDE_KM은 distance_km, 나머지는 1."""
    if action_code == "RIDE_KM":
        return float(payload.get("distance_km", 1))
    return 1.0


async def _reject_event(
    db: AsyncSession,
    data: EventCreate,
    reason: str,
    user: SreUser | None = None,
) -> EventResult:
    occurred_at = data.occurred_at
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)

    user_id = user.user_id if user else 0

    # user가 없으면 임시 조회 시도 (reject 전 user 생성 불필요)
    if user_id == 0:
        _user = await xp_ledger.get_or_create_user(db, str(data.user_id))
        user_id = _user.user_id

    event = ActionEvent(
        user_id=user_id,
        action_code=data.action_code,
        occurred_at=occurred_at,
        payload=data.payload,
        idempotency_key=data.idempotency_key,
        calculated_xp=Decimal("0"),
        applied_multiplier=0.0,
        process_status=EventStatusEnum.REJECTED,
        reject_reason_code=reason,
    )
    db.add(event)
    await db.flush()

    idem = IdempotencyKey(
        idempotency_key=data.idempotency_key,
        resource_type="EVENT",
        resource_id=event.event_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.sre_idempotency_ttl_days),
    )
    db.add(idem)

    await db.commit()

    events_processed_total.labels(action_code=data.action_code, status="REJECTED").inc()

    return EventResult(
        event_id=event.event_id,
        process_status=EventStatusEnum.REJECTED,
        xp_awarded=0,
        applied_multiplier=0.0,
        diversity_multiplier=1.0,
        transaction_id=None,
        reject_reason_code=reason,
    )


def _build_result_from_event(event: ActionEvent) -> EventResult:
    return EventResult(
        event_id=event.event_id,
        process_status=event.process_status,
        xp_awarded=int(event.calculated_xp or 0),
        applied_multiplier=float(event.applied_multiplier or 1.0),
        diversity_multiplier=1.0,
        transaction_id=None,
        reject_reason_code=event.reject_reason_code,
    )
