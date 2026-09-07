"""계약건 상태 전이 5함수 회귀 (260907_ad_payment_pipeline_design.md §4-1).

순수 객체(AdContract/MarketplaceAd 인스턴스, DB 세션 없이)로 전이 규칙만 검증한다.
"""

import os
import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import patch

from app.models import AdContract, MarketplaceAd
from app.services.ad_payments.contracts import (
    ContractStateError,
    accept,
    approve,
    cancel,
    close_refunded,
    issue_instructions,
)
from app.services.ad_payments.payment_code import generate_payment_code

_BANK_ENV_KEYS = (
    "AD_PAYMENT_BANK_NAME",
    "AD_PAYMENT_BANK_ACCOUNT_NO",
    "AD_PAYMENT_BANK_ACCOUNT_HOLDER",
)
_UNWIRED_ENV = dict.fromkeys(_BANK_ENV_KEYS, "")
_WIRED_ENV = {
    "AD_PAYMENT_BANK_NAME": "Vietcombank",
    "AD_PAYMENT_BANK_ACCOUNT_NO": "0123456789",
    "AD_PAYMENT_BANK_ACCOUNT_HOLDER": "CONG TY TNHH SAIGON RIDER",
}


def _now():
    return datetime(2026, 9, 7, 10, 0, tzinfo=UTC)


def _draft_contract(**overrides):
    defaults = dict(
        id=uuid.uuid4(),
        ad_id=uuid.uuid4(),
        tier_id=uuid.uuid4(),
        months=0,
        amount_vnd=0,
        payment_code=generate_payment_code(),
        status="draft",
        contract_token=uuid.uuid4(),
    )
    defaults.update(overrides)
    return AdContract(**defaults)


def _ad(**overrides):
    defaults = dict(id=uuid.uuid4(), partner_name="Test Partner", title="Ad", tier_id=uuid.uuid4())
    defaults.update(overrides)
    return MarketplaceAd(**defaults)


class AcceptTests(unittest.TestCase):
    def test_accept_from_draft_sets_fields_and_status(self):
        contract = _draft_contract()
        accept(contract, months=3, amount_vnd=539000, signer_name=" Nguyen ", signer_ip="1.2.3.4", now=_now())
        self.assertEqual(contract.status, "accepted")
        self.assertEqual(contract.months, 3)
        self.assertEqual(contract.signer_name, "Nguyen")
        self.assertEqual(contract.accepted_at, _now())

    def test_accept_rejects_invalid_months(self):
        contract = _draft_contract()
        with self.assertRaises(ValueError):
            accept(contract, months=2, amount_vnd=1, signer_name="A", signer_ip=None, now=_now())

    def test_accept_rejects_non_draft(self):
        contract = _draft_contract(status="accepted")
        with self.assertRaises(ContractStateError):
            accept(contract, months=1, amount_vnd=1, signer_name="A", signer_ip=None, now=_now())


class IssueInstructionsTests(unittest.TestCase):
    def test_no_op_when_not_wired(self):
        contract = _draft_contract(status="accepted")
        with patch.dict(os.environ, _UNWIRED_ENV, clear=False):
            ok = issue_instructions(contract, now=_now())
        self.assertFalse(ok)
        self.assertEqual(contract.status, "accepted")
        self.assertIsNone(contract.payment_instructions_issued_at)

    def test_idempotent_when_already_awaiting_payment(self):
        issued_at = _now()
        contract = _draft_contract(status="awaiting_payment", payment_instructions_issued_at=issued_at)
        ok = issue_instructions(contract, now=datetime(2026, 9, 8, tzinfo=UTC))
        self.assertTrue(ok)
        self.assertEqual(contract.payment_instructions_issued_at, issued_at)  # 재세팅 안 됨

    def test_transitions_to_awaiting_payment_when_wired(self):
        # 설계문서 §7 성공기준 2: "3키 채우고 재조회 → awaiting_payment 로 올라감".
        contract = _draft_contract(status="accepted")
        now = _now()
        with patch.dict(os.environ, _WIRED_ENV, clear=False):
            ok = issue_instructions(contract, now=now)
        self.assertTrue(ok)
        self.assertEqual(contract.status, "awaiting_payment")
        self.assertEqual(contract.payment_instructions_issued_at, now)

    def test_issued_at_set_only_once_idempotent_when_wired(self):
        # 문서 규정 "최초 1회" — 배선된 상태에서 두 번 호출해도 issued_at 이 최초 값을 유지.
        contract = _draft_contract(status="accepted")
        first_call_now = _now()
        second_call_now = datetime(2026, 9, 8, tzinfo=UTC)
        with patch.dict(os.environ, _WIRED_ENV, clear=False):
            self.assertTrue(issue_instructions(contract, now=first_call_now))
            self.assertTrue(issue_instructions(contract, now=second_call_now))
        self.assertEqual(contract.status, "awaiting_payment")
        self.assertEqual(contract.payment_instructions_issued_at, first_call_now)


class ApproveTests(unittest.TestCase):
    def test_approve_requires_paid_or_partially_paid(self):
        contract = _draft_contract(status="accepted", months=3)
        ad = _ad(id=contract.ad_id)
        with self.assertRaises(ContractStateError):
            approve(contract, ad, actor="admin", now=_now())

    def test_partial_approve_requires_reason(self):
        contract = _draft_contract(status="partially_paid", months=3)
        ad = _ad(id=contract.ad_id)
        with self.assertRaises(ValueError):
            approve(contract, ad, actor="admin", now=_now())

    def test_approve_sets_period_and_ad_fields(self):
        contract = _draft_contract(status="paid", months=3)
        ad = _ad(id=contract.ad_id, paid_until=None, subscription_status="pending_payment")
        start, end = approve(contract, ad, actor="admin", now=_now())
        self.assertEqual(contract.status, "active")
        self.assertEqual(contract.approved_by, "admin")
        self.assertEqual(ad.paid_until, end)
        self.assertEqual(ad.subscription_status, "active")
        self.assertEqual(start, _now())

    def test_approve_rejects_mismatched_ad(self):
        # F-10: approve() 는 ad↔contract 대응을 확인해야 한다 — 엉뚱한 ad 로는 승인 불가.
        contract = _draft_contract(status="paid", months=3)
        other_ad = _ad()  # ad.id != contract.ad_id (독립 uuid4)
        with self.assertRaises(ContractStateError):
            approve(contract, other_ad, actor="admin", now=_now())
        self.assertIsNone(other_ad.paid_until)
        self.assertEqual(contract.status, "paid")

    def test_partial_approve_rejected_when_disallowed_by_constant(self):
        # F-6: ALLOW_PARTIAL_APPROVAL 을 approve() 가 실제로 읽는지 — False 면 사유가 있어도 거부.
        contract = _draft_contract(status="partially_paid", months=3)
        ad = _ad(id=contract.ad_id)
        with (
            patch("app.services.ad_payments.contracts.constants.ALLOW_PARTIAL_APPROVAL", False),
            self.assertRaises(ContractStateError),
        ):
            approve(contract, ad, actor="admin", now=_now(), reason="부족분 승인")


class CancelTests(unittest.TestCase):
    def test_cancel_requires_reason(self):
        contract = _draft_contract(status="draft")
        with self.assertRaises(ValueError):
            cancel(contract, reason="  ", now=_now())

    def test_cancel_rejects_active_or_refunded(self):
        for status in ("active", "refunded"):
            contract = _draft_contract(status=status)
            with self.assertRaises(ContractStateError):
                cancel(contract, reason="stop", now=_now())

    def test_cancel_rejects_when_deposits_outstanding(self):
        from types import SimpleNamespace

        contract = _draft_contract(status="awaiting_payment")
        deposits = [SimpleNamespace(kind="deposit", amount_vnd=100000)]
        with self.assertRaises(ContractStateError):
            cancel(contract, reason="stop", deposits=deposits, now=_now())

    def test_cancel_succeeds_with_no_net_deposits(self):
        contract = _draft_contract(status="draft")
        cancel(contract, reason="변심", now=_now())
        self.assertEqual(contract.status, "cancelled")
        self.assertEqual(contract.closed_reason, "변심")


class CloseRefundedTests(unittest.TestCase):
    def test_requires_active_status(self):
        contract = _draft_contract(status="paid")
        with self.assertRaises(ContractStateError):
            close_refunded(contract, reason="refund", deposits=[], now=_now())

    def test_requires_net_zero_deposits(self):
        from types import SimpleNamespace

        contract = _draft_contract(status="active")
        deposits = [SimpleNamespace(kind="deposit", amount_vnd=539000)]
        with self.assertRaises(ContractStateError):
            close_refunded(contract, reason="refund", deposits=deposits, now=_now())

    def test_succeeds_when_refund_offsets_deposit(self):
        from types import SimpleNamespace

        contract = _draft_contract(status="active")
        deposits = [
            SimpleNamespace(kind="deposit", amount_vnd=539000),
            SimpleNamespace(kind="refund", amount_vnd=539000),
        ]
        close_refunded(contract, reason="환불 요청", deposits=deposits, now=_now())
        self.assertEqual(contract.status, "refunded")


if __name__ == "__main__":
    unittest.main()
