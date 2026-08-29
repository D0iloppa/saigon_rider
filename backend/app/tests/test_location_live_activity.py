"""실시간 위치채널 Live Activity 갱신 — Phase 3-A 테스트.

1) `services/location_live_activity.build_state` 순수함수 5케이스(1:1/그룹 최근접/도착 조합/ended).
2) `noti_worker._handle_live_activity_location_update` 핸들러 배선(채널 없음/토큰 push/종료 시
   event='end'+토큰삭제/410 무효토큰 정리) — DB 대신 스크립트된 더블로 검증(`test_noti_worker_idempotency.py`
   패턴 미러).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.noti_worker import __main__ as noti_worker
from app.services import location_live_activity as lla


def _member(user_id=None, *, lat=None, lng=None, eta_s=None, distance_m=None, arrived_at=None, left_at=None):
    return SimpleNamespace(
        user_id=user_id or uuid.uuid4(),
        lat=lat,
        lng=lng,
        eta_s=eta_s,
        distance_m=distance_m,
        arrived_at=arrived_at,
        left_at=left_at,
    )


class BuildStateTest(unittest.TestCase):
    def test_one_to_one_peer_is_the_other_member(self):
        now = datetime.now(UTC)
        me = _member(lat=10.77, lng=106.69, eta_s=300, distance_m=1000)
        peer = _member(lat=10.78, lng=106.70, eta_s=200, distance_m=500)
        channel = SimpleNamespace(ended_at=None)
        state = lla.build_state(me, [me, peer], channel, now)
        self.assertEqual(state["peerEtaS"], 200)
        self.assertEqual(state["peerDistanceM"], 500)
        self.assertEqual(state["participantCount"], 2)
        self.assertEqual(state["statusKind"], "moving")

    def test_group_peer_is_nearest_by_coords(self):
        now = datetime.now(UTC)
        me = _member(lat=10.77, lng=106.69)
        near = _member(lat=10.7705, lng=106.6905, eta_s=60, distance_m=100)
        far = _member(lat=10.90, lng=106.90, eta_s=900, distance_m=20000)
        channel = SimpleNamespace(ended_at=None)
        state = lla.build_state(me, [me, near, far], channel, now)
        self.assertEqual(state["peerEtaS"], 60)
        self.assertEqual(state["participantCount"], 3)

    def test_both_arrived_is_arrived(self):
        now = datetime.now(UTC)
        me = _member(lat=10.77, lng=106.69, arrived_at=now)
        peer = _member(lat=10.78, lng=106.70, arrived_at=now)
        channel = SimpleNamespace(ended_at=None)
        state = lla.build_state(me, [me, peer], channel, now)
        self.assertTrue(state["myArrived"])
        self.assertTrue(state["peerArrived"])
        self.assertEqual(state["statusKind"], "arrived")

    def test_only_me_arrived_is_waiting(self):
        now = datetime.now(UTC)
        me = _member(lat=10.77, lng=106.69, arrived_at=now)
        peer = _member(lat=10.78, lng=106.70)
        channel = SimpleNamespace(ended_at=None)
        state = lla.build_state(me, [me, peer], channel, now)
        self.assertEqual(state["statusKind"], "waiting")

    def test_channel_ended_overrides_to_ended(self):
        now = datetime.now(UTC)
        me = _member(lat=10.77, lng=106.69, arrived_at=now)
        peer = _member(lat=10.78, lng=106.70, arrived_at=now)
        channel = SimpleNamespace(ended_at=now)
        state = lla.build_state(me, [me, peer], channel, now)
        self.assertEqual(state["statusKind"], "ended")


class _FakeResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return SimpleNamespace(all=lambda: self._items)


class _SessionContext:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc):
        return False


def _token(user_id, push_token="tok", row_id=None):
    return SimpleNamespace(id=row_id or uuid.uuid4(), user_id=user_id, push_token=push_token, locale="vi")


class LocationLiveActivityHandlerTest(unittest.IsolatedAsyncioTestCase):
    async def test_missing_channel_is_noop(self):
        db = MagicMock(get=AsyncMock(return_value=None), execute=AsyncMock(), commit=AsyncMock())
        with patch.object(noti_worker, "AsyncSessionLocal", lambda: _SessionContext(db)):
            await noti_worker._handle_live_activity_location_update(
                {"channel_id": str(uuid.uuid4())}, source_event_id="1-0"
            )
        db.execute.assert_not_awaited()

    async def test_active_update_pushes_per_member_token(self):
        channel_id = uuid.uuid4()
        channel = SimpleNamespace(id=channel_id, ended_at=None)
        m1 = _member(lat=10.77, lng=106.69)
        m2 = _member(lat=10.78, lng=106.70)
        token1 = _token(m1.user_id)
        token2 = _token(m2.user_id)

        db = MagicMock(
            get=AsyncMock(return_value=channel),
            execute=AsyncMock(side_effect=[_FakeResult([m1, m2]), _FakeResult([token1]), _FakeResult([token2])]),
            commit=AsyncMock(),
        )
        push_mock = AsyncMock(return_value={})
        with (
            patch.object(noti_worker, "AsyncSessionLocal", lambda: _SessionContext(db)),
            patch.object(noti_worker.engine_client, "push_live_activity", push_mock),
        ):
            await noti_worker._handle_live_activity_location_update(
                {"channel_id": str(channel_id)}, source_event_id="1-0"
            )
        self.assertEqual(push_mock.await_count, 2)
        for call in push_mock.await_args_list:
            args, kwargs = call
            self.assertEqual(args[1], "update")
            self.assertIsNone(kwargs.get("dismissal_date"))
        db.commit.assert_awaited_once()

    async def test_ended_channel_sends_end_event_and_deletes_tokens(self):
        channel_id = uuid.uuid4()
        channel = SimpleNamespace(id=channel_id, ended_at=datetime.now(UTC))
        m1 = _member(lat=10.77, lng=106.69, arrived_at=datetime.now(UTC))
        token1 = _token(m1.user_id)

        db = MagicMock(
            get=AsyncMock(return_value=channel),
            execute=AsyncMock(side_effect=[_FakeResult([m1]), _FakeResult([token1]), _FakeResult([])]),
            commit=AsyncMock(),
        )
        push_mock = AsyncMock(return_value={})
        with (
            patch.object(noti_worker, "AsyncSessionLocal", lambda: _SessionContext(db)),
            patch.object(noti_worker.engine_client, "push_live_activity", push_mock),
        ):
            await noti_worker._handle_live_activity_location_update(
                {"channel_id": str(channel_id)}, source_event_id="1-0"
            )
        args, kwargs = push_mock.await_args
        self.assertEqual(args[1], "end")
        self.assertIsNotNone(kwargs.get("dismissal_date"))
        # 마지막 execute 호출은 채널 전체 토큰 삭제(DELETE) 문이어야 한다.
        self.assertEqual(db.execute.await_count, 3)

    async def test_invalid_token_410_is_removed(self):
        channel_id = uuid.uuid4()
        channel = SimpleNamespace(id=channel_id, ended_at=None)
        m1 = _member(lat=10.77, lng=106.69)
        token1 = _token(m1.user_id)

        db = MagicMock(
            get=AsyncMock(return_value=channel),
            execute=AsyncMock(side_effect=[_FakeResult([m1]), _FakeResult([token1]), _FakeResult([])]),
            commit=AsyncMock(),
        )
        response = httpx.Response(410, request=httpx.Request("POST", "http://engine/v1/push/live-activity"))
        push_mock = AsyncMock(side_effect=httpx.HTTPStatusError("gone", request=response.request, response=response))
        with (
            patch.object(noti_worker, "AsyncSessionLocal", lambda: _SessionContext(db)),
            patch.object(noti_worker.engine_client, "push_live_activity", push_mock),
        ):
            await noti_worker._handle_live_activity_location_update(
                {"channel_id": str(channel_id)}, source_event_id="1-0"
            )
        # 채널이 끝나지 않았는데도(event='update') invalid 토큰이 있어 delete 가 한 번 더 실행된다.
        self.assertEqual(db.execute.await_count, 3)
        db.commit.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
