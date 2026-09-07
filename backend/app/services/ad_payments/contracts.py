"""계약건 상태 전이 (260907_ad_payment_pipeline_design.md §4-1) — 전이는 이 5함수로만 일어난다.

draft --accept--> accepted --issue_instructions--> awaiting_payment
  --(ingest_deposit, port.py)--> partially_paid --(ingest_deposit)--> paid
  --approve--> active
어디서든 --cancel--> cancelled, active --close_refunded--> refunded.

라우터(P1-3/P1-4, 이번 범위 밖)는 이 함수들을 호출만 한다 — 상태값 직접 대입 금지.
"""

from __future__ import annotations

import calendar
from collections.abc import Sequence
from datetime import datetime

from ...models import AdContract, MarketplaceAd
from ..ad_gating import RENEWAL_GRACE_BUSINESS_DAYS, grace_cutoff
from . import config, constants
from .reconcile import DepositLike, ReconcileResult


class ContractStateError(Exception):
    """허용되지 않는 상태에서의 전이 시도."""


def _add_months_clamped(dt: datetime, months: int) -> datetime:
    """달력월 덧셈, 말일 클램프(예: 1/31 + 1개월 → 2/28 또는 2/29)."""
    total = dt.month - 1 + months
    year = dt.year + total // 12
    month = total % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def compute_period(*, prev_paid_until: datetime | None, months: int, now: datetime) -> tuple[datetime, datetime]:
    """승인 시 기간 산출 (§4-3). 유예기간 안의 갱신은 이어붙이고, 아니면 승인 시점부터."""
    grace_floor = grace_cutoff(now, RENEWAL_GRACE_BUSINESS_DAYS)
    period_start = prev_paid_until if prev_paid_until is not None and prev_paid_until >= grace_floor else now
    period_end = _add_months_clamped(period_start, months)
    return period_start, period_end


def apply_reconcile_outcome(
    contract: AdContract, outcome: ReconcileResult, *, reconcilable_statuses: Sequence[str]
) -> bool:
    """대조 결과를 계약 상태에 반영하는 공유 지점(§4-2) — "상태 전이는 이 함수 호출로만" 규약을
    지키기 위해 관리자 라우터(입금건 등록/재배정)가 여기를 통해서만 `contract.status` 를 바꾼다.
    `reconcilable_statuses` 밖의 상태(예: draft/active/cancelled/refunded)는 건드리지 않는다.
    """
    if contract.status not in reconcilable_statuses:
        return False
    contract.status = outcome.status
    return True


def accept(
    contract: AdContract,
    *,
    months: int,
    amount_vnd: int,
    signer_name: str,
    signer_ip: str | None,
    now: datetime,
    contract_method: str = "checkbox_v1",
    snapshot: dict | None = None,
) -> None:
    """draft → accepted."""
    if contract.status != "draft":
        raise ContractStateError(f"draft 상태에서만 accept 가능 (현재: {contract.status})")
    if months not in (1, 3, 6):
        raise ValueError("months 는 1/3/6 중 하나여야 한다")
    if not signer_name or not signer_name.strip():
        raise ValueError("signer_name 은 필수다")
    contract.months = months
    contract.amount_vnd = amount_vnd
    contract.accepted_at = now
    contract.contract_method = contract_method
    contract.signer_name = signer_name.strip()
    contract.signer_ip = signer_ip
    contract.contract_snapshot = snapshot
    contract.status = "accepted"


def issue_instructions(contract: AdContract, *, now: datetime) -> bool:
    """accepted → awaiting_payment (배선 시). 멱등 — 이미 발급됐으면 True 반환, 재세팅하지 않는다."""
    if contract.status == "awaiting_payment":
        return True
    if contract.status != "accepted":
        return False
    if not config.bank_wiring_ready():
        return False
    contract.payment_instructions_issued_at = now
    contract.status = "awaiting_payment"
    return True


def approve(
    contract: AdContract,
    ad: MarketplaceAd,
    *,
    actor: str,
    now: datetime,
    reason: str | None = None,
) -> tuple[datetime, datetime]:
    """paid/partially_paid → active. 기간 확정 + ad.paid_until/subscription_status 갱신."""
    if ad.id != contract.ad_id:
        raise ContractStateError("ad 가 계약의 ad_id 와 일치하지 않는다")
    if contract.status not in ("paid", "partially_paid"):
        raise ContractStateError(f"paid/partially_paid 상태만 승인 가능 (현재: {contract.status})")
    if contract.status == "partially_paid":
        if not constants.ALLOW_PARTIAL_APPROVAL:
            raise ContractStateError("부분 승인은 현재 허용되지 않는다 (D-D)")
        if not (reason and reason.strip()):
            raise ValueError("부분 승인은 사유(reason)가 필수다")
    period_start, period_end = compute_period(prev_paid_until=ad.paid_until, months=contract.months, now=now)
    contract.period_start = period_start
    contract.period_end = period_end
    contract.approved_at = now
    contract.approved_by = actor
    contract.status = "active"
    # active ⇒ paid_until NOT NULL 불변식(service-rules.md §광고노출)을 이 두 대입으로 항상 함께 지킨다.
    ad.paid_until = period_end
    ad.subscription_status = "active"
    return period_start, period_end


def cancel(contract: AdContract, *, reason: str, deposits: Sequence[DepositLike] = (), now: datetime) -> None:
    """active/refunded 를 제외한 모든 상태 → cancelled. 입금건 순수액이 0이어야 한다."""
    if contract.status in ("active", "refunded"):
        raise ContractStateError("active/refunded 계약은 cancel 불가 — close_refunded 사용")
    if not reason or not reason.strip():
        raise ValueError("cancel 사유는 필수다")
    received = sum(d.amount_vnd for d in deposits if d.kind == "deposit") - sum(
        d.amount_vnd for d in deposits if d.kind == "refund"
    )
    if received > 0:
        raise ContractStateError("입금건이 있는 계약은 환불 처리 후에만 취소 가능")
    contract.status = "cancelled"
    contract.closed_at = now
    contract.closed_reason = reason.strip()


def close_refunded(contract: AdContract, *, reason: str, deposits: Sequence[DepositLike], now: datetime) -> None:
    """active → refunded. refund 합계가 deposit 합계와 같아(순수액 0) 종결된 계약만.

    active 계약이 최신 계약인지에 따른 ad.paid_until 처리(§4-2, D-C)는 호출부(관리자 API) 책임 —
    이 함수는 계약 자체의 상태만 종결한다.
    """
    if contract.status != "active":
        raise ContractStateError(f"active 상태만 close_refunded 가능 (현재: {contract.status})")
    if not reason or not reason.strip():
        raise ValueError("close_refunded 사유는 필수다")
    received = sum(d.amount_vnd for d in deposits if d.kind == "deposit") - sum(
        d.amount_vnd for d in deposits if d.kind == "refund"
    )
    if received != 0:
        raise ContractStateError("refund 합계가 deposit 합계와 같아야(순수액 0) close_refunded 가능")
    contract.status = "refunded"
    contract.closed_at = now
    contract.closed_reason = reason.strip()
