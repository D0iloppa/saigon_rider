"""XP 원장 관리 (business-rules §3, §6).

잔액 갱신은 SELECT FOR UPDATE row-level lock으로 직렬화.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import ExpireStatusEnum, TxTypeEnum
from app.exceptions import InsufficientBalanceError
from app.models import XpBalance, XpExpirationSchedule, XpTransaction, SreUser
from app.config import settings


# ── 사용자 초기화 ────────────────────────────────────────────

async def get_or_create_user(db: AsyncSession, external_uuid: str) -> SreUser:
    from app.models import SreUser
    result = await db.execute(
        select(SreUser).where(SreUser.external_user_uuid == external_uuid)
    )
    user = result.scalar_one_or_none()
    if user is None:
        user = SreUser(external_user_uuid=external_uuid)
        db.add(user)
        await db.flush()
    return user


async def get_or_create_balance(db: AsyncSession, user_id: int) -> XpBalance:
    balance = await db.get(XpBalance, user_id)
    if balance is None:
        balance = XpBalance(user_id=user_id)
        db.add(balance)
        await db.flush()
    return balance


# ── 잔액 조회 (FOR UPDATE) ───────────────────────────────────

async def lock_balance(db: AsyncSession, user_id: int) -> XpBalance:
    result = await db.execute(
        select(XpBalance).where(XpBalance.user_id == user_id).with_for_update()
    )
    balance = result.scalar_one_or_none()
    if balance is None:
        balance = XpBalance(user_id=user_id)
        db.add(balance)
        await db.flush()
    return balance


# RP(gc) 일일 적립 하드캡 (economy-cap-rebalance, SGR-228 후속). VN 일자 경계로 리셋.
# 정상 액티브(3슬롯x6=18)는 안 닿는 회로차단기 — 미감사 social rp_grant 폭주·화이트 인플레 차단.
# 초과분은 이월하지 않고 폐기.
DAILY_RP_CAP = 60
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


async def credit_gc(
    db: AsyncSession,
    *,
    user_id: int,
    amount: int,
    apply_daily_cap: bool = True,
    source_type: str = "RP",
    source_id: Optional[int] = None,
    related_event_id: Optional[int] = None,
    memo: Optional[str] = None,
) -> None:
    """RP(gc_balance) 적립 — 성취 보상. 골드 원장/FIFO 만료와 무관한 단순 가산.
    apply_daily_cap=True 면 일일 DAILY_RP_CAP 상한 적용(초과분 폐기) — 데일리 퀘·info 등 루틴 수급.
    False 면 캡 무시·전액 적립(주간/이벤트 퀘 등 특별 보상). 일일 카운터(daily_gc_today)에도 산입 안 함.
    ENG-10: 실제 적립분(grant>0)마다 gc_transaction 원장 1행을 기록한다(감사/검증)."""
    if amount <= 0:
        return
    balance = await lock_balance(db, user_id)
    if not apply_daily_cap:
        balance.gc_balance += amount
        await record_gc_tx(
            db, user_id=user_id, amount=amount, balance_after=balance.gc_balance,
            source_type=source_type, source_id=source_id,
            related_event_id=related_event_id, memo=memo,
        )
        await db.flush()
        return
    today = datetime.now(VN_TZ).date()
    if balance.daily_gc_date != today:
        balance.daily_gc_today = 0
        balance.daily_gc_date = today
    grant = min(amount, max(0, DAILY_RP_CAP - balance.daily_gc_today))
    if grant <= 0:
        return
    balance.gc_balance += grant
    balance.daily_gc_today += grant
    await record_gc_tx(
        db, user_id=user_id, amount=grant, balance_after=balance.gc_balance,
        source_type=source_type, source_id=source_id,
        related_event_id=related_event_id, memo=memo,
    )
    await db.flush()


async def record_gc_tx(
    db: AsyncSession,
    *,
    user_id: int,
    amount: int,
    balance_after: int,
    source_type: str,
    source_id: Optional[int] = None,
    related_event_id: Optional[int] = None,
    memo: Optional[str] = None,
    tx_type: TxTypeEnum = TxTypeEnum.EARN,
) -> None:
    """gc_transaction 원장 1행 기록 (ENG-10). 적립=EARN, 쿠폰 교환 차감=REDEEM 등.
    호출자가 이미 gc_balance 를 변경하고 잠금을 보유한 상태에서 호출한다(balance_after 는 변경 후 값)."""
    from app.models import GcTransaction
    db.add(GcTransaction(
        user_id=user_id,
        tx_type=tx_type,
        amount=amount,
        balance_after=balance_after,
        source_type=source_type,
        source_id=source_id,
        related_event_id=related_event_id,
        memo=memo,
    ))


# ── XP 적립 ──────────────────────────────────────────────────

def round_xp(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


async def credit(
    db: AsyncSession,
    *,
    user_id: int,
    amount: int,
    source_type: str,
    source_id: Optional[int] = None,
    related_event_id: Optional[int] = None,
    memo: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
    daily_cap: Optional[int] = None,
) -> Optional[XpTransaction]:
    """XP/골드 적립. daily_cap 지정 시 잔액 잠금 하에서 당일 적립 합계를 재확인하고
    남은 여유분(cap - so_far)으로 클램프한다(ENG-1/ENG-5, TOCTOU 방지). 여유분이 0이면
    아무 것도 적립하지 않고 None 을 반환한다. daily_cap=None 이면 캡 없이 전액 적립(정책/미션 등)."""
    if amount <= 0:
        raise ValueError("credit amount must be positive")

    balance = await lock_balance(db, user_id)

    # ENG-1/ENG-5: 잠금 획득 후 당일 적립 합계를 재조회해 클램프한다. lock_balance 가 유저별
    # xp_balance 행을 직렬화하므로, 동일 유저의 동시 credit 은 이 지점에서 순서대로 처리된다.
    if daily_cap is not None:
        so_far = await get_daily_earned(
            db, user_id=user_id, date_vn=occurred_at or datetime.now(timezone.utc)
        )
        headroom = daily_cap - so_far
        if headroom <= 0:
            return None
        if amount > headroom:
            amount = headroom

    now = occurred_at or datetime.now(timezone.utc)
    new_balance = balance.current_balance + amount

    tx = XpTransaction(
        user_id=user_id,
        tx_type=TxTypeEnum.EARN,
        amount=amount,
        balance_after=new_balance,
        source_type=source_type,
        source_id=source_id,
        related_event_id=related_event_id,
        occurred_at=now,
        memo=memo,
    )
    db.add(tx)
    await db.flush()

    # 만료 스케줄 생성 (적립일 + 3개월)
    expires_at = now + relativedelta(months=settings.sre_xp_expiry_months)
    schedule = XpExpirationSchedule(
        user_id=user_id,
        source_transaction_id=tx.transaction_id,
        remaining_amount=amount,
        expires_at=expires_at,
        status=ExpireStatusEnum.PENDING,
    )
    db.add(schedule)

    # 잔액 갱신
    balance.current_balance = new_balance
    balance.lifetime_earned += amount
    balance.last_recalculated_at = now
    await db.flush()

    return tx


# ── XP 차감 (FIFO 만료 소진) ─────────────────────────────────

async def debit(
    db: AsyncSession,
    *,
    user_id: int,
    amount: int,
    source_type: str,
    source_id: Optional[int] = None,
    memo: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> XpTransaction:
    if amount <= 0:
        raise ValueError("debit amount must be positive")

    balance = await lock_balance(db, user_id)
    if balance.current_balance < amount:
        raise InsufficientBalanceError(
            f"Required {amount} XP but current balance is {balance.current_balance}"
        )

    now = occurred_at or datetime.now(timezone.utc)
    new_balance = balance.current_balance - amount

    tx = XpTransaction(
        user_id=user_id,
        tx_type=TxTypeEnum.REDEEM,
        amount=amount,
        balance_after=new_balance,
        source_type=source_type,
        source_id=source_id,
        occurred_at=now,
        memo=memo,
    )
    db.add(tx)
    await db.flush()

    # FIFO 만료 스케줄 소진
    await _consume_expiration_fifo(db, user_id=user_id, amount=amount, now=now)

    balance.current_balance = new_balance
    balance.lifetime_spent += amount
    balance.last_recalculated_at = now
    await db.flush()

    return tx


async def _consume_expiration_fifo(
    db: AsyncSession, *, user_id: int, amount: int, now: datetime
) -> None:
    schedules = (
        await db.execute(
            select(XpExpirationSchedule)
            .where(
                XpExpirationSchedule.user_id == user_id,
                XpExpirationSchedule.status.in_([ExpireStatusEnum.PENDING, ExpireStatusEnum.PARTIALLY_USED]),
                XpExpirationSchedule.expires_at > now,
            )
            .order_by(XpExpirationSchedule.expires_at.asc(), XpExpirationSchedule.expire_id.asc())
            .with_for_update()
        )
    ).scalars().all()

    remaining = amount
    for sched in schedules:
        if remaining <= 0:
            break
        used = min(sched.remaining_amount, remaining)
        sched.remaining_amount -= used
        remaining -= used
        sched.status = (
            ExpireStatusEnum.FULLY_USED if sched.remaining_amount == 0
            else ExpireStatusEnum.PARTIALLY_USED
        )

    await db.flush()


# ── 환불 ─────────────────────────────────────────────────────

async def refund(
    db: AsyncSession,
    *,
    user_id: int,
    amount: int,
    source_type: str,
    source_id: Optional[int] = None,
    memo: Optional[str] = None,
) -> XpTransaction:
    """환불: 잔액 복원 + 환불일 기준 3개월 새 만료 스케줄."""
    balance = await lock_balance(db, user_id)
    now = datetime.now(timezone.utc)
    new_balance = balance.current_balance + amount

    tx = XpTransaction(
        user_id=user_id,
        tx_type=TxTypeEnum.REFUND,
        amount=amount,
        balance_after=new_balance,
        source_type=source_type,
        source_id=source_id,
        occurred_at=now,
        memo=memo,
    )
    db.add(tx)
    await db.flush()

    expires_at = now + relativedelta(months=settings.sre_xp_expiry_months)
    schedule = XpExpirationSchedule(
        user_id=user_id,
        source_transaction_id=tx.transaction_id,
        remaining_amount=amount,
        expires_at=expires_at,
        status=ExpireStatusEnum.PENDING,
    )
    db.add(schedule)

    balance.current_balance = new_balance
    balance.last_recalculated_at = now
    await db.flush()

    return tx


# ── 관리자 조정 ───────────────────────────────────────────────

async def admin_adjust(
    db: AsyncSession,
    *,
    user_id: int,
    amount: int,
    tx_type: TxTypeEnum,
    actor_user_id: Optional[int] = None,
    memo: Optional[str] = None,
) -> XpTransaction:
    assert tx_type in (TxTypeEnum.ADJUST_PLUS, TxTypeEnum.ADJUST_MINUS)

    balance = await lock_balance(db, user_id)
    now = datetime.now(timezone.utc)

    if tx_type == TxTypeEnum.ADJUST_MINUS and balance.current_balance < amount:
        raise InsufficientBalanceError("Insufficient balance for ADJUST_MINUS")

    delta = amount if tx_type == TxTypeEnum.ADJUST_PLUS else -amount
    new_balance = balance.current_balance + delta

    tx = XpTransaction(
        user_id=user_id,
        tx_type=tx_type,
        amount=amount,
        balance_after=new_balance,
        source_type="ADMIN",
        source_id=actor_user_id,
        occurred_at=now,
        memo=memo,
    )
    db.add(tx)

    balance.current_balance = new_balance
    balance.last_recalculated_at = now
    await db.flush()

    return tx


# ── 일일 적립량 조회 ──────────────────────────────────────────

async def get_daily_earned(
    db: AsyncSession, *, user_id: int, date_vn: datetime
) -> int:
    """베트남 시간 기준 당일 적립된 총 XP."""
    from zoneinfo import ZoneInfo
    VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
    day_start = date_vn.astimezone(VN_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start.replace(hour=23, minute=59, second=59, microsecond=999999)

    from sqlalchemy import func
    result = await db.execute(
        select(func.coalesce(func.sum(XpTransaction.amount), 0)).where(
            XpTransaction.user_id == user_id,
            XpTransaction.tx_type == TxTypeEnum.EARN,
            XpTransaction.occurred_at >= day_start,
            XpTransaction.occurred_at <= day_end,
        )
    )
    return result.scalar_one() or 0
