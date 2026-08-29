"""실시간 위치공유 채널 — 강퇴/차단 시 멤버십 정리(`services/location_channel_membership.py`) 테스트.

SoT: ai-docs/task/active/260829_live_location_channel_task.md §7. push 전 코드리뷰(2026-08-29,
effort high) 확정 P0 회귀 테스트 — 강퇴/밴/자발적 나가기·1:1 차단이 활성 위치채널 멤버십을
건드리지 않아 이미 열린 SSE 스트림이 계속 상대 좌표를 수신하던 구멍을 막는다.

`test_location_channels.py` 와 동일하게 AsyncMock/SimpleNamespace 로 서비스 함수를 직접
호출한다(DB 없음).
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services import location_channel_membership as lcm


def _member(user_id, *, left_at=None, lat=None, lng=None, arrived_at=None):
    return SimpleNamespace(
        user_id=user_id,
        lat=lat,
        lng=lng,
        accuracy_m=None,
        heading=None,
        speed_mps=None,
        located_at=None,
        arrived_at=arrived_at,
        left_at=left_at,
    )


def _channel(*, members, created_by=None, created_at=None, expires_at=None, ended_at=None):
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        created_by=created_by or uuid.uuid4(),
        created_at=created_at or now,
        expires_at=expires_at or (now + timedelta(hours=3)),
        ended_at=ended_at,
        end_reason=None,
        members=members,
    )


def _rig(channel):
    db = AsyncMock()
    return db, patch.object(lcm, "_active_channel", AsyncMock(return_value=channel))


class ForceLeaveTest(unittest.IsolatedAsyncioTestCase):
    async def test_active_member_is_removed_and_broadcast(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        my_member = _member(me, lat=Decimal("10.5"), lng=Decimal("106.5"))
        channel = _channel(members=[my_member, _member(peer)], created_by=peer)
        db, active_patch = _rig(channel)

        published = []
        with (
            active_patch,
            patch.object(
                lcm.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
            patch.object(lcm.location_channel_broadcaster, "close_for_user", AsyncMock()) as close_mock,
            patch.object(lcm.location_eta, "enqueue_live_activity_update", AsyncMock()),
        ):
            await lcm.force_leave(db, channel.conversation_id, me, reason="kicked_or_left")

        self.assertIsNotNone(my_member.left_at)
        self.assertIsNone(my_member.lat)
        self.assertIsNone(my_member.lng)
        self.assertEqual(published[0]["type"], "member_left")
        self.assertEqual(published[0]["payload"]["userId"], str(me))
        close_mock.assert_awaited_once_with(str(channel.id), str(me))
        db.commit.assert_awaited()

    async def test_leaving_down_to_one_ends_channel(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        my_member = _member(me)
        peer_member = _member(peer)
        channel = _channel(
            members=[my_member, peer_member], created_by=peer, created_at=datetime.now(UTC) - timedelta(hours=1)
        )
        db, active_patch = _rig(channel)

        published = []
        with (
            active_patch,
            patch.object(
                lcm.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
            patch.object(lcm.location_channel_broadcaster, "close_for_user", AsyncMock()),
            patch.object(lcm.location_eta, "enqueue_live_activity_update", AsyncMock()),
        ):
            await lcm.force_leave(db, channel.conversation_id, me, reason="banned")

        self.assertIsNotNone(channel.ended_at)
        self.assertEqual(channel.end_reason, "members_left")
        self.assertEqual([e["type"] for e in published], ["member_left", "channel_ended"])

    async def test_no_active_channel_is_noop(self):
        db = AsyncMock()
        with patch.object(lcm, "_active_channel", AsyncMock(return_value=None)):
            await lcm.force_leave(db, uuid.uuid4(), uuid.uuid4(), reason="kicked_or_left")
        db.commit.assert_not_awaited()

    async def test_not_a_channel_member_is_noop(self):
        channel = _channel(members=[_member(uuid.uuid4())])
        db, active_patch = _rig(channel)
        with active_patch:
            await lcm.force_leave(db, channel.conversation_id, uuid.uuid4(), reason="kicked_or_left")
        db.commit.assert_not_awaited()

    async def test_already_left_member_is_noop(self):
        me = uuid.uuid4()
        channel = _channel(members=[_member(me, left_at=datetime.now(UTC))])
        db, active_patch = _rig(channel)
        with active_patch:
            await lcm.force_leave(db, channel.conversation_id, me, reason="kicked_or_left")
        db.commit.assert_not_awaited()

    async def test_exception_is_swallowed_not_raised(self):
        """원 요청(강퇴/밴)이 이미 커밋된 뒤 호출되므로, 이 서비스의 실패가 위로 전파되면 안 된다."""
        db = AsyncMock()
        with patch.object(lcm, "_active_channel", AsyncMock(side_effect=RuntimeError("boom"))):
            await lcm.force_leave(db, uuid.uuid4(), uuid.uuid4(), reason="kicked_or_left")  # 예외 없이 반환


class EndForBlockTest(unittest.IsolatedAsyncioTestCase):
    async def test_active_channel_ends_with_blocked_reason(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        my_member = _member(me, lat=Decimal("10.5"), lng=Decimal("106.5"))
        peer_member = _member(peer, lat=Decimal("10.6"), lng=Decimal("106.6"))
        channel = _channel(members=[my_member, peer_member])
        db, active_patch = _rig(channel)

        published = []
        with (
            active_patch,
            patch.object(
                lcm.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
            patch.object(lcm.location_eta, "enqueue_live_activity_update", AsyncMock()),
        ):
            await lcm.end_for_block(db, channel.conversation_id)

        self.assertIsNotNone(channel.ended_at)
        self.assertEqual(channel.end_reason, "blocked")
        self.assertIsNone(my_member.lat)
        self.assertIsNone(peer_member.lat)
        self.assertEqual(published[-1]["type"], "channel_ended")
        self.assertEqual(published[-1]["payload"]["endReason"], "blocked")
        db.commit.assert_awaited()

    async def test_no_active_channel_is_noop(self):
        db = AsyncMock()
        with patch.object(lcm, "_active_channel", AsyncMock(return_value=None)):
            await lcm.end_for_block(db, uuid.uuid4())
        db.commit.assert_not_awaited()

    async def test_exception_is_swallowed_not_raised(self):
        db = AsyncMock()
        with patch.object(lcm, "_active_channel", AsyncMock(side_effect=RuntimeError("boom"))):
            await lcm.end_for_block(db, uuid.uuid4())  # 예외 없이 반환


if __name__ == "__main__":
    unittest.main()
