import unittest
import uuid
from types import SimpleNamespace

from app.models import AdTier, BusinessProfile, MarketplaceAd
from app.modules.ads.application import AdsApplication, AdsError
from app.routers.admin_api.biz import AdTierBody


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


class FakeRows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class QuerySession:
    def __init__(self, rows):
        self.rows = rows
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return FakeRows(self.rows)


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


class AdsApplicationTests(unittest.IsolatedAsyncioTestCase):
    def test_tier_policy_input_is_trimmed_and_bounded(self):
        body = AdTierBody(name="  Premium  ", monthly_price_vnd=0, exposure_weight=1, display_order=32767)
        self.assertEqual(body.name, "Premium")
        for invalid in (
            {"name": " ", "monthly_price_vnd": 0, "exposure_weight": 1},
            {"name": "Tier", "monthly_price_vnd": -1, "exposure_weight": 1},
            {"name": "Tier", "monthly_price_vnd": 0, "exposure_weight": 0},
            {"name": "Tier", "monthly_price_vnd": 0, "exposure_weight": 1, "display_order": 32768},
        ):
            with self.assertRaises(ValueError):
                AdTierBody(**invalid)

    async def test_create_snapshots_price_and_normalizes_ad_fee(self):
        tier = SimpleNamespace(
            id=uuid.uuid4(), name="Premium", monthly_price_vnd=900_000, exposure_weight=4, is_active=True
        )
        db = FakeSession(tier)
        profile = BusinessProfile(id=uuid.uuid4(), user_id=uuid.uuid4(), name="Shop", status="APPROVED")
        ad = await AdsApplication(db).create_ad(
            profile=profile,
            user_id=profile.user_id,
            tier_id=tier.id,
            title="Ad",
            body=None,
            image_content_id=uuid.uuid4(),
            starts_at=None,
            ends_at=None,
        )
        self.assertEqual(ad.tier_id, tier.id)
        self.assertEqual(ad.monthly_price_snapshot_vnd, 900_000)
        self.assertEqual(ad.ad_fee, 1)

    async def test_inactive_tier_is_rejected(self):
        tier = SimpleNamespace(id=uuid.uuid4(), name="Paused", monthly_price_vnd=0, exposure_weight=1, is_active=False)
        with self.assertRaises(AdsError):
            await AdsApplication(FakeSession(tier)).get_tier(tier.id, active=True)

    async def test_inactive_tier_does_not_filter_existing_public_ads(self):
        tier = AdTier(
            id=uuid.uuid4(),
            name="Paused",
            monthly_price_vnd=100,
            exposure_weight=7,
            is_active=False,
            display_order=1,
        )
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=tier.id,
            tier=tier,
            ad_fee=1,
            monthly_price_snapshot_vnd=100,
            review_status="APPROVED",
            is_active=True,
            sort_order=0,
        )
        db = QuerySession([(ad, tier)])
        rows = await AdsApplication(db).public_ads()
        self.assertEqual(rows[0].exposure_weight, 7)
        self.assertNotIn("ad_tiers.is_active", str(db.statement.whereclause))

    async def test_inactive_tier_cannot_be_assigned(self):
        tier = AdTier(
            id=uuid.uuid4(),
            name="Paused",
            monthly_price_vnd=100,
            exposure_weight=7,
            is_active=False,
            display_order=1,
        )
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=tier.id,
            tier=tier,
            ad_fee=1,
            monthly_price_snapshot_vnd=100,
        )
        with self.assertRaises(AdsError):
            await AdsApplication(ModelSession(ad, tier)).set_tier(ad.id, tier.id)
