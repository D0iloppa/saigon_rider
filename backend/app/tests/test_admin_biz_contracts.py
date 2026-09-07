"""admin API — 계약·입금 승인 파이프라인 회귀 (260907_ad_payment_pipeline_design.md §8 P1-4).

이 리포의 관례(test_ad_contract.py, test_ad_payment_port.py)를 따라 실제 컨테이너 DB
(app.database.AsyncSessionLocal)에 그대로 연결해서 돈다. 라우터 함수는 FastAPI 의존성 주입을
거치지 않고 직접 호출한다(session/db/request 를 키워드로 넘긴다 — test_ad_contract.py 스타일).
"""

import contextlib
import os
import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import select

from app.admin_auth import AdminSession
from app.database import AsyncSessionLocal, engine
from app.models import AdContract, AdDeposit, AdminAuditLog, BusinessProfile, MarketplaceAd, User
from app.routers.admin_api import biz_contracts
from app.services.ad_gating import is_payment_ok
from app.services.ad_payments import payment_code
from app.services.ad_payments.port import DepositObservation, ingest_deposit
from app.services.ad_payments.rails import RAILS
from app.services.ad_payments.rails.toss_card import StubTossGateway, TossCardRail

_GENERAL_TIER_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")  # price_3m=539000, price_6m=999000

_BANK_ENV_KEYS = ("AD_PAYMENT_BANK_NAME", "AD_PAYMENT_BANK_ACCOUNT_NO", "AD_PAYMENT_BANK_ACCOUNT_HOLDER")
_UNWIRED_ENV = dict.fromkeys(_BANK_ENV_KEYS, "")

_ADMIN_SESSION = AdminSession(username="tester_admin", role="admin")


def _fake_request() -> SimpleNamespace:
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))


@contextlib.contextmanager
def _stub_toss_rail(gateway: StubTossGateway):
    """`biz_contracts.RAILS["toss_card"]` 를 스텁 게이트웨이 주입 어댑터로 임시 교체한다
    (test_ad_toss_rail.py 관례와 동일 — 대체되는 것은 '토스 서버' 뿐)."""
    original = RAILS["toss_card"]
    RAILS["toss_card"] = TossCardRail(gateway=gateway)
    try:
        yield
    finally:
        RAILS["toss_card"] = original


class _BizContractsTestBase(unittest.IsolatedAsyncioTestCase):
    """공용 fixture — 유저·비즈프로필·APPROVED 광고 1건을 만들고 테스트 후 정리한다."""

    async def asyncSetUp(self):
        self._deposit_ids: list[uuid.UUID] = []
        self._contract_ids: list[uuid.UUID] = []
        self._ad_id: uuid.UUID | None = None
        self._profile_id: uuid.UUID | None = None
        self._user_id: uuid.UUID | None = None

        async with AsyncSessionLocal() as db:
            user = User(id=uuid.uuid4())
            db.add(user)
            await db.flush()
            self._user_id = user.id

            profile = BusinessProfile(id=uuid.uuid4(), user_id=user.id, name="Test Shop", status="APPROVED")
            db.add(profile)
            await db.flush()
            self._profile_id = profile.id

            ad = MarketplaceAd(
                id=uuid.uuid4(),
                partner_name="Test Shop",
                title="Test Ad",
                tier_id=_GENERAL_TIER_ID,
                owner_business_profile_id=profile.id,
                review_status="APPROVED",
                subscription_status="pending_payment",
                paid_until=None,
            )
            db.add(ad)
            await db.flush()
            self._ad_id = ad.id
            await db.commit()

    async def asyncTearDown(self):
        try:
            async with AsyncSessionLocal() as db:
                for dep_id in self._deposit_ids:
                    dep = await db.get(AdDeposit, dep_id)
                    if dep is not None:
                        await db.delete(dep)
                for contract_id in self._contract_ids:
                    contract = await db.get(AdContract, contract_id)
                    if contract is not None:
                        await db.delete(contract)
                if self._ad_id is not None:
                    ad = await db.get(MarketplaceAd, self._ad_id)
                    if ad is not None:
                        await db.delete(ad)
                if self._profile_id is not None:
                    profile = await db.get(BusinessProfile, self._profile_id)
                    if profile is not None:
                        await db.delete(profile)
                if self._user_id is not None:
                    user = await db.get(User, self._user_id)
                    if user is not None:
                        await db.delete(user)
                await db.commit()
        finally:
            await engine.dispose()

    async def _make_contract(
        self, *, status: str = "awaiting_payment", months: int = 3, amount_vnd: int = 539000
    ) -> uuid.UUID:
        async with AsyncSessionLocal() as db:
            contract = AdContract(
                id=uuid.uuid4(),
                ad_id=self._ad_id,
                tier_id=_GENERAL_TIER_ID,
                months=months,
                amount_vnd=amount_vnd,
                payment_code=payment_code.generate_payment_code(),
                status=status,
                contract_token=uuid.uuid4(),
            )
            db.add(contract)
            await db.commit()
            self._contract_ids.append(contract.id)
            return contract.id

    async def _last_audit_row(self, target_id: str) -> AdminAuditLog:
        async with AsyncSessionLocal() as db:
            rows = (
                (
                    await db.execute(
                        select(AdminAuditLog)
                        .where(AdminAuditLog.target_id == target_id)
                        .order_by(AdminAuditLog.created_at.desc())
                    )
                )
                .scalars()
                .all()
            )
            return rows[0]


class ApproveTests(_BizContractsTestBase):
    async def test_approve_sets_ad_fields_and_audit_detail_and_gate_invariant(self):
        # 검증 목표 1 + 7: 승인 → ad.paid_until/subscription_status 갱신 + audit detail 전 키 존재
        # + 그 상태가 실제로 ad_gating 게이트를 통과하는지(불변식).
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=539000)
        async with AsyncSessionLocal() as db:
            contract = await db.get(AdContract, contract_id)
            obs = DepositObservation(
                amount_vnd=539000,
                paid_at=datetime.now(UTC),
                memo_raw=None,
                payer_name="Test Shop",
                bank_ref="ref-approve-1",
                source="manual",
                source_ref=None,
                payment_code_hint=contract.payment_code,
            )
            result = await ingest_deposit(db, obs, actor="tester")
            self._deposit_ids.append(result.deposit_id)
            self.assertEqual(result.status, "paid")

        async with AsyncSessionLocal() as db:
            out = await biz_contracts.approve_contract(
                contract_id=contract_id,
                body=biz_contracts.ApproveRequest(reason=None),
                request=_fake_request(),
                session=_ADMIN_SESSION,
                db=db,
            )

        self.assertEqual(out["status"], "active")
        self.assertEqual(out["ad_subscription_status"], "active")
        self.assertIsNotNone(out["ad_paid_until"])

        async with AsyncSessionLocal() as verify_db:
            ad = await verify_db.get(MarketplaceAd, self._ad_id)
            self.assertEqual(ad.subscription_status, "active")
            self.assertIsNotNone(ad.paid_until)
            now = datetime.now(UTC)
            self.assertGreater(ad.paid_until, now)
            # 불변식 검증: 새 승인 경로를 통과한 광고가 ad_gating 게이트에서 실제로 노출된다.
            self.assertTrue(
                is_payment_ok(
                    owner_business_profile_id=ad.owner_business_profile_id,
                    subscription_status=ad.subscription_status,
                    paid_until=ad.paid_until,
                    starts_at=ad.starts_at,
                    now=now,
                )
            )

        audit_row = await self._last_audit_row(str(contract_id))
        self.assertEqual(audit_row.action, "BIZ_AD_CONTRACT_APPROVE")
        expected_keys = {
            "contract_id",
            "ad_id",
            "months",
            "amount_vnd",
            "received_vnd",
            "deposit_ids",
            "prev_paid_until",
            "period_start",
            "period_end",
        }
        self.assertTrue(expected_keys.issubset(audit_row.detail.keys()))

    async def test_approve_twice_returns_409(self):
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=539000)
        async with AsyncSessionLocal() as db:
            contract = await db.get(AdContract, contract_id)
            obs = DepositObservation(
                amount_vnd=539000,
                paid_at=datetime.now(UTC),
                memo_raw=None,
                payer_name="Test Shop",
                bank_ref="ref-approve-2",
                source="manual",
                source_ref=None,
                payment_code_hint=contract.payment_code,
            )
            result = await ingest_deposit(db, obs, actor="tester")
            self._deposit_ids.append(result.deposit_id)

        async with AsyncSessionLocal() as db:
            await biz_contracts.approve_contract(
                contract_id=contract_id,
                body=biz_contracts.ApproveRequest(reason=None),
                request=_fake_request(),
                session=_ADMIN_SESSION,
                db=db,
            )

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await biz_contracts.approve_contract(
                    contract_id=contract_id,
                    body=biz_contracts.ApproveRequest(reason=None),
                    request=_fake_request(),
                    session=_ADMIN_SESSION,
                    db=db,
                )
            self.assertEqual(raised.exception.status_code, 409)

    async def test_partial_approve_without_reason_returns_422(self):
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=539000)
        async with AsyncSessionLocal() as db:
            contract = await db.get(AdContract, contract_id)
            obs = DepositObservation(
                amount_vnd=200000,  # 부족
                paid_at=datetime.now(UTC),
                memo_raw=None,
                payer_name="Test Shop",
                bank_ref="ref-approve-3",
                source="manual",
                source_ref=None,
                payment_code_hint=contract.payment_code,
            )
            result = await ingest_deposit(db, obs, actor="tester")
            self._deposit_ids.append(result.deposit_id)
            self.assertEqual(result.status, "partially_paid")

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await biz_contracts.approve_contract(
                    contract_id=contract_id,
                    body=biz_contracts.ApproveRequest(reason=None),
                    request=_fake_request(),
                    session=_ADMIN_SESSION,
                    db=db,
                )
            self.assertEqual(raised.exception.status_code, 422)


class ManualDepositDuplicateTests(_BizContractsTestBase):
    async def test_duplicate_manual_deposit_warns_409_then_force_overrides(self):
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=539000)
        paid_at = datetime.now(UTC)

        async with AsyncSessionLocal() as db:
            detail1 = await biz_contracts.create_contract_deposit(
                contract_id=contract_id,
                body=biz_contracts.DepositCreateRequest(
                    amount_vnd=200000, paid_at=paid_at, payer_name="Test Shop", force=False
                ),
                request=_fake_request(),
                session=_ADMIN_SESSION,
                db=db,
            )
        first_deposit = next(iter(detail1.deposits))
        self._deposit_ids.append(first_deposit.id)

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await biz_contracts.create_contract_deposit(
                    contract_id=contract_id,
                    body=biz_contracts.DepositCreateRequest(
                        amount_vnd=200000, paid_at=paid_at, payer_name="Test Shop", force=False
                    ),
                    request=_fake_request(),
                    session=_ADMIN_SESSION,
                    db=db,
                )
            self.assertEqual(raised.exception.status_code, 409)

        async with AsyncSessionLocal() as db:
            detail2 = await biz_contracts.create_contract_deposit(
                contract_id=contract_id,
                body=biz_contracts.DepositCreateRequest(
                    amount_vnd=200000, paid_at=paid_at, payer_name="Test Shop", force=True
                ),
                request=_fake_request(),
                session=_ADMIN_SESSION,
                db=db,
            )
        second_deposit = next(d for d in detail2.deposits if d.id != first_deposit.id)
        self._deposit_ids.append(second_deposit.id)

        audit_row = await self._last_audit_row(str(second_deposit.id))
        self.assertEqual(audit_row.action, "BIZ_AD_DEPOSIT_RECORD")
        self.assertTrue(audit_row.detail.get("duplicate_override"))


class DepositMatchTests(_BizContractsTestBase):
    async def test_match_unmatched_deposit_records_before_after_audit(self):
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=539000)

        async with AsyncSessionLocal() as db:
            obs = DepositObservation(
                amount_vnd=100000,
                paid_at=datetime.now(UTC),
                memo_raw="no code here",
                payer_name=None,
                bank_ref=None,
                source="manual",
                source_ref=None,
            )
            result = await ingest_deposit(db, obs, actor="tester")
            self._deposit_ids.append(result.deposit_id)
            self.assertIsNone(result.contract_id)
            deposit_id = result.deposit_id

        async with AsyncSessionLocal() as db:
            await biz_contracts.match_deposit(
                deposit_id=deposit_id,
                body=biz_contracts.DepositMatchRequest(contract_id=contract_id, reason="오입금 배정"),
                request=_fake_request(),
                session=_ADMIN_SESSION,
                db=db,
            )

        async with AsyncSessionLocal() as verify_db:
            deposit = await verify_db.get(AdDeposit, deposit_id)
            self.assertEqual(deposit.contract_id, contract_id)

        audit_row = await self._last_audit_row(str(deposit_id))
        self.assertEqual(audit_row.action, "BIZ_AD_DEPOSIT_MATCH")
        self.assertIsNone(audit_row.detail.get("before_contract_id"))
        self.assertEqual(audit_row.detail.get("after_contract_id"), str(contract_id))


class PaymentWiringTests(unittest.IsolatedAsyncioTestCase):
    async def test_response_carries_no_real_values(self):
        with patch.dict(os.environ, _UNWIRED_ENV, clear=False):
            out = await biz_contracts.get_payment_wiring(_session=_ADMIN_SESSION)
        self.assertFalse(out["ready"])
        self.assertEqual(set(out["missing_keys"]), set(_BANK_ENV_KEYS))
        # 값(계좌번호·예금주 등)이 응답 어디에도 실리지 않는다 — 키 이름만(토스는 배선여부만).
        self.assertEqual(set(out.keys()), {"ready", "missing_keys", "toss"})
        self.assertEqual(set(out["toss"].keys()), {"ready", "missing_keys"})


class RailSyncTests(_BizContractsTestBase):
    """rail-sync — 웹훅/confirm 유실로 원장에 안 잡힌 토스 결제를 `ref` 재조회로 복구 (§8 P2-6)."""

    async def test_rail_sync_recovers_missing_toss_payment_and_auto_approves(self):
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=539000)
        gateway = StubTossGateway()
        payment_key = "pk_recover_1"
        order_id = None
        async with AsyncSessionLocal() as db:
            contract = await db.get(AdContract, contract_id)
            order_id = f"{contract.payment_code}-1"
        # 토스에는 이미 결제가 완료됐지만(웹훅·confirm 유실 시뮬레이션) 우리 원장엔 없는 상태.
        await gateway.confirm(payment_key=payment_key, order_id=order_id, amount=539000)

        with _stub_toss_rail(gateway):
            async with AsyncSessionLocal() as db:
                out = await biz_contracts.rail_sync_contract(
                    contract_id=contract_id,
                    body=biz_contracts.RailSyncRequest(ref=payment_key),
                    request=_fake_request(),
                    session=_ADMIN_SESSION,
                    db=db,
                )

        self.assertEqual(out.status, "active")
        toss_deposit = next(d for d in out.deposits if d.source == "toss")
        self._deposit_ids.append(toss_deposit.id)
        self.assertEqual(toss_deposit.source_ref, payment_key)

        audit_row = await self._last_audit_row(str(contract_id))
        self.assertEqual(audit_row.action, "BIZ_AD_CONTRACT_RAIL_SYNC")
        self.assertTrue(audit_row.detail.get("approved"))

    async def test_rail_sync_unknown_ref_returns_404(self):
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=539000)
        gateway = StubTossGateway()

        with _stub_toss_rail(gateway):
            async with AsyncSessionLocal() as db:
                with self.assertRaises(HTTPException) as raised:
                    await biz_contracts.rail_sync_contract(
                        contract_id=contract_id,
                        body=biz_contracts.RailSyncRequest(ref="never-existed"),
                        request=_fake_request(),
                        session=_ADMIN_SESSION,
                        db=db,
                    )
        self.assertEqual(raised.exception.status_code, 404)


class RailRefundTests(_BizContractsTestBase):
    """rail-refund — 카드 결제 부분/전액 환불 (§8 P2-6)."""

    async def _make_active_card_contract(self, *, amount_vnd: int = 539000, krw_value: int = 10900) -> tuple:
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=amount_vnd)
        payment_key = f"pk_{uuid.uuid4().hex[:10]}"
        async with AsyncSessionLocal() as db:
            contract = await db.get(AdContract, contract_id)
            contract.contract_snapshot = {
                "charge": {"currency": "KRW", "value": krw_value, "price_col": "price_3m_krw"}
            }
            order_id = f"{contract.payment_code}-1"
            await db.commit()

        gateway = StubTossGateway()
        await gateway.confirm(payment_key=payment_key, order_id=order_id, amount=krw_value)

        with _stub_toss_rail(gateway):
            async with AsyncSessionLocal() as db:
                out = await biz_contracts.rail_sync_contract(
                    contract_id=contract_id,
                    body=biz_contracts.RailSyncRequest(ref=payment_key),
                    request=_fake_request(),
                    session=_ADMIN_SESSION,
                    db=db,
                )
        self.assertEqual(out.status, "active")
        toss_deposit = next(d for d in out.deposits if d.source == "toss")
        self._deposit_ids.append(toss_deposit.id)
        return contract_id, toss_deposit.id, gateway

    async def test_partial_refund_creates_refund_row_and_keeps_contract_active(self):
        contract_id, deposit_id, gateway = await self._make_active_card_contract()

        with _stub_toss_rail(gateway):
            async with AsyncSessionLocal() as db:
                out = await biz_contracts.rail_refund_contract(
                    contract_id=contract_id,
                    body=biz_contracts.RailRefundRequest(
                        deposit_id=deposit_id, amount_vnd=100000, reason="부분 환불 테스트"
                    ),
                    request=_fake_request(),
                    session=_ADMIN_SESSION,
                    db=db,
                )

        self.assertEqual(out.status, "active")
        refund_rows = [d for d in out.deposits if d.kind == "refund"]
        self.assertEqual(len(refund_rows), 1)
        self._deposit_ids.append(refund_rows[0].id)
        self.assertEqual(refund_rows[0].amount_vnd, 100000)
        self.assertEqual(refund_rows[0].source, "toss")

        audit_row = await self._last_audit_row(str(contract_id))
        self.assertEqual(audit_row.action, "BIZ_AD_CONTRACT_RAIL_REFUND")

    async def test_full_refund_then_close_refunded_succeeds(self):
        contract_id, deposit_id, gateway = await self._make_active_card_contract(amount_vnd=539000)

        with _stub_toss_rail(gateway):
            async with AsyncSessionLocal() as db:
                out = await biz_contracts.rail_refund_contract(
                    contract_id=contract_id,
                    body=biz_contracts.RailRefundRequest(deposit_id=deposit_id, amount_vnd=None, reason="전액 환불"),
                    request=_fake_request(),
                    session=_ADMIN_SESSION,
                    db=db,
                )
        refund_rows = [d for d in out.deposits if d.kind == "refund"]
        self._deposit_ids.append(refund_rows[0].id)
        self.assertEqual(refund_rows[0].amount_vnd, 539000)
        self.assertEqual(out.reconcile.received_vnd, 0)

        async with AsyncSessionLocal() as db:
            closed = await biz_contracts.close_refunded_contract(
                contract_id=contract_id,
                body=biz_contracts.ReasonRequest(reason="전액 환불 종결"),
                request=_fake_request(),
                session=_ADMIN_SESSION,
                db=db,
            )
        self.assertEqual(closed["status"], "refunded")

    async def test_refund_on_non_card_deposit_returns_409(self):
        contract_id = await self._make_contract(status="awaiting_payment", months=3, amount_vnd=539000)
        async with AsyncSessionLocal() as db:
            contract = await db.get(AdContract, contract_id)
            obs = DepositObservation(
                amount_vnd=539000,
                paid_at=datetime.now(UTC),
                memo_raw=None,
                payer_name="Test Shop",
                bank_ref="ref-manual-1",
                source="manual",
                source_ref=None,
                payment_code_hint=contract.payment_code,
            )
            result = await ingest_deposit(db, obs, actor="tester")
            self._deposit_ids.append(result.deposit_id)
            manual_deposit_id = result.deposit_id

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await biz_contracts.rail_refund_contract(
                    contract_id=contract_id,
                    body=biz_contracts.RailRefundRequest(
                        deposit_id=manual_deposit_id, amount_vnd=None, reason="테스트"
                    ),
                    request=_fake_request(),
                    session=_ADMIN_SESSION,
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
