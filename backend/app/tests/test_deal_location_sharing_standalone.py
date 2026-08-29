"""독립 위치공유(약속 없이, 대화 단위) 테스트 — 대표 지시 2026-08-29.

`test_deal_location_sharing.py`(약속 기반, 정밀도 창 정책)와는 별개 경로를 검증한다. 여기는
정밀도 창 개념이 없고 세션 TTL(시작시점 기준 1시간)만으로 자동 종료된다는 게 핵심 차이다.
스타일은 그 파일과 동일하게 `AsyncMock`/`SimpleNamespace` 로 라우터 함수를 직접 호출한다.
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import market
from app.schemas import LocationSharePingRequest, LocationShareStartRequest


def _conversation(user_a, user_b):
    return SimpleNamespace(id=uuid.uuid4(), participant_1=user_a, participant_2=user_b)


def _share(*, accuracy_m=20, revoked_at=None, expires_at=None, lat="10.771234", lng="106.691234"):
    now = datetime.now(UTC)
    return SimpleNamespace(
        lat=Decimal(lat),
        lng=Decimal(lng),
        accuracy_m=accuracy_m,
        revoked_at=revoked_at,
        expires_at=expires_at or (now + timedelta(hours=1)),
        updated_at=now,
    )


def _rig(conv, counterpart_id):
    db = AsyncMock()
    db.add = MagicMock()
    load = patch.object(market, "_load_conversation_for_location_share", AsyncMock(return_value=(conv, counterpart_id)))
    return db, load


class StartConversationLocationShareTest(unittest.IsolatedAsyncioTestCase):
    async def test_start_creates_row_without_precision_gate(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = _conversation(me, peer)
        db, load = _rig(conv, peer)

        with load, patch.object(market, "_get_standalone_share", AsyncMock(side_effect=[None, None])):
            out = await market.start_conversation_location_share(
                conv.id, LocationShareStartRequest(consent_version="v1"), db=db, session_uid=me
            )

        self.assertEqual(out.my_status, "sharing")
        self.assertEqual(out.peer_status, "not_started")
        db.add.assert_called_once()
        db.commit.assert_awaited()
        # 약속 기반 창(T+60분)과 달리 시작시점 기준 1시간 TTL이어야 한다.
        self.assertAlmostEqual(
            (out.expires_at - datetime.now(UTC)).total_seconds(), timedelta(hours=1).total_seconds(), delta=5
        )


class PingConversationLocationShareTest(unittest.IsolatedAsyncioTestCase):
    async def test_ping_accepted_with_no_appointment_or_window(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = _conversation(me, peer)
        db, load = _rig(conv, peer)
        my_share = _share(accuracy_m=None)
        body = LocationSharePingRequest(lat=10.5, lng=106.5, accuracy_m=12)

        with load, patch.object(market, "_get_standalone_share", AsyncMock(side_effect=[my_share, None])):
            out = await market.ping_conversation_location_share(conv.id, body, db=db, session_uid=me)

        self.assertEqual(my_share.lat, Decimal("10.5"))
        self.assertEqual(out.my_status, "sharing")
        db.commit.assert_awaited()

    async def test_ping_rejected_when_share_not_started(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = _conversation(me, peer)
        db, load = _rig(conv, peer)
        body = LocationSharePingRequest(lat=10.5, lng=106.5, accuracy_m=12)

        with (
            load,
            patch.object(market, "_get_standalone_share", AsyncMock(return_value=None)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.ping_conversation_location_share(conv.id, body, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_ping_rejected_when_ttl_expired(self):
        """약속 기반은 '창 밖'이 사유지만, 독립 공유는 세션 TTL 경과가 유일한 자동차단 사유다."""
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = _conversation(me, peer)
        db, load = _rig(conv, peer)
        expired_share = _share(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        body = LocationSharePingRequest(lat=10.5, lng=106.5, accuracy_m=12)

        with (
            load,
            patch.object(market, "_get_standalone_share", AsyncMock(return_value=expired_share)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.ping_conversation_location_share(conv.id, body, db=db, session_uid=me)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_accuracy_over_35m_rejected_before_touching_db(self):
        db = AsyncMock()
        body = LocationSharePingRequest(lat=10.77, lng=106.69, accuracy_m=36)
        with self.assertRaises(HTTPException) as ctx:
            await market.ping_conversation_location_share(uuid.uuid4(), body, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 400)
        db.get.assert_not_called()


class GetConversationLocationShareTest(unittest.IsolatedAsyncioTestCase):
    async def test_reveals_peer_coordinates_without_precision_check(self):
        """약속 기반(PROPOSED 등)과 달리 정밀도 레벨 개념이 없어 sharing + accuracy 만 있으면 노출한다."""
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = _conversation(me, peer)
        db, load = _rig(conv, peer)
        my_share = _share()
        peer_share = _share(lat="10.5", lng="106.5")

        with load, patch.object(market, "_get_standalone_share", AsyncMock(side_effect=[my_share, peer_share])):
            out = await market.get_conversation_location_share(conv.id, db=db, session_uid=me)

        self.assertEqual(out.peer_status, "sharing")
        self.assertEqual(out.peer_lat, 10.5)
        self.assertEqual(out.peer_lng, 106.5)

    async def test_hides_peer_coordinates_when_expired(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = _conversation(me, peer)
        db, load = _rig(conv, peer)
        my_share = _share()
        peer_share = _share(revoked_at=datetime.now(UTC))

        with load, patch.object(market, "_get_standalone_share", AsyncMock(side_effect=[my_share, peer_share])):
            out = await market.get_conversation_location_share(conv.id, db=db, session_uid=me)

        self.assertEqual(out.peer_status, "stopped")
        self.assertIsNone(out.peer_lat)


class StopConversationLocationShareTest(unittest.IsolatedAsyncioTestCase):
    async def test_stop_deletes_only_the_standalone_row(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = _conversation(me, peer)
        db, load = _rig(conv, peer)

        with load:
            await market.stop_conversation_location_share(conv.id, db=db, session_uid=me)

        db.execute.assert_awaited_once()
        stmt = db.execute.await_args.args[0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        self.assertIn("marketplace_location_shares", compiled)
        self.assertIn("appointment_id IS NULL", compiled.replace("appointment_id IS  NULL", "appointment_id IS NULL"))
        self.assertIn(conv.id.hex, compiled)
        self.assertIn(me.hex, compiled)
        db.commit.assert_awaited_once()


class BlockedPeerConversationTest(unittest.IsolatedAsyncioTestCase):
    async def test_load_conversation_rejects_blocked_pair(self):
        me, peer = uuid.uuid4(), uuid.uuid4()
        conv = _conversation(me, peer)
        db = AsyncMock()
        db.get = AsyncMock(return_value=conv)
        blocked_result = MagicMock()
        blocked_result.first.return_value = (peer,)
        db.execute = AsyncMock(return_value=blocked_result)

        with self.assertRaises(HTTPException) as ctx:
            await market._load_conversation_for_location_share(db, conv.id, me)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_conversation_not_found_is_404(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        with self.assertRaises(HTTPException) as ctx:
            await market._load_conversation_for_location_share(db, uuid.uuid4(), uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
