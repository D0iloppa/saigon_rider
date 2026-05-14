"""point_ledger 단위 테스트 (DB mock)."""
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import InsufficientBalanceError
from app.models import RpBalance, RpExpirationSchedule
from app.services import point_ledger

from .conftest import make_execute_result


def _make_balance(user_id: int = 1, current: int = 100) -> RpBalance:
    b = RpBalance()
    b.user_id = user_id
    b.current_balance = current
    b.lifetime_earned = current
    b.lifetime_spent = 0
    b.last_recalculated_at = datetime.now(timezone.utc)
    return b


# ── round_rp ─────────────────────────────────────────────────────

def test_round_rp_half_up():
    assert point_ledger.round_rp(Decimal("10.5")) == 11
    assert point_ledger.round_rp(Decimal("10.4")) == 10
    assert point_ledger.round_rp(Decimal("0.0")) == 0
    assert point_ledger.round_rp(Decimal("99.9")) == 100


def test_round_rp_exact():
    assert point_ledger.round_rp(Decimal("50")) == 50


# ── credit ───────────────────────────────────────────────────────

async def test_credit_increases_balance(mock_db: AsyncMock):
    balance = _make_balance(current=100)
    mock_db.execute.return_value = make_execute_result(scalar_one_or_none=balance)

    with patch("app.services.point_ledger.settings") as s:
        s.sre_rp_expiry_months = 3
        tx = await point_ledger.credit(
            mock_db,
            user_id=1,
            amount=50,
            source_type="ACTION",
        )

    assert balance.current_balance == 150
    assert balance.lifetime_earned == 150
    assert tx.amount == 50
    assert mock_db.add.call_count >= 2  # RpTransaction + RpExpirationSchedule


async def test_credit_creates_expiration_schedule(mock_db: AsyncMock):
    balance = _make_balance(current=0)
    mock_db.execute.return_value = make_execute_result(scalar_one_or_none=balance)

    added_objects = []
    mock_db.add.side_effect = added_objects.append

    with patch("app.services.point_ledger.settings") as s:
        s.sre_rp_expiry_months = 3
        await point_ledger.credit(mock_db, user_id=1, amount=100, source_type="TEST")

    schedule_added = any(isinstance(o, RpExpirationSchedule) for o in added_objects)
    assert schedule_added


async def test_credit_rejects_zero_amount(mock_db: AsyncMock):
    with pytest.raises(ValueError, match="must be positive"):
        await point_ledger.credit(mock_db, user_id=1, amount=0, source_type="TEST")


async def test_credit_rejects_negative_amount(mock_db: AsyncMock):
    with pytest.raises(ValueError, match="must be positive"):
        await point_ledger.credit(mock_db, user_id=1, amount=-10, source_type="TEST")


# ── debit ────────────────────────────────────────────────────────

async def test_debit_insufficient_balance_raises(mock_db: AsyncMock):
    balance = _make_balance(current=30)
    mock_db.execute.return_value = make_execute_result(scalar_one_or_none=balance)

    with pytest.raises(InsufficientBalanceError):
        await point_ledger.debit(mock_db, user_id=1, amount=100, source_type="REDEEM")


async def test_debit_decreases_balance(mock_db: AsyncMock):
    balance = _make_balance(current=200)

    fifo_schedule = RpExpirationSchedule()
    fifo_schedule.expire_id = 1
    fifo_schedule.user_id = 1
    fifo_schedule.remaining_amount = 200

    from app.enums import ExpireStatusEnum
    fifo_schedule.status = ExpireStatusEnum.PENDING

    # First call: lock_balance, second call: _consume_expiration_fifo
    mock_db.execute.side_effect = [
        make_execute_result(scalar_one_or_none=balance),
        make_execute_result(scalars_all=[fifo_schedule]),
    ]

    with patch("app.services.point_ledger.settings"):
        tx = await point_ledger.debit(mock_db, user_id=1, amount=50, source_type="REDEEM")

    assert balance.current_balance == 150
    assert balance.lifetime_spent == 50
    assert tx.amount == 50


async def test_debit_rejects_zero_amount(mock_db: AsyncMock):
    with pytest.raises(ValueError, match="must be positive"):
        await point_ledger.debit(mock_db, user_id=1, amount=0, source_type="REDEEM")


# ── get_or_create_user ───────────────────────────────────────────

async def test_get_or_create_user_creates_when_missing(mock_db: AsyncMock):
    mock_db.execute.return_value = make_execute_result(scalar_one_or_none=None)

    user = await point_ledger.get_or_create_user(mock_db, "uuid-001")

    assert user.external_user_uuid == "uuid-001"
    mock_db.add.assert_called_once()
    mock_db.flush.assert_called_once()
