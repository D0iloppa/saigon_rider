"""P4-2 appointment departure/arrival facts and transactional outbox contract."""

import unittest
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import market
from app.schemas import AppointmentTravelArrivalRequest


def _appointment(*, status="ACCEPTED", place_lat=Decimal("10.771234"), place_lng=Decimal("106.691234")):
    return SimpleNamespace(
        id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        status=status,
        place_lat=place_lat,
        place_lng=place_lng,
    )


def _result(value):
    return SimpleNamespace(scalar_one_or_none=MagicMock(return_value=value))


def _db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


class AppointmentTravelEligibilityTest(unittest.IsolatedAsyncioTestCase):
    async def test_nonparticipant_cannot_create_a_travel_event(self):
        actor_id = uuid.uuid4()
        appt = _appointment()
        conv = SimpleNamespace(participant_1=uuid.uuid4(), participant_2=uuid.uuid4())
        db = _db()
        db.get = AsyncMock(side_effect=(appt, conv))

        with self.assertRaises(HTTPException) as raised:
            await market._travel_appointment(db, appt.id, actor_id)

        self.assertEqual(raised.exception.status_code, 403)
        db.add.assert_not_called()

    async def test_blocked_participant_cannot_create_a_travel_event(self):
        actor_id = uuid.uuid4()
        appt = _appointment()
        conv = SimpleNamespace(participant_1=actor_id, participant_2=uuid.uuid4())
        db = _db()
        db.get = AsyncMock(side_effect=(appt, conv))

        with (
            patch.object(
                market, "require_unblocked", AsyncMock(side_effect=HTTPException(status_code=403, detail="blocked"))
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market._travel_appointment(db, appt.id, actor_id)

        self.assertEqual(raised.exception.status_code, 403)
        db.add.assert_not_called()

    async def test_unaccepted_or_invalid_destination_cannot_create_a_travel_event(self):
        actor_id = uuid.uuid4()
        counterpart_id = uuid.uuid4()
        listing = SimpleNamespace(id=uuid.uuid4(), seller_id=counterpart_id)
        for appt, code in (
            (_appointment(status="PROPOSED"), "appointment_travel_not_accepted"),
            (_appointment(place_lat=None), "appointment_travel_destination_missing"),
        ):
            with self.subTest(code=code):
                conv = SimpleNamespace(
                    id=appt.conversation_id,
                    participant_1=actor_id,
                    participant_2=counterpart_id,
                    context_type="listing",
                    context_id=listing.id,
                )
                db = _db()
                with (
                    patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))),
                    self.assertRaises(HTTPException) as raised,
                ):
                    await market._travel_appointment(db, appt.id, actor_id)

                self.assertEqual(raised.exception.status_code, 409)
                self.assertEqual(raised.exception.detail, {"code": code})


class AppointmentTravelEventPersistenceTest(unittest.IsolatedAsyncioTestCase):
    async def test_new_fact_and_peer_only_outbox_share_the_commit(self):
        appt = _appointment()
        actor_id = uuid.uuid4()
        recipient_id = uuid.uuid4()
        conv = SimpleNamespace(id=appt.conversation_id)
        db = _db()
        occurred_at = datetime.now(UTC)
        db.execute = AsyncMock(return_value=_result(occurred_at))

        out = await market._record_appointment_travel_event(
            db,
            appointment=appt,
            conversation=conv,
            actor_id=actor_id,
            recipient_id=recipient_id,
            kind="departure",
        )

        self.assertTrue(out.recorded)
        self.assertEqual(out.occurred_at, occurred_at)
        event = db.add.call_args.args[0]
        self.assertEqual(event.event_type, "market.appointment_travel")
        self.assertEqual(event.payload["recipient_id"], str(recipient_id))
        self.assertNotEqual(event.payload["recipient_id"], str(actor_id))
        self.assertEqual(event.payload["kind"], "departure")
        self.assertNotIn("lat", event.payload)
        self.assertNotIn("lng", event.payload)
        db.commit.assert_awaited_once()

    async def test_unique_existing_fact_is_idempotent_without_another_outbox_row(self):
        appt = _appointment()
        db = _db()
        occurred_at = datetime.now(UTC)
        db.execute = AsyncMock(side_effect=(_result(None), _result(occurred_at)))

        out = await market._record_appointment_travel_event(
            db,
            appointment=appt,
            conversation=SimpleNamespace(id=appt.conversation_id),
            actor_id=uuid.uuid4(),
            recipient_id=uuid.uuid4(),
            kind="departure",
        )

        self.assertFalse(out.recorded)
        self.assertEqual(out.occurred_at, occurred_at)
        db.add.assert_not_called()
        db.commit.assert_not_awaited()


class AppointmentArrivalContractTest(unittest.IsolatedAsyncioTestCase):
    async def test_arrival_requires_departure_before_gps_can_create_it(self):
        appt = _appointment()
        actor_id = uuid.uuid4()
        db = _db()
        db.execute = AsyncMock(return_value=_result(None))
        body = AppointmentTravelArrivalRequest(lat=10.771234, lng=106.691234, accuracy_m=10)

        with (
            patch.object(
                market,
                "_travel_appointment",
                AsyncMock(
                    return_value=(appt, SimpleNamespace(id=appt.conversation_id), uuid.uuid4(), (10.771234, 106.691234))
                ),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.record_appointment_arrival(appt.id, body, db, actor_id)

        self.assertEqual(raised.exception.detail, {"code": "appointment_travel_departure_required"})
        db.add.assert_not_called()

    async def test_arrival_rejects_low_accuracy_and_out_of_radius_gps(self):
        appt = _appointment()
        actor_id = uuid.uuid4()
        context = (appt, SimpleNamespace(id=appt.conversation_id), uuid.uuid4(), (10.771234, 106.691234))
        for body, code in (
            (
                AppointmentTravelArrivalRequest(lat=10.771234, lng=106.691234, accuracy_m=36),
                "appointment_travel_arrival_accuracy_too_low",
            ),
            (AppointmentTravelArrivalRequest(lat=10.8, lng=106.7, accuracy_m=10), "appointment_travel_arrival_too_far"),
        ):
            with self.subTest(code=code):
                db = _db()
                db.execute = AsyncMock(return_value=_result(datetime.now(UTC)))
                with (
                    patch.object(market, "_travel_appointment", AsyncMock(return_value=context)),
                    self.assertRaises(HTTPException) as raised,
                ):
                    await market.record_appointment_arrival(appt.id, body, db, actor_id)

                self.assertEqual(raised.exception.detail, {"code": code})
                db.add.assert_not_called()

    async def test_arrival_records_only_after_departure_with_valid_foreground_sample(self):
        appt = _appointment()
        actor_id = uuid.uuid4()
        recipient_id = uuid.uuid4()
        conv = SimpleNamespace(id=appt.conversation_id)
        db = _db()
        occurred_at = datetime.now(UTC)
        db.execute = AsyncMock(side_effect=(_result(occurred_at), _result(occurred_at)))
        body = AppointmentTravelArrivalRequest(lat=10.771234, lng=106.691234, accuracy_m=35)

        with patch.object(
            market, "_travel_appointment", AsyncMock(return_value=(appt, conv, recipient_id, (10.771234, 106.691234)))
        ):
            out = await market.record_appointment_arrival(appt.id, body, db, actor_id)

        self.assertTrue(out.recorded)
        self.assertEqual(db.add.call_args.args[0].payload["recipient_id"], str(recipient_id))
        self.assertEqual(db.add.call_args.args[0].payload["kind"], "arrival")


if __name__ == "__main__":
    unittest.main()
