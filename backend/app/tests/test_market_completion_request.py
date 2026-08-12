"""S-16 / D-7 — 구매자 거래 완료 요청권.

수정 전에는 `complete_appointment` 만 존재해 판매자가 앱을 다시 열지 않으면 구매자의
거래·리뷰가 영구 정체됐다. 이 파일은 신설된 요청/거절 경로의 권한·상태·멱등 계약을 고정한다.

**자동 완료는 없다** — 요청은 `status` 를 바꾸지 않고(ACCEPTED 유지) 완료 확정 권한은
판매자에게 그대로 남는다는 D-7 결정도 함께 고정한다.
"""

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import market


def _fixture(*, requested=False, declined=False, status="ACCEPTED", listing_status="RESERVED"):
    """구매자가 요청한 상태(`requested`)·판매자가 거절한 상태(`declined`)를 조합해 만든다.
    요청자는 항상 이 대화의 구매자(buyer_id)다."""
    seller_id = uuid.uuid4()
    buyer_id = uuid.uuid4()
    now = market.datetime.now(market.UTC)
    appt = SimpleNamespace(
        id=uuid.uuid4(),
        listing_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        proposer_id=buyer_id,
        when_at=now,
        place_name=None,
        place_lat=None,
        place_lng=None,
        status=status,
        completion_requested_by=buyer_id if requested else None,
        completion_requested_at=now if requested else None,
        completion_declined_at=now if declined else None,
        completion_declined_by=seller_id if declined else None,
        updated_at=None,
    )
    conv = SimpleNamespace(id=appt.conversation_id)
    listing = SimpleNamespace(id=appt.listing_id, seller_id=seller_id, title="혼다 웨이브", status=listing_status)
    return appt, conv, listing, seller_id, buyer_id


def _db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


class RequestCompletionTest(unittest.IsolatedAsyncioTestCase):
    async def test_buyer_request_records_and_notifies_seller(self):
        appt, conv, listing, _seller_id, buyer_id = _fixture()
        db = _db()
        with patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))):
            out = await market.request_appointment_completion(appt.id, db=db, session_uid=buyer_id)

        self.assertEqual(appt.completion_requested_by, buyer_id)
        self.assertIsNotNone(appt.completion_requested_at)
        # D-7: 요청은 상태를 바꾸지 않는다 — 완료는 여전히 판매자만.
        self.assertEqual(appt.status, "ACCEPTED")
        self.assertEqual(out.completion_requested_by, buyer_id)
        # 판매자 대상 알림이 같은 트랜잭션에 적재됐는가 (FD-6 outbox)
        self.assertEqual(db.add.call_count, 1)
        event = db.add.call_args[0][0]
        self.assertEqual(event.event_type, "market.completion_requested")
        self.assertEqual(event.payload["recipient_id"], str(listing.seller_id))
        self.assertEqual(event.payload["conversation_id"], str(conv.id))
        db.commit.assert_awaited()

    async def test_seller_cannot_request(self):
        appt, conv, listing, seller_id, _buyer_id = _fixture()
        db = _db()
        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.request_appointment_completion(appt.id, db=db, session_uid=seller_id)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, {"code": "seller_completes_directly"})

    async def test_request_rejected_unless_accepted(self):
        appt, conv, listing, _seller_id, buyer_id = _fixture(status="PROPOSED")
        db = _db()
        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.request_appointment_completion(appt.id, db=db, session_uid=buyer_id)
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_duplicate_request_is_idempotent_and_silent(self):
        appt, conv, listing, _seller_id, buyer_id = _fixture(requested=True)
        first_requested_at = appt.completion_requested_at
        db = _db()
        with patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))):
            await market.request_appointment_completion(appt.id, db=db, session_uid=buyer_id)
        self.assertEqual(appt.completion_requested_at, first_requested_at)
        db.add.assert_not_called()
        db.commit.assert_not_awaited()

    async def test_re_request_allowed_after_decline(self):
        appt, conv, listing, _seller_id, buyer_id = _fixture(requested=True, declined=True)
        db = _db()
        with patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))):
            await market.request_appointment_completion(appt.id, db=db, session_uid=buyer_id)
        self.assertIsNone(appt.completion_declined_at)
        # 행위자 기록도 함께 비워져야 한다 — 남아 있으면 프론트가 "판매자가 거절" 문구를 계속 띄운다.
        self.assertIsNone(appt.completion_declined_by)
        self.assertEqual(db.add.call_count, 1)

    async def test_request_rejected_when_listing_already_sold_elsewhere(self):
        """판매자가 다른 대화의 구매자에게 이미 팔았으면 이 약속은 완료될 수 없다 — 완료 불가능한
        거래에 판매자 푸시가 나가고 어드민 큐에 해소 경로 없는 행이 쌓이던 것을 막는다."""
        appt, conv, listing, _seller_id, buyer_id = _fixture(listing_status="SOLD")
        db = _db()
        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.request_appointment_completion(appt.id, db=db, session_uid=buyer_id)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIsNone(appt.completion_requested_at)
        db.add.assert_not_called()


class DeclineCompletionTest(unittest.IsolatedAsyncioTestCase):
    async def test_seller_decline_records_and_notifies_buyer(self):
        appt, conv, listing, seller_id, buyer_id = _fixture(requested=True)
        db = _db()
        with patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))):
            out = await market.decline_appointment_completion(appt.id, db=db, session_uid=seller_id)

        self.assertIsNotNone(appt.completion_declined_at)
        # 거절해도 요청 이력은 남는다 — 운영 이의 큐의 판단 근거.
        self.assertEqual(appt.completion_requested_by, buyer_id)
        self.assertEqual(appt.status, "ACCEPTED")
        self.assertIsNotNone(out.completion_declined_at)
        # 운영 기각(NULL)과 구분되도록 판매자 id 를 남긴다.
        self.assertEqual(appt.completion_declined_by, listing.seller_id)
        event = db.add.call_args[0][0]
        self.assertEqual(event.event_type, "market.completion_declined")
        self.assertEqual(event.payload["recipient_id"], str(buyer_id))

    async def test_buyer_cannot_decline(self):
        appt, conv, listing, _seller_id, buyer_id = _fixture(requested=True)
        db = _db()
        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.decline_appointment_completion(appt.id, db=db, session_uid=buyer_id)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_decline_without_request_rejected(self):
        appt, conv, listing, seller_id, _buyer_id = _fixture()
        db = _db()
        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.decline_appointment_completion(appt.id, db=db, session_uid=seller_id)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, {"code": "no_completion_request"})

    async def test_decline_skips_notification_when_requester_account_is_gone(self):
        """요청자 탈퇴 시 FK ON DELETE SET NULL 로 requested_by 만 NULL 이 된다. 그 상태로 알림을
        적재하면 worker 가 uuid.UUID("None") 로 죽어 DLQ 까지 간다 — 적재 자체를 건너뛴다."""
        appt, conv, listing, seller_id, _buyer_id = _fixture(requested=True)
        appt.completion_requested_by = None
        db = _db()
        with patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))):
            await market.decline_appointment_completion(appt.id, db=db, session_uid=seller_id)

        self.assertIsNotNone(appt.completion_declined_at)  # 거절 기록은 남는다
        db.add.assert_not_called()  # 받을 사람이 없는 알림은 적재하지 않는다
        db.commit.assert_awaited()

    async def test_duplicate_decline_is_idempotent_and_silent(self):
        appt, conv, listing, seller_id, _buyer_id = _fixture(requested=True, declined=True)
        first_declined_at = appt.completion_declined_at
        db = _db()
        with patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))):
            await market.decline_appointment_completion(appt.id, db=db, session_uid=seller_id)
        self.assertEqual(appt.completion_declined_at, first_declined_at)
        db.add.assert_not_called()
        db.commit.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
