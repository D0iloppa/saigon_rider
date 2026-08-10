import unittest
import uuid
from datetime import UTC, datetime, timedelta

from app.models import AdTier, MarketplaceAd, ProximityHit
from app.modules.proximity.application import ProximityApplication


class FakeRows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class QuerySession:
    """test_ads_application.py 의 QuerySession 패턴 미러 — execute() 가 받은 statement 를 기록한다."""

    def __init__(self, rows):
        self.rows = rows
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return FakeRows(self.rows)


class ScalarSession:
    """scalar() 호출 순서대로 값을 반환 — is_in_cooldown/daily_*_count 단위테스트용."""

    def __init__(self, values):
        self._values = list(values)
        self.statements = []

    async def scalar(self, statement):
        self.statements.append(statement)
        return self._values.pop(0)


class ProximitySpeedValidationTests(unittest.TestCase):
    def test_no_previous_sample_passes(self):
        self.assertTrue(
            ProximityApplication.validate_speed(
                prev_lat=None,
                prev_lng=None,
                prev_at=None,
                lat=10.77,
                lng=106.70,
                occurred_at=datetime.now(UTC),
                max_speed_kmh=120,
            )
        )

    def test_plausible_motorbike_speed_passes(self):
        now = datetime.now(UTC)
        # 약 300m 를 30초에 이동 = 36km/h — 오토바이 상한(120) 이내
        self.assertTrue(
            ProximityApplication.validate_speed(
                prev_lat=10.7700,
                prev_lng=106.7000,
                prev_at=now - timedelta(seconds=30),
                lat=10.7727,
                lng=106.7000,
                occurred_at=now,
                max_speed_kmh=120,
            )
        )

    def test_teleport_speed_is_rejected(self):
        """위조 좌표 주입(비현실적 속도) — 10km 를 1초에 이동은 어떤 교통수단으로도 불가능."""
        now = datetime.now(UTC)
        self.assertFalse(
            ProximityApplication.validate_speed(
                prev_lat=10.7000,
                prev_lng=106.7000,
                prev_at=now - timedelta(seconds=1),
                lat=10.79,
                lng=106.79,
                occurred_at=now,
                max_speed_kmh=120,
            )
        )

    def test_non_positive_elapsed_time_rejected_unless_same_point(self):
        now = datetime.now(UTC)
        self.assertFalse(
            ProximityApplication.validate_speed(
                prev_lat=10.70,
                prev_lng=106.70,
                prev_at=now,
                lat=10.75,
                lng=106.75,
                occurred_at=now - timedelta(seconds=1),  # 역행 타임스탬프
                max_speed_kmh=120,
            )
        )
        self.assertTrue(
            ProximityApplication.validate_speed(
                prev_lat=10.70,
                prev_lng=106.70,
                prev_at=now,
                lat=10.70,
                lng=106.70,
                occurred_at=now,
                max_speed_kmh=120,
            )
        )


class ProximityCandidateQueryTests(unittest.IsolatedAsyncioTestCase):
    async def test_candidate_query_applies_g1_gate_and_proximity_enabled(self):
        tier = AdTier(id=uuid.uuid4(), name="프리미엄", monthly_price_vnd=0, exposure_weight=3, proximity_enabled=True)
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Shop",
            title="Ad",
            tier_id=tier.id,
            tier=tier,
            ad_fee=1,
            monthly_price_snapshot_vnd=0,
            review_status="APPROVED",
            is_active=True,
            subscription_status="active",
            sort_order=0,
        )
        db = QuerySession([(ad, tier)])
        result = await ProximityApplication(db).find_candidate(
            business_profile_id=uuid.uuid4(), lat=10.77, lng=106.70, radius_m=300
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.ad.id, ad.id)
        whereclause = str(db.statement.whereclause)
        self.assertIn("ad_tiers.proximity_enabled", whereclause)
        self.assertIn("marketplace_ads.subscription_status", whereclause)

    async def test_no_rows_returns_none(self):
        db = QuerySession([])
        result = await ProximityApplication(db).find_candidate(
            business_profile_id=uuid.uuid4(), lat=10.77, lng=106.70, radius_m=300
        )
        self.assertIsNone(result)


class FakeCandidateRows:
    """(id, latitude, longitude) 튜플 형태 row 를 named-attribute 로도 접근 가능하게 감싼다."""

    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class CandidateQuerySession:
    def __init__(self, rows):
        self.rows = rows
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return FakeCandidateRows(self.rows)


class _Row:
    """SQLAlchemy Row 흉내 — .id/.latitude/.longitude 속성 접근을 지원한다."""

    def __init__(self, id_, latitude, longitude):
        self.id = id_
        self.latitude = latitude
        self.longitude = longitude


class ProximityCandidatesNearTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_coords_only_and_applies_g1_gate(self):
        business_profile_id = uuid.uuid4()
        db = CandidateQuerySession([_Row(business_profile_id, 10.77, 106.70)])
        result = await ProximityApplication(db).find_candidates_near(lat=10.77, lng=106.70, radius_m=3000)
        self.assertEqual(result, [(business_profile_id, 10.77, 106.70)])
        whereclause = str(db.statement.whereclause)
        self.assertIn("ad_tiers.proximity_enabled", whereclause)
        self.assertIn("marketplace_ads.subscription_status", whereclause)

    async def test_rows_missing_coords_are_dropped(self):
        db = CandidateQuerySession([_Row(uuid.uuid4(), None, None)])
        result = await ProximityApplication(db).find_candidates_near(lat=10.77, lng=106.70, radius_m=3000)
        self.assertEqual(result, [])

    async def test_no_rows_returns_empty_list(self):
        db = CandidateQuerySession([])
        result = await ProximityApplication(db).find_candidates_near(lat=10.77, lng=106.70, radius_m=3000)
        self.assertEqual(result, [])


class ProximityCooldownAndCapTests(unittest.IsolatedAsyncioTestCase):
    async def test_in_cooldown_when_recently_notified(self):
        now = datetime.now(UTC)
        db = ScalarSession([now - timedelta(hours=1)])
        result = await ProximityApplication(db).is_in_cooldown(
            user_id=uuid.uuid4(), business_profile_id=uuid.uuid4(), cooldown_hours=24, now=now
        )
        self.assertTrue(result)

    async def test_not_in_cooldown_when_never_notified(self):
        now = datetime.now(UTC)
        db = ScalarSession([None])
        result = await ProximityApplication(db).is_in_cooldown(
            user_id=uuid.uuid4(), business_profile_id=uuid.uuid4(), cooldown_hours=24, now=now
        )
        self.assertFalse(result)

    async def test_not_in_cooldown_after_window_elapses(self):
        now = datetime.now(UTC)
        db = ScalarSession([now - timedelta(hours=25)])
        result = await ProximityApplication(db).is_in_cooldown(
            user_id=uuid.uuid4(), business_profile_id=uuid.uuid4(), cooldown_hours=24, now=now
        )
        self.assertFalse(result)

    async def test_daily_notify_cap_reached_blocks_further_notify(self):
        now = datetime.now(UTC)
        db = ScalarSession([5])
        count = await ProximityApplication(db).daily_notify_count(user_id=uuid.uuid4(), now=now)
        self.assertEqual(count, 5)
        self.assertGreaterEqual(count, 5)  # daily_notify_cap=5 확정값과 동일 기준

    async def test_daily_rp_cap_count_defaults_to_zero(self):
        db = ScalarSession([None])
        count = await ProximityApplication(db).daily_rp_count(user_id=uuid.uuid4(), now=datetime.now(UTC))
        self.assertEqual(count, 0)


class ProximityVisitEligibilityTests(unittest.TestCase):
    def test_visit_not_eligible_before_dwell_time(self):
        now = datetime.now(UTC)
        hit = ProximityHit(
            user_key=uuid.uuid4(),
            business_profile_id=uuid.uuid4(),
            hit_lat=10.77,
            hit_lng=106.70,
            distance_m=30,
            occurred_at=now - timedelta(seconds=60),  # dwell_sec=120 미달
        )
        self.assertFalse(
            ProximityApplication.visit_eligible(hit=hit, distance_m=30, visit_radius_m=50, visit_dwell_sec=120, now=now)
        )

    def test_visit_eligible_after_dwell_time_within_radius(self):
        now = datetime.now(UTC)
        hit = ProximityHit(
            user_key=uuid.uuid4(),
            business_profile_id=uuid.uuid4(),
            hit_lat=10.77,
            hit_lng=106.70,
            distance_m=30,
            occurred_at=now - timedelta(seconds=150),
        )
        self.assertTrue(
            ProximityApplication.visit_eligible(hit=hit, distance_m=30, visit_radius_m=50, visit_dwell_sec=120, now=now)
        )

    def test_visit_not_eligible_outside_visit_radius(self):
        now = datetime.now(UTC)
        hit = ProximityHit(
            user_key=uuid.uuid4(),
            business_profile_id=uuid.uuid4(),
            hit_lat=10.77,
            hit_lng=106.70,
            distance_m=200,
            occurred_at=now - timedelta(seconds=150),
        )
        self.assertFalse(
            ProximityApplication.visit_eligible(
                hit=hit, distance_m=200, visit_radius_m=50, visit_dwell_sec=120, now=now
            )
        )

    def test_already_confirmed_hit_is_not_reconfirmed(self):
        now = datetime.now(UTC)
        hit = ProximityHit(
            user_key=uuid.uuid4(),
            business_profile_id=uuid.uuid4(),
            hit_lat=10.77,
            hit_lng=106.70,
            distance_m=30,
            occurred_at=now - timedelta(seconds=300),
            visit_confirmed_at=now - timedelta(seconds=200),
        )
        self.assertFalse(
            ProximityApplication.visit_eligible(hit=hit, distance_m=30, visit_radius_m=50, visit_dwell_sec=120, now=now)
        )


class ProximityPolicyReadTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_policy_row_defaults_to_disabled_kill_switch(self):
        class NoPolicySession:
            async def get(self, model, item_id):
                return None

        policy = await ProximityApplication(NoPolicySession()).get_policy()
        self.assertFalse(policy.is_enabled)

    async def test_policy_row_is_read_through(self):
        from app.models import ProximityPolicy

        class PolicySession:
            def __init__(self, policy):
                self.policy = policy

            async def get(self, model, item_id):
                return self.policy

        seeded = ProximityPolicy(
            id=1,
            notify_radius_m=300,
            visit_radius_m=50,
            visit_dwell_sec=120,
            cooldown_hours=24,
            daily_notify_cap=2,
            daily_rp_cap=3,
            max_speed_kmh=120,
            candidate_radius_m=3000,
            is_enabled=False,
        )
        policy = await ProximityApplication(PolicySession(seeded)).get_policy()
        self.assertEqual(policy.notify_radius_m, 300)
        self.assertEqual(policy.daily_notify_cap, 2)
        self.assertFalse(policy.is_enabled)


class ProximityRecordNotifyTests(unittest.TestCase):
    def test_record_notify_builds_hit_with_notified_at(self):
        class AddOnlySession:
            def __init__(self):
                self.added = None

            def add(self, value):
                self.added = value

        db = AddOnlySession()
        now = datetime.now(UTC)
        user_id = uuid.uuid4()
        business_profile_id = uuid.uuid4()
        ad_id = uuid.uuid4()
        hit = ProximityApplication(db).record_notify(
            user_id=user_id,
            business_profile_id=business_profile_id,
            ad_id=ad_id,
            lat=10.77,
            lng=106.70,
            distance_m=120,
            occurred_at=now,
        )
        self.assertIs(db.added, hit)
        self.assertEqual(hit.notified_at, now)
        self.assertEqual(hit.occurred_at, now)
        self.assertIsNone(hit.visit_confirmed_at)
        self.assertFalse(hit.rp_granted)


if __name__ == "__main__":
    unittest.main()
