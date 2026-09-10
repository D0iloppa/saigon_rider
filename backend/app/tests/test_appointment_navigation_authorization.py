import unittest
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

from app.routers import market
from app.schemas import AppointmentProposeRequest


def _appointment(*, status="ACCEPTED", when_at=None, place_lat=Decimal("10.771234"), place_lng=Decimal("106.691234")):
    return SimpleNamespace(
        id=uuid4(),
        conversation_id=uuid4(),
        status=status,
        when_at=when_at or datetime.now(UTC),
        completion_requested_at=None,
        place_name="Ben Thanh",
        place_lat=place_lat,
        place_lng=place_lng,
    )


def _db_for(appointment, actor_id, counterpart_id):
    conversation = SimpleNamespace(participant_1=actor_id, participant_2=counterpart_id)
    return SimpleNamespace(get=AsyncMock(side_effect=(appointment, conversation)))


class AppointmentNavigationAuthorizationTest(unittest.IsolatedAsyncioTestCase):
    async def test_participant_receives_only_exact_destination_contract(self):
        actor_id = uuid4()
        appointment = _appointment()
        db = _db_for(appointment, actor_id, uuid4())

        with patch.object(market, "require_unblocked", AsyncMock()):
            result = await market.get_appointment_navigation_destination(appointment.id, db, actor_id)

        self.assertEqual(result.appointment_id, appointment.id)
        self.assertEqual(result.precision, "exact")
        self.assertEqual((result.place_lat, result.place_lng), (10.771234, 106.691234))

    async def test_nonparticipant_receives_stable_error_without_destination(self):
        participant_id = uuid4()
        appointment = _appointment()
        db = _db_for(appointment, participant_id, uuid4())

        with self.assertRaises(HTTPException) as raised:
            await market.get_appointment_navigation_destination(appointment.id, db, uuid4())

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail, {"code": "appointment_navigation_not_participant"})
        self.assertNotIn(str(appointment.place_lat), str(raised.exception.detail))
        self.assertNotIn(str(appointment.place_lng), str(raised.exception.detail))

    async def test_blocked_participant_receives_stable_error_without_destination(self):
        actor_id = uuid4()
        appointment = _appointment()
        db = _db_for(appointment, actor_id, uuid4())

        with (
            patch.object(
                market,
                "require_unblocked",
                AsyncMock(side_effect=HTTPException(status_code=403, detail="Conversation blocked")),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await market.get_appointment_navigation_destination(appointment.id, db, actor_id)

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail, {"code": "appointment_navigation_blocked"})
        self.assertNotIn(str(appointment.place_lat), str(raised.exception.detail))
        self.assertNotIn(str(appointment.place_lng), str(raised.exception.detail))

    async def test_terminal_or_unaccepted_states_are_rejected_without_destination(self):
        actor_id = uuid4()
        cases = (
            ("CANCELLED", "appointment_navigation_cancelled"),
            ("COMPLETED", "appointment_navigation_completed"),
            ("PROPOSED", "appointment_navigation_not_accepted"),
        )
        for status, code in cases:
            with self.subTest(status=status):
                appointment = _appointment(status=status)
                db = _db_for(appointment, actor_id, uuid4())
                with patch.object(market, "require_unblocked", AsyncMock()), self.assertRaises(HTTPException) as raised:
                    await market.get_appointment_navigation_destination(appointment.id, db, actor_id)

                self.assertEqual(raised.exception.status_code, 409)
                self.assertEqual(raised.exception.detail, {"code": code})
                self.assertNotIn(str(appointment.place_lat), str(raised.exception.detail))
                self.assertNotIn(str(appointment.place_lng), str(raised.exception.detail))

    async def test_accepted_appointment_outside_exact_window_is_rejected_without_destination(self):
        actor_id = uuid4()
        appointment = _appointment(when_at=datetime.now(UTC) + timedelta(hours=2))
        db = _db_for(appointment, actor_id, uuid4())

        with patch.object(market, "require_unblocked", AsyncMock()), self.assertRaises(HTTPException) as raised:
            await market.get_appointment_navigation_destination(appointment.id, db, actor_id)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail, {"code": "appointment_navigation_destination_not_exact"})
        self.assertNotIn(str(appointment.place_lat), str(raised.exception.detail))
        self.assertNotIn(str(appointment.place_lng), str(raised.exception.detail))

    async def test_accepted_appointment_without_complete_destination_is_rejected(self):
        actor_id = uuid4()
        appointment = _appointment(place_lat=None)
        db = _db_for(appointment, actor_id, uuid4())

        with patch.object(market, "require_unblocked", AsyncMock()), self.assertRaises(HTTPException) as raised:
            await market.get_appointment_navigation_destination(appointment.id, db, actor_id)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail, {"code": "appointment_navigation_destination_missing"})

    async def test_accepted_appointment_with_invalid_stored_destination_is_rejected(self):
        actor_id = uuid4()
        appointment = _appointment(place_lat=Decimal("NaN"))
        db = _db_for(appointment, actor_id, uuid4())

        with patch.object(market, "require_unblocked", AsyncMock()), self.assertRaises(HTTPException) as raised:
            await market.get_appointment_navigation_destination(appointment.id, db, actor_id)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail, {"code": "appointment_navigation_destination_invalid"})


class AppointmentDestinationInputValidationTest(unittest.TestCase):
    def test_proposal_requires_a_complete_in_range_destination_pair(self):
        base = {"conversation_id": uuid4(), "when_at": datetime.now(UTC)}
        with self.assertRaises(ValidationError):
            AppointmentProposeRequest(**base, place_lat=10.7)
        with self.assertRaises(ValidationError):
            AppointmentProposeRequest(**base, place_lat=91, place_lng=106.7)
