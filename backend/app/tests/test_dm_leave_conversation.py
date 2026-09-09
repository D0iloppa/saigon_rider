"""Per-user DM leave/hide behavior without deleting chat or trade history."""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call, patch

from fastapi import HTTPException

from app.models import DmConversation, User
from app.routers import dm
from app.schemas import DmMessageCreateRequest


def _direct(conv_id, me, other):
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=conv_id,
        conversation_type="direct",
        participant_1=me,
        participant_2=other,
        context_type=None,
        context_id=None,
        last_message_at=now,
        created_at=now,
    )


class DirectLeaveTest(unittest.IsolatedAsyncioTestCase):
    async def test_leave_hides_only_current_participant(self):
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = _direct(conv_id, me, other)
        db = MagicMock()
        db.get = AsyncMock(return_value=conv)
        db.commit = AsyncMock()

        with (
            patch.object(dm, "_set_direct_visibility", AsyncMock(return_value=True)) as visibility,
            patch.object(dm.location_channel_membership, "force_leave", AsyncMock()) as force_leave,
        ):
            out = await dm.leave_conversation(conv_id, db=db, _session_uid=me)

        self.assertEqual(out, {"ok": True})
        self.assertEqual(visibility.await_args.args, (db, conv, me))
        self.assertIsNotNone(visibility.await_args.kwargs["left_at"])
        db.commit.assert_awaited_once()
        force_leave.assert_awaited_once_with(db, conv_id, me, reason="left")

    async def test_non_participant_cannot_hide_direct_room(self):
        me, other, outsider, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        db = MagicMock()
        db.get = AsyncMock(return_value=_direct(conv_id, me, other))

        with self.assertRaises(HTTPException) as raised:
            await dm.leave_conversation(conv_id, db=db, _session_uid=outsider)

        self.assertEqual(raised.exception.status_code, 403)

    async def test_hidden_direct_room_stays_out_of_list_after_reload(self):
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = _direct(conv_id, me, other)
        now = datetime.now(UTC)

        block_result = MagicMock()
        block_result.all.return_value = []
        member_result = MagicMock()
        member_result.all.return_value = [(conv_id, now, now)]
        conversations_result = MagicMock()
        conversations_result.scalars.return_value.all.return_value = [conv]
        trades_result = MagicMock()
        trades_result.all.return_value = []
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[block_result, member_result, conversations_result, trades_result])

        out = await dm.get_conversations(me, db=db, _session_uid=me)

        self.assertEqual(out, [])

    async def test_detail_get_does_not_revert_a_left_room(self):
        """GET 은 조회일 뿐이다 — 나간 방을 되살리는 mutation 을 하지 않는다(리뷰 지적 #3)."""
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = _direct(conv_id, me, other)
        peer = SimpleNamespace(nickname="peer", avatar_content=None, avatar_url=None)

        async def get(model, _key):
            return conv if model is DmConversation else peer if model is User else None

        db = MagicMock()
        db.get = AsyncMock(side_effect=get)
        db.commit = AsyncMock()
        with (
            patch.object(dm, "require_unblocked", AsyncMock()),
            patch.object(dm, "_set_direct_visibility", AsyncMock(return_value=True)) as visibility,
            patch.object(dm, "_appointment_unlocked", AsyncMock(return_value=False)),
        ):
            await dm.get_conversation(conv_id, db=db, _session_uid=me)

        visibility.assert_not_awaited()
        db.commit.assert_not_awaited()

    async def test_new_message_reactivates_sender_and_recipient(self):
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = _direct(conv_id, me, other)
        sender = SimpleNamespace(nickname="sender")
        saved = []

        async def get(model, _key):
            return conv if model is DmConversation else sender if model is User else None

        def add(obj):
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            saved.append(obj)

        selected = MagicMock()
        selected.scalar_one.side_effect = lambda: saved[0]
        db = MagicMock()
        db.get = AsyncMock(side_effect=get)
        db.add = MagicMock(side_effect=add)
        db.execute = AsyncMock(return_value=selected)
        db.commit = AsyncMock()

        with (
            patch.object(dm, "require_unblocked", AsyncMock()),
            patch.object(dm, "_banned_keywords", AsyncMock(return_value=[])),
            patch.object(dm, "_set_direct_visibility", AsyncMock(return_value=True)) as visibility,
            patch.object(dm.noti_events, "enqueue"),
        ):
            await dm.send_message(
                conv_id,
                DmMessageCreateRequest(content="new"),
                db=db,
                _session_uid=me,
            )

        self.assertEqual(
            visibility.await_args_list,
            [call(db, conv, me, left_at=None), call(db, conv, other, left_at=None)],
        )


class GroupLeaveTest(unittest.IsolatedAsyncioTestCase):
    async def test_group_leave_ends_membership_without_deleting_room(self):
        me, conv_id = uuid.uuid4(), uuid.uuid4()
        conv = SimpleNamespace(id=conv_id, conversation_type="group", member_count=3)
        member = SimpleNamespace(left_at=None)
        db = MagicMock()
        db.get = AsyncMock(return_value=conv)
        db.commit = AsyncMock()

        with (
            patch.object(dm, "require_member", AsyncMock(return_value=member)),
            patch.object(dm.location_channel_membership, "force_leave", AsyncMock()),
        ):
            await dm.leave_conversation(conv_id, db=db, _session_uid=me)

        self.assertIsNotNone(member.left_at)
        self.assertEqual(conv.member_count, 2)
        db.commit.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
