"""P1-3/P1-4 리뷰 CHANGES 대응 회귀 (260907_ad_payment_pipeline_design.md).

리뷰에서 지적된 항목별 검증:
- 치명 1: 입금건 재배정 시 이전 계약도 재대조되고, stale 상태의 승인은 409.
- 치명 2: 3/6개월 확정가가 NULL 인 tier 로는 accept 가 422, tier_price_options 도 null.
- 중대 3: 환불건 등록(kind=refund) → 순수액 0 → close-refunded 200.
- 중대 4(감독 결정): 미배선 상태에서도 계약 발급→동의→입금 등록→대조 paid→승인→active→게이트
  노출까지 끝까지 돈다(§7 성공기준 ①). `_RECONCILABLE_STATUSES` 에 accepted 포함.
- [경미]: 종결 계약(cancelled/refunded)에는 입금건 배정 불가(409).

이 리포 관례(test_ad_payment_port.py, test_ad_contract.py)를 따라 실제 컨테이너 DB
(app.database.AsyncSessionLocal)에 그대로 연결해서 돈다.
"""

import os
import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from sqlalchemy import select

from app.admin_auth import AdminSession
from app.database import AsyncSessionLocal, engine
from app.models import AdContract, AdDeposit, AdTier, BusinessProfile, MarketplaceAd, User
from app.routers import ad_contract
from app.routers.admin_api import biz_contracts
from app.services.ad_gating import is_payment_ok
from app.services.ad_payments import rails as ad_payment_rails

_GENERAL_TIER_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")  # price_3m=539000, price_6m=999000

_ADMIN = AdminSession(username="tester-admin", role="root")


def _fake_request():
    request = MagicMock()
    request.headers.get.return_value = None
    request.client.host = "203.0.113.9"
    return request


class _PipelineTestBase(unittest.IsolatedAsyncioTestCase):
    """유저·검증된 비즈프로필·APPROVED 광고 1건을 만들고 뒷정리한다. 필요 시 tier 도 커스텀 생성."""

    async def asyncSetUp(self):
        self._deposit_ids: list[uuid.UUID] = []
        self._contract_ids: list[uuid.UUID] = []
        self._ad_ids: list[uuid.UUID] = []
        self._profile_id: uuid.UUID | None = None
        self._user_id: uuid.UUID | None = None
        self._extra_tier_id: uuid.UUID | None = None

        async with AsyncSessionLocal() as db:
            user = User(id=uuid.uuid4())
            db.add(user)
            await db.flush()
            self._user_id = user.id

            profile = BusinessProfile(
                id=uuid.uuid4(),
                user_id=user.id,
                name="Test Shop",
                status="APPROVED",
                verification_status="verified",
            )
            db.add(profile)
            await db.flush()
            self._profile_id = profile.id
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
                for ad_id in self._ad_ids:
                    ad = await db.get(MarketplaceAd, ad_id)
                    if ad is not None:
                        await db.delete(ad)
                if self._extra_tier_id is not None:
                    tier = await db.get(AdTier, self._extra_tier_id)
                    if tier is not None:
                        await db.delete(tier)
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

    async def _make_ad(self, db: AsyncSessionLocal, *, tier_id: uuid.UUID = _GENERAL_TIER_ID) -> MarketplaceAd:
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Test Shop",
            title="Test Ad",
            tier_id=tier_id,
            owner_business_profile_id=self._profile_id,
            review_status="APPROVED",
        )
        db.add(ad)
        await db.flush()
        self._ad_ids.append(ad.id)
        return ad

    async def _create_link(self, ad_id: uuid.UUID) -> uuid.UUID:
        async with AsyncSessionLocal() as db:
            out = await ad_contract.create_contract_link(ad_id=ad_id, db=db, session_uid=self._user_id)
        token = uuid.UUID(out.url.rsplit("token=", 1)[1])
        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
            self._contract_ids.append(contract.id)
        return token

    async def _accept(self, token: uuid.UUID, months: int = 3, signer_name: str = "Nguyen Van A"):
        async with AsyncSessionLocal() as db:
            return await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=months, signer_name=signer_name),
                request=_fake_request(),
                db=db,
            )

    async def _register_deposit(
        self,
        contract_id: uuid.UUID,
        *,
        amount_vnd: int,
        kind: str = "deposit",
        paid_at: datetime | None = None,
        force: bool = False,
    ):
        async with AsyncSessionLocal() as db:
            detail = await biz_contracts.create_contract_deposit(
                contract_id=contract_id,
                body=biz_contracts.DepositCreateRequest(
                    kind=kind,
                    amount_vnd=amount_vnd,
                    paid_at=paid_at or datetime.now(UTC),
                    payer_name="Test Shop",
                    force=force,
                ),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )
        for d in detail.deposits:
            if d.id not in self._deposit_ids:
                self._deposit_ids.append(d.id)
        return detail


class UnwiredE2ETests(_PipelineTestBase):
    """§7 성공기준 ①: 미배선 상태에서도 계약 발급 → 동의 → 입금 등록 → 대조 paid → 승인 →
    active → 게이트 노출까지 끝까지 돈다(치명 4, 감독 결정 accepted 포함)."""

    async def test_unwired_pipeline_completes_end_to_end(self):
        import os
        from unittest.mock import patch

        unwired_env = {
            "AD_PAYMENT_BANK_NAME": "",
            "AD_PAYMENT_BANK_ACCOUNT_NO": "",
            "AD_PAYMENT_BANK_ACCOUNT_HOLDER": "",
        }
        with patch.dict(os.environ, unwired_env):
            async with AsyncSessionLocal() as db:
                ad = await self._make_ad(db)
                await db.commit()
                ad_id = ad.id

            token = await self._create_link(ad_id)

            out = await self._accept(token, months=3)
            self.assertEqual(out.status, "accepted")
            self.assertEqual(out.amount_vnd, 539000)

            # GET 은 배선 안 됐으므로 accepted 에 머문다 — 입금 안내 미발급.
            async with AsyncSessionLocal() as db:
                get_out = await ad_contract.get_ad_contract(token=token, db=db)
            self.assertEqual(get_out.status, "accepted")
            self.assertIsNone(get_out.bank)

        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
        self.assertEqual(contract.status, "accepted")

        # 어드민이 정확 금액 입금건을 등록 — accepted 에서도 대조가 진행돼 곧장 paid 로 전이한다.
        detail = await self._register_deposit(contract.id, amount_vnd=539000)
        self.assertEqual(detail.status, "paid")
        self.assertEqual(detail.reconcile.status, "paid")

        # 승인 — active, ad.paid_until 갱신.
        async with AsyncSessionLocal() as db:
            approve_out = await biz_contracts.approve_contract(
                contract_id=contract.id,
                body=biz_contracts.ApproveRequest(),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )
        self.assertEqual(approve_out["status"], "active")
        self.assertIsNotNone(approve_out["ad_paid_until"])
        self.assertEqual(approve_out["ad_subscription_status"], "active")

        # 게이트 노출 — 결제 조건 판정 함수가 True 를 반환해야 한다.
        async with AsyncSessionLocal() as db:
            ad_row = await db.get(MarketplaceAd, ad_id)
        self.assertTrue(
            is_payment_ok(
                owner_business_profile_id=ad_row.owner_business_profile_id,
                subscription_status=ad_row.subscription_status,
                paid_until=ad_row.paid_until,
                starts_at=ad_row.starts_at,
                now=datetime.now(UTC),
            )
        )


class ReassignmentReconcileTests(_PipelineTestBase):
    """치명 1: 재배정 시 이전 계약 재대조 + stale 승인 가드."""

    async def test_reassign_deposit_reverts_previous_contract_and_blocks_stale_approve(self):
        async with AsyncSessionLocal() as db:
            ad1 = await self._make_ad(db)
            ad2 = await self._make_ad(db)
            await db.commit()

        token1 = await self._create_link(ad1.id)
        token2 = await self._create_link(ad2.id)
        await self._accept(token1, months=3)
        await self._accept(token2, months=3)

        async with AsyncSessionLocal() as db:
            contract1 = (await db.execute(select(AdContract).where(AdContract.contract_token == token1))).scalar_one()
            contract2 = (await db.execute(select(AdContract).where(AdContract.contract_token == token2))).scalar_one()

        # 계약2 에 정확 금액 입금 → paid.
        detail2 = await self._register_deposit(contract2.id, amount_vnd=539000)
        self.assertEqual(detail2.status, "paid")
        deposit_id = detail2.deposits[0].id

        # 미매칭 판정을 위해 배정을 해제한 상태를 재현: match_deposit 으로 계약1 로 재배정.
        async with AsyncSessionLocal() as db:
            refreshed_detail = await biz_contracts.match_deposit(
                deposit_id=deposit_id,
                body=biz_contracts.DepositMatchRequest(contract_id=contract1.id, reason="재배정 테스트"),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )
        self.assertEqual(refreshed_detail.status, "paid")  # 계약1(재배정 대상)은 paid

        # 계약2(이전 계약) 는 입금이 빠졌으므로 자동으로 미납 상태로 되돌아가야 한다.
        async with AsyncSessionLocal() as db:
            contract2_after = await db.get(AdContract, contract2.id)
        self.assertEqual(contract2_after.status, "awaiting_payment")

        # 계약2 승인 시도 → stale 상태였다면 원래 409(입금 부족)로 막혀야 한다.
        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await biz_contracts.approve_contract(
                    contract_id=contract2.id,
                    body=biz_contracts.ApproveRequest(),
                    request=_fake_request(),
                    session=_ADMIN,
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 409)

    async def test_match_deposit_rejects_closed_contract(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db)
            await db.commit()
        token = await self._create_link(ad.id)
        await self._accept(token, months=3)

        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
            contract.status = "cancelled"
            contract.closed_at = datetime.now(UTC)
            contract.closed_reason = "test"
            await db.commit()

        # 미매칭 입금건 하나 생성 (unmatched deposit 경로).
        async with AsyncSessionLocal() as db:
            result = await biz_contracts.create_unmatched_deposit(
                body=biz_contracts.UnmatchedDepositCreateRequest(
                    amount_vnd=100000, paid_at=datetime.now(UTC), payer_name="Someone"
                ),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )
        self._deposit_ids.append(result["deposit_id"])

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await biz_contracts.match_deposit(
                    deposit_id=result["deposit_id"],
                    body=biz_contracts.DepositMatchRequest(contract_id=contract.id, reason="should fail"),
                    request=_fake_request(),
                    session=_ADMIN,
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 409)


class NullTierPriceTests(_PipelineTestBase):
    """치명 2: 3/6개월 확정가가 NULL 인 tier 는 accept 를 거부하고, tier_price_options 도 null."""

    async def asyncSetUp(self):
        await super().asyncSetUp()
        async with AsyncSessionLocal() as db:
            tier = AdTier(
                id=uuid.uuid4(),
                name="__test_no_period_price__",
                monthly_price_vnd=99000,
                exposure_weight=1,
                price_3m_vnd=None,
                price_6m_vnd=None,
            )
            db.add(tier)
            await db.flush()
            self._extra_tier_id = tier.id
            await db.commit()

    async def test_accept_with_null_period_price_is_422(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db, tier_id=self._extra_tier_id)
            await db.commit()
        token = await self._create_link(ad.id)

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await ad_contract.accept_ad_contract(
                    token=token,
                    body=ad_contract.AdContractAcceptRequest(months=6, signer_name="Nguyen Van A"),
                    request=_fake_request(),
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 422)

    async def test_tier_price_options_report_null_for_missing_period_price(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db, tier_id=self._extra_tier_id)
            await db.commit()
        token = await self._create_link(ad.id)

        async with AsyncSessionLocal() as db:
            out = await ad_contract.get_ad_contract(token=token, db=db)
        self.assertIsNone(out.tier_price_options.month_3_vnd)
        self.assertIsNone(out.tier_price_options.month_6_vnd)
        self.assertEqual(out.tier_price_options.month_1_vnd, 99000)


class RefundRegistrationTests(_PipelineTestBase):
    """중대 3: 환불건(kind=refund) 등록 API → 순수액 0 → close-refunded 200."""

    async def test_refund_registration_enables_close_refunded(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db)
            await db.commit()
        token = await self._create_link(ad.id)
        await self._accept(token, months=3)

        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()

        await self._register_deposit(contract.id, amount_vnd=539000)
        async with AsyncSessionLocal() as db:
            await biz_contracts.approve_contract(
                contract_id=contract.id,
                body=biz_contracts.ApproveRequest(),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )

        # 환불건 등록 — 순수액 0 이 되게.
        # force=True — 중복입금 의심 판정(§4-2)은 kind 와 무관하게 "같은 계약·같은 금액" 만 보므로
        # (기존 코어, 손대지 않음), 환불(반대 방향 거래)은 관리자가 명시 override 하는 게 정상 사용례.
        refund_detail = await self._register_deposit(contract.id, amount_vnd=539000, kind="refund", force=True)
        self.assertEqual(refund_detail.reconcile.received_vnd, 0)

        async with AsyncSessionLocal() as db:
            close_out = await biz_contracts.close_refunded_contract(
                contract_id=contract.id,
                body=biz_contracts.ReasonRequest(reason="고객 요청 환불"),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )
        self.assertEqual(close_out["status"], "refunded")


_STUB_TOSS_ENV = {
    "AD_PAYMENT_TOSS_CLIENT_KEY": "",
    "AD_PAYMENT_TOSS_SECRET_KEY": "",
    "AD_PAYMENT_TOSS_STUB": "1",
    "APP_ENV": "development",
}


class _KrwPricedTierTestBase(_PipelineTestBase):
    """price_1m_krw 가 채워진 tier — seam-D(KRW 확정가) 없이는 카드 rail 이 뜨지 않으므로
    (260907_toss_payment_rail_design.md §4-3), 스텁 e2e 를 돌리려면 전용 tier 가 필요하다."""

    async def asyncSetUp(self):
        await super().asyncSetUp()
        async with AsyncSessionLocal() as db:
            tier = AdTier(
                id=uuid.uuid4(),
                name="__test_krw_priced__",
                monthly_price_vnd=99000,
                exposure_weight=1,
                price_1m_krw=4500,
            )
            db.add(tier)
            await db.flush()
            self._extra_tier_id = tier.id
            await db.commit()


class _SpyGateway:
    """`TossGateway` 스파이 — 실결제 호출이 있었는지만 기록한다(호출되면 그 자체가 실패다)."""

    def __init__(self):
        self.confirm_calls: list[dict] = []

    async def confirm(self, *, payment_key: str, order_id: str, amount: int) -> dict:
        self.confirm_calls.append({"payment_key": payment_key, "order_id": order_id, "amount": amount})
        return {
            "paymentKey": payment_key,
            "orderId": order_id,
            "status": "DONE",
            "totalAmount": amount,
            "currency": "KRW",
            "method": "카드",
            "approvedAt": datetime.now(UTC).isoformat(),
            "card": {},
            "cancels": [],
        }

    async def get_payment(self, payment_key: str) -> dict | None:
        return None

    async def cancel(self, *, payment_key: str, cancel_reason: str, cancel_amount, idempotency_key: str) -> dict:
        raise AssertionError("cancel 이 호출되면 이미 돈이 나간 뒤라는 뜻이다")


class CheckoutStateGuardTests(_KrwPricedTierTestBase):
    """결제 가능 상태가 아닌 계약의 confirm 은 **토스 API 를 부르기 전에** 막혀야 한다.

    사후 환불이 아니라 사전 차단이 정답이다 — 취소·승인된 계약에 실카드 결제가 나가면
    complete_checkout 이 그 상태를 승인 가능 집합 밖으로 판정해 자동 롤백조차 하지 않는다.
    """

    async def _accepted_contract_with_order(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db, tier_id=self._extra_tier_id)
            await db.commit()
            ad_id = ad.id
        token = await self._create_link(ad_id)
        await self._accept(token, months=1)
        with patch.dict(os.environ, _STUB_TOSS_ENV):
            async with AsyncSessionLocal() as db:
                get_out = await ad_contract.get_ad_contract(token=token, db=db)
        offer = next(r for r in get_out.rails if r.rail == "toss_card")
        return ad_id, token, offer.checkout["order_id"], offer.checkout["amount"]["value"]

    async def _force_status(self, token: uuid.UUID, status: str) -> None:
        """테스트 셋업 전용 상태 주입 — 전이함수로는 만들 수 없는 조합(다른 경로가 이미 종결)을
        재현하기 위해 DB 에 직접 쓴다."""
        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
            contract.status = status
            await db.commit()

    async def _confirm_expecting_block(self, token, order_id, amount):
        spy = _SpyGateway()
        with (
            patch.dict(os.environ, _STUB_TOSS_ENV),
            patch.dict(ad_payment_rails.RAILS, {"toss_card": ad_payment_rails.TossCardRail(gateway=spy)}, clear=False),
        ):
            async with AsyncSessionLocal() as db:
                with self.assertRaises(HTTPException) as raised:
                    await ad_contract.confirm_checkout(
                        token=token,
                        body=ad_contract.CheckoutConfirmRequest(
                            paymentKey=f"stub_{uuid.uuid4()}", orderId=order_id, amount=amount
                        ),
                        db=db,
                    )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["error"], "contract_not_chargeable")
        self.assertEqual(spy.confirm_calls, [], "취소/승인된 계약인데 토스 실결제가 호출됐다")

    async def test_cancelled_contract_confirm_never_calls_toss(self):
        _ad_id, token, order_id, amount = await self._accepted_contract_with_order()
        await self._force_status(token, "cancelled")
        await self._confirm_expecting_block(token, order_id, amount)

    async def test_already_active_contract_confirm_never_calls_toss(self):
        _ad_id, token, order_id, amount = await self._accepted_contract_with_order()
        await self._force_status(token, "active")
        await self._confirm_expecting_block(token, order_id, amount)

    async def test_chargeable_contract_still_reaches_toss(self):
        # 가드가 정상 경로를 막지 않는지 — accepted 계약은 그대로 실결제까지 간다.
        _ad_id, token, order_id, amount = await self._accepted_contract_with_order()
        spy = _SpyGateway()
        with (
            patch.dict(os.environ, _STUB_TOSS_ENV),
            patch.dict(ad_payment_rails.RAILS, {"toss_card": ad_payment_rails.TossCardRail(gateway=spy)}, clear=False),
        ):
            async with AsyncSessionLocal() as db:
                out = await ad_contract.confirm_checkout(
                    token=token,
                    body=ad_contract.CheckoutConfirmRequest(
                        paymentKey=f"stub_{uuid.uuid4()}", orderId=order_id, amount=amount
                    ),
                    db=db,
                )
        self.assertEqual(len(spy.confirm_calls), 1)
        self.assertEqual(out.status, "active")
        async with AsyncSessionLocal() as db:
            deposit = (await db.execute(select(AdDeposit).where(AdDeposit.source == "toss"))).scalars().all()
        for d in deposit:
            if d.id not in self._deposit_ids:
                self._deposit_ids.append(d.id)


class TossStubE2ETests(_KrwPricedTierTestBase):
    """§7 검증 목표 4 — 스텁 e2e: offer → confirm → ingest_deposit → 자동 승인 → active +
    paid_until → ad_gating.is_payment_ok() True 까지 완주(260907_toss_payment_rail_design.md §5-1)."""

    async def test_stub_checkout_completes_to_active_and_gate_opens(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db, tier_id=self._extra_tier_id)
            await db.commit()
            ad_id = ad.id

        token = await self._create_link(ad_id)
        accept_out = await self._accept(token, months=1)
        self.assertEqual(accept_out.status, "accepted")
        self.assertEqual(accept_out.amount_vnd, 99000)

        with patch.dict(os.environ, _STUB_TOSS_ENV):
            async with AsyncSessionLocal() as db:
                get_out = await ad_contract.get_ad_contract(token=token, db=db)
            toss_offer = next(r for r in get_out.rails if r.rail == "toss_card")
            self.assertTrue(toss_offer.wired)
            self.assertTrue(toss_offer.checkout["stub"])
            order_id = toss_offer.checkout["order_id"]
            amount = toss_offer.checkout["amount"]["value"]
            self.assertEqual(amount, 4500)

            payment_key = f"stub_{uuid.uuid4()}"
            async with AsyncSessionLocal() as db:
                confirm_out = await ad_contract.confirm_checkout(
                    token=token,
                    body=ad_contract.CheckoutConfirmRequest(paymentKey=payment_key, orderId=order_id, amount=amount),
                    db=db,
                )
        self.assertTrue(confirm_out.approved)
        self.assertEqual(confirm_out.status, "active")

        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
            deposit = (await db.execute(select(AdDeposit).where(AdDeposit.source_ref == payment_key))).scalar_one()
            ad_row = await db.get(MarketplaceAd, ad_id)
        self._deposit_ids.append(deposit.id)
        self.assertEqual(deposit.source, "toss")
        self.assertEqual(deposit.recorded_by, "rail:toss")
        self.assertIsNotNone(deposit.charge_snapshot)
        self.assertEqual(contract.status, "active")
        self.assertEqual(contract.approved_by, "system:toss")
        self.assertIsNotNone(ad_row.paid_until)
        self.assertEqual(ad_row.subscription_status, "active")
        self.assertTrue(
            is_payment_ok(
                owner_business_profile_id=ad_row.owner_business_profile_id,
                subscription_status=ad_row.subscription_status,
                paid_until=ad_row.paid_until,
                starts_at=ad_row.starts_at,
                now=datetime.now(UTC),
            )
        )

    async def test_amount_mismatch_is_rejected(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db, tier_id=self._extra_tier_id)
            await db.commit()
            ad_id = ad.id
        token = await self._create_link(ad_id)
        await self._accept(token, months=1)

        with patch.dict(os.environ, _STUB_TOSS_ENV):
            async with AsyncSessionLocal() as db:
                get_out = await ad_contract.get_ad_contract(token=token, db=db)
            toss_offer = next(r for r in get_out.rails if r.rail == "toss_card")
            order_id = toss_offer.checkout["order_id"]

            async with AsyncSessionLocal() as db:
                with self.assertRaises(HTTPException) as raised:
                    await ad_contract.confirm_checkout(
                        token=token,
                        body=ad_contract.CheckoutConfirmRequest(
                            paymentKey=f"stub_{uuid.uuid4()}", orderId=order_id, amount=1
                        ),
                        db=db,
                    )
        self.assertEqual(raised.exception.status_code, 400)

        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
        self.assertNotEqual(contract.status, "active")

    async def test_webhook_resend_is_idempotent_and_does_not_extend_period_twice(self):
        """§7 검증 목표 5 — 같은 paymentKey 로 confirm 후 웹훅이 다시 와도 원장 1행·승인 1회."""
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db, tier_id=self._extra_tier_id)
            await db.commit()
            ad_id = ad.id
        token = await self._create_link(ad_id)
        await self._accept(token, months=1)

        with patch.dict(os.environ, _STUB_TOSS_ENV):
            async with AsyncSessionLocal() as db:
                get_out = await ad_contract.get_ad_contract(token=token, db=db)
            toss_offer = next(r for r in get_out.rails if r.rail == "toss_card")
            order_id = toss_offer.checkout["order_id"]
            amount = toss_offer.checkout["amount"]["value"]
            payment_key = f"stub_{uuid.uuid4()}"

            async with AsyncSessionLocal() as db:
                confirm_out = await ad_contract.confirm_checkout(
                    token=token,
                    body=ad_contract.CheckoutConfirmRequest(paymentKey=payment_key, orderId=order_id, amount=amount),
                    db=db,
                )
            self.assertTrue(confirm_out.approved)

            async with AsyncSessionLocal() as db:
                contract_after_confirm = (
                    await db.execute(select(AdContract).where(AdContract.contract_token == token))
                ).scalar_one()
                period_end_after_confirm = contract_after_confirm.period_end

            import json

            webhook_body = json.dumps(
                {"eventType": "PAYMENT_STATUS_CHANGED", "data": {"paymentKey": payment_key}}
            ).encode()
            fake_request = MagicMock()

            async def _body():
                return webhook_body

            fake_request.body = _body
            fake_request.headers = {}

            async with AsyncSessionLocal() as db:
                webhook_resp = await ad_payment_rails.toss_webhook(request=fake_request, db=db)
        self.assertEqual(webhook_resp, {"ok": True})

        async with AsyncSessionLocal() as db:
            deposits = (await db.execute(select(AdDeposit).where(AdDeposit.source_ref == payment_key))).scalars().all()
            self._deposit_ids.extend(d.id for d in deposits)
            contract_after_webhook = (
                await db.execute(select(AdContract).where(AdContract.contract_token == token))
            ).scalar_one()
        self.assertEqual(len(deposits), 1)  # 원장 1행 — 재전송이 두 번째 행을 만들지 않는다
        self.assertEqual(contract_after_webhook.period_end, period_end_after_confirm)  # 기간 1회만 연장


if __name__ == "__main__":
    unittest.main()
