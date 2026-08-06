import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import mileage
from app.workers.gps_agent import _parse_measured_at


def _result(*, scalar=None, rowcount=1):
    result = MagicMock(rowcount=rowcount)
    result.scalar_one_or_none.return_value = scalar
    result.scalar_one.return_value = scalar
    return result


class _SessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *_args):
        return False


class GpsPipelineTest(unittest.IsolatedAsyncioTestCase):
    async def test_same_message_ten_deliveries_updates_mileage_and_all_quests_once(self):
        db = AsyncMock()
        processed = False
        total = 0

        async def execute(statement):
            nonlocal processed, total
            sql = str(statement)
            if "FROM device_user_map" in sql:
                return _result(scalar=7)
            if "max(user_mileage_log.recorded_at)" in sql:
                return _result(scalar=None)
            if "INSERT INTO user_mileage_log" in sql:
                if processed:
                    return _result(rowcount=0)
                processed = True
                return _result(rowcount=1)
            if "UPDATE sre_user" in sql:
                total += 30
                return _result(scalar=total)
            raise AssertionError(sql)

        db.execute.side_effect = execute
        measured_at = datetime.now(timezone.utc)
        with patch.object(mileage, "AsyncSessionLocal", return_value=_SessionContext(db)), \
            patch("app.services.quest_tracker.dispatch_in_session", new=AsyncMock(return_value=[1, 2])) as quests, \
            patch("app.services.policy_engine.evaluate_policies", new=AsyncMock()):
            results = [
                await mileage.process_gps_event(
                    msg_id="1-0", device_uuid="device-a", latitude=10.7, longitude=106.7,
                    distance_m=30, measured_at=measured_at,
                )
                for _ in range(10)
            ]

        self.assertEqual(total, 30)
        quests.assert_awaited_once()
        self.assertEqual(sum(1 for result in results if result[3]), 9)
        db.commit.assert_awaited_once()

    async def test_device_remap_is_seen_without_worker_restart(self):
        db = AsyncMock()
        owner = 1
        seen_owners = []

        async def execute(statement):
            sql = str(statement)
            if "FROM device_user_map" in sql:
                return _result(scalar=owner)
            if "max(user_mileage_log.recorded_at)" in sql:
                return _result(scalar=None)
            if "INSERT INTO user_mileage_log" in sql:
                return _result(rowcount=1)
            if "UPDATE sre_user" in sql:
                seen_owners.append(owner)
                return _result(scalar=10)
            raise AssertionError(sql)

        db.execute.side_effect = execute
        with (
            patch.object(mileage, "AsyncSessionLocal", return_value=_SessionContext(db)),
            patch("app.services.quest_tracker.dispatch_in_session", new=AsyncMock(return_value=[])),
            patch("app.services.policy_engine.evaluate_policies", new=AsyncMock()),
        ):
            await mileage.process_gps_event(
                msg_id="1-0", device_uuid="device-a", latitude=10.7, longitude=106.7,
                distance_m=10, measured_at=datetime.now(timezone.utc),
            )
            owner = 2
            await mileage.process_gps_event(
                msg_id="2-0", device_uuid="device-a", latitude=10.7, longitude=106.7,
                distance_m=10, measured_at=datetime.now(timezone.utc),
            )

        self.assertEqual(seen_owners, [1, 2])

    def test_event_time_accepts_backlog_and_rejects_future_and_stale(self):
        now = datetime.now(timezone.utc)
        backlog = now - timedelta(minutes=10)
        self.assertEqual(_parse_measured_at(backlog.isoformat(), now), backlog)
        with self.assertRaisesRegex(ValueError, "future"):
            _parse_measured_at((now + timedelta(minutes=6)).timestamp(), now)
        with self.assertRaisesRegex(ValueError, "old"):
            _parse_measured_at((now - timedelta(hours=25)).timestamp(), now)

    def test_speed_uses_measurement_interval_and_reverse_event_is_ignored(self):
        previous = datetime.now(timezone.utc) - timedelta(minutes=10)
        ordered, distance = mileage._apply_event_time_policy(250, previous, previous + timedelta(seconds=30))
        self.assertTrue(ordered)
        self.assertEqual(distance, 250)

        ordered, distance = mileage._apply_event_time_policy(30, previous, previous - timedelta(seconds=1))
        self.assertFalse(ordered)
        self.assertEqual(distance, 0)

        ordered, distance = mileage._apply_event_time_policy(2000, previous, previous + timedelta(seconds=10))
        self.assertTrue(ordered)
        self.assertEqual(distance, 0)

    def test_gap_over_5min_is_dropped_even_at_valid_speed(self):
        # T-1: 결함 재현 — 공백(8h) 뒤 대형 점프가 "50km/h 정상 주행"으로 통과해서는 안 된다.
        now = datetime.now(timezone.utc)
        previous = now - timedelta(hours=8)
        ordered, distance = mileage._apply_event_time_policy(1_075_000, previous, now)
        self.assertTrue(ordered)
        self.assertEqual(distance, 0.0)

    def test_normal_drive_within_gap_is_accepted(self):
        # T-2
        now = datetime.now(timezone.utc)
        previous = now - timedelta(seconds=60)
        ordered, distance = mileage._apply_event_time_policy(500, previous, now)
        self.assertTrue(ordered)
        self.assertEqual(distance, 500)

    def test_gap_boundary_over_max_is_dropped(self):
        # T-3
        now = datetime.now(timezone.utc)
        previous = now - timedelta(seconds=301)
        ordered, distance = mileage._apply_event_time_policy(1_000, previous, now)
        self.assertTrue(ordered)
        self.assertEqual(distance, 0.0)

    def test_gap_boundary_just_under_max_is_accepted(self):
        # T-4
        now = datetime.now(timezone.utc)
        previous = now - timedelta(seconds=299)
        ordered, distance = mileage._apply_event_time_policy(1_000, previous, now)
        self.assertTrue(ordered)
        self.assertEqual(distance, 1_000)

    def test_absolute_event_distance_cap_is_enforced(self):
        # T-5
        now = datetime.now(timezone.utc)
        previous = now - timedelta(seconds=290)
        ordered, distance = mileage._apply_event_time_policy(50_000, previous, now)
        self.assertTrue(ordered)
        self.assertEqual(distance, 0.0)

    def test_first_event_without_previous_is_capped(self):
        # T-6: 결함 재현 — previous_at 이 없는 첫 이벤트에도 절대 상한이 적용돼야 한다.
        now = datetime.now(timezone.utc)
        ordered, distance = mileage._apply_event_time_policy(1_075_000, None, now)
        self.assertTrue(ordered)
        self.assertEqual(distance, 0.0)

    def test_first_event_within_cap_is_accepted(self):
        # T-7
        now = datetime.now(timezone.utc)
        ordered, distance = mileage._apply_event_time_policy(500, None, now)
        self.assertTrue(ordered)
        self.assertEqual(distance, 500)

    def test_reverse_event_still_rejected(self):
        # T-8: 기존 동작 보존
        now = datetime.now(timezone.utc)
        previous = now + timedelta(seconds=60)
        ordered, distance = mileage._apply_event_time_policy(500, previous, now)
        self.assertFalse(ordered)
        self.assertEqual(distance, 0.0)

    def test_speed_cap_still_rejected(self):
        # T-9: 기존 동작 보존
        now = datetime.now(timezone.utc)
        previous = now - timedelta(seconds=10)
        ordered, distance = mileage._apply_event_time_policy(5_000, previous, now)
        self.assertTrue(ordered)
        self.assertEqual(distance, 0.0)
