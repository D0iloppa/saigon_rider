"""대조(reconcile) 규칙 회귀 (260907_ad_payment_pipeline_design.md §4-2, §8 P1-2 검증 항목 3).

reconcile_contract() 는 "이미 이 계약에 매칭된 입금건들을 보고 상태·플래그를 계산"하는 순수함수다.
§4-2 표의 8케이스 중 코드 매칭 자체(코드 누락/훼손, 타 계약 코드로 입금)는 port.py 의 매칭 책임
이라 test_ad_payment_port.py 에서 다룬다 — 여기서는 reconcile 이 담당하는 6케이스(정확 일치·부족·
초과·분할·중복 의심·타 계약 코드로 인한 payer 불일치→check_payer)와 환불을 검증한다.
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.services.ad_payments.reconcile import reconcile_contract


def _deposit(*, kind="deposit", amount_vnd, paid_at=None, payer_name=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        kind=kind,
        amount_vnd=amount_vnd,
        paid_at=paid_at or datetime.now(UTC),
        payer_name=payer_name,
    )


class ReconcileCasesTests(unittest.TestCase):
    def test_exact_match_is_paid_with_no_flags(self):
        result = reconcile_contract(expected_vnd=539000, deposits=[_deposit(amount_vnd=539000)])
        self.assertEqual(result.status, "paid")
        self.assertEqual(result.received_vnd, 539000)
        self.assertEqual(result.shortfall_vnd, 0)
        self.assertEqual(result.overpaid_vnd, 0)
        self.assertEqual(result.flags, frozenset())

    def test_shortfall_is_partially_paid(self):
        result = reconcile_contract(expected_vnd=539000, deposits=[_deposit(amount_vnd=300000)])
        self.assertEqual(result.status, "partially_paid")
        self.assertEqual(result.shortfall_vnd, 239000)
        self.assertEqual(result.overpaid_vnd, 0)

    def test_overpayment_is_paid_with_overpaid_flag(self):
        result = reconcile_contract(expected_vnd=539000, deposits=[_deposit(amount_vnd=600000)])
        self.assertEqual(result.status, "paid")
        self.assertIn("overpaid", result.flags)
        self.assertEqual(result.overpaid_vnd, 61000)

    def test_split_deposits_sum_to_paid(self):
        deposits = [_deposit(amount_vnd=200000), _deposit(amount_vnd=339000)]
        result = reconcile_contract(expected_vnd=539000, deposits=deposits)
        self.assertEqual(result.status, "paid")
        self.assertEqual(result.received_vnd, 539000)
        self.assertEqual(result.flags, frozenset())

    def test_duplicate_suspect_flag_for_same_amount_near_paid_at(self):
        base = datetime(2026, 9, 7, 10, 0, tzinfo=UTC)
        deposits = [
            _deposit(amount_vnd=539000, paid_at=base),
            _deposit(amount_vnd=539000, paid_at=base + timedelta(hours=2)),
        ]
        result = reconcile_contract(expected_vnd=539000, deposits=deposits)
        self.assertIn("duplicate_suspect", result.flags)

    def test_no_duplicate_suspect_when_paid_at_far_apart(self):
        base = datetime(2026, 9, 1, 10, 0, tzinfo=UTC)
        deposits = [
            _deposit(amount_vnd=270000, paid_at=base),
            _deposit(amount_vnd=270000, paid_at=base + timedelta(days=5)),
        ]
        result = reconcile_contract(expected_vnd=539000, deposits=deposits)
        self.assertNotIn("duplicate_suspect", result.flags)

    def test_wrong_contract_code_payer_mismatch_flags_check_payer(self):
        # 타 계약 코드로 입금된 케이스: 코드대로 매칭은 되지만(=이 계약에 연결됨) payer_name 이
        # 계약 업체명과 다르고 금액도 계약금액과 다르면 관리자 재배정 검토용 플래그를 세운다.
        result = reconcile_contract(
            expected_vnd=539000,
            deposits=[_deposit(amount_vnd=300000, payer_name="Someone Else")],
            partner_name="Test Partner",
        )
        self.assertIn("check_payer", result.flags)

    def test_matching_amount_still_flags_check_payer_when_payer_differs(self):
        # [중 6] 금액이 정확히 맞아도(가장 흔한 오입금 패턴: 다른 사람이 정확한 금액을 송금)
        # payer_name 이 다르면 독립적으로 flag 되어야 한다 — 이전엔 amount 일치가 flag 를 죽였다.
        exact_amount = reconcile_contract(
            expected_vnd=539000,
            deposits=[_deposit(amount_vnd=539000, payer_name="Someone Else")],
            partner_name="Test Partner",
        )
        self.assertIn("check_payer", exact_amount.flags)

    def test_matching_payer_does_not_flag_check_payer(self):
        matching_payer = reconcile_contract(
            expected_vnd=539000,
            deposits=[_deposit(amount_vnd=300000, payer_name="Test Partner")],
            partner_name="  test   partner  ",
        )
        self.assertNotIn("check_payer", matching_payer.flags)

    def test_refund_reduces_received_and_can_drop_to_awaiting_payment(self):
        deposits = [
            _deposit(kind="deposit", amount_vnd=539000),
            _deposit(kind="refund", amount_vnd=539000),
        ]
        result = reconcile_contract(expected_vnd=539000, deposits=deposits)
        self.assertEqual(result.received_vnd, 0)
        self.assertEqual(result.status, "awaiting_payment")

    def test_no_deposits_is_awaiting_payment(self):
        result = reconcile_contract(expected_vnd=539000, deposits=[])
        self.assertEqual(result.status, "awaiting_payment")
        self.assertEqual(result.received_vnd, 0)


if __name__ == "__main__":
    unittest.main()
