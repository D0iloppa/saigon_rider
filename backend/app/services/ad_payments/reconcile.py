"""대조(reconcile) — 시스템이 계산하는 부분 (260907_ad_payment_pipeline_design.md §4-2).

`received = Σ(kind=deposit) - Σ(kind=refund)` 를 `expected`(계약금액)와 비교해 상태·플래그를
산출하는 순수함수. 코드로 계약을 특정하는 매칭(§2-1 port.py)과 승인(contracts.py)은 여기서
다루지 않는다 — 이 모듈은 "이미 이 계약에 연결된 입금건들을 보고 무슨 상태인가"만 답한다.

플래그(overpaid/check_payer/duplicate_suspect)는 저장하지 않고 호출 때마다 계산한다(§4-2 마지막 문단).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

# 같은 계약에 금액이 같고 입금시각이 이 간격 이내인 입금건이 2개 이상이면 "중복 의심".
_DUPLICATE_SUSPECT_WINDOW = timedelta(days=1)


class DepositLike(Protocol):
    kind: str
    amount_vnd: int
    paid_at: object
    payer_name: str | None


@dataclass(frozen=True)
class ReconcileResult:
    status: str  # "awaiting_payment" | "partially_paid" | "paid"
    received_vnd: int
    expected_vnd: int
    shortfall_vnd: int
    overpaid_vnd: int
    flags: frozenset[str]


def _normalize_name(name: str) -> str:
    return "".join(name.upper().split())


def reconcile_contract(
    *,
    expected_vnd: int,
    deposits: Sequence[DepositLike],
    partner_name: str | None = None,
) -> ReconcileResult:
    """`deposits` 는 이미 이 계약에 매칭된(contract_id 일치) 입금건 전부."""
    deposit_rows = [d for d in deposits if d.kind == "deposit"]
    refund_rows = [d for d in deposits if d.kind == "refund"]
    received = sum(d.amount_vnd for d in deposit_rows) - sum(d.amount_vnd for d in refund_rows)

    if received <= 0:
        status = "awaiting_payment"
    elif received < expected_vnd:
        status = "partially_paid"
    else:
        status = "paid"

    flags: set[str] = set()
    if received > expected_vnd:
        flags.add("overpaid")

    if partner_name:
        normalized_partner = _normalize_name(partner_name)
        for d in deposit_rows:
            # [중 6] amount 일치 여부와 무관하게 payer_name 불일치를 독립적으로 플래그한다 —
            # 이전엔 amount 도 함께 달라야 했는데, "다른 사람이 정확한 금액을 송금"(가장 흔한
            # 오입금 패턴)이 amount 일치로 인해 안 걸렸다.
            if d.payer_name and _normalize_name(d.payer_name) != normalized_partner:
                flags.add("check_payer")
                break

    for i, a in enumerate(deposit_rows):
        for b in deposit_rows[i + 1 :]:
            if a.amount_vnd == b.amount_vnd and abs(a.paid_at - b.paid_at) <= _DUPLICATE_SUSPECT_WINDOW:
                flags.add("duplicate_suspect")

    return ReconcileResult(
        status=status,
        received_vnd=received,
        expected_vnd=expected_vnd,
        shortfall_vnd=max(0, expected_vnd - received),
        overpaid_vnd=max(0, received - expected_vnd),
        flags=frozenset(flags),
    )
