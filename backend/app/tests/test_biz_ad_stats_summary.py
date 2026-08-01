"""광고 성과 대시보드 요약(GET /biz/profiles/{id}/ad-stats-summary) 회귀 테스트.

ai-docs/spec/ad-performance-metrics.md §7/§8 B-9 구현 검증:
- 오너십: 남의 profile_id 로 조회 시 거부(404), 광고 조회조차 하지 않는다.
- 광고 0건이면 200 + state="no_ads" (에러 아님).
- ad_daily_stats 가 비어 있어도(수집 파이프라인 미구현) 200 + 0 값 (에러 아님).
- MIN_SAMPLE_FOR_RATIO 게이트: 노출 100 미만이면 CTR/CPA 등 비율·비용 지표를 숨긴다.

기존 test_biz_favorite_count.py 스타일 미러 — 라우터 함수를 직접 호출, DB 는 MagicMock.
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.models import BusinessProfile, MarketplaceAd
from app.routers import biz


def _profile(user_id: uuid.UUID) -> BusinessProfile:
    return BusinessProfile(id=uuid.uuid4(), user_id=user_id, name="Shop", status="APPROVED")


def _ads_db(profile: BusinessProfile, ads: list[MarketplaceAd], summary_row: tuple):
    """db.get → 프로필, 첫 execute → 광고 목록, 두번째 execute → 롤업 합산 튜플."""
    db = MagicMock()
    db.get = AsyncMock(return_value=profile)

    ads_result = MagicMock()
    ads_result.scalars.return_value.all.return_value = ads

    summary_result = MagicMock()
    summary_result.one.return_value = summary_row

    db.execute = AsyncMock(side_effect=[ads_result, summary_result])
    return db


class AdStatsSummaryOwnershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_other_users_profile(self):
        owner_id = uuid.uuid4()
        requester_id = uuid.uuid4()
        profile = _profile(owner_id)
        db = MagicMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await biz.get_ad_stats_summary(profile.id, "7d", db, requester_id)

        self.assertEqual(ctx.exception.status_code, 404)
        db.execute.assert_not_awaited()  # 소유권 검증에서 막혀 광고 조회조차 안 감


class AdStatsSummaryEmptyStateTests(unittest.IsolatedAsyncioTestCase):
    async def test_no_ads_returns_empty_state_not_error(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        db = _ads_db(profile, [], (0, 0, 0, 0, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertEqual(out.state, "no_ads")
        self.assertEqual(out.impressions, 0)

    async def test_pending_ad_returns_pending_state(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=uuid.uuid4(),
            owner_business_profile_id=profile.id,
            review_status="PENDING",
            subscription_status="pending_payment",
            is_active=True,
            is_ongoing=True,
            starts_at=None,
            ends_at=None,
            monthly_price_snapshot_vnd=199_000,
            created_at=datetime.now(UTC),
        )
        db = _ads_db(profile, [ad], (0, 0, 0, 0, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertEqual(out.state, "pending")
        self.assertIsNone(out.ctr)

    async def test_launched_under_24h_returns_warming_up(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        now = datetime.now(UTC)
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=uuid.uuid4(),
            owner_business_profile_id=profile.id,
            review_status="APPROVED",
            subscription_status="active",
            is_active=True,
            is_ongoing=True,
            starts_at=now - timedelta(hours=2),
            ends_at=None,
            monthly_price_snapshot_vnd=199_000,
            created_at=now - timedelta(hours=2),
        )
        db = _ads_db(profile, [ad], (0, 0, 0, 0, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertEqual(out.state, "warming_up")

    async def test_ended_ad_keeps_data_visible_with_ended_flag(self):
        """§7-3 F — 게시 중지돼도 마지막 집계까지의 성과는 감추지 않는다(읽기 전용 + 배지만 추가)."""
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        now = datetime.now(UTC)
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=uuid.uuid4(),
            owner_business_profile_id=profile.id,
            review_status="APPROVED",
            subscription_status="active",
            is_active=False,  # 광고주가 게시 중단
            is_ongoing=True,
            starts_at=now - timedelta(days=10),
            ends_at=None,
            monthly_price_snapshot_vnd=199_000,
            created_at=now - timedelta(days=10),
        )
        db = _ads_db(profile, [ad], (150, 80, 6, 2, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertTrue(out.is_ended)
        self.assertEqual(out.state, "normal")  # 표본 충분 — 게시 종료여도 비율 계산은 유지
        self.assertIsNotNone(out.ctr)
        self.assertEqual(out.impressions, 150)


class AdStatsSummaryRatioGateTests(unittest.IsolatedAsyncioTestCase):
    def _running_ad(self, profile_id, monthly_price=199_000):
        now = datetime.now(UTC)
        return MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=uuid.uuid4(),
            owner_business_profile_id=profile_id,
            review_status="APPROVED",
            subscription_status="active",
            is_active=True,
            is_ongoing=True,
            starts_at=now - timedelta(days=10),
            ends_at=None,
            monthly_price_snapshot_vnd=monthly_price,
            created_at=now - timedelta(days=10),
        )

    async def test_below_min_sample_hides_ratio_and_cost(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        ad = self._running_ad(profile.id)
        # 노출 99 < MIN_SAMPLE_FOR_RATIO(100)
        db = _ads_db(profile, [ad], (99, 40, 3, 0, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertEqual(out.state, "low_sample")
        self.assertIsNone(out.ctr)
        self.assertIsNone(out.cpa_vnd)
        self.assertEqual(out.impressions, 99)  # 절대 숫자는 표시

    async def test_at_or_above_min_sample_shows_ratio_and_cost(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        ad = self._running_ad(profile.id)
        db = _ads_db(profile, [ad], (100, 60, 5, 1, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertEqual(out.state, "normal")
        self.assertIsNotNone(out.ctr)
        self.assertIsNotNone(out.cpa_vnd)


class AdStatsSummaryAdSpendTests(unittest.IsolatedAsyncioTestCase):
    """HIGH-2/MEDIUM-1/MEDIUM-2 — 광고비 교집합 합산 회귀 (ai-docs/spec/ad-performance-metrics.md)."""

    def _launched_ad(
        self,
        profile_id,
        *,
        monthly_price=199_000,
        starts_at,
        ends_at=None,
        review_status="APPROVED",
        subscription_status="active",
        is_active=True,
        created_at=None,
    ):
        return MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=uuid.uuid4(),
            owner_business_profile_id=profile_id,
            review_status=review_status,
            subscription_status=subscription_status,
            is_active=is_active,
            is_ongoing=True,
            starts_at=starts_at,
            ends_at=ends_at,
            monthly_price_snapshot_vnd=monthly_price,
            created_at=created_at or (starts_at or datetime.now(UTC)),
        )

    async def test_multiple_ads_spend_sums_overlap_days(self):
        """광고 2건이 같은 기간 게시 중이면 ad_spend 는 두 광고의 교집합 합계와 일치해야 한다."""
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        now = datetime.now(UTC)
        ad1 = self._launched_ad(profile.id, monthly_price=199_000, starts_at=now - timedelta(days=10))
        ad2 = self._launched_ad(profile.id, monthly_price=499_000, starts_at=now - timedelta(days=10))
        db = _ads_db(profile, [ad1, ad2], (150, 80, 6, 2, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertEqual(out.state, "normal")
        # 7d 기간 전체가 두 광고 게시기간과 겹침 -> 각 30일 정규화 7일치 합산
        expected = round(199_000 * 7 / 30 + 499_000 * 7 / 30)
        self.assertEqual(out.ad_spend_vnd, expected)

    async def test_never_launched_ad_excluded_from_spend(self):
        """심사중(PENDING) 광고는 게시된 적이 없으므로 비용에 포함되지 않는다."""
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        now = datetime.now(UTC)
        pending_ad = self._launched_ad(
            profile.id,
            monthly_price=999_000,
            starts_at=None,
            review_status="PENDING",
            subscription_status="pending_payment",
            created_at=now - timedelta(days=1),
        )
        active_ad = self._launched_ad(profile.id, monthly_price=199_000, starts_at=now - timedelta(days=10))
        db = _ads_db(profile, [pending_ad, active_ad], (150, 80, 6, 2, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        expected = round(199_000 * 7 / 30)  # pending_ad 의 999_000 은 합산되지 않음
        self.assertEqual(out.ad_spend_vnd, expected)

    async def test_period_all_with_null_starts_at_uses_created_at(self):
        """period='all' + starts_at NULL 이면 created_at 기준으로 계산하고 1일로 뭉개지지 않는다."""
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        now = datetime.now(UTC)
        ad = self._launched_ad(profile.id, monthly_price=300_000, starts_at=None, created_at=now - timedelta(days=15))
        db = _ads_db(profile, [ad], (200, 90, 6, 2, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "all", db, owner_id)

        self.assertEqual(out.state, "normal")
        expected = round(300_000 * 16 / 30)  # 15일 전 생성 ~ 오늘까지 16일치
        self.assertEqual(out.ad_spend_vnd, expected)
        self.assertNotEqual(out.ad_spend_vnd, round(300_000 * 1 / 30))  # 과거처럼 1일로 뭉개지지 않음

    async def test_ended_ad_excludes_days_after_end_from_spend(self):
        """is_ended + period=7d 에서 종료일 이후 기간은 비용에 포함되지 않는다."""
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        now = datetime.now(UTC)
        ad = self._launched_ad(
            profile.id,
            monthly_price=199_000,
            starts_at=now - timedelta(days=30),
            ends_at=now - timedelta(days=10),
        )
        db = _ads_db(profile, [ad], (150, 80, 6, 2, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertTrue(out.is_ended)
        self.assertEqual(out.state, "normal")
        self.assertEqual(out.ad_spend_vnd, 0)  # 광고 종료일이 조회기간(최근 7일) 이전 -> 교집합 없음

    async def test_warming_up_applies_when_starts_at_null_uses_created_at(self):
        """MEDIUM-2 — starts_at 이 NULL 이어도 created_at 기준 24시간 이내면 warming_up."""
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        now = datetime.now(UTC)
        ad = self._launched_ad(profile.id, monthly_price=199_000, starts_at=None, created_at=now - timedelta(hours=5))
        db = _ads_db(profile, [ad], (0, 0, 0, 0, 0, 0, 0, 0))

        out = await biz.get_ad_stats_summary(profile.id, "7d", db, owner_id)

        self.assertEqual(out.state, "warming_up")


if __name__ == "__main__":
    unittest.main()
