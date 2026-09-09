import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.routers import market


def _context(payment_status="AWAITING_PAYMENT"):
    buyer_id = uuid4()
    seller_id = uuid4()
    transaction = SimpleNamespace(
        appointment_id=uuid4(),
        buyer_id=buyer_id,
        seller_id=seller_id,
        payment_status=payment_status,
        buyer_reported_at=None,
        seller_confirmed_at=None,
        updated_at=None,
    )
    appointment = SimpleNamespace(id=transaction.appointment_id, status="ACCEPTED")
    conversation = SimpleNamespace(id=uuid4())
    listing = SimpleNamespace(status="RESERVED")
    return transaction, appointment, conversation, listing


class MarketplaceTransactionTest(unittest.IsolatedAsyncioTestCase):
    async def test_reported_or_confirmed_payment_blocks_cancellation_for_both_roles(self):
        seller_id = uuid4()
        buyer_id = uuid4()
        for actor_id in (seller_id, buyer_id):
            for payment_status in ("PAYMENT_REPORTED", "PAYMENT_CONFIRMED"):
                with self.subTest(actor_id=actor_id, payment_status=payment_status):
                    appointment = SimpleNamespace(id=uuid4(), status="ACCEPTED", updated_at=None)
                    conversation = SimpleNamespace(id=uuid4())
                    listing = SimpleNamespace(id=uuid4(), seller_id=seller_id, status="RESERVED", updated_at=None)
                    transaction = SimpleNamespace(payment_status=payment_status)
                    result = MagicMock()
                    result.scalar_one_or_none.return_value = transaction
                    db = SimpleNamespace(execute=AsyncMock(return_value=result), commit=AsyncMock())
                    with (
                        patch.object(
                            market,
                            "_load_appointment",
                            AsyncMock(return_value=(appointment, conversation, listing)),
                        ),
                        self.assertRaises(HTTPException) as raised,
                    ):
                        await market.cancel_appointment(appointment.id, db, actor_id)

                    self.assertEqual(raised.exception.status_code, 409)
                    self.assertEqual(appointment.status, "ACCEPTED")
                    self.assertEqual(listing.status, "RESERVED")
                    db.commit.assert_not_awaited()

    async def test_awaiting_payment_still_allows_cancellation(self):
        actor_id = uuid4()
        appointment = SimpleNamespace(id=uuid4(), status="ACCEPTED", updated_at=None)
        conversation = SimpleNamespace(id=uuid4())
        listing = SimpleNamespace(id=uuid4(), seller_id=uuid4(), status="RESERVED", updated_at=None)
        transaction = SimpleNamespace(payment_status="AWAITING_PAYMENT")
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = transaction
        db = SimpleNamespace(execute=AsyncMock(return_value=query_result), commit=AsyncMock())
        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appointment, conversation, listing))),
            patch.object(market, "log_transition"),
            patch.object(market, "_enqueue_live_activity"),
            patch.object(market, "_appt_out", AsyncMock(return_value="out")),
        ):
            result = await market.cancel_appointment(appointment.id, db, actor_id)

        self.assertEqual(result, "out")
        self.assertEqual(appointment.status, "CANCELLED")
        self.assertEqual(listing.status, "ON_SALE")
        db.commit.assert_awaited_once()

    async def test_buyer_report_is_not_seller_confirmation_or_trade_completion(self):
        transaction, appointment, conversation, listing = _context()
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            patch.object(market, "_current_payment_qr_message_id", AsyncMock(return_value=uuid4())),
            patch.object(market, "_marketplace_transaction_out", AsyncMock(return_value="out")),
        ):
            result = await market.report_marketplace_payment(transaction.appointment_id, db, transaction.buyer_id)

        self.assertEqual(result, "out")
        self.assertEqual(transaction.payment_status, "PAYMENT_REPORTED")
        self.assertIsNotNone(transaction.buyer_reported_at)
        self.assertIsNone(transaction.seller_confirmed_at)
        self.assertEqual(appointment.status, "ACCEPTED")
        self.assertEqual(listing.status, "RESERVED")
        db.commit.assert_awaited_once()

    async def test_buyer_cannot_report_before_seller_registers_qr(self):
        transaction, appointment, conversation, listing = _context()
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            patch.object(market, "_current_payment_qr_message_id", AsyncMock(return_value=None)),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.report_marketplace_payment(transaction.appointment_id, db, transaction.buyer_id)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(transaction.payment_status, "AWAITING_PAYMENT")
        db.commit.assert_not_awaited()

    async def test_only_buyer_can_report_payment(self):
        transaction, appointment, conversation, listing = _context()
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.report_marketplace_payment(transaction.appointment_id, db, transaction.seller_id)

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(transaction.payment_status, "AWAITING_PAYMENT")
        db.commit.assert_not_awaited()

    async def test_seller_cannot_confirm_before_buyer_reports_payment(self):
        transaction, appointment, conversation, listing = _context()
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.confirm_marketplace_payment(transaction.appointment_id, db, transaction.seller_id)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(transaction.payment_status, "AWAITING_PAYMENT")
        db.commit.assert_not_awaited()

    async def test_seller_confirmation_does_not_complete_appointment_or_listing(self):
        transaction, appointment, conversation, listing = _context("PAYMENT_REPORTED")
        db = SimpleNamespace(commit=AsyncMock())
        with (
            patch.object(
                market,
                "_load_marketplace_transaction",
                AsyncMock(return_value=(transaction, appointment, conversation, listing)),
            ),
            patch.object(market, "_marketplace_transaction_out", AsyncMock(return_value="out")),
        ):
            result = await market.confirm_marketplace_payment(transaction.appointment_id, db, transaction.seller_id)

        self.assertEqual(result, "out")
        self.assertEqual(transaction.payment_status, "PAYMENT_CONFIRMED")
        self.assertIsNotNone(transaction.seller_confirmed_at)
        self.assertEqual(appointment.status, "ACCEPTED")
        self.assertEqual(listing.status, "RESERVED")
        db.commit.assert_awaited_once()

    async def test_transaction_creation_is_idempotent_for_appointment(self):
        transaction, appointment, conversation, listing = _context()
        db = SimpleNamespace(get=AsyncMock(return_value=transaction), add=MagicMock())

        result = await market._ensure_marketplace_transaction(db, appointment, conversation, listing)

        self.assertIs(result, transaction)
        db.add.assert_not_called()

    async def test_transaction_snapshots_participants_and_accepted_offer(self):
        seller_id = uuid4()
        buyer_id = uuid4()
        appointment = SimpleNamespace(id=uuid4())
        conversation = SimpleNamespace(id=uuid4(), participant_1=seller_id, participant_2=buyer_id)
        listing = SimpleNamespace(id=uuid4(), seller_id=seller_id, price_vnd=9_000_000)
        offer_result = MagicMock()
        offer_result.scalar_one_or_none.return_value = 8_500_000
        db = SimpleNamespace(
            get=AsyncMock(return_value=None), execute=AsyncMock(return_value=offer_result), add=MagicMock()
        )

        result = await market._ensure_marketplace_transaction(db, appointment, conversation, listing)

        self.assertEqual(result.appointment_id, appointment.id)
        self.assertEqual(result.buyer_id, buyer_id)
        self.assertEqual(result.seller_id, seller_id)
        self.assertEqual(result.amount_vnd, 8_500_000)
        self.assertEqual(result.payment_method, "zalopay_qr_manual")
        self.assertEqual(result.payment_status, "AWAITING_PAYMENT")
        db.add.assert_called_once_with(result)


if __name__ == "__main__":
    unittest.main()
