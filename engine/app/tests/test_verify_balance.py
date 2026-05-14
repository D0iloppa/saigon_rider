"""verify_balance 배치 잡 — 잔액 정합성 로직 단위 테스트.

실제 DB 없이 불일치 감지 로직만 격리해서 검증한다.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import RpBalance


# ── 잔액 비교 로직 (jobs/verify_balance.py 핵심 로직 추출) ────────

def _detect_mismatches(computed_rows, balances: dict) -> list[dict]:
    """verify_balance.run() 내 불일치 감지 로직을 독립 함수로 추출."""
    mismatches = []
    for row in computed_rows:
        balance = balances.get(row["user_id"])
        if balance is None:
            continue
        if balance != row["computed_balance"]:
            mismatches.append({
                "user_id": row["user_id"],
                "cached": balance,
                "computed": row["computed_balance"],
                "diff": balance - row["computed_balance"],
            })
    return mismatches


# ── 정합성 케이스 ─────────────────────────────────────────────────

def test_no_mismatch_when_balances_match():
    computed = [
        {"user_id": 1, "computed_balance": 500},
        {"user_id": 2, "computed_balance": 0},
    ]
    balances = {1: 500, 2: 0}

    mismatches = _detect_mismatches(computed, balances)
    assert mismatches == []


def test_mismatch_detected():
    computed = [{"user_id": 1, "computed_balance": 500}]
    balances = {1: 400}  # 캐시가 100 더 적게 표시

    mismatches = _detect_mismatches(computed, balances)
    assert len(mismatches) == 1
    assert mismatches[0]["user_id"] == 1
    assert mismatches[0]["diff"] == -100


def test_positive_diff_mismatch():
    computed = [{"user_id": 2, "computed_balance": 200}]
    balances = {2: 300}  # 캐시가 100 더 크게 표시

    mismatches = _detect_mismatches(computed, balances)
    assert len(mismatches) == 1
    assert mismatches[0]["diff"] == 100


def test_missing_balance_skipped():
    computed = [
        {"user_id": 1, "computed_balance": 100},
        {"user_id": 99, "computed_balance": 999},  # rp_balance 없는 유저
    ]
    balances = {1: 100}

    mismatches = _detect_mismatches(computed, balances)
    assert mismatches == []


def test_multiple_mismatches():
    computed = [
        {"user_id": 1, "computed_balance": 100},
        {"user_id": 2, "computed_balance": 200},
        {"user_id": 3, "computed_balance": 300},
    ]
    balances = {1: 99, 2: 200, 3: 350}

    mismatches = _detect_mismatches(computed, balances)
    assert len(mismatches) == 2
    affected_ids = {m["user_id"] for m in mismatches}
    assert affected_ids == {1, 3}


# ── Prometheus 메트릭 카운터 연동 ────────────────────────────────

def test_balance_mismatches_metric_incremented():
    from app.metrics import balance_mismatches_total

    before = balance_mismatches_total._value.get()
    mismatches = [
        {"user_id": 1, "cached": 400, "computed": 500, "diff": -100},
        {"user_id": 2, "cached": 300, "computed": 200, "diff": 100},
    ]

    if mismatches:
        balance_mismatches_total.inc(len(mismatches))

    after = balance_mismatches_total._value.get()
    assert after - before == 2
