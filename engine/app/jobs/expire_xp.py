"""일배치: 만료된 XP 처리 (베트남 시간 04:00).

만료 조건: xp_expiration_schedule.expires_at <= NOW()
           AND status IN (PENDING, PARTIALLY_USED)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.enums import ExpireStatusEnum, TxTypeEnum
from app.models import XpExpirationSchedule, XpTransaction

log = logging.getLogger(__name__)


async def run() -> None:
    log.info("expire_xp job started")
    now = datetime.now(timezone.utc)
    count = 0

    async with AsyncSessionLocal() as db:
        schedules = (
            await db.execute(
                select(XpExpirationSchedule)
                .where(
                    XpExpirationSchedule.status.in_([
                        ExpireStatusEnum.PENDING,
                        ExpireStatusEnum.PARTIALLY_USED,
                    ]),
                    XpExpirationSchedule.expires_at <= now,
                )
                .order_by(XpExpirationSchedule.user_id, XpExpirationSchedule.expire_id)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()

        # 사용자별로 묶어서 한 트랜잭션으로 처리
        from itertools import groupby
        for user_id, group in groupby(schedules, key=lambda s: s.user_id):
            user_schedules = list(group)
            total_expire = sum(s.remaining_amount for s in user_schedules)
            if total_expire == 0:
                continue

            from app.models import XpBalance
            balance = (
                await db.execute(
                    select(XpBalance).where(XpBalance.user_id == user_id).with_for_update()
                )
            ).scalar_one_or_none()
            if balance is None:
                continue

            actual_expire = min(total_expire, balance.current_balance)
            new_balance = balance.current_balance - actual_expire

            tx = XpTransaction(
                user_id=user_id,
                tx_type=TxTypeEnum.EXPIRE,
                amount=actual_expire,
                balance_after=new_balance,
                source_type="EXPIRY",
                occurred_at=now,
                memo=f"자동 만료 {len(user_schedules)}건",
            )
            db.add(tx)

            for sched in user_schedules:
                sched.remaining_amount = 0
                sched.status = ExpireStatusEnum.EXPIRED

            balance.current_balance = new_balance
            balance.last_recalculated_at = now
            count += len(user_schedules)

        await db.commit()

    log.info("expire_xp job done: %d schedules expired", count)
