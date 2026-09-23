import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.models import SupportTicket
from app.routers import market


class BlockEffectsTests(unittest.IsolatedAsyncioTestCase):
    """F-X-02 FR-2(260924 승인안) — 차단 효력: 팔로우 삭제 + 진행 중 거래 강제 취소 + CS 자동 접수."""

    async def test_block_deletes_bidirectional_follow_and_force_cancels_accepted_trade(self):
        session_uid = uuid.uuid4()
        user_id = uuid.uuid4()
        conv_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        appt_id = uuid.uuid4()
        transaction_id = uuid.uuid4()

        appt = SimpleNamespace(
            id=appt_id,
            listing_id=listing_id,
            conversation_id=conv_id,
            status="ACCEPTED",
            cancel_reason=None,
            updated_at=None,
        )
        listing = SimpleNamespace(id=listing_id, status="RESERVED", updated_at=None, title="테스트 매물")
        transaction = SimpleNamespace(id=transaction_id)

        conv_id_result = MagicMock()
        conv_id_result.scalar_one_or_none.return_value = conv_id
        follow_delete_result = MagicMock()
        appts_result = MagicMock()
        appts_result.scalars.return_value.all.return_value = [appt]
        transaction_result = MagicMock()
        transaction_result.scalar_one_or_none.return_value = transaction

        db = AsyncMock()
        db.get.side_effect = [None, listing]
        db.execute.side_effect = [
            conv_id_result,
            follow_delete_result,
            appts_result,
            transaction_result,
        ]

        with (
            patch.object(market.location_channel_membership, "end_for_block", AsyncMock()),
            patch.object(market.noti_events, "enqueue", MagicMock()) as enqueue,
            patch.object(market, "log_transition", MagicMock()) as log_transition,
        ):
            await market.block_user(user_id=user_id, db=db, session_uid=session_uid)

        # 팔로우 삭제 — 양방향 조건이 SQL에 담겨 있다.
        follow_delete_sql = str(db.execute.await_args_list[1].args[0])
        self.assertIn("user_follows", follow_delete_sql.lower())

        # 진행 중(ACCEPTED) 약속이 강제 취소되고 매물이 복귀한다.
        self.assertEqual(appt.status, "CANCELLED")
        self.assertEqual(appt.cancel_reason, "BLOCKED")
        self.assertEqual(listing.status, "ON_SALE")
        log_transition.assert_called_once()

        # 상대에게는 취소 사실만 통지(사유 노출 없음) — CS 자동 접수 티켓 1건.
        enqueue.assert_called_once()
        event_type, payload = enqueue.call_args.args[1], enqueue.call_args.args[2]
        self.assertEqual(event_type, "market.appointment_cancelled")
        self.assertNotIn("cancel_reason", payload)
        self.assertEqual(payload["recipient_id"], str(user_id))

        added_tickets = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], SupportTicket)]
        self.assertEqual(len(added_tickets), 1)
        self.assertEqual(added_tickets[0].category, "X-BLOCK-TRADE")
        self.assertEqual(added_tickets[0].contract_context["transaction_id"], str(transaction_id))

    async def test_block_auto_rejects_proposed_appointment_without_cs_ticket(self):
        session_uid = uuid.uuid4()
        user_id = uuid.uuid4()
        conv_id = uuid.uuid4()
        listing_id = uuid.uuid4()
        appt = SimpleNamespace(
            id=uuid.uuid4(),
            listing_id=listing_id,
            conversation_id=conv_id,
            status="PROPOSED",
            cancel_reason=None,
            updated_at=None,
        )
        listing = SimpleNamespace(id=listing_id, status="ON_SALE", updated_at=None, title="테스트 매물")

        conv_id_result = MagicMock()
        conv_id_result.scalar_one_or_none.return_value = conv_id
        follow_delete_result = MagicMock()
        appts_result = MagicMock()
        appts_result.scalars.return_value.all.return_value = [appt]

        db = AsyncMock()
        db.get.side_effect = [None, listing]
        db.execute.side_effect = [conv_id_result, follow_delete_result, appts_result]

        with (
            patch.object(market.location_channel_membership, "end_for_block", AsyncMock()),
            patch.object(market.noti_events, "enqueue", MagicMock()) as enqueue,
        ):
            await market.block_user(user_id=user_id, db=db, session_uid=session_uid)

        self.assertEqual(appt.status, "CANCELLED")
        enqueue.assert_not_called()
        added_tickets = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], SupportTicket)]
        self.assertEqual(len(added_tickets), 0)
