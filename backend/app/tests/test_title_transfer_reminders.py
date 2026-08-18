"""016 §4-6 #41, D-35=(a) — 명의이전 D+7/D+25 리마인더 잡 회귀 테스트.

expire_flood_reports 선례와 동일한 방식으로 AsyncSessionLocal 을 목(mock) 세션으로 패치해
실제 DB 없이 쿼리 조건·중복방지 삽입·커밋 흐름을 고정한다.
"""

import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app.jobs import title_transfer_reminders


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class TitleTransferReminderJobTest(unittest.IsolatedAsyncioTestCase):
    async def test_due_listing_query_filters_by_sold_transition_and_status(self):
        """앵커는 listing_state_log 의 SOLD 전이 시각 — status='SOLD' 도 함께 걸어야
        (WITHDRAWN 등으로 재전이된) 매물에 리마인더가 새지 않는다."""
        session = MagicMock()
        session.execute = AsyncMock(
            side_effect=[
                MagicMock(all=MagicMock(return_value=[])),  # D7
                MagicMock(all=MagicMock(return_value=[])),  # D25
            ]
        )
        session.commit = AsyncMock()
        session.scalar = AsyncMock(return_value=None)

        with patch.object(
            title_transfer_reminders,
            "AsyncSessionLocal",
            return_value=_SessionContext(session),
        ):
            result = await title_transfer_reminders.send_title_transfer_reminders()

        self.assertTrue(result)
        self.assertEqual(session.execute.await_count, 2)
        for call in session.execute.await_args_list:
            sql = str(call.args[0])
            self.assertIn("to_state", sql)
            self.assertIn("marketplace_listings.status", sql)
        session.commit.assert_awaited_once()

    async def test_duplicate_reminder_is_skipped_via_conflict(self):
        """title_transfer_reminder_log UNIQUE(listing_id, reminder_type) 로 이미 보낸 건은
        on_conflict_do_nothing 이 None 을 반환 — 그 경우 noti_events.enqueue 를 호출하지 않는다."""
        listing_id = uuid.uuid4()
        seller_id = uuid.uuid4()
        session = MagicMock()
        session.execute = AsyncMock(
            side_effect=[
                MagicMock(all=MagicMock(return_value=[(listing_id, seller_id, "제목")])),  # D7 due
                MagicMock(all=MagicMock(return_value=[])),  # D25
                MagicMock(first=MagicMock(return_value=None)),  # buyer lookup (no completed appointment)
            ]
        )
        session.commit = AsyncMock()
        session.scalar = AsyncMock(return_value=None)  # ON CONFLICT DO NOTHING -> 이미 존재

        with (
            patch.object(title_transfer_reminders, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch("app.services.noti_events.enqueue") as enqueue,
        ):
            result = await title_transfer_reminders.send_title_transfer_reminders()

        self.assertTrue(result)
        enqueue.assert_not_called()

    async def test_failure_is_logged_and_returns_false(self):
        session = MagicMock(execute=AsyncMock(side_effect=RuntimeError("db unavailable")))

        with (
            patch.object(title_transfer_reminders, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(title_transfer_reminders.log, "exception") as log_exception,
        ):
            result = await title_transfer_reminders.send_title_transfer_reminders()

        self.assertFalse(result)
        log_exception.assert_called_once()


if __name__ == "__main__":
    unittest.main()
