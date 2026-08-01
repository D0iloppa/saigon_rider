"""광고 성과 시계열(GET /biz/profiles/{id}/ad-stats-series) 회귀 테스트.

ai-docs/spec/ad-performance-metrics.md 기반 W2 발주 검증 목표:
- 오너십: 남의 profile_id 로 조회 시 거부(404), 광고 조회조차 하지 않는다.
- 데이터 0건이어도 200 + 기간 일수만큼 0 으로 채워진 series (구멍 없음).
- previous 는 직전 동일 길이 기간을 정확히 집계 (경계 — 겹치지 않음).
- MIN_SAMPLE_FOR_RATIO 게이트: totals.impressions 미달이면 ctr/cvr/cpm/cpc/cpa 전부 None.
- by_ad 의 spend_vnd 합이 전체 spend_vnd 와 일치.
- 기존 ad-stats-summary 응답은 변경되지 않는다(회귀).

기존 test_biz_ad_stats_summary.py 스타일 미러 — 라우터 함수를 직접 호출, DB 는 MagicMock.
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


def _running_ad(profile_id, monthly_price=199_000, days_running=10, title="Ad"):
    now = datetime.now(UTC)
    return MarketplaceAd(
        id=uuid.uuid4(),
        partner_name="Shop",
        title=title,
        tier_id=uuid.uuid4(),
        owner_business_profile_id=profile_id,
        review_status="APPROVED",
        subscription_status="active",
        is_active=True,
        is_ongoing=True,
        starts_at=now - timedelta(days=days_running),
        ends_at=None,
        monthly_price_snapshot_vnd=monthly_price,
        created_at=now - timedelta(days=days_running),
    )


def _series_db(profile, ads, daily_rows=(), previous_row=(0, 0, 0, 0, 0), by_ad_rows=()):
    """db.get → 프로필, execute 순서: 광고목록 → (있으면) 일별 → 직전기간 → 광고별 분해."""
    db = MagicMock()
    db.get = AsyncMock(return_value=profile)

    ads_result = MagicMock()
    ads_result.scalars.return_value.all.return_value = ads

    side_effects = [ads_result]
    if ads:
        daily_result = MagicMock()
        daily_result.all.return_value = list(daily_rows)
        prev_result = MagicMock()
        prev_result.one.return_value = previous_row
        by_ad_result = MagicMock()
        by_ad_result.all.return_value = list(by_ad_rows)
        side_effects += [daily_result, prev_result, by_ad_result]

    db.execute = AsyncMock(side_effect=side_effects)
    return db


class AdStatsSeriesOwnershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_other_users_profile(self):
        owner_id = uuid.uuid4()
        requester_id = uuid.uuid4()
        profile = _profile(owner_id)
        db = MagicMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await biz.get_ad_stats_series(profile.id, "7d", db, requester_id)

        self.assertEqual(ctx.exception.status_code, 404)
        db.execute.assert_not_awaited()  # 소유권 검증에서 막혀 광고 조회조차 안 감


class AdStatsSeriesEmptyStateTests(unittest.IsolatedAsyncioTestCase):
    async def test_no_ads_returns_zero_filled_series_not_empty(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        db = _series_db(profile, [])

        out = await biz.get_ad_stats_series(profile.id, "7d", db, owner_id)

        self.assertEqual(len(out.series), 7)  # 구멍 없이 7일 전부 채워짐
        self.assertTrue(all(p.impressions == 0 for p in out.series))
        self.assertEqual(out.totals.impressions, 0)
        self.assertEqual(out.by_ad, [])
        self.assertEqual(out.spend_vnd, 0)

    async def test_invalid_period_rejected(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        db = _series_db(profile, [])

        with self.assertRaises(HTTPException) as ctx:
            await biz.get_ad_stats_series(profile.id, "all", db, owner_id)

        self.assertEqual(ctx.exception.status_code, 400)


class AdStatsSeriesFillTests(unittest.IsolatedAsyncioTestCase):
    async def test_series_covers_full_period_with_gaps_zeroed(self):
        """데이터가 있는 날과 없는 날이 섞여도 기간 전체 일수만큼 배열이 채워진다."""
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        ad = _running_ad(profile.id)
        today = datetime.now(biz._VN_TZ).date()
        only_today_row = (today, 50, 30, 4, 1, 0, 0, 0, 0)
        db = _series_db(profile, [ad], daily_rows=[only_today_row])

        out = await biz.get_ad_stats_series(profile.id, "7d", db, owner_id)

        self.assertEqual(len(out.series), 7)
        self.assertEqual(out.series[-1].date, today)
        self.assertEqual(out.series[-1].impressions, 50)
        self.assertEqual(out.series[-1].cta_primary, 1)  # call(1)+follow(0)+fav(0)+review(0)
        # 나머지 6일은 데이터 없음 -> 0
        self.assertTrue(all(p.impressions == 0 for p in out.series[:-1]))
        self.assertEqual(out.totals.impressions, 50)


class AdStatsSeriesPreviousBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_previous_period_does_not_overlap_current(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        ad = _running_ad(profile.id)
        db = _series_db(profile, [ad], previous_row=(200, 100, 8, 3, 0))

        out = await biz.get_ad_stats_series(profile.id, "7d", db, owner_id)

        self.assertEqual(out.previous.impressions, 200)
        self.assertEqual(out.previous.clicks, 8)
        self.assertEqual(out.previous.cta_primary, 3)

        # 경계 검증: previous 쿼리가 실제로 [prev_start, prev_end] 를 쓰고 current period 와 안 겹침
        prev_stmt = db.execute.await_args_list[2].args[0]  # ads, daily, previous 순
        compiled = str(prev_stmt.compile(compile_kwargs={"literal_binds": True}))
        today = datetime.now(biz._VN_TZ).date()
        start_date = today - timedelta(days=6)
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=6)
        self.assertIn(str(prev_start), compiled)
        self.assertIn(str(prev_end), compiled)
        self.assertNotIn(str(start_date), compiled)  # 이번 기간 시작일은 previous 쿼리에 안 나와야 함(안 겹침)


class AdStatsSeriesRatioGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_below_min_sample_hides_ratio_and_cost(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        ad = _running_ad(profile.id)
        today = datetime.now(biz._VN_TZ).date()
        db = _series_db(profile, [ad], daily_rows=[(today, 99, 40, 3, 0, 0, 0, 0, 0)])

        out = await biz.get_ad_stats_series(profile.id, "7d", db, owner_id)

        self.assertIsNone(out.ctr)
        self.assertIsNone(out.cpa_vnd)
        self.assertEqual(out.totals.impressions, 99)  # 절대 숫자는 표시

    async def test_at_or_above_min_sample_shows_ratio_and_cost(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        ad = _running_ad(profile.id)
        today = datetime.now(biz._VN_TZ).date()
        db = _series_db(
            profile,
            [ad],
            daily_rows=[(today, 100, 60, 5, 1, 0, 0, 0, 0)],
            by_ad_rows=[(ad.id, 100, 60, 5, 1)],
        )

        out = await biz.get_ad_stats_series(profile.id, "7d", db, owner_id)

        self.assertIsNotNone(out.ctr)
        self.assertIsNotNone(out.cpa_vnd)


class AdStatsSeriesByAdTests(unittest.IsolatedAsyncioTestCase):
    async def test_by_ad_spend_sums_to_total_spend(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id)
        ad1 = _running_ad(profile.id, monthly_price=199_000, title="Ad 1")
        ad2 = _running_ad(profile.id, monthly_price=499_000, title="Ad 2")
        db = _series_db(
            profile,
            [ad1, ad2],
            by_ad_rows=[(ad1.id, 80, 40, 3, 1), (ad2.id, 120, 60, 5, 2)],
        )

        out = await biz.get_ad_stats_series(profile.id, "7d", db, owner_id)

        self.assertEqual(len(out.by_ad), 2)
        self.assertEqual(out.spend_vnd, sum(item.spend_vnd for item in out.by_ad))
        titles = {item.title for item in out.by_ad}
        self.assertEqual(titles, {"Ad 1", "Ad 2"})


if __name__ == "__main__":
    unittest.main()
