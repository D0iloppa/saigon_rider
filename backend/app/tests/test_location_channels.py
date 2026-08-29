"""실시간 위치공유 채널(Live Location Channel) Phase 1 테스트.

SoT: ai-docs/task/active/260829_live_location_channel_task.md. 스타일은
`test_deal_location_sharing_standalone.py` 와 동일하게 AsyncMock/SimpleNamespace 로 라우터
함수를 직접 호출한다(DB 없음). 로더 헬퍼(`_active_channel_for_conversation` 등)는 patch 로
대체해 도메인 로직만 검증한다.

독립 리뷰(실 HTTP 스모크) 지적 4건(P0-1/P0-2/P1/P2) 회귀 테스트를 포함한다.
"""

import asyncio
import unittest
import uuid
from contextlib import ExitStack, contextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models import LocationChannelDestProposal
from app.routers import location_channels as lc
from app.schemas import (
    LocationChannelCreateRequest,
    LocationChannelDestIn,
    LocationChannelDestinationRequest,
    LocationChannelPingRequest,
    LocationChannelVoteRequest,
)
from app.services.location_channel_broadcast import InProcessLocationChannelBroadcaster
from app.services.location_channel_lifecycle import resolve_end_reason


def _user(nickname="Rider"):
    return SimpleNamespace(id=uuid.uuid4(), nickname=nickname, avatar_content=None, avatar_url=None)


def _member(user_id, *, left_at=None, lat=None, lng=None, arrived_at=None, user=None):
    return SimpleNamespace(
        user_id=user_id,
        consented_at=datetime.now(UTC),
        consent_version="v1",
        lat=lat,
        lng=lng,
        accuracy_m=None,
        heading=None,
        speed_mps=None,
        located_at=None,
        eta_s=None,
        distance_m=None,
        eta_computed_at=None,
        arrived_at=arrived_at,
        left_at=left_at,
        user=user or _user(),
    )


def _channel(
    *, members, dest_lat=None, dest_lng=None, created_by=None, created_at=None, expires_at=None, ended_at=None
):
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        appointment_id=None,
        dest_lat=dest_lat,
        dest_lng=dest_lng,
        dest_name=None,
        created_by=created_by or uuid.uuid4(),
        created_at=created_at or now,
        expires_at=expires_at or (now + timedelta(hours=3)),
        ended_at=ended_at,
        end_reason=None,
        members=members,
    )


def _proposal(
    *,
    channel_id,
    proposed_by,
    lat=10.9,
    lng=106.9,
    name=None,
    status="pending",
    created_at=None,
    expires_at=None,
    votes=None,
):
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        channel_id=channel_id,
        proposed_by=proposed_by,
        lat=Decimal(str(lat)),
        lng=Decimal(str(lng)),
        name=name,
        status=status,
        created_at=created_at or now,
        resolved_at=None,
        expires_at=expires_at or (now + timedelta(minutes=5)),
        proposer=_user(),
        votes=votes if votes is not None else [],
    )


def _rig(channel):
    """공통 로더/접근검사 헬퍼를 patch 로 대체 — DB·차단검사 없이 라우터 로직만 검증한다."""
    db = AsyncMock()
    db.add = MagicMock()
    conv = SimpleNamespace(
        id=channel.conversation_id, conversation_type="direct", participant_1=None, participant_2=None
    )

    @contextmanager
    def _patched():
        with ExitStack() as stack:
            stack.enter_context(patch.object(lc, "_get_conversation", AsyncMock(return_value=conv)))
            stack.enter_context(patch.object(lc, "_require_conversation_membership", AsyncMock(return_value=None)))
            stack.enter_context(patch.object(lc, "_require_conversation_access", AsyncMock(return_value=None)))
            stack.enter_context(patch.object(lc, "_active_channel_for_conversation", AsyncMock(return_value=channel)))
            stack.enter_context(patch.object(lc, "_load_channel_full", AsyncMock(return_value=channel)))
            # Phase 2: `_serialize_channel_full`/`_expire_pending_proposal_if_stale` 모두 이 leaf 를
            # 거친다 — DB 없는 이 rig 에서는 "pending 제안 없음" 으로 고정해 Phase 1 로직만 검증한다.
            stack.enter_context(patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=None)))
            yield

    return db, _patched()


class _PlainNewChannel:
    """P0-1 회귀 테스트 전용 — `lc.LocationChannel` 대역. `members` 를 명시적으로 set 하기 전에
    읽으면(회귀했다면) 예외를 던져, 실 SQLAlchemy 의 flush 직후 lazy selectin 동기 접근
    (MissingGreenlet) 을 흉내낸다. side_effect 우회 없이 라우터 로직 자체를 검증한다.
    """

    def __init__(self, **kwargs):
        self.id = uuid.uuid4()
        self.ended_at = None
        self.end_reason = None
        members = kwargs.pop("members", None)
        for k, v in kwargs.items():
            setattr(self, k, v)
        if members is not None:
            self._members = members

    @property
    def members(self):
        if not hasattr(self, "_members"):
            raise RuntimeError("simulated MissingGreenlet: read `.members` before it was explicitly set")
        return self._members

    @members.setter
    def members(self, value):
        self._members = value


class _PlainNewMember:
    """P0-1 회귀 테스트 전용 — `lc.LocationChannelMember` 대역. 실 SQLAlchemy 관계 로딩과
    무관하게 `.user` 를 즉시 갖는 평범한 객체라 `_member_out` 직렬화가 그대로 통과한다.
    """

    def __init__(self, **kwargs):
        self.user = _user()
        self.left_at = None
        self.lat = None
        self.lng = None
        self.accuracy_m = None
        self.heading = None
        self.speed_mps = None
        self.located_at = None
        self.arrived_at = None
        self.eta_s = None
        self.distance_m = None
        self.eta_computed_at = None
        for k, v in kwargs.items():
            setattr(self, k, v)


class ResolveEndReasonTest(unittest.TestCase):
    def test_ttl_expired(self):
        now = datetime.now(UTC)
        channel = SimpleNamespace(
            expires_at=now - timedelta(seconds=1), created_at=now - timedelta(hours=1), created_by=uuid.uuid4()
        )
        members = [SimpleNamespace(user_id=uuid.uuid4(), arrived_at=None)]
        self.assertEqual(resolve_end_reason(channel, members, now), "ttl")

    def test_all_arrived_after_grace(self):
        now = datetime.now(UTC)
        channel = SimpleNamespace(
            expires_at=now + timedelta(hours=1), created_at=now - timedelta(hours=1), created_by=uuid.uuid4()
        )
        arrived = now - timedelta(minutes=16)
        members = [
            SimpleNamespace(user_id=uuid.uuid4(), arrived_at=arrived),
            SimpleNamespace(user_id=uuid.uuid4(), arrived_at=arrived + timedelta(minutes=1)),
        ]
        self.assertEqual(resolve_end_reason(channel, members, now), "all_arrived")

    def test_all_arrived_within_grace_does_not_end(self):
        now = datetime.now(UTC)
        channel = SimpleNamespace(
            expires_at=now + timedelta(hours=1), created_at=now - timedelta(hours=1), created_by=uuid.uuid4()
        )
        members = [
            SimpleNamespace(user_id=uuid.uuid4(), arrived_at=now - timedelta(minutes=5)),
            SimpleNamespace(user_id=uuid.uuid4(), arrived_at=now - timedelta(minutes=4)),
        ]
        self.assertIsNone(resolve_end_reason(channel, members, now))

    def test_members_left_down_to_one(self):
        now = datetime.now(UTC)
        creator = uuid.uuid4()
        channel = SimpleNamespace(
            expires_at=now + timedelta(hours=1), created_at=now - timedelta(hours=1), created_by=creator
        )
        # 남은 1명이 창설자가 아니고, 생성한 지 오래 지남 -> 종료
        members = [SimpleNamespace(user_id=uuid.uuid4(), arrived_at=None)]
        self.assertEqual(resolve_end_reason(channel, members, now), "members_left")

    def test_solo_creator_within_join_grace_window_does_not_end(self):
        now = datetime.now(UTC)
        creator = uuid.uuid4()
        channel = SimpleNamespace(
            expires_at=now + timedelta(hours=3), created_at=now - timedelta(minutes=2), created_by=creator
        )
        members = [SimpleNamespace(user_id=creator, arrived_at=None)]
        self.assertIsNone(resolve_end_reason(channel, members, now))

    def test_solo_creator_after_join_grace_window_ends(self):
        now = datetime.now(UTC)
        creator = uuid.uuid4()
        channel = SimpleNamespace(
            expires_at=now + timedelta(hours=3), created_at=now - timedelta(minutes=11), created_by=creator
        )
        members = [SimpleNamespace(user_id=creator, arrived_at=None)]
        self.assertEqual(resolve_end_reason(channel, members, now), "members_left")

    def test_two_active_members_does_not_end(self):
        now = datetime.now(UTC)
        channel = SimpleNamespace(
            expires_at=now + timedelta(hours=1), created_at=now - timedelta(hours=1), created_by=uuid.uuid4()
        )
        members = [
            SimpleNamespace(user_id=uuid.uuid4(), arrived_at=None),
            SimpleNamespace(user_id=uuid.uuid4(), arrived_at=None),
        ]
        self.assertIsNone(resolve_end_reason(channel, members, now))


class CreateOrJoinChannelTest(unittest.IsolatedAsyncioTestCase):
    async def test_join_existing_channel_upserts_member(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        channel = _channel(members=[_member(peer)], created_by=peer)
        db, patches = _rig(channel)

        published = []
        with (
            patches,
            patch.object(lc, "LocationChannelMember", _PlainNewMember),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            out = await lc.create_or_join_channel(
                channel.conversation_id, LocationChannelCreateRequest(consent_version="v2"), db=db, session_uid=me
            )

        self.assertTrue(out["me"]["joined"])
        self.assertEqual({m["userId"] for m in out["members"]}, {str(me), str(peer)})
        db.commit.assert_awaited()
        # P2: member_joined 페이로드에 nickname/avatarUrl 이 실려야 한다.
        self.assertEqual(published[0]["type"], "member_joined")
        self.assertEqual(published[0]["payload"]["userId"], str(me))
        self.assertIsNotNone(published[0]["payload"]["nickname"])
        self.assertIsNotNone(published[0]["payload"]["avatarUrl"])

    async def test_create_new_channel_when_none_active(self):
        """P0-1 회귀: 신규 채널 생성 직후 `.members` 를 (구현이 실수로) 동기 접근하면 즉시 터진다
        (side_effect 로 members=[] 를 몰래 주입하는 우회 없음 — `_PlainNewChannel` 이 실제로 감시).
        """
        me = uuid.uuid4()
        conv_id = uuid.uuid4()
        conv = SimpleNamespace(id=conv_id, conversation_type="direct", participant_1=me, participant_2=uuid.uuid4())
        db = AsyncMock()
        db.add = MagicMock()

        created_holder = {}

        def add_side_effect(obj):
            if isinstance(obj, _PlainNewChannel):
                created_holder["channel"] = obj

        db.add.side_effect = add_side_effect

        with (
            patch.object(lc, "_get_conversation", AsyncMock(return_value=conv)),
            patch.object(lc, "_require_conversation_access", AsyncMock(return_value=None)),
            patch.object(lc, "_active_channel_for_conversation", AsyncMock(return_value=None)),
            patch.object(lc, "LocationChannel", _PlainNewChannel),
            patch.object(lc, "LocationChannelMember", _PlainNewMember),
            patch.object(lc, "_load_channel_full", AsyncMock(side_effect=lambda db, cid: created_holder["channel"])),
            patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=None)),
            patch.object(lc.location_channel_broadcaster, "publish", AsyncMock()),
        ):
            out = await lc.create_or_join_channel(
                conv_id, LocationChannelCreateRequest(consent_version="v1"), db=db, session_uid=me
            )

        self.assertEqual(out["conversationId"], str(conv_id))
        self.assertTrue(out["me"]["joined"])
        self.assertAlmostEqual(
            (created_holder["channel"].expires_at - datetime.now(UTC)).total_seconds(),
            timedelta(hours=3).total_seconds(),
            delta=5,
        )


class GetChannelStateTest(unittest.IsolatedAsyncioTestCase):
    async def test_member_can_read_state(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        channel = _channel(members=[_member(me), _member(peer)], created_by=me)
        db, patches = _rig(channel)

        with patches:
            out = await lc.get_channel_state(channel.conversation_id, db=db, session_uid=me)

        self.assertEqual(out["id"], str(channel.id))
        self.assertTrue(out["me"]["joined"])

    async def test_non_member_gets_403(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        channel = _channel(members=[_member(peer)], created_by=peer)
        db, patches = _rig(channel)

        with patches, self.assertRaises(HTTPException) as ctx:
            await lc.get_channel_state(channel.conversation_id, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_left_member_gets_403(self):
        me = uuid.uuid4()
        channel = _channel(members=[_member(me, left_at=datetime.now(UTC))], created_by=me)
        db, patches = _rig(channel)

        with patches, self.assertRaises(HTTPException) as ctx:
            await lc.get_channel_state(channel.conversation_id, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_no_active_channel_is_404(self):
        me = uuid.uuid4()
        conv_id = uuid.uuid4()
        db = AsyncMock()
        conv = SimpleNamespace(id=conv_id, conversation_type="direct", participant_1=me, participant_2=uuid.uuid4())
        with (
            patch.object(lc, "_get_conversation", AsyncMock(return_value=conv)),
            patch.object(lc, "_require_conversation_access", AsyncMock(return_value=None)),
            patch.object(lc, "_active_channel_for_conversation", AsyncMock(return_value=None)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc.get_channel_state(conv_id, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 404)


class LeaveChannelTest(unittest.IsolatedAsyncioTestCase):
    async def test_leave_nulls_coordinates_and_broadcasts(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        my_member = _member(me, lat=Decimal("10.5"), lng=Decimal("106.5"))
        channel = _channel(members=[my_member, _member(peer)], created_by=peer)
        db, patches = _rig(channel)

        published = []
        with (
            patches,
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
            patch.object(lc.location_channel_broadcaster, "close_for_user", AsyncMock()) as close_mock,
        ):
            await lc.leave_channel(channel.conversation_id, db=db, session_uid=me)

        self.assertIsNone(my_member.lat)
        self.assertIsNone(my_member.lng)
        self.assertIsNotNone(my_member.left_at)
        self.assertEqual(published[0]["type"], "member_left")
        # P1: 나간 사람 본인의 SSE 큐를 즉시 닫는다.
        close_mock.assert_awaited_once_with(str(channel.id), str(me))
        db.commit.assert_awaited()

    async def test_leaving_down_to_one_ends_channel(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        my_member = _member(me)
        peer_member = _member(peer)
        channel = _channel(
            members=[my_member, peer_member], created_by=peer, created_at=datetime.now(UTC) - timedelta(hours=1)
        )
        db, patches = _rig(channel)

        published = []
        with (
            patches,
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
            patch.object(lc.location_channel_broadcaster, "close_for_user", AsyncMock()),
        ):
            await lc.leave_channel(channel.conversation_id, db=db, session_uid=me)

        self.assertIsNotNone(channel.ended_at)
        self.assertEqual(channel.end_reason, "members_left")
        self.assertEqual([e["type"] for e in published], ["member_left", "channel_ended"])


class PingLocationTest(unittest.IsolatedAsyncioTestCase):
    def _rig_ping(self, member, channel, conv=None):
        db = AsyncMock()
        conv = conv or SimpleNamespace(
            id=channel.conversation_id if channel else uuid.uuid4(),
            conversation_type="direct",
            participant_1=None,
            participant_2=None,
        )

        @contextmanager
        def _patched():
            with ExitStack() as stack:
                stack.enter_context(patch.object(lc, "_get_conversation", AsyncMock(return_value=conv)))
                stack.enter_context(patch.object(lc, "_require_conversation_access", AsyncMock(return_value=None)))
                stack.enter_context(
                    patch.object(lc, "_member_and_channel_for_ping", AsyncMock(return_value=(member, channel)))
                )
                stack.enter_context(patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=None)))
                yield

        return db, _patched()

    async def test_accuracy_over_35_rejected_before_touching_db(self):
        db = AsyncMock()
        body = LocationChannelPingRequest(lat=10.77, lng=106.69, accuracy_m=36)
        with self.assertRaises(HTTPException) as ctx:
            await lc.ping_location(uuid.uuid4(), body, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 400)
        db.execute.assert_not_called()
        db.get.assert_not_called()

    async def test_not_a_member_is_403(self):
        db, rig = self._rig_ping(None, None)
        body = LocationChannelPingRequest(lat=10.77, lng=106.69, accuracy_m=10)
        with rig, self.assertRaises(HTTPException) as ctx:
            await lc.ping_location(uuid.uuid4(), body, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_ended_channel_is_410(self):
        me = uuid.uuid4()
        member = _member(me)
        channel = _channel(members=[member], ended_at=datetime.now(UTC))
        db, rig = self._rig_ping(member, channel)
        body = LocationChannelPingRequest(lat=10.77, lng=106.69, accuracy_m=10)
        with rig, self.assertRaises(HTTPException) as ctx:
            await lc.ping_location(channel.conversation_id, body, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 410)

    async def test_ping_updates_location_and_broadcasts(self):
        me = uuid.uuid4()
        member = _member(me)
        channel = _channel(members=[member], created_by=me)
        db, rig = self._rig_ping(member, channel)
        body = LocationChannelPingRequest(lat=10.77, lng=106.69, accuracy_m=10)

        published = []
        with (
            rig,
            patch.object(lc, "_load_channel_full", AsyncMock(return_value=channel)),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            out = await lc.ping_location(channel.conversation_id, body, db=db, session_uid=me)

        self.assertEqual(member.lat, Decimal("10.77"))
        self.assertEqual(published[0]["type"], "location")
        self.assertEqual(published[0]["payload"]["userId"], str(me))
        self.assertEqual(out["id"], str(channel.id))
        db.commit.assert_awaited()

    async def test_arrival_within_radius_sets_arrived_and_broadcasts(self):
        me = uuid.uuid4()
        member = _member(me)
        # 목적지와 거의 동일한 좌표 -> 40m 반경 이내
        channel = _channel(
            members=[member], dest_lat=Decimal("10.771234"), dest_lng=Decimal("106.691234"), created_by=me
        )
        db, rig = self._rig_ping(member, channel)
        body = LocationChannelPingRequest(lat=10.771234, lng=106.691234, accuracy_m=10)

        published = []
        with (
            rig,
            patch.object(lc, "_load_channel_full", AsyncMock(return_value=channel)),
            patch.object(lc.location_eta, "compute_and_broadcast", AsyncMock()),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            await lc.ping_location(channel.conversation_id, body, db=db, session_uid=me)

        self.assertIsNotNone(member.arrived_at)
        self.assertIn("arrived", [e["type"] for e in published])


class SetDestinationTest(unittest.IsolatedAsyncioTestCase):
    async def test_first_set_when_dest_null_is_immediate(self):
        me = uuid.uuid4()
        channel = _channel(members=[_member(me)], dest_lat=None, dest_lng=None)
        db, patches = _rig(channel)
        body = LocationChannelDestinationRequest(lat=10.7, lng=106.7, name="A")

        with patches, patch.object(lc, "_schedule_eta_task", MagicMock()) as schedule_mock:
            out = await lc.set_destination(channel.conversation_id, body, db=db, session_uid=me)

        self.assertEqual(out["dest"]["lat"], 10.7)
        self.assertEqual(channel.dest_lat, Decimal("10.7"))
        schedule_mock.assert_called_once_with(channel.id, [me])

    async def test_change_with_two_active_members_requires_proposal(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        channel = _channel(members=[_member(me), _member(peer)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7"))
        db, patches = _rig(channel)
        body = LocationChannelDestinationRequest(lat=10.8, lng=106.8)

        with patches, self.assertRaises(HTTPException) as ctx:
            await lc.set_destination(channel.conversation_id, body, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_change_with_single_active_member_is_immediate(self):
        me = uuid.uuid4()
        channel = _channel(members=[_member(me)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7"))
        db, patches = _rig(channel)
        body = LocationChannelDestinationRequest(lat=10.8, lng=106.8)

        with patches, patch.object(lc, "_schedule_eta_task", MagicMock()) as schedule_mock:
            out = await lc.set_destination(channel.conversation_id, body, db=db, session_uid=me)
        self.assertEqual(out["dest"]["lat"], 10.8)
        schedule_mock.assert_called_once_with(channel.id, [me])


class RequireConversationAccessBlockTest(unittest.IsolatedAsyncioTestCase):
    """P0-2 — 차단 관계 검사 + 1:1 채널 즉시 종료."""

    async def test_blocked_direct_pair_ends_active_channel_then_raises_403(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = SimpleNamespace(id=uuid.uuid4(), conversation_type="direct", participant_1=me, participant_2=peer)
        my_member = _member(me, lat=Decimal("10.7"), lng=Decimal("106.7"))
        channel = _channel(members=[my_member, _member(peer)], created_by=me)
        db = AsyncMock()

        published = []
        with (
            patch.object(lc, "_active_channel_for_conversation", AsyncMock(return_value=channel)),
            patch.object(
                lc, "require_unblocked", AsyncMock(side_effect=HTTPException(status_code=403, detail="blocked"))
            ),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc._require_conversation_access(db, conv, me)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIsNotNone(channel.ended_at)
        self.assertEqual(channel.end_reason, "blocked")
        self.assertIsNone(my_member.lat)
        self.assertEqual(published[-1]["type"], "channel_ended")
        self.assertEqual(published[-1]["payload"]["endReason"], "blocked")
        db.commit.assert_awaited()

    async def test_blocked_pair_without_active_channel_still_raises_403(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = SimpleNamespace(id=uuid.uuid4(), conversation_type="direct", participant_1=me, participant_2=peer)
        db = AsyncMock()
        with (
            patch.object(lc, "_active_channel_for_conversation", AsyncMock(return_value=None)),
            patch.object(
                lc, "require_unblocked", AsyncMock(side_effect=HTTPException(status_code=403, detail="blocked"))
            ),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc._require_conversation_access(db, conv, me)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_unblocked_pair_passes(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = SimpleNamespace(id=uuid.uuid4(), conversation_type="direct", participant_1=me, participant_2=peer)
        db = AsyncMock()
        with patch.object(lc, "require_unblocked", AsyncMock(return_value=None)):
            await lc._require_conversation_access(db, conv, me)  # 예외 없이 통과

    async def test_group_conversation_skips_block_check(self):
        me = uuid.uuid4()
        conv = SimpleNamespace(id=uuid.uuid4(), conversation_type="group")
        db = AsyncMock()
        with (
            patch.object(lc, "require_member", AsyncMock(return_value=SimpleNamespace(role="member"))),
            patch.object(
                lc, "require_unblocked", AsyncMock(side_effect=AssertionError("group 방은 차단검사를 타면 안 된다"))
            ),
        ):
            await lc._require_conversation_access(db, conv, me)  # AssertionError 없이 통과해야 함


class BlockedPairEndpointWiringTest(unittest.IsolatedAsyncioTestCase):
    """엔드포인트가 실제로 `_require_conversation_access` 를 거치는지(배선) 확인."""

    async def test_join_blocked_pair_is_403(self):
        me = uuid.uuid4()
        conv_id = uuid.uuid4()
        conv = SimpleNamespace(id=conv_id, conversation_type="direct", participant_1=me, participant_2=uuid.uuid4())
        db = AsyncMock()
        with (
            patch.object(lc, "_get_conversation", AsyncMock(return_value=conv)),
            patch.object(
                lc,
                "_require_conversation_access",
                AsyncMock(side_effect=HTTPException(status_code=403, detail="blocked")),
            ),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc.create_or_join_channel(
                conv_id, LocationChannelCreateRequest(consent_version="v1"), db=db, session_uid=me
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_state_after_block_is_403(self):
        me = uuid.uuid4()
        conv_id = uuid.uuid4()
        conv = SimpleNamespace(id=conv_id, conversation_type="direct", participant_1=me, participant_2=uuid.uuid4())
        db = AsyncMock()
        with (
            patch.object(lc, "_get_conversation", AsyncMock(return_value=conv)),
            patch.object(
                lc,
                "_require_conversation_access",
                AsyncMock(side_effect=HTTPException(status_code=403, detail="blocked")),
            ),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc.get_channel_state(conv_id, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 403)


class SseBroadcastSmokeTest(unittest.IsolatedAsyncioTestCase):
    """SSE 구독자가 실제로 `location` 이벤트를 수신하는지 큐 레벨에서 검증한다."""

    async def test_subscriber_receives_location_event_on_ping(self):
        me = uuid.uuid4()
        member = _member(me)
        channel = _channel(members=[member], created_by=me)
        db = AsyncMock()
        body = LocationChannelPingRequest(lat=10.77, lng=106.69, accuracy_m=10)

        broadcaster = lc.location_channel_broadcaster
        async with broadcaster.subscribe(str(channel.id)) as queue:
            with (
                patch.object(
                    lc,
                    "_get_conversation",
                    AsyncMock(
                        return_value=SimpleNamespace(
                            id=channel.conversation_id,
                            conversation_type="direct",
                            participant_1=me,
                            participant_2=uuid.uuid4(),
                        )
                    ),
                ),
                patch.object(lc, "_require_conversation_access", AsyncMock(return_value=None)),
                patch.object(lc, "_member_and_channel_for_ping", AsyncMock(return_value=(member, channel))),
                patch.object(lc, "_load_channel_full", AsyncMock(return_value=channel)),
                patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=None)),
            ):
                await lc.ping_location(channel.conversation_id, body, db=db, session_uid=me)

            event = await asyncio.wait_for(queue.get(), timeout=1)
        self.assertEqual(event["type"], "location")
        self.assertEqual(event["payload"]["lat"], 10.77)


class SseCloseOnLeaveTest(unittest.IsolatedAsyncioTestCase):
    """P1 — 나간 사용자 본인의 구독 큐가 즉시 종료 신호를 받는지(다음 keepalive 를 기다리지 않음)."""

    async def test_subscriber_queue_gets_stream_closed_signal_on_leave(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        my_member = _member(me)
        channel = _channel(members=[my_member, _member(peer)], created_by=peer)
        db, patches = _rig(channel)

        broadcaster = lc.location_channel_broadcaster
        async with broadcaster.subscribe(str(channel.id), str(me)) as queue:
            with patches:
                await lc.leave_channel(channel.conversation_id, db=db, session_uid=me)

            first = await asyncio.wait_for(queue.get(), timeout=1)
            self.assertEqual(first["type"], "member_left")
            second = await asyncio.wait_for(queue.get(), timeout=1)
            self.assertEqual(second["type"], "_stream_closed")


class IsActiveMemberTest(unittest.IsolatedAsyncioTestCase):
    """P1 — SSE keepalive tick 재확인에 쓰는 헬퍼의 3가지 결과."""

    def _db_returning(self, row):
        db = AsyncMock()
        result = MagicMock()
        result.first.return_value = row
        db.execute = AsyncMock(return_value=result)
        return db

    async def test_active_member_returns_true(self):
        db = self._db_returning((None, None))
        self.assertTrue(await lc._is_active_member(db, uuid.uuid4(), uuid.uuid4()))

    async def test_left_member_returns_false(self):
        db = self._db_returning((datetime.now(UTC), None))
        self.assertFalse(await lc._is_active_member(db, uuid.uuid4(), uuid.uuid4()))

    async def test_ended_channel_returns_false(self):
        db = self._db_returning((None, datetime.now(UTC)))
        self.assertFalse(await lc._is_active_member(db, uuid.uuid4(), uuid.uuid4()))

    async def test_no_row_returns_false(self):
        db = self._db_returning(None)
        self.assertFalse(await lc._is_active_member(db, uuid.uuid4(), uuid.uuid4()))


class BroadcasterUnitTest(unittest.IsolatedAsyncioTestCase):
    async def test_publish_to_no_subscribers_is_noop(self):
        b = InProcessLocationChannelBroadcaster()
        await b.publish("nope", {"type": "x"})  # 예외 없이 조용히 무시

    async def test_subscribe_then_unsubscribe_clears_registry(self):
        b = InProcessLocationChannelBroadcaster()
        async with b.subscribe("ch1") as q:
            await b.publish("ch1", {"type": "location"})
            event = await q.get()
            self.assertEqual(event["type"], "location")
        self.assertEqual(b.subscriber_count, 0)

    async def test_close_for_user_only_signals_that_users_queue(self):
        b = InProcessLocationChannelBroadcaster()
        async with b.subscribe("ch1", "userA") as qa, b.subscribe("ch1", "userB") as qb:
            await b.close_for_user("ch1", "userA")
            signal = await asyncio.wait_for(qa.get(), timeout=1)
            self.assertEqual(signal["type"], "_stream_closed")
            self.assertTrue(qb.empty())


class ProposeDestinationTest(unittest.IsolatedAsyncioTestCase):
    async def test_single_active_member_is_immediate(self):
        me = uuid.uuid4()
        channel = _channel(members=[_member(me)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7"))
        db, patches = _rig(channel)
        body = LocationChannelDestIn(lat=10.8, lng=106.8, name="B")

        published = []
        with (
            patches,
            patch.object(lc, "_schedule_eta_task", MagicMock()) as schedule_mock,
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            out = await lc.propose_destination(channel.conversation_id, body, db=db, session_uid=me)

        self.assertEqual(out["dest"]["lat"], 10.8)
        self.assertIsNone(out["pendingProposal"])
        self.assertEqual(published[0]["type"], "dest_set")
        schedule_mock.assert_called_once_with(channel.id, [me])

    async def test_two_active_members_creates_pending_proposal(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        channel = _channel(members=[_member(me), _member(peer)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7"))
        db, patches = _rig(channel)
        body = LocationChannelDestIn(lat=10.8, lng=106.8, name="B")

        created = _proposal(channel_id=channel.id, proposed_by=me, lat=10.8, lng=106.8, name="B")
        published = []
        with (
            patches,
            patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=None)),
            patch.object(lc, "_get_proposal", AsyncMock(return_value=created)),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            out = await lc.propose_destination(channel.conversation_id, body, db=db, session_uid=me)

        # 목적지는 아직 미확정 — 기존 값 유지.
        self.assertEqual(out["dest"]["lat"], 10.7)
        db.add.assert_called()
        added = db.add.call_args[0][0]
        self.assertIsInstance(added, LocationChannelDestProposal)
        self.assertEqual(added.proposed_by, me)
        self.assertEqual(published[-1]["type"], "dest_proposed")

    async def test_concurrent_insert_integrity_error_becomes_409(self):
        """W7 P1 TOCTOU — 애플리케이션 체크(existing is None) 통과 후 커밋 시점의 partial unique
        위반(init/224)을 IntegrityError 로 잡아 409 pending_exists 로 변환하고 rollback 한다."""
        me, peer = uuid.uuid4(), uuid.uuid4()
        channel = _channel(members=[_member(me), _member(peer)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7"))
        db, patches = _rig(channel)
        body = LocationChannelDestIn(lat=10.8, lng=106.8)

        db.commit = AsyncMock(side_effect=IntegrityError("insert", {}, Exception("dup")))
        db.rollback = AsyncMock()

        with (
            patches,
            patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=None)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc.propose_destination(channel.conversation_id, body, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "pending_exists")
        db.rollback.assert_awaited()

    async def test_pending_exists_is_409(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        channel = _channel(members=[_member(me), _member(peer)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7"))
        db, patches = _rig(channel)
        body = LocationChannelDestIn(lat=10.8, lng=106.8)
        existing = _proposal(channel_id=channel.id, proposed_by=peer)

        with (
            patches,
            patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=existing)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc.propose_destination(channel.conversation_id, body, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "pending_exists")


class VoteDestinationProposalTest(unittest.IsolatedAsyncioTestCase):
    async def test_proposer_cannot_vote(self):
        proposer, voter = uuid.uuid4(), uuid.uuid4()
        channel = _channel(
            members=[_member(proposer), _member(voter)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7")
        )
        proposal = _proposal(channel_id=channel.id, proposed_by=proposer)
        db, patches = _rig(channel)
        body = LocationChannelVoteRequest(accept=True)

        with (
            patches,
            patch.object(lc, "_get_proposal_for_update", AsyncMock(return_value=proposal)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc.vote_destination_proposal(channel.conversation_id, proposal.id, body, db=db, session_uid=proposer)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail["code"], "proposer_cannot_vote")

    async def test_accept_by_sole_required_voter_resolves_accepted(self):
        proposer, voter = uuid.uuid4(), uuid.uuid4()
        channel = _channel(
            members=[_member(proposer), _member(voter)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7")
        )
        resolved_proposal = _proposal(channel_id=channel.id, proposed_by=proposer, lat=10.9, lng=106.9)
        db, patches = _rig(channel)
        # 투표 반영 확인(accepted_voters)은 votes 테이블 직접 조회로 이뤄진다(flush 만으로는
        # `proposal.votes` selectin 이 재로딩되지 않음) — voter 의 accept 표를 이미 반영된 것으로 응답.
        votes_result = MagicMock()
        votes_result.scalars.return_value.all.return_value = [
            SimpleNamespace(user_id=voter, accept=True, voted_at=datetime.now(UTC))
        ]
        db.execute = AsyncMock(return_value=votes_result)
        body = LocationChannelVoteRequest(accept=True)

        published = []
        with (
            patches,
            patch.object(lc, "_get_proposal_for_update", AsyncMock(return_value=resolved_proposal)),
            patch.object(lc, "_schedule_eta_task", MagicMock()) as schedule_mock,
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            out = await lc.vote_destination_proposal(
                channel.conversation_id, resolved_proposal.id, body, db=db, session_uid=voter
            )

        self.assertEqual(resolved_proposal.status, "accepted")
        self.assertEqual(channel.dest_lat, resolved_proposal.lat)
        self.assertEqual(out["dest"]["lat"], 10.9)
        self.assertIn("dest_vote", [e["type"] for e in published])
        # 완료기준(c) — 목적지가 실제로 바뀌면 전원 재계산이 1회 예약된다.
        schedule_mock.assert_called_once()
        self.assertEqual(schedule_mock.call_args[0][0], channel.id)
        self.assertEqual(set(schedule_mock.call_args[0][1]), {proposer, voter})
        resolved_events = [e for e in published if e["type"] == "dest_resolved"]
        self.assertEqual(resolved_events[-1]["payload"]["status"], "accepted")

    async def test_reject_resolves_rejected_without_changing_dest(self):
        proposer, voter = uuid.uuid4(), uuid.uuid4()
        channel = _channel(
            members=[_member(proposer), _member(voter)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7")
        )
        proposal = _proposal(channel_id=channel.id, proposed_by=proposer, lat=10.9, lng=106.9)
        db, patches = _rig(channel)
        body = LocationChannelVoteRequest(accept=False)

        published = []
        with (
            patches,
            patch.object(lc, "_get_proposal_for_update", AsyncMock(return_value=proposal)),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            out = await lc.vote_destination_proposal(
                channel.conversation_id, proposal.id, body, db=db, session_uid=voter
            )

        self.assertEqual(proposal.status, "rejected")
        self.assertEqual(out["dest"]["lat"], 10.7)  # 목적지 불변
        resolved_events = [e for e in published if e["type"] == "dest_resolved"]
        self.assertEqual(resolved_events[-1]["payload"]["status"], "rejected")


class WithdrawDestinationProposalTest(unittest.IsolatedAsyncioTestCase):
    async def test_non_proposer_gets_403(self):
        proposer, other = uuid.uuid4(), uuid.uuid4()
        channel = _channel(
            members=[_member(proposer), _member(other)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7")
        )
        proposal = _proposal(channel_id=channel.id, proposed_by=proposer)
        db, patches = _rig(channel)

        with (
            patches,
            patch.object(lc, "_get_proposal", AsyncMock(return_value=proposal)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await lc.withdraw_destination_proposal(channel.conversation_id, proposal.id, db=db, session_uid=other)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_proposer_withdraws(self):
        proposer, other = uuid.uuid4(), uuid.uuid4()
        channel = _channel(
            members=[_member(proposer), _member(other)], dest_lat=Decimal("10.7"), dest_lng=Decimal("106.7")
        )
        proposal = _proposal(channel_id=channel.id, proposed_by=proposer)
        db, patches = _rig(channel)

        published = []
        with (
            patches,
            patch.object(lc, "_get_proposal", AsyncMock(return_value=proposal)),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            await lc.withdraw_destination_proposal(channel.conversation_id, proposal.id, db=db, session_uid=proposer)

        self.assertEqual(proposal.status, "withdrawn")
        self.assertEqual(published[-1]["payload"]["status"], "withdrawn")


class GetProposalForUpdateLocksRowTest(unittest.IsolatedAsyncioTestCase):
    """W7 P1 — 수락 판정 경합 방지용 행 잠금이 실제로 컴파일된 SQL 에 FOR UPDATE 를 싣는지."""

    async def test_compiled_sql_includes_for_update(self):
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        captured = {}

        async def _execute(stmt):
            captured["stmt"] = stmt
            return result

        db.execute = _execute
        await lc._get_proposal_for_update(db, uuid.uuid4())
        compiled = str(captured["stmt"].compile(compile_kwargs={"literal_binds": True}))
        self.assertIn("FOR UPDATE", compiled.upper())


class ExpirePendingProposalTest(unittest.IsolatedAsyncioTestCase):
    async def test_expires_stale_pending_proposal(self):
        channel_id = uuid.uuid4()
        now = datetime.now(UTC)
        proposal = _proposal(channel_id=channel_id, proposed_by=uuid.uuid4(), expires_at=now - timedelta(seconds=1))
        db = AsyncMock()

        published = []
        with (
            patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=proposal)),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=lambda cid, e: published.append(e))
            ),
        ):
            await lc._expire_pending_proposal_if_stale(db, channel_id, now)

        self.assertEqual(proposal.status, "expired")
        self.assertEqual(published[0]["type"], "dest_resolved")
        self.assertEqual(published[0]["payload"]["status"], "expired")

    async def test_not_yet_expired_stays_pending(self):
        channel_id = uuid.uuid4()
        now = datetime.now(UTC)
        proposal = _proposal(channel_id=channel_id, proposed_by=uuid.uuid4(), expires_at=now + timedelta(minutes=1))
        db = AsyncMock()

        with (
            patch.object(lc, "_active_pending_proposal", AsyncMock(return_value=proposal)),
            patch.object(
                lc.location_channel_broadcaster, "publish", AsyncMock(side_effect=AssertionError("방송 금지"))
            ),
        ):
            await lc._expire_pending_proposal_if_stale(db, channel_id, now)

        self.assertEqual(proposal.status, "pending")


if __name__ == "__main__":
    unittest.main()
