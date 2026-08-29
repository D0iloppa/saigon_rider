"""실시간 위치공유 채널 ETA/거리 계산(Phase 2) 테스트.

SoT: ai-docs/task/active/260829_live_location_channel_task.md §5. DB 없이 `_compute_for_members`
(순수 로직 — 이미 로드된 멤버 객체를 받는다)를 직접 호출해 검증한다. `_get_cache`/`_set_cache` 는
실 Redis 대신 dict 로 만든 대역으로 patch 해 캐시/보간/호출횟수 상한(§5-2, 완료기준3)을 결정적으로
검증한다.

부하테스트(20명x10초x5분) thundering herd 대응 회귀 테스트를 포함한다:
- 사용자별 하드 게이트(60초, 격자 변경과 무관) — `HardGateTest`
- 캐시 키 단위 in-flight 락(동시에 같은 키를 두 번 계산하지 않음) — `InFlightLockTest`
- 채널 단위 코얼레싱(`request_compute`) — `RequestComputeCoalescingTest`
- 커버리지 밖 결과도 60초 캐시(W7 P2) — `CoverageMissCachedTest`
- 엔진 호출 카운터(로그가 INFO 로 안 보여도 테스트에서 assert 가능) — `EngineCallCounterTest`
"""

import asyncio
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services import location_eta as eta


def _member(lat=10.77, lng=106.69, arrived_at=None, user_id=None):
    return SimpleNamespace(
        user_id=user_id or uuid.uuid4(),
        lat=lat,
        lng=lng,
        arrived_at=arrived_at,
        eta_s=None,
        distance_m=None,
        eta_computed_at=None,
    )


def _fake_cache():
    store: dict[str, dict] = {}

    async def _get(key):
        return store.get(key)

    async def _set(key, eta_s, distance_m, at):
        store[key] = {"etaS": eta_s, "distanceM": distance_m, "at": at.isoformat()}

    return store, _get, _set


class GridKeyTest(unittest.TestCase):
    def test_same_point_same_grid(self):
        self.assertEqual(eta.grid_key(10.771234, 106.691234), eta.grid_key(10.771300, 106.691300))

    def test_far_points_different_grid(self):
        self.assertNotEqual(eta.grid_key(10.771234, 106.691234), eta.grid_key(10.780000, 106.700000))


class ComputeForMembersTest(unittest.IsolatedAsyncioTestCase):
    async def test_arrived_member_gets_zero_without_engine_call(self):
        channel_id = uuid.uuid4()
        member = _member(arrived_at=datetime.now(UTC))
        now = datetime.now(UTC)
        published = []
        with (
            patch.object(
                eta.location_channel_broadcaster,
                "publish",
                AsyncMock(side_effect=lambda cid, e: published.append(e)),
            ),
            patch.object(eta.routing_engine, "fetch_trip", AsyncMock(side_effect=AssertionError("호출 금지"))),
            patch.object(
                eta.routing_engine, "fetch_matrix_to_target", AsyncMock(side_effect=AssertionError("호출 금지"))
            ),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, [member], "http://engine", now)
        self.assertEqual(member.eta_s, 0)
        self.assertEqual(member.distance_m, 0)
        self.assertEqual(published[0]["type"], "eta")
        self.assertEqual(published[0]["payload"]["etaS"], 0)

    async def test_no_engine_url_uses_haversine_fallback(self):
        channel_id = uuid.uuid4()
        member = _member(lat=10.77, lng=106.69)
        now = datetime.now(UTC)
        with patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()):
            await eta._compute_for_members(channel_id, 10.78, 106.70, [member], "", now)
        self.assertIsNone(member.eta_s)
        self.assertIsNotNone(member.distance_m)
        self.assertGreater(member.distance_m, 0)

    async def test_single_member_uses_route_not_matrix(self):
        channel_id = uuid.uuid4()
        member = _member()
        now = datetime.now(UTC)
        _, get_cache, set_cache = _fake_cache()
        route_mock = AsyncMock(return_value={"summary": {"length": 2.0, "time": 300}})
        matrix_mock = AsyncMock(side_effect=AssertionError("matrix 호출 금지"))
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(eta.routing_engine, "fetch_trip", route_mock),
            patch.object(eta.routing_engine, "fetch_matrix_to_target", matrix_mock),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, [member], "http://engine", now)
        route_mock.assert_awaited_once()
        self.assertEqual(member.eta_s, 300)
        self.assertEqual(member.distance_m, 2000)

    async def test_three_members_uses_matrix_not_route(self):
        channel_id = uuid.uuid4()
        members = [_member(lat=10.77 + i * 0.01) for i in range(3)]
        now = datetime.now(UTC)
        _, get_cache, set_cache = _fake_cache()
        matrix_mock = AsyncMock(return_value=[{"distance_m": 1000, "duration_s": 120}] * 3)
        route_mock = AsyncMock(side_effect=AssertionError("route 호출 금지"))
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(eta.routing_engine, "fetch_matrix_to_target", matrix_mock),
            patch.object(eta.routing_engine, "fetch_trip", route_mock),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, members, "http://engine", now)
        matrix_mock.assert_awaited_once()
        for m in members:
            self.assertEqual(m.eta_s, 120)
            self.assertEqual(m.distance_m, 1000)

    async def test_coverage_outside_falls_back_to_haversine(self):
        channel_id = uuid.uuid4()
        member = _member(lat=10.77, lng=106.69)
        now = datetime.now(UTC)
        _, get_cache, set_cache = _fake_cache()
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(eta.routing_engine, "fetch_trip", AsyncMock(return_value=None)),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.78, 106.70, [member], "http://engine", now)
        self.assertIsNone(member.eta_s)
        self.assertGreater(member.distance_m, 0)

    async def test_cache_hit_interpolates_and_skips_engine_call(self):
        channel_id = uuid.uuid4()
        member = _member(lat=10.77, lng=106.69)
        now = datetime.now(UTC)
        store, get_cache, set_cache = _fake_cache()
        key = eta._cache_key(channel_id, eta.grid_key(member.lat, member.lng), 10.8, 106.8)
        store[key] = {"etaS": 100, "distanceM": 500, "at": (now - timedelta(seconds=30)).isoformat()}
        route_mock = AsyncMock(side_effect=AssertionError("호출 금지"))
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(eta.routing_engine, "fetch_trip", route_mock),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, [member], "http://engine", now)
        route_mock.assert_not_awaited()
        self.assertEqual(member.eta_s, 70)
        self.assertEqual(member.distance_m, 500)

    async def test_rate_limit_two_pings_within_60s_call_engine_once(self):
        """§5-2/완료기준3 — 같은 격자에서 60초 안 재호출은 캐시로 흡수돼 엔진 호출 1회 이하."""
        channel_id = uuid.uuid4()
        member = _member(lat=10.77, lng=106.69)
        t0 = datetime.now(UTC)
        _, get_cache, set_cache = _fake_cache()
        route_mock = AsyncMock(return_value={"summary": {"length": 2.0, "time": 300}})
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(eta.routing_engine, "fetch_trip", route_mock),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, [member], "http://engine", t0)
            await eta._compute_for_members(
                channel_id, 10.8, 106.8, [member], "http://engine", t0 + timedelta(seconds=10)
            )
        route_mock.assert_awaited_once()


class ComputeAndBroadcastEntryPointTest(unittest.IsolatedAsyncioTestCase):
    async def test_missing_channel_is_noop(self):
        class _FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def get(self, model, pk):
                return None

            async def execute(self, *args, **kwargs):
                raise AssertionError("channel 이 없으면 더 이상 쿼리하지 않아야 한다")

            async def commit(self):
                pass

        with patch.object(eta, "AsyncSessionLocal", lambda: _FakeSession()):
            await eta.compute_and_broadcast(uuid.uuid4(), [uuid.uuid4()])  # 예외 없이 조용히 반환


class HardGateTest(unittest.IsolatedAsyncioTestCase):
    """W7 대응 — 마지막 계산 후 60초 이내면 격자가 바뀌었어도 무조건 보간(§5-2/완료기준3)."""

    async def test_hard_gate_applies_even_if_grid_changed(self):
        channel_id = uuid.uuid4()
        now = datetime.now(UTC)
        member = _member(lat=10.90, lng=106.90)  # 목적지·이전 계산 위치와 전혀 다른 격자
        member.eta_s = 200
        member.distance_m = 3000
        member.eta_computed_at = now - timedelta(seconds=30)  # 30초 전 — 60초 하드 게이트 안에 있음

        with patch.object(eta.routing_engine, "fetch_trip", AsyncMock(side_effect=AssertionError("호출 금지"))):
            await eta._compute_for_members(channel_id, 10.8, 106.8, [member], "http://engine", now)

        self.assertEqual(member.eta_s, 170)  # 200 - 30 보간
        self.assertEqual(member.distance_m, 3000)  # 직전 값 유지(격자 변경과 무관하게 재계산 안 함)

    async def test_gate_expires_after_60s_and_recomputes(self):
        channel_id = uuid.uuid4()
        now = datetime.now(UTC)
        member = _member(lat=10.77, lng=106.69)
        member.eta_s = 200
        member.distance_m = 3000
        member.eta_computed_at = now - timedelta(seconds=61)  # 게이트 밖

        _, get_cache, set_cache = _fake_cache()
        route_mock = AsyncMock(return_value={"summary": {"length": 1.0, "time": 90}})
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(eta.routing_engine, "fetch_trip", route_mock),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, [member], "http://engine", now)
        route_mock.assert_awaited_once()
        self.assertEqual(member.eta_s, 90)


class InFlightLockTest(unittest.IsolatedAsyncioTestCase):
    """W7 대응 — 같은 격자+목적지 키를 동시에 두 태스크가 계산하지 않는다(먼저 끝난 결과 재사용)."""

    async def test_concurrent_same_key_computed_once(self):
        channel_id = uuid.uuid4()
        member_a = _member(lat=10.77, lng=106.69)
        member_b = _member(lat=10.77, lng=106.69)
        call_count = 0

        async def slow_fetch_trip(engine_url, lat, lng, dest_lat, dest_lng):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)
            return {"summary": {"length": 2.0, "time": 300}}

        _, get_cache, set_cache = _fake_cache()
        now = datetime.now(UTC)
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(eta.routing_engine, "fetch_trip", slow_fetch_trip),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await asyncio.gather(
                eta._compute_for_members(channel_id, 10.8, 106.8, [member_a], "http://engine", now),
                eta._compute_for_members(channel_id, 10.8, 106.8, [member_b], "http://engine", now),
            )

        self.assertEqual(call_count, 1)
        self.assertEqual(member_a.eta_s, 300)
        self.assertEqual(member_b.eta_s, 300)


class CoverageMissCachedTest(unittest.IsolatedAsyncioTestCase):
    """W7 P2 — 커버리지 밖(row=None) 결과도 60초 캐시해 같은 격자 재핑이 재호출하지 않게 한다."""

    async def test_coverage_miss_result_is_cached(self):
        channel_id = uuid.uuid4()
        member = _member(lat=10.77, lng=106.69)
        now = datetime.now(UTC)
        store, get_cache, set_cache = _fake_cache()
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(eta.routing_engine, "fetch_trip", AsyncMock(return_value=None)),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, [member], "http://engine", now)

        key = eta._cache_key(channel_id, eta.grid_key(member.lat, member.lng), 10.8, 106.8)
        self.assertIn(key, store)
        self.assertIsNone(store[key]["etaS"])
        self.assertGreater(store[key]["distanceM"], 0)


class EngineCallCounterTest(unittest.IsolatedAsyncioTestCase):
    """로그가 INFO 로 내려가 안 보일 수 있어도(별건 이슈) 테스트는 인메모리 카운터로 assert."""

    async def test_route_call_increments_counter(self):
        channel_id = uuid.uuid4()
        member = _member()
        now = datetime.now(UTC)
        _, get_cache, set_cache = _fake_cache()
        before = eta.engine_call_counts.get("route", 0)
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(
                eta.routing_engine, "fetch_trip", AsyncMock(return_value={"summary": {"length": 1.0, "time": 60}})
            ),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, [member], "http://engine", now)
        self.assertEqual(eta.engine_call_counts["route"], before + 1)

    async def test_matrix_call_increments_counter(self):
        channel_id = uuid.uuid4()
        members = [_member(lat=10.77 + i * 0.01) for i in range(3)]
        now = datetime.now(UTC)
        _, get_cache, set_cache = _fake_cache()
        before = eta.engine_call_counts.get("matrix", 0)
        with (
            patch.object(eta, "_get_cache", get_cache),
            patch.object(eta, "_set_cache", set_cache),
            patch.object(
                eta.routing_engine,
                "fetch_matrix_to_target",
                AsyncMock(return_value=[{"distance_m": 1000, "duration_s": 120}] * 3),
            ),
            patch.object(eta.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            await eta._compute_for_members(channel_id, 10.8, 106.8, members, "http://engine", now)
        self.assertEqual(eta.engine_call_counts["matrix"], before + 1)


class RequestComputeCoalescingTest(unittest.IsolatedAsyncioTestCase):
    """완료기준(a) — 채널 단위 코얼레싱이 동시 다발 요청을 소수의 배치로 뭉치는지."""

    async def test_concurrent_requests_coalesce_into_few_batches(self):
        channel_id = uuid.uuid4()
        calls: list[set] = []

        async def fake_compute(cid, user_ids):
            calls.append(set(user_ids))
            await asyncio.sleep(0.05)  # 실제 엔진 호출 지연을 흉내 — 그 사이 다른 요청이 pending 에 합쳐짐

        user_ids = [uuid.uuid4() for _ in range(20)]
        with patch.object(eta, "compute_and_broadcast", fake_compute):
            await asyncio.gather(*[eta.request_compute(channel_id, [uid]) for uid in user_ids])

        all_seen: set = set()
        for batch in calls:
            all_seen |= batch
        self.assertEqual(all_seen, set(user_ids))  # 아무도 누락되지 않음
        self.assertLess(len(calls), 20)  # 20번 개별 호출이 아니라 훨씬 적은 배치로 뭉쳤다
        # 정리 — 다음 테스트에 상태가 새지 않게.
        eta._channel_pending.pop(channel_id, None)
        eta._channel_worker_active.discard(channel_id)


if __name__ == "__main__":
    unittest.main()
