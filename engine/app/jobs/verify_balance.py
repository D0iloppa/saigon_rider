"""일배치: XP 잔액 정합성 검증 (베트남 시간 04:30).

진실: xp_transaction 합계
캐시: xp_balance.current_balance
불일치 시 structlog 경고 출력 (수동 조사용).
"""
from __future__ import annotations

import logging

from sqlalchemy import case, func, select

from app.database import AsyncSessionLocal
from app.enums import TxTypeEnum
from app.metrics import balance_mismatches_total
from app.models import XpBalance, XpTransaction

log = logging.getLogger(__name__)

_EARN_TYPES = (TxTypeEnum.EARN, TxTypeEnum.REFUND, TxTypeEnum.ADJUST_PLUS)
_SPEND_TYPES = (TxTypeEnum.REDEEM, TxTypeEnum.EXPIRE, TxTypeEnum.ADJUST_MINUS)


async def run() -> None:
    log.info("verify_balance job started")

    async with AsyncSessionLocal() as db:
        computed = (
            await db.execute(
                select(
                    XpTransaction.user_id,
                    func.sum(
                        case(
                            (XpTransaction.tx_type.in_(_EARN_TYPES), XpTransaction.amount),
                            else_=-XpTransaction.amount,
                        )
                    ).label("computed_balance"),
                ).group_by(XpTransaction.user_id)
            )
        ).all()

        mismatches = []
        for row in computed:
            balance = await db.get(XpBalance, row.user_id)
            if balance is None:
                continue
            if balance.current_balance != row.computed_balance:
                mismatches.append({
                    "user_id": row.user_id,
                    "cached": balance.current_balance,
                    "computed": row.computed_balance,
                    "diff": balance.current_balance - row.computed_balance,
                })

    if mismatches:
        balance_mismatches_total.inc(len(mismatches))
        log.warning(
            "verify_balance MISMATCH detected: %d users affected — %s",
            len(mismatches),
            mismatches,
        )
    else:
        log.info("verify_balance job done: all balances OK (%d users checked)", len(computed))
