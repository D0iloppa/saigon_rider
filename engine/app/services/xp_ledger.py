"""XP 원장 관리 (business-rules §3, §6).

잔액 갱신은 SELECT FOR UPDATE row-level lock으로 직렬화.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

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


async def credit_gc(db: AsyncSession, *, user_id: int, amount: int) -> None:
    """RP(gc_balance) 적립 — 성취 보상. 골드 원장/FIFO 만료와 무관한 단순 가산, 상한 없음."""
    if amount <= 0:
        return
    balance = await lock_balance(db, user_id)
    balance.gc_balance += amount
    await db.flush()


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
) -> XpTransaction:
    if amount <= 0:
        raise ValueError("credit amount must be positive")

    balance = await lock_balance(db, user_id)
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
