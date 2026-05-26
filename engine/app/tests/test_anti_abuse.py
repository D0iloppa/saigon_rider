"""anti_abuse 단위 테스트 (DB mock).

business-rules §1.4 — REJECT → REDUCE → CAP 순서 검증.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock


from app.enums import AbuseActionEnum, AbuseSeverityEnum
from app.models import AbuseRule, SreUser
from app.services import anti_abuse

from .conftest import make_execute_result


def _make_user(days_old: int = 30) -> SreUser:
    user = SreUser()
    user.user_id = 1
    user.created_at = datetime.now(timezone.utc) - timedelta(days=days_old)
    user.is_driver_verified = False
    return user


def _make_rule(
    rule_code: str,
    action: AbuseActionEnum,
    condition: dict,
) -> AbuseRule:
    rule = AbuseRule()
    rule.rule_code = rule_code
    rule.action = action
    rule.severity = AbuseSeverityEnum.HIGH
    rule.condition_json = condition
    rule.is_active = True
    return rule


# ── REJECT 룰 ────────────────────────────────────────────────────

async def test_gps_speed_out_of_range_rejected(mock_db: AsyncMock):
    rule = _make_rule(
        "GPS_SPEED_RANGE",
        AbuseActionEnum.REJECT,
        {"min_kmh": 5, "max_kmh": 80},
    )
    mock_db.execute.return_value = make_execute_result(scalars_all=[rule])

    result = await anti_abuse.evaluate(
        mock_db,
        user=_make_user(),
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={"speed_kmh": 150},
        daily_rp_so_far=0,
        daily_cap=250,
    )

    assert result.rejected is True
    assert result.reject_reason_code == "GPS_SPEED_OUT_OF_RANGE"
    assert result.penalty_multiplier == 0.0


async def test_gps_speed_in_range_passes(mock_db: AsyncMock):
    rule = _make_rule(
        "GPS_SPEED_RANGE",
        AbuseActionEnum.REJECT,
        {"min_kmh": 5, "max_kmh": 80},
    )
    mock_db.execute.return_value = make_execute_result(scalars_all=[rule])

    result = await anti_abuse.evaluate(
        mock_db,
        user=_make_user(),
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={"speed_kmh": 30},
        daily_rp_so_far=0,
        daily_cap=250,
    )

    assert result.rejected is False


async def test_no_speed_payload_skips_gps_rule(mock_db: AsyncMock):
    rule = _make_rule(
        "GPS_SPEED_RANGE",
        AbuseActionEnum.REJECT,
        {"min_kmh": 5, "max_kmh": 80},
    )
    mock_db.execute.return_value = make_execute_result(scalars_all=[rule])

    result = await anti_abuse.evaluate(
        mock_db,
        user=_make_user(),
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={},
        daily_rp_so_far=0,
        daily_cap=250,
    )

    assert result.rejected is False


# ── REDUCE 룰 ────────────────────────────────────────────────────

async def test_new_account_penalty_applied(mock_db: AsyncMock):
    rule = _make_rule(
        "NEW_ACCOUNT_50",
        AbuseActionEnum.REDUCE,
        {"within_days": 3, "multiplier": 0.5},
    )
    mock_db.execute.return_value = make_execute_result(scalars_all=[rule])

    new_user = _make_user(days_old=1)  # 가입 1일차

    result = await anti_abuse.evaluate(
        mock_db,
        user=new_user,
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={},
        daily_rp_so_far=0,
        daily_cap=250,
    )

    assert result.rejected is False
    assert result.penalty_multiplier == 0.5


async def test_old_account_no_new_account_penalty(mock_db: AsyncMock):
    rule = _make_rule(
        "NEW_ACCOUNT_50",
        AbuseActionEnum.REDUCE,
        {"within_days": 3, "multiplier": 0.5},
    )
    mock_db.execute.return_value = make_execute_result(scalars_all=[rule])

    old_user = _make_user(days_old=30)

    result = await anti_abuse.evaluate(
        mock_db,
        user=old_user,
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={},
        daily_rp_so_far=0,
        daily_cap=250,
    )

    assert result.penalty_multiplier == 1.0


# ── CAP 룰 ───────────────────────────────────────────────────────

async def test_daily_cap_exceeded_zero_rp(mock_db: AsyncMock):
    mock_db.execute.return_value = make_execute_result(scalars_all=[])  # 룰 없음

    result = await anti_abuse.evaluate(
        mock_db,
        user=_make_user(),
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={},
        daily_rp_so_far=300,
        daily_cap=250,
    )

    assert result.rejected is False
    assert result.penalty_multiplier == 0.0
    assert result.reject_reason_code == "DAILY_CAP_EXCEEDED"


async def test_daily_cap_not_exceeded(mock_db: AsyncMock):
    mock_db.execute.return_value = make_execute_result(scalars_all=[])

    result = await anti_abuse.evaluate(
        mock_db,
        user=_make_user(),
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={},
        daily_rp_so_far=100,
        daily_cap=250,
    )

    assert result.rejected is False
    assert result.penalty_multiplier == 1.0


# ── 복합 케이스 ──────────────────────────────────────────────────

async def test_no_rules_clean_result(mock_db: AsyncMock):
    mock_db.execute.return_value = make_execute_result(scalars_all=[])

    result = await anti_abuse.evaluate(
        mock_db,
        user=_make_user(),
        action_code="RIDE_KM",
        occurred_at=datetime.now(timezone.utc),
        payload={"speed_kmh": 30},
        daily_rp_so_far=0,
        daily_cap=250,
    )

    assert result.rejected is False
    assert result.penalty_multiplier == 1.0
    assert result.reject_reason_code is None
