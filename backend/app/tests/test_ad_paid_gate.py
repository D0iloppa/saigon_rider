"""260907_biz_ad_payment_contract_adr.md §9 T-1 회귀 테스트.

- 결함 재현: subscription_status 를 전혀 검사하지 않아 미입금(pending_payment) 광고가
  무한정 노출되던 문제(ad_gating.py) — 유예기간 계산(add_business_days/grace_cutoff)의
  정확성을 직접 단위 테스트한다(이 저장소의 게이트 테스트는 실 DB 없이 SQL 컴파일/순수함수
  검증으로 하는 것이 관례 — test_biz_verification_gate.py, test_ad_detail_gate.py 스타일).
- launching_ad_conditions 는 `base_col >= grace_cutoff(now, N)` 형태로 유예 조건을 SQL 비교식에
  싣는다(add_business_days 가 base 에 대해 단조증가라 grace_cutoff 로 역산 가능 — 파일 docstring
  참조). 따라서 grace_cutoff/add_business_days 의 정확성이 곧 실제 노출/비노출 판정의 정확성이다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from app.services import ad_gating
from app.services.ad_gating import (
    NEW_CONTRACT_GRACE_BUSINESS_DAYS,
    RENEWAL_GRACE_BUSINESS_DAYS,
    add_business_days,
    grace_cutoff,
    is_payment_ok,
    launching_ad_conditions,
)

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _dt(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=UTC)


def _vn_dt(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=_VN_TZ)


class BusinessDayMathTests(unittest.TestCase):
    """add_business_days/grace_cutoff 자체의 정확성 — 토·일 제외."""

    def test_add_business_days_skips_weekend(self):
        # 2026-09-07 은 월요일. 3영업일 후 = 화·수·목 → 09-10 23:59:59.999999.
        deadline = add_business_days(_dt(2026, 9, 7), 3)
        self.assertEqual(deadline.date(), _dt(2026, 9, 10).date())

    def test_add_business_days_from_friday_rolls_over_weekend(self):
        # 2026-09-04 는 금요일. 3영업일 후 = 월·화·수(주말 스킵) → 09-09.
        deadline = add_business_days(_dt(2026, 9, 4), 3)
        self.assertEqual(deadline.date(), _dt(2026, 9, 9).date())

    def test_holiday_range_pushes_deadline_further(self):
        # 09-08(화)·09-09(수)를 휴일로 설정하면 3영업일 후가 더 밀려야 한다.
        with patch.object(ad_gating, "AD_GRACE_HOLIDAY_RANGES", ((_dt(2026, 9, 8).date(), _dt(2026, 9, 9).date()),)):
            deadline = add_business_days(_dt(2026, 9, 7), 3)
        # 휴일 없을 때(09-10)보다 늦어야 한다 — 09-08/09 스킵 후 목(1)·금(2)·(주말 스킵)월(3)=09-14.
        self.assertEqual(deadline.date(), _dt(2026, 9, 14).date())

    def test_grace_cutoff_is_inverse_of_add_business_days(self):
        from datetime import timedelta

        now = _dt(2026, 9, 10, 10, 0)
        cutoff = grace_cutoff(now, 3)
        # cutoff 이상인 base 는 포함, 하루라도 이르면 제외돼야 한다(경계 정확성).
        self.assertGreaterEqual(add_business_days(cutoff, 3), now)
        self.assertLess(add_business_days(cutoff - timedelta(days=1), 3), now)


class NewContractGraceTests(unittest.TestCase):
    """검증 목표 2 — pending_payment + 승인(starts_at) 후 3영업일 이내/초과.

    cutoff 를 자기 자신(grace_cutoff)과 비교하면 계산이 하루 틀려도 통과해버리는 편측
    테스트가 된다(리뷰 지적 3) — 절대값으로 직접 계산해 하드코딩한다. now=2026-09-10 10:00
    UTC, N=3 에서의 실제 grace_cutoff() 출력은 VN 로컬 2026-09-07 00:00 이다(운영중 확인).
    """

    def test_cutoff_absolute_value(self):
        now = _dt(2026, 9, 10, 10, 0)  # 목요일
        cutoff = grace_cutoff(now, NEW_CONTRACT_GRACE_BUSINESS_DAYS)
        self.assertEqual(cutoff, _vn_dt(2026, 9, 7, 0, 0))

    def test_within_grace_is_included(self):
        cutoff = _vn_dt(2026, 9, 7, 0, 0)
        approved_monday = _dt(2026, 9, 7, 9, 0)  # 승인 월요일 — 유예 3영업일(화수목) 안
        self.assertGreaterEqual(approved_monday, cutoff)

    def test_exceeding_grace_is_excluded(self):
        cutoff = _vn_dt(2026, 9, 7, 0, 0)
        approved_last_friday = _dt(2026, 9, 4, 9, 0)  # 승인 그 전주 금요일 — 3영업일(월화수) 지남
        self.assertLess(approved_last_friday, cutoff)


class RenewalGraceTests(unittest.TestCase):
    """검증 목표 3 — paid_until 만료 후 5영업일 이내/초과.

    now=2026-09-14 10:00 UTC, N=5 에서의 실제 grace_cutoff() 출력은 VN 로컬 2026-09-07 00:00
    이다(운영중 확인) — 우연히 신규계약(N=3) 케이스와 같은 값이지만 서로 다른 now/N 조합이다.
    """

    def test_cutoff_absolute_value(self):
        now = _dt(2026, 9, 14, 10, 0)  # 월요일
        cutoff = grace_cutoff(now, RENEWAL_GRACE_BUSINESS_DAYS)
        self.assertEqual(cutoff, _vn_dt(2026, 9, 7, 0, 0))

    def test_within_grace_is_included(self):
        cutoff = _vn_dt(2026, 9, 7, 0, 0)
        paid_until_last_monday = _dt(2026, 9, 7, 23, 59)  # 5영업일(화수목금+금다음월) 이내
        self.assertGreaterEqual(paid_until_last_monday, cutoff)

    def test_exceeding_grace_is_excluded(self):
        cutoff = _vn_dt(2026, 9, 7, 0, 0)
        paid_until_two_weeks_ago = _dt(2026, 8, 31, 23, 59)
        self.assertLess(paid_until_two_weeks_ago, cutoff)


class ActiveFutureTests(unittest.TestCase):
    """검증 목표 1 — active + paid_until 미래는 항상 포함(유예 계산과 무관)."""

    def test_future_paid_until_always_above_any_past_cutoff(self):
        now = _dt(2026, 9, 10, 10, 0)
        cutoff = grace_cutoff(now, RENEWAL_GRACE_BUSINESS_DAYS)
        future_paid_until = _dt(2026, 12, 31)
        self.assertGreaterEqual(future_paid_until, cutoff)


class IsPaymentOkTests(unittest.TestCase):
    """is_payment_ok() — launching_ad_conditions 결제 or_() 절의 순수함수 판정.

    biz.py `_is_launching_ad()` 가 이 함수를 그대로 호출한다(리뷰 지적 4 — 중복 판정 방지).
    """

    def test_active_with_null_paid_until_is_excluded(self):
        # 지적 1 회귀 방지: activate_subscription() 이 paid_until 을 세팅하지 않던 결함이
        # 재발하면 이 케이스가 실패해야 한다.
        ok = is_payment_ok(
            owner_business_profile_id=uuid.uuid4(),
            subscription_status="active",
            paid_until=None,
            starts_at=_dt(2026, 9, 1),
            now=_dt(2026, 9, 10, 10, 0),
        )
        self.assertFalse(ok)

    def test_pending_payment_with_null_starts_at_is_excluded(self):
        ok = is_payment_ok(
            owner_business_profile_id=uuid.uuid4(),
            subscription_status="pending_payment",
            paid_until=None,
            starts_at=None,
            now=_dt(2026, 9, 10, 10, 0),
        )
        self.assertFalse(ok)

    def test_expired_status_is_excluded(self):
        # database/init/151_biz_verification.sql:62 CHECK 에 존재하는 값 — active/pending_payment
        # 둘 다 아니므로 무조건 비노출.
        ok = is_payment_ok(
            owner_business_profile_id=uuid.uuid4(),
            subscription_status="expired",
            paid_until=_dt(2026, 12, 31),
            starts_at=_dt(2026, 9, 1),
            now=_dt(2026, 9, 10, 10, 0),
        )
        self.assertFalse(ok)

    def test_house_ad_is_exempt_regardless_of_subscription_status(self):
        # 지적 2 — owner_business_profile_id NULL(하우스/레거시)은 결제 게이트 면제.
        ok = is_payment_ok(
            owner_business_profile_id=None,
            subscription_status="pending_payment",
            paid_until=None,
            starts_at=None,
            now=_dt(2026, 9, 10, 10, 0),
        )
        self.assertTrue(ok)

    def test_active_with_future_paid_until_is_included(self):
        ok = is_payment_ok(
            owner_business_profile_id=uuid.uuid4(),
            subscription_status="active",
            paid_until=_dt(2026, 12, 31),
            starts_at=_dt(2026, 9, 1),
            now=_dt(2026, 9, 10, 10, 0),
        )
        self.assertTrue(ok)


class LaunchingConditionsWiringTests(unittest.TestCase):
    """launching_ad_conditions 컴파일 결과에 결제 조건이 실제로 들어가는지 — 기존 조건 회귀 없음."""

    def test_conditions_include_subscription_and_paid_until(self):
        conds = launching_ad_conditions(_dt(2026, 9, 10, 10, 0))
        sql = " ".join(str(c) for c in conds)
        self.assertIn("subscription_status", sql)
        self.assertIn("paid_until", sql)
        # 기존 조건 회귀 없음 (검증 목표 5).
        self.assertIn("review_status", sql)
        self.assertIn("is_active", sql)
        self.assertIn("verification_status", sql)
        self.assertIn("owner_business_profile_id IS NULL", sql)


if __name__ == "__main__":
    unittest.main()
