"""F-X-01 FR-1/FR-2(260919 리뷰킷 v10 승인안, 구현 패키지 A) 상태 전이 테스트.

취소 사유 칩, 송금 신고 취소(오신고 철회), 양측 합의 취소 요청(생성/응답/자동 만료)의
상태기계 전이와 매물 ON_SALE 복귀를 검증한다.
"""

import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.jobs import expire_transaction_cancel_requests as expire_job
from app.routers import market
from app.schemas import TransactionCancelRequestCreate, TransactionCancelRequestRespond


def _tx_context(payment_status="PAYMENT_REPORTED"):
    buyer_id = uuid4()
    seller_id = uuid4()
    appointment_id = uuid4()
    transaction = SimpleNamespace(
        appointment_id=appointment_id,
        conversation_id=uuid4(),
        listing_id=uuid4(),
        buyer_id=buyer_id,
        seller_id=seller_id,
        payment_status=payment_status,
        buyer_reported_at=datetime.now(UTC),
        stall_notice_sent_at=None,
        updated_at=None,
    )
    appointment = SimpleNamespace(
        id=appointment_id, status="ACCEPTED", when_at=datetime.now(UTC), cancel_reason=None, updated_at=None
    )
    conversation = SimpleNamespace(id=uuid4(), participant_1=buyer_id, participant_2=seller_id)
    listing = SimpleNamespace(id=transaction.listing_id, title="혼다 웨이브", status="RESERVED", updated_at=None)
    return transaction, appointment, conversation, listing


def _pending_request(appointment_id, requester_id, *, expired=False):
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid4(),
        appointment_id=appointment_id,
        requester_id=requester_id,
        reason="UNREACHABLE",
        status="PENDING",
        expires_at=now - timedelta(minutes=1) if expired else now + timedelta(hours=24),
        responded_at=None,
        created_at=now,
        updated_at=now,
    )


class CancelReasonTest(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_appointment_stores_reason_and_notifies_it(self):
        actor_id = uuid4()
        appointment = SimpleNamespace(id=uuid4(), status="ACCEPTED", cancel_reason=None, updated_at=None)
        counterpart_id = uuid4()
        conversation = SimpleNamespace(id=uuid4(), participant_1=actor_id, participant_2=counterpart_id)
        listing = SimpleNamespace(
            id=uuid4(), seller_id=uuid4(), title="혼다 웨이브", status="RESERVED", updated_at=None
        )
        transaction = SimpleNamespace(payment_status="AWAITING_PAYMENT")
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = transaction
        db = SimpleNamespace(execute=AsyncMock(return_value=query_result), commit=AsyncMock(), add=MagicMock())
        body = market.AppointmentCancelRequestBody(reason="UNREACHABLE")
        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appointment, conversation, listing))),
            patch.object(market, "log_transition"),
            patch.object(market, "_enqueue_live_activity"),
            patch.object(market, "_appt_out", AsyncMock(return_value="out")),
        ):
            result = await market.cancel_appointment(appointment.id, db, actor_id, body)

        self.assertEqual(result, "out")
        self.assertEqual(appointment.cancel_reason, "UNREACHABLE")
        event = db.add.call_args.args[0]
        self.assertEqual(event.payload["cancel_reason"], "UNREACHABLE")

    async def test_cancel_appointment_without_body_keeps_reason_none(self):
        actor_id = uuid4()
        appointment = SimpleNamespace(id=uuid4(), status="PROPOSED", cancel_reason=None, updated_at=None)
        conversation = SimpleNamespace(id=uuid4(), participant_1=actor_id, participant_2=uuid4())
        listing = SimpleNamespace(id=uuid4(), seller_id=uuid4(), title="혼다 웨이브", status="ON_SALE", updated_at=None)
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = None
        db = SimpleNamespace(add=MagicMock(), commit=AsyncMock(), execute=AsyncMock(return_value=query_result))
        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appointment, conversation, listing))),
            patch.object(market, "_enqueue_live_activity"),
            patch.object(market, "_appt_out", AsyncMock(return_value="out")),
        ):
            result = await market.cancel_appointment(appointment.id, db, actor_id)

        self.assertEqual(result, "out")
        self.assertIsNone(appointment.cancel_reason)


class PaymentReportCancelTest(unittest.IsolatedAsyncioTestCase):
    async def test_buyer_can_withdraw_payment_report(self):
        transaction, appointment, conversation, listing = _tx_context("PAYMENT_REPORTED")
        db = SimpleNamespace(commit=AsyncMock(), add=MagicMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            patch.object(market, "_marketplace_transaction_out", AsyncMock(return_value="out")),
        ):
            result = await market.cancel_marketplace_payment_report(
                transaction.appointment_id, db, transaction.buyer_id
            )

        self.assertEqual(result, "out")
        self.assertEqual(transaction.payment_status, "AWAITING_PAYMENT")
        self.assertIsNone(transaction.buyer_reported_at)
        self.assertEqual(appointment.status, "ACCEPTED")
        db.commit.assert_awaited_once()

    async def test_seller_cannot_withdraw_buyers_payment_report(self):
        transaction, appointment, conversation, listing = _tx_context("PAYMENT_REPORTED")
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.cancel_marketplace_payment_report(transaction.appointment_id, db, transaction.seller_id)

        self.assertEqual(raised.exception.status_code, 403)
        db.commit.assert_not_awaited()

    async def test_confirmed_payment_cannot_be_withdrawn(self):
        transaction, appointment, conversation, listing = _tx_context("PAYMENT_CONFIRMED")
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.cancel_marketplace_payment_report(transaction.appointment_id, db, transaction.buyer_id)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(transaction.payment_status, "PAYMENT_CONFIRMED")
        db.commit.assert_not_awaited()


class CreateCancelRequestTest(unittest.IsolatedAsyncioTestCase):
    async def test_create_request_requires_payment_reported(self):
        transaction, appointment, conversation, listing = _tx_context("AWAITING_PAYMENT")
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.create_transaction_cancel_request(
                transaction.appointment_id,
                TransactionCancelRequestCreate(reason="SCHEDULE_CHANGED"),
                db,
                transaction.buyer_id,
            )

        self.assertEqual(raised.exception.status_code, 409)
        db.commit.assert_not_awaited()

    async def test_create_request_rejects_second_pending_request(self):
        transaction, appointment, conversation, listing = _tx_context("PAYMENT_REPORTED")
        existing = _pending_request(appointment.id, transaction.seller_id)
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            patch.object(market, "_active_cancel_request", AsyncMock(return_value=existing)),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.create_transaction_cancel_request(
                transaction.appointment_id,
                TransactionCancelRequestCreate(reason="TRADED_ELSEWHERE"),
                db,
                transaction.buyer_id,
            )

        self.assertEqual(raised.exception.status_code, 409)
        db.commit.assert_not_awaited()

    async def test_create_request_notifies_counterpart(self):
        transaction, appointment, conversation, listing = _tx_context("PAYMENT_REPORTED")

        async def _assign_id(obj):
            obj.id = uuid4()

        db = SimpleNamespace(commit=AsyncMock(), add=MagicMock(), refresh=AsyncMock(side_effect=_assign_id))
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            patch.object(market, "_active_cancel_request", AsyncMock(return_value=None)),
        ):
            result = await market.create_transaction_cancel_request(
                transaction.appointment_id,
                TransactionCancelRequestCreate(reason="UNREACHABLE"),
                db,
                transaction.buyer_id,
            )

        self.assertEqual(result.status, "PENDING")
        self.assertEqual(result.requester_id, transaction.buyer_id)
        cancel_request = db.add.call_args_list[0].args[0]
        self.assertEqual(cancel_request.reason, "UNREACHABLE")
        event = db.add.call_args_list[1].args[0]
        self.assertEqual(event.event_type, "market.transaction_cancel_requested")
        self.assertEqual(event.payload["recipient_id"], str(transaction.seller_id))


class RespondCancelRequestTest(unittest.IsolatedAsyncioTestCase):
    async def test_requester_cannot_respond_to_own_request(self):
        transaction, appointment, conversation, listing = _tx_context("PAYMENT_REPORTED")
        cancel_request = _pending_request(appointment.id, transaction.buyer_id)
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = cancel_request
        db = SimpleNamespace(execute=AsyncMock(return_value=query_result), commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.respond_transaction_cancel_request(
                cancel_request.id, TransactionCancelRequestRespond(action="AGREE"), db, transaction.buyer_id
            )

        self.assertEqual(raised.exception.status_code, 403)
        db.commit.assert_not_awaited()

    async def test_agree_cancels_appointment_and_reopens_listing(self):
        transaction, appointment, conversation, listing = _tx_context("PAYMENT_REPORTED")
        cancel_request = _pending_request(appointment.id, transaction.buyer_id)
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = cancel_request
        db = SimpleNamespace(execute=AsyncMock(return_value=query_result), commit=AsyncMock(), add=MagicMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            patch.object(market, "log_transition"),
        ):
            result = await market.respond_transaction_cancel_request(
                cancel_request.id, TransactionCancelRequestRespond(action="AGREE"), db, transaction.seller_id
            )

        self.assertEqual(result.status, "AGREED")
        self.assertEqual(appointment.status, "CANCELLED")
        self.assertEqual(appointment.cancel_reason, "UNREACHABLE")
        self.assertEqual(listing.status, "ON_SALE")
        # 어드민 PAYMENT_REPORTED 큐(admin_api/transactions.py::list_transactions)에 해결된 거래가
        # 계속 남지 않도록, 운영자 롤백과 동일하게 payment_status를 되돌린다.
        self.assertEqual(transaction.payment_status, "AWAITING_PAYMENT")
        self.assertIsNone(transaction.buyer_reported_at)
        db.commit.assert_awaited_once()

    async def test_reject_leaves_appointment_untouched(self):
        transaction, appointment, conversation, listing = _tx_context("PAYMENT_REPORTED")
        cancel_request = _pending_request(appointment.id, transaction.buyer_id)
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = cancel_request
        db = SimpleNamespace(execute=AsyncMock(return_value=query_result), commit=AsyncMock(), add=MagicMock())
        with patch.object(
            market,
            "_load_marketplace_transaction",
            AsyncMock(return_value=(transaction, appointment, conversation, listing)),
        ):
            result = await market.respond_transaction_cancel_request(
                cancel_request.id, TransactionCancelRequestRespond(action="REJECT"), db, transaction.seller_id
            )

        self.assertEqual(result.status, "REJECTED")
        self.assertEqual(appointment.status, "ACCEPTED")
        self.assertEqual(listing.status, "RESERVED")

    async def test_expired_request_cannot_be_answered(self):
        transaction, appointment, _conversation, _listing = _tx_context("PAYMENT_REPORTED")
        cancel_request = _pending_request(appointment.id, transaction.buyer_id, expired=True)
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = cancel_request
        db = SimpleNamespace(execute=AsyncMock(return_value=query_result), commit=AsyncMock())
        with self.assertRaises(HTTPException) as raised:
            await market.respond_transaction_cancel_request(
                cancel_request.id, TransactionCancelRequestRespond(action="AGREE"), db, transaction.seller_id
            )

        self.assertEqual(raised.exception.status_code, 409)
        db.commit.assert_not_awaited()


class ExpireCancelRequestJobTest(unittest.IsolatedAsyncioTestCase):
    async def test_expire_one_cancels_appointment_and_reopens_listing(self):
        buyer_id, seller_id = uuid4(), uuid4()
        appointment_id = uuid4()
        cancel_request = SimpleNamespace(
            id=uuid4(),
            appointment_id=appointment_id,
            requester_id=buyer_id,
            reason="UNREACHABLE",
            status="PENDING",
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
            responded_at=None,
            updated_at=None,
        )
        appointment = SimpleNamespace(id=appointment_id, status="ACCEPTED", cancel_reason=None, updated_at=None)
        listing_id = uuid4()
        transaction = SimpleNamespace(
            appointment_id=appointment_id,
            conversation_id=uuid4(),
            listing_id=listing_id,
            buyer_id=buyer_id,
            seller_id=seller_id,
            payment_status="PAYMENT_REPORTED",
            buyer_reported_at=datetime.now(UTC),
            updated_at=None,
        )
        listing = SimpleNamespace(id=listing_id, title="혼다 웨이브", status="RESERVED", updated_at=None)

        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = cancel_request
        listing_result = MagicMock()
        listing_result.scalar_one_or_none.return_value = listing

        async def _get(model, pk):
            from app.models import MarketplaceAppointment, MarketplaceTransaction

            if model is MarketplaceAppointment:
                return appointment
            if model is MarketplaceTransaction:
                return transaction
            return None

        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[query_result, listing_result]),
            get=AsyncMock(side_effect=_get),
            commit=AsyncMock(),
            add=MagicMock(),
        )
        now = datetime.now(UTC)
        with patch.object(expire_job, "log_transition"):
            await expire_job._expire_one(db, cancel_request.id, now)

        self.assertEqual(cancel_request.status, "EXPIRED")
        self.assertEqual(appointment.status, "CANCELLED")
        self.assertEqual(listing.status, "ON_SALE")
        # 어드민 PAYMENT_REPORTED 큐에 해결된 거래가 남지 않도록 자동 만료도 되돌린다(운영자 롤백과 동일).
        self.assertEqual(transaction.payment_status, "AWAITING_PAYMENT")
        self.assertIsNone(transaction.buyer_reported_at)
        db.commit.assert_awaited_once()
        recipients = {call.args[0].payload["recipient_id"] for call in db.add.call_args_list}
        self.assertEqual(recipients, {str(buyer_id), str(seller_id)})


if __name__ == "__main__":
    unittest.main()
