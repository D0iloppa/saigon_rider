"""ingest_deposit 코어 회귀 (260907_ad_payment_pipeline_design.md §2-1, §8 P1-2 검증 항목 5).

- 코드로 계약을 특정해 상태를 갱신하는지
- 코드 미매칭 입금은 버리지 않고 contract_id NULL 로 보관하는지
- 같은 (source, source_ref) 로 두 번 들어와도 행이 1개(멱등)인지 — 웹훅 리트라이 방어

이 리포의 관례(test_funnel_events.py)를 따라 실제 컨테이너 DB(app.database.AsyncSessionLocal)에
그대로 연결해서 돈다 — mock 세션으로는 UNIQUE(source, source_ref) 제약 위반 경로를 검증할 수 없다.
"""

import asyncio
import unittest
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import AdContract, AdDeposit, MarketplaceAd
from app.services.ad_payments import contracts as contract_fsm
from app.services.ad_payments import payment_code
from app.services.ad_payments.port import DepositObservation, ingest_deposit

_GENERAL_TIER_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")


class IngestDepositTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._ad_id: uuid.UUID | None = None
        self._contract_id: uuid.UUID | None = None
        self._deposit_ids: list[uuid.UUID] = []

    async def asyncTearDown(self):
        try:
            async with AsyncSessionLocal() as db:
                for dep_id in self._deposit_ids:
                    dep = await db.get(AdDeposit, dep_id)
                    if dep is not None:
                        await db.delete(dep)
                if self._contract_id is not None:
                    contract = await db.get(AdContract, self._contract_id)
                    if contract is not None:
                        await db.delete(contract)
                if self._ad_id is not None:
                    ad = await db.get(MarketplaceAd, self._ad_id)
                    if ad is not None:
                        await db.delete(ad)
                await db.commit()
        finally:
            await engine.dispose()

    async def _make_contract(self, db: AsyncSessionLocal, *, amount_vnd: int = 539000) -> AdContract:
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Test Partner",
            title="Test Ad",
            tier_id=_GENERAL_TIER_ID,
        )
        db.add(ad)
        await db.flush()
        self._ad_id = ad.id

        contract = AdContract(
            id=uuid.uuid4(),
            ad_id=ad.id,
            tier_id=_GENERAL_TIER_ID,
            months=3,
            amount_vnd=amount_vnd,
            payment_code=payment_code.generate_payment_code(),
            status="awaiting_payment",
            contract_token=uuid.uuid4(),
        )
        db.add(contract)
        await db.flush()
        self._contract_id = contract.id
        await db.commit()
        return contract

    async def test_matches_by_code_and_updates_status_to_paid(self):
        async with AsyncSessionLocal() as db:
            contract = await self._make_contract(db, amount_vnd=539000)

        async with AsyncSessionLocal() as db:
            obs = DepositObservation(
                amount_vnd=539000,
                paid_at=datetime.now(UTC),
                memo_raw=None,
                payer_name="Test Partner",
                bank_ref="ref-1",
                source="manual",
                source_ref=None,
                payment_code_hint=contract.payment_code,
            )
            result = await ingest_deposit(db, obs, actor="tester")
            self._deposit_ids.append(result.deposit_id)

            self.assertEqual(result.contract_id, contract.id)
            self.assertEqual(result.status, "paid")
            self.assertFalse(result.duplicate)

        async with AsyncSessionLocal() as verify_db:
            refreshed = await verify_db.get(AdContract, contract.id)
            self.assertEqual(refreshed.status, "paid")

    async def test_unmatched_code_keeps_deposit_with_null_contract(self):
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
            self.assertIsNone(result.status)

    async def test_same_source_ref_twice_yields_one_row(self):
        async with AsyncSessionLocal() as db:
            contract = await self._make_contract(db, amount_vnd=539000)

        source_ref = f"webhook-{uuid.uuid4().hex[:12]}"

        async def _ingest_once():
            async with AsyncSessionLocal() as db:
                obs = DepositObservation(
                    amount_vnd=539000,
                    paid_at=datetime.now(UTC),
                    memo_raw=f"SGR-{contract.payment_code.split('-')[1]}",
                    payer_name="Test Partner",
                    bank_ref="ref-2",
                    source="csv",
                    source_ref=source_ref,
                )
                return await ingest_deposit(db, obs, actor="tester")

        first = await _ingest_once()
        second = await _ingest_once()
        self._deposit_ids.append(first.deposit_id)

        self.assertFalse(first.duplicate)
        self.assertTrue(second.duplicate)
        self.assertEqual(first.deposit_id, second.deposit_id)

        async with AsyncSessionLocal() as verify_db:
            rows = (
                (
                    await verify_db.execute(
                        select(AdDeposit).where(AdDeposit.source == "csv", AdDeposit.source_ref == source_ref)
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual(len(rows), 1)


class MoneyPathLockTests(unittest.IsolatedAsyncioTestCase):
    """머니 경로 동시성 재현 — 세션 2개를 실제로 경쟁시킨다(락이 없으면 실패한다).

    - ingest_deposit: 같은 계약에 동시 입금 2건 → 상태가 역행하지 않고 최종 paid
    - approve_with_ad_lock: 같은 광고의 계약 2건 동시 승인 → paid_until 이 덮어써지지 않고 이어붙는다
    """

    async def asyncSetUp(self):
        self._ad_id: uuid.UUID | None = None
        self._contract_ids: list[uuid.UUID] = []
        self._deposit_ids: list[uuid.UUID] = []

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
                await db.commit()
        finally:
            await engine.dispose()

    async def _make_ad(self, db) -> MarketplaceAd:
        ad = MarketplaceAd(
            id=uuid.uuid4(),
            partner_name="Test Partner",
            title="Test Ad",
            tier_id=_GENERAL_TIER_ID,
        )
        db.add(ad)
        await db.flush()
        self._ad_id = ad.id
        return ad

    async def _add_contract(self, db, ad_id: uuid.UUID, *, status: str, amount_vnd: int, months: int) -> AdContract:
        contract = AdContract(
            id=uuid.uuid4(),
            ad_id=ad_id,
            tier_id=_GENERAL_TIER_ID,
            months=months,
            amount_vnd=amount_vnd,
            payment_code=payment_code.generate_payment_code(),
            status=status,
            contract_token=uuid.uuid4(),
        )
        db.add(contract)
        await db.flush()
        self._contract_ids.append(contract.id)
        return contract

    async def test_concurrent_deposits_do_not_regress_status(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db)
            contract = await self._add_contract(db, ad.id, status="awaiting_payment", amount_vnd=100000, months=1)
            await db.commit()
            code = contract.payment_code
            contract_id = contract.id

        async def _ingest(bank_ref: str):
            async with AsyncSessionLocal() as db:
                obs = DepositObservation(
                    amount_vnd=20000,
                    paid_at=datetime.now(UTC),
                    memo_raw=None,
                    payer_name="Test Partner",
                    bank_ref=bank_ref,
                    source="manual",
                    source_ref=None,
                    payment_code_hint=code,
                )
                return await ingest_deposit(db, obs, actor="tester")

        # 5건을 한꺼번에 — 락이 없으면 서로의 미커밋 INSERT 를 못 봐 마지막 커밋이 partially_paid
        # 로 역행한다(실측: 락 제거 시 이 테스트가 실패한다).
        results = await asyncio.gather(*(_ingest(f"race-{i}") for i in range(5)))
        for result in results:
            self._deposit_ids.append(result.deposit_id)

        # 직렬화되면 마지막 1건만 paid, 나머지는 partially_paid (락 획득 순서는 태스크 순서와
        # 무관하므로 순서가 아니라 개수로 본다).
        statuses = sorted(r.status for r in results)
        self.assertEqual(statuses, ["paid", *["partially_paid"] * 4])
        async with AsyncSessionLocal() as verify_db:
            refreshed = await verify_db.get(AdContract, contract_id)
            rows = (
                (await verify_db.execute(select(AdDeposit).where(AdDeposit.contract_id == contract_id))).scalars().all()
            )
        self.assertEqual(refreshed.status, "paid")
        self.assertEqual(len(rows), 5)

    async def test_concurrent_approvals_of_same_contract_extend_period_once(self):
        """같은 계약을 두 경로(관리자 승인 ↔ 토스 자동승인)가 동시에 승인해도 기간은 1회만 붙는다.

        락·재조회가 없으면 두 트랜잭션이 각자 stale 한 `ad.paid_until`/`contract.status` 로
        계산해 같은 돈으로 기간이 두 번 붙는다(paid_until 이 2개월치가 된다).
        """
        now = datetime.now(UTC)
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db)
            contract = await self._add_contract(db, ad.id, status="paid", amount_vnd=100000, months=1)
            await db.commit()
            ad_id = ad.id
            contract_id = contract.id

        async def _load():
            db = AsyncSessionLocal()
            # 락 밖에서 미리 읽어둔 인스턴스 — 락 획득 후 refresh 하지 않으면 이 스테일 값으로
            # 계산한다(재현 대상 버그).
            return db, await db.get(AdContract, contract_id), await db.get(MarketplaceAd, ad_id)

        loaded = await asyncio.gather(_load(), _load())

        async def _approve(db, contract_row, ad_row):
            try:
                await contract_fsm.approve_with_ad_lock(db, contract_row, ad_row, actor="tester", now=now)
                await db.commit()
                return "approved"
            except contract_fsm.ContractStateError:
                await db.rollback()
                return "rejected"
            finally:
                await db.close()

        outcomes = await asyncio.gather(*(_approve(*entry) for entry in loaded))

        async with AsyncSessionLocal() as verify_db:
            ad_row = await verify_db.get(MarketplaceAd, ad_id)
            contract_row = await verify_db.get(AdContract, contract_id)

        one_month = contract_fsm.compute_period(prev_paid_until=None, months=1, now=now)[1]
        self.assertEqual(sorted(outcomes), ["approved", "rejected"])
        self.assertEqual(contract_row.status, "active")
        self.assertEqual(ad_row.paid_until, one_month)
        self.assertEqual(ad_row.subscription_status, "active")


if __name__ == "__main__":
    unittest.main()
