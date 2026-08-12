"""S-16 / D-7 — 어드민 거래 완료 이의 큐.

이 파일이 고정하는 계약:
 1) `list_completion_requests` — state 화이트리스트(pending/declined/all) 밖은 400.
 2) `force_complete` — 약속 COMPLETED + 매물 SOLD + 합의가 스냅샷(MKT-7 규칙) + 양측 알림 + 감사로그.
 3) `dismiss_completion_request` — 거래는 완료되지 않고 요청만 내려가며(구매자 재요청 가능),
    요청 이력(`completion_requested_at`)은 지우지 않는다.
 4) 두 조치 모두 **빈 사유를 받지 않는다**(사유가 사용자 알림 본문으로 그대로 나간다).
"""

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.models import AdminAuditLog, Notification
from app.routers.admin_api import trades


def _request():
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))


def _session():
    return SimpleNamespace(username="root", role="root")


def _fixture(*, declined=False, status="ACCEPTED", listing_status="RESERVED"):
    seller_id = uuid.uuid4()
    buyer_id = uuid.uuid4()
    now = trades.datetime.now(trades.UTC)
    appt = SimpleNamespace(
        id=uuid.uuid4(),
        listing_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        status=status,
        completion_requested_by=buyer_id,
        completion_requested_at=now,
        completion_declined_at=now if declined else None,
        completion_declined_by=seller_id if declined else None,
        updated_at=None,
    )
    listing = SimpleNamespace(
        id=appt.listing_id,
        seller_id=seller_id,
        title="혼다 웨이브",
        status=listing_status,
        price_vnd=5_000_000,
        agreed_price_vnd=None,
        updated_at=None,
    )
    return appt, listing, seller_id, buyer_id


def _db(appt, listing, *, accepted_offer_amount=None):
    """`db.get` 은 약속을, `db.execute` 는 (매물 잠금 → 수락 가격제안) 순서로 응답한다."""
    db = AsyncMock()
    db.get = AsyncMock(return_value=appt)
    added: list = []
    db.add = MagicMock(side_effect=lambda obj: added.append(obj))

    listing_res = MagicMock()
    listing_res.scalar_one_or_none = MagicMock(return_value=listing)
    offer_res = MagicMock()
    offer_res.scalar_one_or_none = MagicMock(return_value=accepted_offer_amount)
    db.execute = AsyncMock(side_effect=[listing_res, offer_res])
    return db, added


class ListStateValidationTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_unknown_state(self):
        with self.assertRaises(HTTPException) as ctx:
            await trades.list_completion_requests(state="bogus", db=AsyncMock())
        self.assertEqual(ctx.exception.status_code, 400)

    def test_state_whitelist_is_exactly_three(self):
        self.assertEqual(trades._STATES, {"pending", "declined", "all"})


class ForceCompleteTest(unittest.IsolatedAsyncioTestCase):
    async def test_completes_trade_and_notifies_both_parties(self):
        appt, listing, seller_id, buyer_id = _fixture()
        db, added = _db(appt, listing)

        result = await trades.force_complete(
            appt.id,
            trades.ResolveRequest(reason="양측 확인 완료 · 판매자 미응답 5일"),
            _request(),
            session=_session(),
            db=db,
        )

        self.assertEqual(appt.status, "COMPLETED")
        self.assertEqual(listing.status, "SOLD")
        self.assertEqual(result["listing_status"], "SOLD")
        # MKT-7: 수락된 가격제안이 없으면 완료 시점 매물가가 합의가로 남는다.
        self.assertEqual(listing.agreed_price_vnd, listing.price_vnd)

        notis = [o for o in added if isinstance(o, Notification)]
        self.assertEqual({n.user_id for n in notis}, {seller_id, buyer_id})
        self.assertTrue(all(n.type == "MODERATION" for n in notis))
        self.assertIn("판매자 미응답 5일", notis[0].body)

        audits = [o for o in added if isinstance(o, AdminAuditLog)]
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0].action, "trade.completion_force_complete")
        self.assertEqual(audits[0].target_id, str(appt.id))
        db.commit.assert_awaited_once()

    async def test_accepted_offer_amount_wins_as_agreed_price(self):
        appt, listing, _seller_id, _buyer_id = _fixture()
        db, _added = _db(appt, listing, accepted_offer_amount=4_200_000)

        await trades.force_complete(
            appt.id, trades.ResolveRequest(reason="합의가 확인"), _request(), session=_session(), db=db
        )
        self.assertEqual(listing.agreed_price_vnd, 4_200_000)

    async def test_blank_reason_rejected_before_any_write(self):
        appt, listing, _seller_id, _buyer_id = _fixture()
        db, added = _db(appt, listing)

        with self.assertRaises(HTTPException) as ctx:
            await trades.force_complete(
                appt.id, trades.ResolveRequest(reason="   "), _request(), session=_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(added, [])
        db.commit.assert_not_awaited()

    async def test_rejects_when_no_completion_request(self):
        appt, listing, _seller_id, _buyer_id = _fixture()
        appt.completion_requested_at = None
        db, _added = _db(appt, listing)

        with self.assertRaises(HTTPException) as ctx:
            await trades.force_complete(
                appt.id, trades.ResolveRequest(reason="사유"), _request(), session=_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, {"code": "no_completion_request"})

    async def test_rejects_already_completed_appointment(self):
        appt, listing, _seller_id, _buyer_id = _fixture(status="COMPLETED")
        db, _added = _db(appt, listing)

        with self.assertRaises(HTTPException) as ctx:
            await trades.force_complete(
                appt.id, trades.ResolveRequest(reason="사유"), _request(), session=_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_rejects_when_listing_already_sold(self):
        appt, listing, _seller_id, _buyer_id = _fixture(listing_status="SOLD")
        db, _added = _db(appt, listing)

        with self.assertRaises(HTTPException) as ctx:
            await trades.force_complete(
                appt.id, trades.ResolveRequest(reason="사유"), _request(), session=_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 409)


class DismissTest(unittest.IsolatedAsyncioTestCase):
    async def test_dismiss_works_even_when_listing_sold_elsewhere(self):
        """판매자가 다른 대화로 먼저 팔아 매물이 SOLD 인 건은 강제완료는 불가하지만 **기각은 가능해야**
        한다 — 공용 가드로 두면 그 행이 큐에서 나갈 방법이 없어 영구 잔류한다."""
        appt, listing, _seller_id, buyer_id = _fixture(listing_status="SOLD")
        db, added = _db(appt, listing)

        await trades.dismiss_completion_request(
            appt.id, trades.ResolveRequest(reason="타 구매자와 성사 확인"), _request(), session=_session(), db=db
        )
        self.assertIsNotNone(appt.completion_declined_at)
        self.assertEqual([n.user_id for n in added if isinstance(n, Notification)], [buyer_id])
        db.commit.assert_awaited_once()

    async def test_dismiss_leaves_actor_null_so_buyer_is_not_told_the_seller_declined(self):
        """운영 기각은 판매자 거절이 아니다 — 행위자를 비워 프론트 문구가 갈리게 한다."""
        appt, listing, _seller_id, _buyer_id = _fixture()
        db, _added = _db(appt, listing)

        await trades.dismiss_completion_request(
            appt.id, trades.ResolveRequest(reason="거래 미성립"), _request(), session=_session(), db=db
        )
        self.assertIsNone(appt.completion_declined_by)

    async def test_dismiss_keeps_trade_open_and_notifies_buyer_only(self):
        appt, listing, _seller_id, buyer_id = _fixture()
        requested_at = appt.completion_requested_at
        db, added = _db(appt, listing)

        await trades.dismiss_completion_request(
            appt.id, trades.ResolveRequest(reason="거래 미성립 확인"), _request(), session=_session(), db=db
        )

        # 기각은 완료가 아니다 — 약속·매물 상태는 그대로.
        self.assertEqual(appt.status, "ACCEPTED")
        self.assertEqual(listing.status, "RESERVED")
        self.assertIsNotNone(appt.completion_declined_at)
        # 요청 이력은 남는다(반복 요청 판단 근거).
        self.assertEqual(appt.completion_requested_at, requested_at)

        notis = [o for o in added if isinstance(o, Notification)]
        self.assertEqual([n.user_id for n in notis], [buyer_id])
        audits = [o for o in added if isinstance(o, AdminAuditLog)]
        self.assertEqual(audits[0].action, "trade.completion_dismiss")
        db.commit.assert_awaited_once()

    async def test_blank_reason_rejected(self):
        appt, listing, _seller_id, _buyer_id = _fixture()
        db, added = _db(appt, listing)

        with self.assertRaises(HTTPException) as ctx:
            await trades.dismiss_completion_request(
                appt.id, trades.ResolveRequest(reason=""), _request(), session=_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(added, [])


if __name__ == "__main__":
    unittest.main()
