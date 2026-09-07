"""코어 `complete_checkout()` 회귀 — 260907_toss_payment_rail_design.md §3-6/§8 P2-4.

실 컨테이너 DB 에 연결한다(이 리포 관례, test_ad_payment_pipeline_e2e.py 와 동일). 어댑터가 만드는
`CheckoutResult` 를 직접 구성해 코어에 넣는다 — 게이트웨이/HTTP 는 관여하지 않는다(§3-6 "자동
승인은 어댑터가 아니라 코어가 한다"의 코어 쪽 절반만 검증).
"""

import unittest
import uuid
from datetime import UTC, datetime

from app.database import AsyncSessionLocal, engine
from app.models import AdContract, AdDeposit, BusinessProfile, MarketplaceAd, User
from app.services.ad_payments import checkout as checkout_core
from app.services.ad_payments import payment_code
from app.services.ad_payments.port import DepositObservation
from app.services.ad_payments.rails.base import CheckoutResult

_GENERAL_TIER_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")


def _make_checkout_result(*, amount_vnd: int, source_ref: str, code: str, source: str = "toss") -> CheckoutResult:
    observation = DepositObservation(
        amount_vnd=amount_vnd,
        paid_at=datetime.now(UTC),
        memo_raw=f"{code}-1",
        payer_name="Nguyen Van A",
        bank_ref="71 123456******7890",
        source=source,
        source_ref=source_ref,
        kind="deposit",
        payment_code_hint=code,
    )
    return CheckoutResult(
        observation=observation,
        charge_snapshot={"currency": "KRW", "value": 10900, "psp": "toss", "payment_key": source_ref},
        already_final=False,
    )


class _CheckoutCoreTestBase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._deposit_ids: list[uuid.UUID] = []
        self._contract_ids: list[uuid.UUID] = []
        self._ad_ids: list[uuid.UUID] = []

        async with AsyncSessionLocal() as db:
            user = User(id=uuid.uuid4())
            db.add(user)
            await db.flush()
            self._user_id = user.id

            profile = BusinessProfile(id=uuid.uuid4(), user_id=user.id, name="Test Shop", status="APPROVED")
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
                profile = await db.get(BusinessProfile, self._profile_id)
                if profile is not None:
                    await db.delete(profile)
                user = await db.get(User, self._user_id)
                if user is not None:
                    await db.delete(user)
                await db.commit()
        finally:
            await engine.dispose()

    async def _make_contract(self, db, *, amount_vnd: int = 539000, status: str = "awaiting_payment") -> AdContract:
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Test Shop",
            title="Test Ad",
            tier_id=_GENERAL_TIER_ID,
            owner_business_profile_id=self._profile_id,
            review_status="APPROVED",
        )
        db.add(ad)
        await db.flush()
        self._ad_ids.append(ad.id)

        code = payment_code.generate_payment_code()
        contract = AdContract(
            id=uuid.uuid4(),
            ad_id=ad.id,
            tier_id=_GENERAL_TIER_ID,
            months=3,
            amount_vnd=amount_vnd,
            payment_code=code,
            status=status,
            contract_token=uuid.uuid4(),
            accepted_at=datetime.now(UTC),
            signer_name="Nguyen Van A",
            contract_snapshot={"charge": {"currency": "KRW", "value": 10900, "price_col": "price_3m_krw"}},
        )
        db.add(contract)
        await db.flush()
        self._contract_ids.append(contract.id)
        await db.commit()
        return ad, contract


class ExactMatchAutoApproveTests(_CheckoutCoreTestBase):
    async def test_exact_match_auto_approves_with_system_toss_actor(self):
        async with AsyncSessionLocal() as db:
            ad, contract = await self._make_contract(db)
            result = _make_checkout_result(amount_vnd=539000, source_ref="pay_exact_1", code=contract.payment_code)
            outcome = await checkout_core.complete_checkout(db, contract, ad, result, now=datetime.now(UTC))

        self.assertTrue(outcome.approved)
        self.assertIsNotNone(outcome.period_start)
        self.assertIsNotNone(outcome.period_end)

        async with AsyncSessionLocal() as db:
            refreshed = await db.get(AdContract, contract.id)
            refreshed_ad = await db.get(MarketplaceAd, ad.id)
        self.assertEqual(refreshed.status, "active")
        self.assertEqual(refreshed.approved_by, "system:toss")
        self.assertIsNotNone(refreshed_ad.paid_until)
        self.assertEqual(refreshed_ad.subscription_status, "active")

        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            deposit = (await db.execute(select(AdDeposit).where(AdDeposit.source_ref == "pay_exact_1"))).scalar_one()
        self._deposit_ids.append(deposit.id)
        self.assertEqual(deposit.charge_snapshot["value"], 10900)


class DuplicateWebhookConfirmRaceTests(_CheckoutCoreTestBase):
    async def test_same_payment_key_twice_yields_one_row_and_one_approval(self):
        async with AsyncSessionLocal() as db:
            ad, contract = await self._make_contract(db)

        async with AsyncSessionLocal() as db:
            contract1 = await db.get(AdContract, contract.id)
            ad1 = await db.get(MarketplaceAd, ad.id)
            result = _make_checkout_result(amount_vnd=539000, source_ref="pay_race_1", code=contract.payment_code)
            first = await checkout_core.complete_checkout(db, contract1, ad1, result, now=datetime.now(UTC))
        self.assertTrue(first.approved)

        async with AsyncSessionLocal() as db:
            contract2 = await db.get(AdContract, contract.id)
            ad2 = await db.get(MarketplaceAd, ad.id)
            first_period_end = contract2.period_end
            result2 = _make_checkout_result(amount_vnd=539000, source_ref="pay_race_1", code=contract.payment_code)
            second = await checkout_core.complete_checkout(db, contract2, ad2, result2, now=datetime.now(UTC))

        self.assertTrue(second.ingest_duplicate)
        self.assertFalse(second.approved)

        async with AsyncSessionLocal() as db:
            from sqlalchemy import select

            rows = (await db.execute(select(AdDeposit).where(AdDeposit.source_ref == "pay_race_1"))).scalars().all()
            self._deposit_ids.extend(d.id for d in rows)
            self.assertEqual(len(rows), 1)

            refreshed = await db.get(AdContract, contract.id)
        self.assertEqual(refreshed.period_end, first_period_end)  # 기간이 두 번 늘지 않는다


class AlreadyActiveNoReapproveTests(_CheckoutCoreTestBase):
    async def test_already_active_contract_is_not_reapproved(self):
        async with AsyncSessionLocal() as db:
            ad, contract = await self._make_contract(db)
            first_result = _make_checkout_result(amount_vnd=539000, source_ref="pay_first", code=contract.payment_code)
            first_outcome = await checkout_core.complete_checkout(db, contract, ad, first_result, now=datetime.now(UTC))
        self.assertTrue(first_outcome.approved)
        self._deposit_ids.append((await self._deposit_for_ref("pay_first")).id)

        async with AsyncSessionLocal() as db:
            contract2 = await db.get(AdContract, contract.id)
            ad2 = await db.get(MarketplaceAd, ad.id)
            self.assertEqual(contract2.status, "active")
            # 다른 결제건(예: 실수로 두 번째 toss 결제)이 같은 이미 active 계약에 들어옴.
            second_result = _make_checkout_result(
                amount_vnd=539000, source_ref="pay_second", code=contract.payment_code
            )
            second_outcome = await checkout_core.complete_checkout(
                db, contract2, ad2, second_result, now=datetime.now(UTC)
            )

        self.assertFalse(second_outcome.approved)
        self._deposit_ids.append((await self._deposit_for_ref("pay_second")).id)

    async def _deposit_for_ref(self, ref: str) -> AdDeposit:
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            return (await db.execute(select(AdDeposit).where(AdDeposit.source_ref == ref))).scalar_one()


class PartiallyPaidNoAutoApproveTests(_CheckoutCoreTestBase):
    async def test_shortfall_amount_does_not_auto_approve(self):
        async with AsyncSessionLocal() as db:
            ad, contract = await self._make_contract(db, amount_vnd=539000)
            # 카드 결제 관측이지만 금액이 계약액보다 작은 비정상 케이스(전액 단건이 깨진 경우) —
            # ingest_deposit 대조 결과가 partially_paid 가 되어 자동 승인 조건(status=='paid')을
            # 만족하지 못해야 한다.
            result = _make_checkout_result(amount_vnd=300000, source_ref="pay_short", code=contract.payment_code)
            outcome = await checkout_core.complete_checkout(db, contract, ad, result, now=datetime.now(UTC))

        self.assertEqual(outcome.ingest_status, "partially_paid")
        self.assertFalse(outcome.approved)
        self._deposit_ids.append((await self._deposit_for_ref("pay_short")).id)

    async def _deposit_for_ref(self, ref: str) -> AdDeposit:
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            return (await db.execute(select(AdDeposit).where(AdDeposit.source_ref == ref))).scalar_one()


class NonAutoApproveSourceTests(_CheckoutCoreTestBase):
    async def test_manual_source_is_not_auto_approved_even_if_paid(self):
        async with AsyncSessionLocal() as db:
            ad, contract = await self._make_contract(db, amount_vnd=539000)
            result = _make_checkout_result(
                amount_vnd=539000, source_ref="manual_ref_1", code=contract.payment_code, source="manual"
            )
            outcome = await checkout_core.complete_checkout(db, contract, ad, result, now=datetime.now(UTC))

        self.assertEqual(outcome.ingest_status, "paid")
        self.assertFalse(outcome.approved)  # AUTO_APPROVE_SOURCES = ("toss",) 뿐 — manual 은 대상 아님

        async with AsyncSessionLocal() as db:
            from sqlalchemy import select

            deposit = (await db.execute(select(AdDeposit).where(AdDeposit.source_ref == "manual_ref_1"))).scalar_one()
        self._deposit_ids.append(deposit.id)


if __name__ == "__main__":
    unittest.main()
