"""F033 — 어드민 수동 QR 거래 조회·분쟁 개입.

이 파일이 고정하는 계약:
 1) `list_transactions` — payment_status 화이트리스트 밖은 400.
 2) `get_transaction` — 존재하지 않으면 404, QR 등록 여부는 이미지 노출 없이 boolean 으로만 나온다.
 3) `add_transaction_memo` — 메모는 payment_status를 바꾸지 않는다. 별도 rollback endpoint만
    PAYMENT_REPORTED 거래를 취소·재판매로 되돌릴 수 있다.
 4) `verify_admin_api` — 쿠키 없으면 401 (신규 엔드포인트가 공유하는 인증 의존성 자체 검증).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.admin_auth import verify_admin_api
from app.models import AdminAuditLog, MarketplaceTransaction
from app.routers.admin_api import transactions as admin_tx


def _request():
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))


def _session():
    return SimpleNamespace(username="root", role="root")


def _tx(**overrides) -> MarketplaceTransaction:
    now = datetime.now(UTC)
    defaults = dict(
        appointment_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        listing_id=uuid.uuid4(),
        buyer_id=uuid.uuid4(),
        seller_id=uuid.uuid4(),
        amount_vnd=5_000_000,
        payment_method="zalopay_qr_manual",
        payment_status="AWAITING_PAYMENT",
        buyer_reported_at=None,
        seller_confirmed_at=None,
        created_at=now,
        updated_at=now,
    )
    defaults.update(overrides)
    return MarketplaceTransaction(**defaults)


class AuthDependencyTest(unittest.IsolatedAsyncioTestCase):
    async def test_missing_cookie_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await verify_admin_api(admin_session=None)
        self.assertEqual(ctx.exception.status_code, 401)


class ListTransactionsTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_unknown_status(self):
        with self.assertRaises(HTTPException) as ctx:
            await admin_tx.list_transactions(payment_status="BOGUS", db=AsyncMock())
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_lists_rows_with_listing_and_party_lookup(self):
        tx = _tx()
        listing = SimpleNamespace(title="Honda Wave 2020")
        buyer = SimpleNamespace(id=tx.buyer_id, nickname="buyer1")
        seller = SimpleNamespace(id=tx.seller_id, nickname="seller1")

        db = AsyncMock()
        count_res = MagicMock()
        count_res.scalar_one = MagicMock(return_value=1)
        rows_res = MagicMock()
        rows_res.all = MagicMock(return_value=[(tx, listing, buyer, seller)])
        db.execute = AsyncMock(side_effect=[count_res, rows_res])

        page = await admin_tx.list_transactions(
            payment_status=None, date_from=None, date_to=None, page=1, size=20, db=db
        )
        self.assertEqual(page.total, 1)
        self.assertEqual(len(page.items), 1)
        self.assertEqual(page.items[0].listing_title, "Honda Wave 2020")
        self.assertEqual(page.items[0].buyer.nickname, "buyer1")
        self.assertEqual(page.items[0].payment_status, "AWAITING_PAYMENT")


class GetTransactionTest(unittest.IsolatedAsyncioTestCase):
    async def test_404_when_missing(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        with self.assertRaises(HTTPException) as ctx:
            await admin_tx.get_transaction(uuid.uuid4(), db=db)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_qr_registered_true_without_exposing_image(self):
        tx = _tx(payment_status="PAYMENT_REPORTED")
        appt = SimpleNamespace(status="ACCEPTED", when_at=tx.created_at)
        listing = SimpleNamespace(title="Honda Wave 2020")
        buyer = SimpleNamespace(id=tx.buyer_id, nickname="buyer1")
        seller = SimpleNamespace(id=tx.seller_id, nickname="seller1")

        db = AsyncMock()
        db.get = AsyncMock(side_effect=[tx, appt, listing, buyer, seller])
        qr_res = MagicMock()
        qr_res.scalar_one_or_none = MagicMock(return_value=uuid.uuid4())
        memo_res = MagicMock()
        memo_res.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        db.execute = AsyncMock(side_effect=[qr_res, memo_res])

        detail = await admin_tx.get_transaction(tx.appointment_id, db=db)
        self.assertTrue(detail.qr_registered)
        # 응답 스키마에 이미지 URL/경로 필드가 없다 — 있음/없음만 노출.
        self.assertNotIn("image", detail.model_dump())

    async def test_memos_come_from_audit_log(self):
        tx = _tx()
        appt = SimpleNamespace(status="ACCEPTED", when_at=tx.created_at)
        listing = SimpleNamespace(title="Honda Wave 2020")
        buyer = SimpleNamespace(id=tx.buyer_id, nickname="buyer1")
        seller = SimpleNamespace(id=tx.seller_id, nickname="seller1")
        log = AdminAuditLog(
            admin_username="root",
            admin_role="root",
            action="transaction.memo_added",
            target_type="marketplace_transaction",
            target_id=str(tx.appointment_id),
            detail={"note": "구매자 문의 확인함"},
            created_at=tx.created_at,
        )

        db = AsyncMock()
        db.get = AsyncMock(side_effect=[tx, appt, listing, buyer, seller])
        qr_res = MagicMock()
        qr_res.scalar_one_or_none = MagicMock(return_value=None)
        memo_res = MagicMock()
        memo_res.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[log])))
        db.execute = AsyncMock(side_effect=[qr_res, memo_res])

        detail = await admin_tx.get_transaction(tx.appointment_id, db=db)
        self.assertFalse(detail.qr_registered)
        self.assertEqual(len(detail.memos), 1)
        self.assertEqual(detail.memos[0].note, "구매자 문의 확인함")


class AddMemoTest(unittest.IsolatedAsyncioTestCase):
    async def test_blank_note_rejected_before_any_write(self):
        db = AsyncMock()
        with self.assertRaises(HTTPException) as ctx:
            await admin_tx.add_transaction_memo(
                uuid.uuid4(), admin_tx.MemoRequest(note="   "), _request(), session=_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 400)
        db.get.assert_not_awaited()
        db.commit.assert_not_awaited()

    async def test_404_when_transaction_missing(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        with self.assertRaises(HTTPException) as ctx:
            await admin_tx.add_transaction_memo(
                uuid.uuid4(), admin_tx.MemoRequest(note="확인 필요"), _request(), session=_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 404)
        db.commit.assert_not_awaited()

    async def test_writes_audit_log_only_and_never_touches_payment_status(self):
        tx = _tx(payment_status="PAYMENT_REPORTED")
        db = AsyncMock()
        db.get = AsyncMock(return_value=tx)
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        await admin_tx.add_transaction_memo(
            tx.appointment_id,
            admin_tx.MemoRequest(note="판매자에게 확인 요청함"),
            _request(),
            session=_session(),
            db=db,
        )

        self.assertEqual(tx.payment_status, "PAYMENT_REPORTED")
        audits = [o for o in added if isinstance(o, AdminAuditLog)]
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0].action, "transaction.memo_added")
        self.assertEqual(audits[0].target_id, str(tx.appointment_id))
        self.assertEqual(audits[0].detail, {"note": "판매자에게 확인 요청함"})
        db.commit.assert_awaited_once()


class RollbackPaymentReportTest(unittest.IsolatedAsyncioTestCase):
    async def test_only_payment_reported_active_transaction_can_be_rolled_back(self):
        tx = _tx(payment_status="PAYMENT_REPORTED")
        appt = SimpleNamespace(status="ACCEPTED", updated_at=None)
        listing = SimpleNamespace(id=tx.listing_id, status="RESERVED", updated_at=None, title="Honda Wave 2020")
        initial_tx_result = MagicMock()
        initial_tx_result.scalar_one_or_none.return_value = tx
        listing_result = MagicMock()
        listing_result.scalar_one_or_none.return_value = listing
        locked_tx_result = MagicMock()
        locked_tx_result.scalar_one_or_none.return_value = tx
        pending_cancel_request_result = MagicMock()
        pending_cancel_request_result.scalar_one_or_none.return_value = None
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[initial_tx_result, listing_result, locked_tx_result, pending_cancel_request_result]
        )
        db.get = AsyncMock(return_value=appt)
        db.add = MagicMock()
        with (
            patch.object(admin_tx, "log_transition") as log_transition,
            patch.object(admin_tx.noti_events, "enqueue") as enqueue,
        ):
            await admin_tx.rollback_payment_report(
                tx.appointment_id,
                admin_tx.RollbackRequest(reason="양측 거래 취소 확인"),
                _request(),
                session=_session(),
                db=db,
            )

        self.assertEqual(tx.payment_status, "AWAITING_PAYMENT")
        self.assertIsNone(tx.buyer_reported_at)
        self.assertEqual(appt.status, "CANCELLED")
        self.assertEqual(listing.status, "ON_SALE")
        log_transition.assert_called_once()
        self.assertEqual(enqueue.call_count, 3)
        statements = [call.args[0] for call in db.execute.await_args_list]
        self.assertNotIn("FOR UPDATE", str(statements[0].compile(dialect=postgresql.dialect())))
        self.assertIn("FOR UPDATE", str(statements[1].compile(dialect=postgresql.dialect())))
        self.assertIn("FOR UPDATE", str(statements[2].compile(dialect=postgresql.dialect())))
        self.assertTrue(
            any(
                isinstance(call.args[0], AdminAuditLog)
                and call.args[0].action == "transaction.payment_report_rolled_back"
                for call in db.add.call_args_list
            )
        )
        db.commit.assert_awaited_once()

    async def test_closes_pending_cancel_request_so_it_cannot_be_answered_later(self):
        """F-X-01 FR-2: 운영자 롤백이 사용자의 합의 취소 요청보다 먼저 도착하면, 그 PENDING 요청을
        열어둔 채로 두지 않는다 — 이미 CANCELLED된 약속에 나중에 동의/거절하는 경로를 막는다."""
        from app.models import MarketplaceTransactionCancelRequest

        tx = _tx(payment_status="PAYMENT_REPORTED")
        appt = SimpleNamespace(status="ACCEPTED", updated_at=None)
        listing = SimpleNamespace(id=tx.listing_id, status="RESERVED", updated_at=None, title="Honda Wave 2020")
        pending_request = MarketplaceTransactionCancelRequest(
            id=uuid.uuid4(),
            appointment_id=tx.appointment_id,
            requester_id=tx.buyer_id,
            reason="UNREACHABLE",
            status="PENDING",
            expires_at=datetime.now(UTC),
            responded_at=None,
        )
        initial_tx_result = MagicMock()
        initial_tx_result.scalar_one_or_none.return_value = tx
        listing_result = MagicMock()
        listing_result.scalar_one_or_none.return_value = listing
        locked_tx_result = MagicMock()
        locked_tx_result.scalar_one_or_none.return_value = tx
        pending_cancel_request_result = MagicMock()
        pending_cancel_request_result.scalar_one_or_none.return_value = pending_request
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[initial_tx_result, listing_result, locked_tx_result, pending_cancel_request_result]
        )
        db.get = AsyncMock(return_value=appt)
        db.add = MagicMock()
        with patch.object(admin_tx, "log_transition"), patch.object(admin_tx.noti_events, "enqueue"):
            await admin_tx.rollback_payment_report(
                tx.appointment_id,
                admin_tx.RollbackRequest(reason="상대 무응답"),
                _request(),
                session=_session(),
                db=db,
            )

        self.assertEqual(pending_request.status, "EXPIRED")
        self.assertIsNotNone(pending_request.responded_at)

    async def test_confirmed_payment_cannot_be_rolled_back(self):
        tx = _tx(payment_status="PAYMENT_CONFIRMED")
        initial_tx_result = MagicMock()
        initial_tx_result.scalar_one_or_none.return_value = tx
        listing_result = MagicMock()
        listing_result.scalar_one_or_none.return_value = SimpleNamespace(
            id=tx.listing_id, status="RESERVED", title="Honda Wave 2020"
        )
        locked_tx_result = MagicMock()
        locked_tx_result.scalar_one_or_none.return_value = tx
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[initial_tx_result, listing_result, locked_tx_result])
        db.get = AsyncMock(return_value=SimpleNamespace(status="ACCEPTED"))

        with self.assertRaises(HTTPException) as ctx:
            await admin_tx.rollback_payment_report(
                tx.appointment_id,
                admin_tx.RollbackRequest(reason="잘못된 요청"),
                _request(),
                session=_session(),
                db=db,
            )

        self.assertEqual(ctx.exception.status_code, 409)
        db.get.assert_awaited_once()
        db.commit.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
