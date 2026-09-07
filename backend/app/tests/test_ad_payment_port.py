"""ingest_deposit 코어 회귀 (260907_ad_payment_pipeline_design.md §2-1, §8 P1-2 검증 항목 5).

- 코드로 계약을 특정해 상태를 갱신하는지
- 코드 미매칭 입금은 버리지 않고 contract_id NULL 로 보관하는지
- 같은 (source, source_ref) 로 두 번 들어와도 행이 1개(멱등)인지 — 웹훅 리트라이 방어

이 리포의 관례(test_funnel_events.py)를 따라 실제 컨테이너 DB(app.database.AsyncSessionLocal)에
그대로 연결해서 돈다 — mock 세션으로는 UNIQUE(source, source_ref) 제약 위반 경로를 검증할 수 없다.
"""

import unittest
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import AdContract, AdDeposit, MarketplaceAd
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


if __name__ == "__main__":
    unittest.main()
