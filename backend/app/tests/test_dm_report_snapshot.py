import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.models import Report
from app.routers import dm
from app.schemas import ReportCreateRequest


class DmReportSnapshotTests(unittest.IsolatedAsyncioTestCase):
    """F-X-02 FR-1(260924 승인안) — DM 신고는 최근 50개 메시지를 스냅샷으로 첨부한다."""

    async def test_report_conversation_attaches_last_50_messages_snapshot(self):
        session_uid = uuid.uuid4()
        other_uid = uuid.uuid4()
        conv_id = uuid.uuid4()
        conv = SimpleNamespace(id=conv_id, participant_1=session_uid, participant_2=other_uid)

        message_row = SimpleNamespace(
            id=uuid.uuid4(),
            sender_id=other_uid,
            content="hello",
            created_at=datetime(2026, 9, 24, tzinfo=UTC),
            deleted_at=None,
        )
        messages_result = MagicMock()
        messages_result.all.return_value = [message_row]

        db = AsyncMock()
        db.get.return_value = conv
        db.execute.return_value = messages_result

        with (
            patch.object(dm, "guard_duplicate_report", AsyncMock()),
            patch.object(dm, "_other_user_id", MagicMock(return_value=other_uid)),
        ):
            await dm.report_conversation(
                conv_id=conv_id,
                body=ReportCreateRequest(reason="ABUSE"),
                db=db,
                session_uid=session_uid,
            )

        added = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], Report)]
        self.assertEqual(len(added), 1)
        snapshot = added[0].snapshot
        self.assertEqual(len(snapshot["messages"]), 1)
        self.assertEqual(snapshot["messages"][0]["message_id"], str(message_row.id))
        self.assertEqual(snapshot["messages"][0]["content"], "hello")
        self.assertFalse(snapshot["messages"][0]["deleted"])

    async def test_report_conversation_masks_soft_deleted_message_content(self):
        session_uid = uuid.uuid4()
        other_uid = uuid.uuid4()
        conv_id = uuid.uuid4()
        conv = SimpleNamespace(id=conv_id, participant_1=session_uid, participant_2=other_uid)

        deleted_row = SimpleNamespace(
            id=uuid.uuid4(),
            sender_id=other_uid,
            content="곧 지워질 메시지",
            created_at=datetime(2026, 9, 24, tzinfo=UTC),
            deleted_at=datetime(2026, 9, 24, 1, tzinfo=UTC),
        )
        messages_result = MagicMock()
        messages_result.all.return_value = [deleted_row]

        db = AsyncMock()
        db.get.return_value = conv
        db.execute.return_value = messages_result

        with (
            patch.object(dm, "guard_duplicate_report", AsyncMock()),
            patch.object(dm, "_other_user_id", MagicMock(return_value=other_uid)),
        ):
            await dm.report_conversation(
                conv_id=conv_id,
                body=ReportCreateRequest(reason="ABUSE"),
                db=db,
                session_uid=session_uid,
            )

        added = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], Report)]
        snapshot = added[0].snapshot
        self.assertIsNone(snapshot["messages"][0]["content"])
        self.assertTrue(snapshot["messages"][0]["deleted"])
        self.assertEqual(snapshot["messages"][0]["message_id"], str(deleted_row.id))
