"""Payment QR is an external-payment instruction, never a platform payment state."""

import unittest
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.routers import dm
from app.schemas import DmMessageCreateRequest, DmPaymentQrRequest


def _context(*, listing_status="RESERVED"):
    seller, buyer = uuid.uuid4(), uuid.uuid4()
    appointment = SimpleNamespace(id=uuid.uuid4(), status="ACCEPTED")
    conversation = SimpleNamespace(id=uuid.uuid4(), participant_1=seller, participant_2=buyer, last_message_at=None)
    listing = SimpleNamespace(id=uuid.uuid4(), seller_id=seller, status=listing_status)
    appointment.conversation_id = conversation.id
    appointment.listing_id = listing.id
    return appointment, conversation, listing, seller, buyer


def _private_image(owner_id):
    return SimpleNamespace(
        id=uuid.uuid4(),
        owner_id=owner_id,
        owner_type="user",
        is_private=True,
        mime_type="image/png",
        file_path="qr.png",
    )


class PaymentQrRegistrationTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        patcher = patch.object(dm.asyncio, "to_thread", AsyncMock(return_value=True))
        patcher.start()
        self.addCleanup(patcher.stop)

    def _db(self, image):
        db = MagicMock()
        transaction = SimpleNamespace(payment_status="AWAITING_PAYMENT")

        async def get(model, _key):
            return transaction if model.__name__ == "MarketplaceTransaction" else image

        db.get = AsyncMock(side_effect=get)
        db.add = MagicMock(side_effect=lambda msg: setattr(msg, "id", uuid.uuid4()))
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        result = MagicMock()
        result.scalars.return_value = []
        db.execute = AsyncMock(return_value=result)
        return db

    async def test_qr_is_frozen_after_buyer_reports_payment(self):
        appointment, conversation, listing, seller, _buyer = _context()
        image = _private_image(seller)
        db = self._db(image)

        async def get(model, _key):
            if model.__name__ == "MarketplaceTransaction":
                return SimpleNamespace(payment_status="PAYMENT_REPORTED")
            return image

        db.get = AsyncMock(side_effect=get)
        body = DmPaymentQrRequest(appointment_id=appointment.id, image_content_id=image.id)
        with (
            patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
            self.assertRaises(HTTPException) as raised,
        ):
            await dm.register_payment_qr(conversation.id, body, db=db, _session_uid=seller)

        self.assertEqual(raised.exception.status_code, 409)
        db.add.assert_not_called()

    async def test_transaction_context_locks_accepted_appointment_for_replacement(self):
        appointment, conversation, listing, seller, _buyer = _context()
        appointment.conversation_id = conversation.id
        appointment.listing_id = listing.id
        conversation.conversation_type = "direct"
        db = MagicMock()
        seen = []

        async def execute(query):
            seen.append(query)
            result = MagicMock()
            result.scalar_one_or_none.return_value = appointment
            return result

        async def get(model, _key):
            return conversation if model.__name__ == "DmConversation" else listing

        db.execute = AsyncMock(side_effect=execute)
        db.get = AsyncMock(side_effect=get)
        with patch.object(dm, "require_unblocked", AsyncMock()):
            await dm._payment_qr_context(db, appointment.id, seller, lock=True)
        self.assertIn("FOR UPDATE", str(seen[0].compile(dialect=postgresql.dialect())))

    async def test_seller_can_replace_only_own_private_image_without_trade_mutation(self):
        appointment, conversation, listing, seller, _buyer = _context()
        image = _private_image(seller)
        db = self._db(image)
        body = DmPaymentQrRequest(appointment_id=appointment.id, image_content_id=image.id)
        with patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))):
            out = await dm.register_payment_qr(conversation.id, body, db=db, _session_uid=seller)

        saved = db.add.call_args_list[0].args[0]
        self.assertEqual(saved.message_type, "payment_qr")
        self.assertEqual(saved.meta["appointmentId"], str(appointment.id))
        self.assertEqual(saved.meta["listingId"], str(listing.id))
        self.assertIsNone(out.image_url)  # never emit an imgproxy/bearer URL
        self.assertEqual(appointment.status, "ACCEPTED")
        self.assertEqual(listing.status, "RESERVED")

    async def test_buyer_cannot_register_qr(self):
        appointment, conversation, listing, seller, buyer = _context()
        image = _private_image(seller)
        db = self._db(image)
        body = DmPaymentQrRequest(appointment_id=appointment.id, image_content_id=image.id)
        with (
            patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
            self.assertRaises(HTTPException) as raised,
        ):
            await dm.register_payment_qr(conversation.id, body, db=db, _session_uid=buyer)
        self.assertEqual(raised.exception.status_code, 403)
        db.add.assert_not_called()

    async def test_wrong_conversation_and_terminal_listing_are_rejected(self):
        appointment, conversation, listing, seller, _buyer = _context()
        image = _private_image(seller)
        db = self._db(image)
        body = DmPaymentQrRequest(appointment_id=appointment.id, image_content_id=image.id)
        with (
            patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
            self.assertRaises(HTTPException) as raised,
        ):
            await dm.register_payment_qr(uuid.uuid4(), body, db=db, _session_uid=seller)
        self.assertEqual(raised.exception.status_code, 403)

        listing.status = "SOLD"
        with (
            patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
            self.assertRaises(HTTPException) as raised,
        ):
            await dm.register_payment_qr(conversation.id, body, db=db, _session_uid=seller)
        self.assertEqual(raised.exception.status_code, 409)

    async def test_other_user_or_non_image_content_is_rejected(self):
        appointment, conversation, listing, seller, _buyer = _context()
        image = _private_image(uuid.uuid4())
        db = self._db(image)
        body = DmPaymentQrRequest(appointment_id=appointment.id, image_content_id=image.id)
        with (
            patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
            self.assertRaises(HTTPException) as raised,
        ):
            await dm.register_payment_qr(conversation.id, body, db=db, _session_uid=seller)
        self.assertEqual(raised.exception.status_code, 400)

    async def test_missing_public_or_svg_qr_content_is_rejected(self):
        appointment, conversation, listing, seller, _buyer = _context()
        body = DmPaymentQrRequest(appointment_id=appointment.id, image_content_id=uuid.uuid4())
        # Keep each invalid condition explicit: absent, public, then an unsupported SVG payload.
        invalid_images = [None, _private_image(seller), _private_image(seller)]
        invalid_images[1].is_private = False
        invalid_images[2].mime_type = "image/svg+xml"
        for image in invalid_images:
            db = self._db(image)
            with (
                patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
                self.assertRaises(HTTPException) as raised,
            ):
                await dm.register_payment_qr(conversation.id, body, db=db, _session_uid=seller)
            self.assertEqual(raised.exception.status_code, 400)

    async def test_replacement_soft_deletes_only_prior_qr_for_same_appointment(self):
        appointment, conversation, listing, seller, _buyer = _context()
        image = _private_image(seller)
        same = SimpleNamespace(meta={"appointmentId": str(appointment.id)}, deleted_at=None, updated_at=None)
        other = SimpleNamespace(meta={"appointmentId": str(uuid.uuid4())}, deleted_at=None, updated_at=None)
        db = self._db(image)
        db.execute.return_value.scalars.return_value = [same, other]
        body = DmPaymentQrRequest(appointment_id=appointment.id, image_content_id=image.id)
        with patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))):
            await dm.register_payment_qr(conversation.id, body, db=db, _session_uid=seller)
        self.assertIsNotNone(same.deleted_at)
        self.assertIsNotNone(same.updated_at)
        self.assertIsNone(other.deleted_at)
        self.assertIsNone(other.updated_at)

        image.owner_id = seller
        image.mime_type = "audio/m4a"
        with (
            patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
            self.assertRaises(HTTPException) as raised,
        ):
            await dm.register_payment_qr(conversation.id, body, db=db, _session_uid=seller)
        self.assertEqual(raised.exception.status_code, 400)


class PaymentQrGenericGuardTest(unittest.IsolatedAsyncioTestCase):
    async def test_generic_message_cannot_spoof_payment_qr(self):
        me, other = uuid.uuid4(), uuid.uuid4()
        db = MagicMock()
        db.get = AsyncMock(
            return_value=SimpleNamespace(conversation_type="direct", participant_1=me, participant_2=other)
        )
        with patch.object(dm, "require_unblocked", AsyncMock()), self.assertRaises(HTTPException) as raised:
            await dm.send_message(
                uuid.uuid4(),
                DmMessageCreateRequest(content="QR", message_type="payment_qr", meta={"appointmentId": "fake"}),
                db=db,
                _session_uid=me,
            )
        self.assertEqual(raised.exception.status_code, 400)

    async def test_generic_message_rejects_private_image_before_serialization(self):
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = SimpleNamespace(conversation_type="direct", participant_1=me, participant_2=other)
        private = _private_image(me)
        db = MagicMock()
        db.get = AsyncMock(side_effect=[conv, private])
        with (
            patch.object(dm, "require_unblocked", AsyncMock()),
            self.assertRaises(HTTPException) as raised,
        ):
            await dm.send_message(
                conv_id,
                DmMessageCreateRequest(image_content_id=private.id),
                db=db,
                _session_uid=me,
            )
        self.assertEqual(raised.exception.status_code, 403)

    def test_private_image_is_never_serialized_even_for_a_legacy_generic_message(self):
        msg = SimpleNamespace(message_type="text", image_content=_private_image(uuid.uuid4()))
        self.assertIsNone(dm._resolve_dm_image(msg))


class PaymentQrImagePrivacyTest(unittest.IsolatedAsyncioTestCase):
    async def test_deleted_qr_is_not_served(self):
        db = MagicMock()
        missing = MagicMock()
        missing.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=missing)
        with self.assertRaises(HTTPException) as raised:
            await dm.get_payment_qr_image(uuid.uuid4(), uuid.uuid4(), db=db, _session_uid=uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 404)

    async def test_buyer_can_fetch_current_qr_with_private_cache_headers(self):
        appointment, conversation, listing, seller, buyer = _context()
        message = SimpleNamespace(
            id=uuid.uuid4(),
            conversation_id=conversation.id,
            sender_id=seller,
            message_type="payment_qr",
            deleted_at=None,
            meta={"appointmentId": str(appointment.id)},
            image_content_id=uuid.uuid4(),
        )
        with TemporaryDirectory() as directory:
            image_path = Path(directory) / "qr.png"
            image_path.write_bytes(b"png")
            image = _private_image(seller)
            image.id = message.image_content_id
            image.file_path = "qr.png"
            first = MagicMock()
            first.scalar_one_or_none.return_value = message
            db = MagicMock()
            db.execute = AsyncMock(return_value=first)
            db.get = AsyncMock(return_value=image)
            with (
                patch.object(dm, "CONTENTS_BASE_PATH", Path(directory)),
                patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
            ):
                response = await dm.get_payment_qr_image(conversation.id, message.id, db=db, _session_uid=buyer)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")


class PaymentQrContextAccessTest(unittest.IsolatedAsyncioTestCase):
    async def test_nonparticipant_and_group_are_rejected_by_authoritative_context(self):
        appointment, conversation, listing, _seller, _buyer = _context()

        async def context_for(conv):
            result = MagicMock()
            result.scalar_one_or_none.return_value = appointment
            db = MagicMock()
            db.execute = AsyncMock(return_value=result)
            db.get = AsyncMock(side_effect=[conv, listing])
            return db

        outsider_db = await context_for(SimpleNamespace(**vars(conversation), conversation_type="direct"))
        with self.assertRaises(HTTPException) as raised:
            await dm._payment_qr_context(outsider_db, appointment.id, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 403)

        group_db = await context_for(SimpleNamespace(**vars(conversation), conversation_type="group"))
        with self.assertRaises(HTTPException) as raised:
            await dm._payment_qr_context(group_db, appointment.id, conversation.participant_1)
        self.assertEqual(raised.exception.status_code, 403)

    async def test_qr_image_rejects_wrong_seller_content(self):
        appointment, conversation, listing, seller, buyer = _context()
        message = SimpleNamespace(
            id=uuid.uuid4(),
            conversation_id=conversation.id,
            sender_id=seller,
            message_type="payment_qr",
            deleted_at=None,
            meta={"appointmentId": str(appointment.id)},
            image_content_id=uuid.uuid4(),
        )
        image = _private_image(uuid.uuid4())
        first = MagicMock()
        first.scalar_one_or_none.return_value = message
        db = MagicMock()
        db.execute = AsyncMock(return_value=first)
        db.get = AsyncMock(return_value=image)
        with (
            patch.object(dm, "_payment_qr_context", AsyncMock(return_value=(appointment, conversation, listing))),
            self.assertRaises(HTTPException) as raised,
        ):
            await dm.get_payment_qr_image(conversation.id, message.id, db=db, _session_uid=buyer)
        self.assertEqual(raised.exception.status_code, 404)
