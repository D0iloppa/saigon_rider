"""event_bus 단위 테스트 — 서비스 레이어를 mock으로 격리.

각 테스트는 process_event()의 분기 로직만 검증한다.
"""
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.enums import EventStatusEnum
from app.exceptions import DuplicateEventError
from app.models import ActionDefinition, ActionEvent, IdempotencyKey, SreUser
from app.schemas import EventCreate
from app.services import event_bus

from .conftest import make_execute_result


_TEST_UUID = "550e8400-e29b-41d4-a716-446655440000"


def _make_event_data(**overrides) -> EventCreate:
    defaults = dict(
        user_id=_TEST_UUID,
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={"distance_km": 5.0},
        idempotency_key="idem-test-001",
    )
    defaults.update(overrides)
    return EventCreate(**defaults)


def _make_action_def(action_code: str = "RIDE_KM", base_rp: int = 10) -> ActionDefinition:
    ad = ActionDefinition()
    ad.action_code = action_code
    ad.category_code = "RIDING"
    ad.display_name = "Ride KM"
    ad.base_rp = base_rp
    ad.daily_count_limit = None
    ad.is_active = True
    return ad


def _make_sre_user() -> SreUser:
    from app.enums import UserStatusEnum
    user = SreUser()
    user.user_id = 1
    user.external_user_uuid = _TEST_UUID
    user.status = UserStatusEnum.ACTIVE
    user.is_driver_verified = False
    user.created_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
    return user


# ── 멱등성 중복 ───────────────────────────────────────────────────

async def test_duplicate_idem_key_with_existing_event(mock_db: AsyncMock):
    existing_idem = MagicMock()

    orig_event = ActionEvent()
    orig_event.event_id = 42
    orig_event.process_status = EventStatusEnum.PROCESSED
    orig_event.calculated_rp = Decimal("50")
    orig_event.applied_multiplier = 1.0
    orig_event.reject_reason_code = None

    mock_db.get.side_effect = lambda model, key: existing_idem if model is IdempotencyKey else None
    mock_db.execute.return_value = make_execute_result(scalar_one_or_none=orig_event)

    data = _make_event_data()
    result = await event_bus.process_event(mock_db, data)

    assert result.event_id == 42
    assert result.process_status == EventStatusEnum.PROCESSED


async def test_duplicate_idem_key_no_event_raises(mock_db: AsyncMock):
    existing_idem = MagicMock()

    mock_db.get.side_effect = lambda model, key: existing_idem if model is IdempotencyKey else None
    mock_db.execute.return_value = make_execute_result(scalar_one_or_none=None)

    data = _make_event_data()
    with pytest.raises(DuplicateEventError):
        await event_bus.process_event(mock_db, data)


# ── 미지 액션 → REJECTED ─────────────────────────────────────────

async def test_unknown_action_code_rejected(mock_db: AsyncMock):
    # db.get(IdempotencyKey) → None, db.get(ActionDefinition) → None
    mock_db.get.return_value = None
    # _reject_event 내에서 get_or_create_user 호출
    mock_db.execute.return_value = make_execute_result(scalar_one_or_none=None)

    with patch("app.services.event_bus.point_ledger") as mock_ledger:
        mock_user = _make_sre_user()
        mock_ledger.get_or_create_user = AsyncMock(return_value=mock_user)

        data = _make_event_data(action_code="UNKNOWN_ACTION")
        result = await event_bus.process_event(mock_db, data)

    assert result.process_status == EventStatusEnum.REJECTED
    assert result.reject_reason_code == "UNKNOWN_ACTION"
    assert result.rp_awarded == 0


# ── _extract_volume ───────────────────────────────────────────────

def test_extract_volume_ride_km():
    vol = event_bus._extract_volume("RIDE_KM", {"distance_km": 7.5})
    assert vol == 7.5


def test_extract_volume_ride_km_missing_defaults_to_1():
    vol = event_bus._extract_volume("RIDE_KM", {})
    assert vol == 1.0


def test_extract_volume_non_ride_action():
    vol = event_bus._extract_volume("QUEST_COMPLETE", {"quest_id": "abc"})
    assert vol == 1.0


# ── _build_result_from_event ──────────────────────────────────────

def test_build_result_from_event():
    event = ActionEvent()
    event.event_id = 99
    event.process_status = EventStatusEnum.PROCESSED
    event.calculated_rp = Decimal("120")
    event.applied_multiplier = 1.2
    event.reject_reason_code = None

    result = event_bus._build_result_from_event(event)

    assert result.event_id == 99
    assert result.rp_awarded == 120
    assert result.applied_multiplier == 1.2
    assert result.reject_reason_code is None
