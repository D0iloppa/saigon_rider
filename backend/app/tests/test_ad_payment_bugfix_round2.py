"""/code-review 2차 라운드 지적 회귀 (치명 1~3, 중 4~6, 하 accept 종결가드).

`test_ad_payment_pipeline_e2e.py` 의 `_PipelineTestBase`/헬퍼를 그대로 재사용한다 — 실제
컨테이너 DB(app.database.AsyncSessionLocal)에 붙어서 돈다.

- 치명 1: 전액환불(close-refunded) 후 ad.subscription_status 도 expired 로 내려가 게이트가 막힌다.
- 치명 2: active 계약의 입금을 재배정하면 그 광고도 게이트가 막힌다.
- 치명 3: tier 변경 후 재사용 draft 가 새 tier 가격을 반영한다.
- 중 4: 종결 계약(cancelled/refunded)에 입금 등록 시 409.
- 중 5: 중복탐지가 kind 로 분리되어 정당한 환불이 막히지 않는다(진짜 중복 환불은 여전히 막힘).
- 중 6: check_payer 가 금액 일치 여부와 무관하게 payer_name 불일치를 잡는다(reconcile 단위 테스트).
- 하: 종결 계약에 /accept 호출 시 409.
"""

from __future__ import annotations

import unittest
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import AdContract
from app.routers import ad_contract
from app.routers.admin_api import biz_contracts
from app.services.ad_gating import is_payment_ok
from app.services.ad_payments.reconcile import reconcile_contract
from app.tests.test_ad_payment_pipeline_e2e import (
    _ADMIN,
    _fake_request,
    _PipelineTestBase,
)

_PREMIUM_TIER_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")  # monthly_price_vnd=499000


class FullRefundGateTests(_PipelineTestBase):
    """치명 1: 전액환불 후 광고가 게이트를 통과하지 못해야 한다."""

    async def test_close_refunded_expires_subscription_status(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db)
            await db.commit()
            ad_id = ad.id
        token = await self._create_link(ad_id)
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

        async with AsyncSessionLocal() as db:
            ad_after_approve = await db.get(type(ad), ad_id)
        self.assertEqual(ad_after_approve.subscription_status, "active")

        await self._register_deposit(contract.id, amount_vnd=539000, kind="refund")

        async with AsyncSessionLocal() as db:
            close_out = await biz_contracts.close_refunded_contract(
                contract_id=contract.id,
                body=biz_contracts.ReasonRequest(reason="고객 요청 환불"),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )
        self.assertEqual(close_out["status"], "refunded")

        async with AsyncSessionLocal() as db:
            ad_after_refund = await db.get(type(ad), ad_id)
        self.assertEqual(ad_after_refund.subscription_status, "expired")
        self.assertFalse(
            is_payment_ok(
                owner_business_profile_id=ad_after_refund.owner_business_profile_id,
                subscription_status=ad_after_refund.subscription_status,
                paid_until=ad_after_refund.paid_until,
                starts_at=ad_after_refund.starts_at,
                now=datetime.now(UTC),
            )
        )


class ActiveReassignmentGateTests(_PipelineTestBase):
    """치명 2: active 계약의 입금을 재배정하면 그 광고도 게이트를 통과하지 못해야 한다."""

    async def test_reassigning_active_contract_deposit_expires_ad(self):
        async with AsyncSessionLocal() as db:
            ad1 = await self._make_ad(db)
            ad2 = await self._make_ad(db)
            await db.commit()
            ad1_id, ad2_id = ad1.id, ad2.id

        token1 = await self._create_link(ad1_id)
        token2 = await self._create_link(ad2_id)
        await self._accept(token1, months=3)
        await self._accept(token2, months=3)

        async with AsyncSessionLocal() as db:
            contract1 = (await db.execute(select(AdContract).where(AdContract.contract_token == token1))).scalar_one()
            contract2 = (await db.execute(select(AdContract).where(AdContract.contract_token == token2))).scalar_one()

        detail1 = await self._register_deposit(contract1.id, amount_vnd=539000)
        deposit_id = detail1.deposits[0].id

        async with AsyncSessionLocal() as db:
            await biz_contracts.approve_contract(
                contract_id=contract1.id,
                body=biz_contracts.ApproveRequest(),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )

        async with AsyncSessionLocal() as db:
            ad1_after_approve = await db.get(type(ad1), ad1_id)
        self.assertEqual(ad1_after_approve.subscription_status, "active")

        # 이미 승인 완료(active)된 계약1 의 입금건을 계약2 로 재배정 — 계약1 은 입금 0원이 된다.
        async with AsyncSessionLocal() as db:
            await biz_contracts.match_deposit(
                deposit_id=deposit_id,
                body=biz_contracts.DepositMatchRequest(contract_id=contract2.id, reason="재배정 테스트"),
                request=_fake_request(),
                session=_ADMIN,
                db=db,
            )

        # 계약1 은 FSM 상 여전히 active(코어를 건드리지 않았으므로) 지만, 그 광고는 게이트가
        # 막혀야 한다(무료노출 방지가 목적이지 계약 status 전이가 목적이 아니다).
        async with AsyncSessionLocal() as db:
            contract1_after = await db.get(AdContract, contract1.id)
            ad1_after = await db.get(type(ad1), ad1_id)
        self.assertEqual(contract1_after.status, "active")
        self.assertEqual(ad1_after.subscription_status, "expired")
        self.assertFalse(
            is_payment_ok(
                owner_business_profile_id=ad1_after.owner_business_profile_id,
                subscription_status=ad1_after.subscription_status,
                paid_until=ad1_after.paid_until,
                starts_at=ad1_after.starts_at,
                now=datetime.now(UTC),
            )
        )


class ReusedDraftTierChangeTests(_PipelineTestBase):
    """치명 3: 링크 발급 후 tier 변경 시 재사용 draft 가 새 tier 가격을 반영한다."""

    async def test_reused_draft_reflects_new_tier_after_admin_change(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db)  # 일반 tier (price_3m=539000)
            await db.commit()
            ad_id = ad.id

        token = await self._create_link(ad_id)
        async with AsyncSessionLocal() as db:
            out_before = await ad_contract.get_ad_contract(token=token, db=db)
        self.assertEqual(out_before.tier_price_options.month_3_vnd, 539000)

        # 관리자가 tier 를 프리미엄으로 상향 (set_tier 라우터를 직접 부르지 않고 모델 필드만
        # 바꾼다 — 이 테스트가 검증할 대상은 create_contract_link 의 재사용 판정이다).
        async with AsyncSessionLocal() as db:
            ad_row = await db.get(type(ad), ad_id)
            ad_row.tier_id = _PREMIUM_TIER_ID
            await db.commit()

        # 같은 draft 토큰을 재발급 요청 — tier_id 가 갱신돼야 한다.
        async with AsyncSessionLocal() as db:
            relink_out = await ad_contract.create_contract_link(ad_id=ad_id, db=db, session_uid=self._user_id)
        relink_token = uuid.UUID(relink_out.url.rsplit("token=", 1)[1])
        self.assertEqual(relink_token, token)  # 여전히 같은 draft(재사용) — 새로 만들지 않았다.

        async with AsyncSessionLocal() as db:
            out_after = await ad_contract.get_ad_contract(token=token, db=db)
        self.assertEqual(out_after.tier_name, "프리미엄")
        self.assertEqual(out_after.tier_price_options.month_3_vnd, 1349000)

        # accept() 도 새 tier 가격(프리미엄 3개월 1,349,000)으로 과금돼야 한다.
        accept_out = await self._accept(token, months=3)
        self.assertEqual(accept_out.amount_vnd, 1349000)


class ClosedContractDepositGuardTests(_PipelineTestBase):
    """중 4: 종결 계약(cancelled/refunded)에 입금 등록 시 409."""

    async def test_create_deposit_on_cancelled_contract_is_409(self):
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

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await biz_contracts.create_contract_deposit(
                    contract_id=contract.id,
                    body=biz_contracts.DepositCreateRequest(
                        amount_vnd=100000, paid_at=datetime.now(UTC), payer_name="Someone"
                    ),
                    request=_fake_request(),
                    session=_ADMIN,
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 409)


class DuplicateSuspectKindFilterTests(_PipelineTestBase):
    """중 5: 중복탐지가 kind 로 분리 — 정당한 동액 환불은 막히지 않고, 진짜 중복 환불은 막힌다."""

    async def test_legit_refund_matching_deposit_amount_not_blocked(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db)
            await db.commit()
        token = await self._create_link(ad.id)
        await self._accept(token, months=3)

        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()

        await self._register_deposit(contract.id, amount_vnd=539000)
        # 같은 계약·같은 금액의 환불 — force 없이도 409 가 나면 안 된다(kind 분리 전엔 났다).
        refund_detail = await self._register_deposit(contract.id, amount_vnd=539000, kind="refund")
        self.assertEqual(refund_detail.reconcile.received_vnd, 0)

    async def test_true_duplicate_refund_still_flagged(self):
        async with AsyncSessionLocal() as db:
            ad = await self._make_ad(db)
            await db.commit()
        token = await self._create_link(ad.id)
        await self._accept(token, months=3)

        async with AsyncSessionLocal() as db:
            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()

        await self._register_deposit(contract.id, amount_vnd=539000)
        paid_at = datetime.now(UTC)
        await self._register_deposit(contract.id, amount_vnd=539000, kind="refund", paid_at=paid_at)

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await biz_contracts.create_contract_deposit(
                    contract_id=contract.id,
                    body=biz_contracts.DepositCreateRequest(
                        kind="refund", amount_vnd=539000, paid_at=paid_at, payer_name="Test Shop"
                    ),
                    request=_fake_request(),
                    session=_ADMIN,
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 409)


class CheckPayerFlagTests(unittest.TestCase):
    """중 6: check_payer 가 금액 일치 여부와 무관하게 payer_name 불일치를 잡는다."""

    class _Dep:
        def __init__(self, kind, amount_vnd, paid_at, payer_name):
            self.kind = kind
            self.amount_vnd = amount_vnd
            self.paid_at = paid_at
            self.payer_name = payer_name

    def test_amount_matching_but_wrong_payer_is_flagged(self):
        now = datetime.now(UTC)
        deposits = [self._Dep("deposit", 539000, now, "Someone Else")]
        outcome = reconcile_contract(expected_vnd=539000, deposits=deposits, partner_name="Test Shop")
        self.assertIn("check_payer", outcome.flags)

    def test_matching_payer_not_flagged(self):
        now = datetime.now(UTC)
        deposits = [self._Dep("deposit", 539000, now, "Test Shop")]
        outcome = reconcile_contract(expected_vnd=539000, deposits=deposits, partner_name="Test Shop")
        self.assertNotIn("check_payer", outcome.flags)


class AcceptClosedContractGuardTests(_PipelineTestBase):
    """하: 종결 계약(cancelled/refunded)에 /accept 호출 시 409(멱등 성공 아님)."""

    async def test_accept_on_cancelled_contract_is_409(self):
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

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await ad_contract.accept_ad_contract(
                    token=token,
                    body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Nguyen Van A"),
                    request=_fake_request(),
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
