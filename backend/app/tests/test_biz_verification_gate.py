"""init/151 광고주 중간 검증 회귀 테스트.

- 유료게시 게이트: 노출 조건(launching_ad_conditions)이 소유 파트너 verified 를 요구한다
  (owner_business_profile_id NULL 레거시/하우스 광고는 면제).
- is_ongoing=true → ends_at 무시(null). is_ongoing=false → ends_at 보존.
- 승인 시점에 서버가 starts_at 을 세팅한다(광고주 미입력).

DB 를 붙이지 않는 기존 test_ads_application 스타일 미러 — SQL 조건 문자열 검사 + Fake 세션.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from app.models import AdTier, MarketplaceAd
from app.modules.ads.application import AdsApplication
from app.services.ad_gating import launching_ad_conditions


class FakeSession:
    def __init__(self, tier):
        self.tier = tier
        self.added = None

    async def get(self, model, item_id):
        return self.tier if item_id == self.tier.id else None

    def add(self, value):
        self.added = value

    async def commit(self):
        return None

    async def refresh(self, value):
        return None


class ModelSession:
    def __init__(self, ad, tier):
        self.ad = ad
        self.tier = tier

    async def get(self, model, item_id):
        if model is MarketplaceAd and item_id == self.ad.id:
            return self.ad
        if model is AdTier and item_id == self.tier.id:
            return self.tier
        return None

    async def commit(self):
        return None

    async def refresh(self, value):
        return None


class VerificationGateConditionTests(unittest.TestCase):
    def test_launching_gate_requires_verified_owner(self):
        conds = launching_ad_conditions(datetime(2026, 7, 25, tzinfo=UTC))
        sql = " ".join(str(c) for c in conds)
        # 소유 파트너 verified EXISTS 게이트가 노출 조건에 포함돼야 한다.
        self.assertIn("business_profile", sql)
        self.assertIn("verification_status", sql)
        # NULL 소유(레거시/하우스 광고) 면제 분기.
        self.assertIn("owner_business_profile_id IS NULL", sql)
        # 기존 게이트도 그대로.
        self.assertIn("review_status", sql)
        self.assertIn("is_active", sql)


class _EmptyResult:
    def all(self):
        return []

    def one(self):
        # dashboard_stats 의 5-튜플 언팩용.
        return (0, 0, 0, 0, 0)


class CompileCaptureSession:
    """execute 시 statement 를 실제 컴파일한다 — auto-correlation 500 은 컴파일 시점에 raise 된다."""

    def __init__(self):
        self.compiled: list[str] = []

    async def execute(self, statement):
        self.compiled.append(str(statement.compile()))
        return _EmptyResult()

    async def get(self, model, item_id):
        return None


class GateAutoCorrelationTests(unittest.IsolatedAsyncioTestCase):
    """launching_ad_conditions 의 verified EXISTS 게이트가 4개 소비처 전부에서 컴파일돼야 한다.

    특히 list_admin_ads(launching=True) 는 BusinessProfile 을 외부 outerjoin 에 두므로,
    게이트 서브쿼리가 alias 없이 BusinessProfile 을 참조하면 auto-correlate 로 FROM 이 소실돼
    InvalidRequestError(500)가 난다. 문자열 검사만 하던 기존 테스트는 이를 못 잡았다.
    """

    async def test_admin_launching_query_compiles(self):
        db = CompileCaptureSession()
        # BusinessProfile 이 외부 FROM 에 있는 형태 — 버그 재현 지점.
        await AdsApplication(db).list_admin_ads(status=None, profile_id=None, launching=True)
        self.assertTrue(any("EXISTS" in sql for sql in db.compiled))

    async def test_all_four_consumers_compile(self):
        now = datetime(2026, 7, 25, tzinfo=UTC)
        await AdsApplication(CompileCaptureSession()).public_ads(district_id=1)
        await AdsApplication(CompileCaptureSession()).profile_public_ads(uuid.uuid4())
        await AdsApplication(CompileCaptureSession()).list_admin_ads(status=None, profile_id=None, launching=True)
        await AdsApplication(CompileCaptureSession()).dashboard_stats(now, now)


class OngoingAndStartAtTests(unittest.IsolatedAsyncioTestCase):
    def _tier(self):
        return SimpleNamespace(
            id=uuid.uuid4(), name="Premium", monthly_price_vnd=199_000, exposure_weight=1, is_active=True
        )

    def _profile(self):
        return SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4(), name="Shop", phone="0900", address="HCMC")

    async def test_ongoing_ad_ignores_ends_at(self):
        tier = self._tier()
        profile = self._profile()
        ad = await AdsApplication(FakeSession(tier)).create_ad(
            profile=profile,
            user_id=profile.user_id,
            tier_id=tier.id,
            title="Ad",
            body=None,
            image_content_id=uuid.uuid4(),
            is_ongoing=True,
            ends_at=datetime(2026, 12, 31, tzinfo=UTC),
        )
        self.assertTrue(ad.is_ongoing)
        self.assertIsNone(ad.ends_at)
        self.assertIsNone(ad.starts_at)  # 광고주 미입력
        self.assertEqual(ad.subscription_status, "pending_payment")

    async def test_scheduled_ad_keeps_ends_at(self):
        tier = self._tier()
        profile = self._profile()
        ends = datetime(2026, 12, 31, tzinfo=UTC)
        ad = await AdsApplication(FakeSession(tier)).create_ad(
            profile=profile,
            user_id=profile.user_id,
            tier_id=tier.id,
            title="Ad",
            body=None,
            image_content_id=uuid.uuid4(),
            is_ongoing=False,
            ends_at=ends,
        )
        self.assertFalse(ad.is_ongoing)
        self.assertEqual(ad.ends_at, ends)

    async def test_approve_sets_starts_at(self):
        tier = AdTier(id=uuid.uuid4(), name="P", monthly_price_vnd=0, exposure_weight=1, is_active=True)
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=tier.id,
            tier=tier,
            ad_fee=1,
            monthly_price_snapshot_vnd=0,
            review_status="PENDING",
            is_active=True,
            is_ongoing=True,
            subscription_status="pending_payment",
            starts_at=None,
            sort_order=0,
        )
        read, _owner = await AdsApplication(ModelSession(ad, tier)).approve(ad.id)
        self.assertEqual(read.review_status, "APPROVED")
        self.assertIsNotNone(ad.starts_at)


if __name__ == "__main__":
    unittest.main()
