"""승인 시 유료 기간 산출 회귀 (260907_ad_payment_pipeline_design.md §4-3, §8 P1-2 검증 항목 4).

compute_period(): 최초 계약 / 만료 전 갱신 / 유예 내 갱신 / 유예 지난 뒤 재계약 / 말일 클램프.
grace 컷오프 계산 자체(add_business_days/grace_cutoff)는 test_ad_paid_gate.py 가 이미 검증하므로,
여기서는 compute_period 가 그 컷오프를 올바르게 소비하는지만 본다.
"""

import unittest
from datetime import UTC, datetime

from app.services.ad_gating import RENEWAL_GRACE_BUSINESS_DAYS, grace_cutoff
from app.services.ad_payments.contracts import compute_period


def _dt(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=UTC)


class ComputePeriodTests(unittest.TestCase):
    def test_first_contract_starts_now(self):
        now = _dt(2026, 9, 7, 10, 0)
        start, end = compute_period(prev_paid_until=None, months=3, now=now)
        self.assertEqual(start, now)
        self.assertEqual(end, _dt(2026, 12, 7, 10, 0))

    def test_renewal_before_expiry_continues_from_prev_paid_until(self):
        # 2026-09-07(월) 승인 시점에 prev_paid_until 이 아직 미래(만료 전 갱신) → 이어붙임.
        now = _dt(2026, 9, 7, 10, 0)
        prev_paid_until = _dt(2026, 9, 20)
        start, end = compute_period(prev_paid_until=prev_paid_until, months=1, now=now)
        self.assertEqual(start, prev_paid_until)
        self.assertEqual(end, _dt(2026, 10, 20))

    def test_renewal_within_grace_period_continues_from_prev_paid_until(self):
        now = _dt(2026, 9, 7, 10, 0)
        # RENEWAL_GRACE_BUSINESS_DAYS(5영업일) 컷오프 안쪽의 과거 만료일 — 유예 내 갱신.
        grace_floor = grace_cutoff(now, RENEWAL_GRACE_BUSINESS_DAYS)
        prev_paid_until = grace_floor  # 컷오프 경계값 자체는 "유예 내"(>=)로 포함된다.
        start, _end = compute_period(prev_paid_until=prev_paid_until, months=6, now=now)
        self.assertEqual(start, prev_paid_until)

    def test_renewal_after_grace_period_starts_now(self):
        now = _dt(2026, 9, 7, 10, 0)
        # 유예 컷오프보다도 더 과거인 만료일 — 유예를 넘겨 끊긴 뒤 재계약.
        grace_floor = grace_cutoff(now, RENEWAL_GRACE_BUSINESS_DAYS)
        prev_paid_until = grace_floor.replace(year=grace_floor.year - 1)
        start, end = compute_period(prev_paid_until=prev_paid_until, months=1, now=now)
        self.assertEqual(start, now)
        self.assertEqual(end, _dt(2026, 10, 7, 10, 0))

    def test_month_end_clamp_jan31_plus_one_month_is_feb28(self):
        now = _dt(2026, 1, 31, 9, 0)
        _start, end = compute_period(prev_paid_until=None, months=1, now=now)
        self.assertEqual(end, _dt(2026, 2, 28, 9, 0))

    def test_month_end_clamp_leap_year_feb29(self):
        now = _dt(2028, 1, 31, 9, 0)  # 2028 은 윤년
        _start, end = compute_period(prev_paid_until=None, months=1, now=now)
        self.assertEqual(end, _dt(2028, 2, 29, 9, 0))

    def test_month_end_clamp_across_year_boundary(self):
        now = _dt(2026, 12, 31, 9, 0)
        _start, end = compute_period(prev_paid_until=None, months=3, now=now)
        self.assertEqual(end, _dt(2027, 3, 31, 9, 0))


if __name__ == "__main__":
    unittest.main()
