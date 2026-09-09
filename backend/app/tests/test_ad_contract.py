"""광고주 tier 계약 웹 게이트(ad_contract.py) 회귀 테스트 — ad_contracts 테이블 기준 재작성.

260907_ad_payment_pipeline_design.md §8 P1-3 검증 항목. 이 라우터는 여러 테이블을 조인·삽입하므로
(services/ad_payments/*.py 코어 호출 포함) 이 리포의 관례(test_ad_payment_port.py, test_funnel_events.py)를
따라 실제 컨테이너 DB(app.database.AsyncSessionLocal)에 그대로 연결해서 돈다.

배선/미배선은 실행 환경에 `.env` 키가 있는지에 기대지 않고 `patch.dict(os.environ, ...)` 로
명시 구성한다 — 직전 리뷰에서 정확히 이 문제로 CHANGES 를 받았다.
"""

import hashlib
import os
import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi import HTTPException

from app.database import AsyncSessionLocal, engine
from app.models import AdContract, AdDeposit, AdTier, BusinessProfile, MarketplaceAd, User
from app.routers import ad_contract

_GENERAL_TIER_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")  # price_3m=539000, price_6m=999000

_ENV_KEYS = (
    "AD_PAYMENT_BANK_NAME",
    "AD_PAYMENT_BANK_ACCOUNT_NO",
    "AD_PAYMENT_BANK_ACCOUNT_HOLDER",
)

_UNWIRED_ENV = {k: "" for k in _ENV_KEYS}
_WIRED_ENV = {
    "AD_PAYMENT_BANK_NAME": "Vietcombank",
    "AD_PAYMENT_BANK_ACCOUNT_NO": "0011000012345",
    "AD_PAYMENT_BANK_ACCOUNT_HOLDER": "CONG TY TNHH VIDU KIEM THU",  # 무의미한 가공 상호(테스트 전용, 실 상호 아님)
}


class _AdContractTestBase(unittest.IsolatedAsyncioTestCase):
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

    async def _create_link(self) -> uuid.UUID:
        """contract-link 를 호출해 draft 계약 토큰을 반환한다."""
        async with AsyncSessionLocal() as db:
            out = await ad_contract.create_contract_link(ad_id=self._ad_id, db=db, session_uid=self._user_id)
        token = uuid.UUID(out.url.rsplit("token=", 1)[1])
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select

            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
            self._contract_ids.append(contract.id)
        return token


class ContractLinkTests(_AdContractTestBase):
    async def test_creates_draft_and_reuses_on_second_call(self):
        token1 = await self._create_link()
        async with AsyncSessionLocal() as db:
            out2 = await ad_contract.create_contract_link(ad_id=self._ad_id, db=db, session_uid=self._user_id)
        self.assertEqual(str(token1), out2.url.rsplit("token=", 1)[1])

    async def test_rejects_ad_not_owned_by_session_user(self):
        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await ad_contract.create_contract_link(ad_id=self._ad_id, db=db, session_uid=uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 404)

    async def test_rejects_ad_not_approved(self):
        async with AsyncSessionLocal() as db:
            ad = await db.get(MarketplaceAd, self._ad_id)
            ad.review_status = "PENDING"
            await db.commit()
        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await ad_contract.create_contract_link(ad_id=self._ad_id, db=db, session_uid=self._user_id)
        self.assertEqual(raised.exception.status_code, 409)

    async def test_renewal_allows_new_draft_when_ad_is_active(self):
        """갱신(이미 active 인 광고)도 draft 생성이 가능해야 한다 — 선불 기간제에서 409 로 막으면 안 됨."""
        async with AsyncSessionLocal() as db:
            ad = await db.get(MarketplaceAd, self._ad_id)
            ad.subscription_status = "active"
            ad.paid_until = datetime.now(UTC)
            await db.commit()

        token = await self._create_link()
        self.assertIsNotNone(token)

    async def test_unclosed_non_draft_contract_blocks_new_draft(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select

            contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
            contract.status = "accepted"
            contract.accepted_at = datetime.now(UTC)
            contract.signer_name = "Nguyen"
            await db.commit()

        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await ad_contract.create_contract_link(ad_id=self._ad_id, db=db, session_uid=self._user_id)
        self.assertEqual(raised.exception.status_code, 409)


class ConcurrentContractLinkTests(_AdContractTestBase):
    """동시 발급 경쟁 — "열린 draft 없음" 확인이 check-then-act 라 동시 요청 2개가 각각 별도
    계약을 만들 수 있었다. 부분 유니크 인덱스(init/230)가 두 번째를 거부하고, 라우터가 그
    IntegrityError 를 잡아 먼저 만들어진 draft 를 돌려준다.
    """

    async def test_concurrent_calls_yield_single_draft(self):
        import asyncio

        from sqlalchemy import select

        # 경쟁을 결정적으로 만든다 — "열린 draft 없음" 확인 직후(결제코드 발급 지점)에서 두 요청이
        # 서로를 기다리게 해, 둘 다 "없음" 을 본 상태에서 INSERT 하도록 강제한다.
        original_generate = ad_contract._generate_unique_payment_code
        arrived = asyncio.Event()
        both_arrived: list[int] = []

        async def _gated_generate(db):
            code = await original_generate(db)
            both_arrived.append(1)
            if len(both_arrived) < 2:
                await asyncio.wait_for(arrived.wait(), timeout=5)
            else:
                arrived.set()
            return code

        async def _call():
            async with AsyncSessionLocal() as db:
                out = await ad_contract.create_contract_link(ad_id=self._ad_id, db=db, session_uid=self._user_id)
            return out.url.rsplit("token=", 1)[1]

        with patch.object(ad_contract, "_generate_unique_payment_code", _gated_generate):
            tokens = await asyncio.gather(_call(), _call())
        self.assertEqual(len(both_arrived), 2, "두 요청이 같은 지점에서 실제로 경쟁하지 않았다")

        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(AdContract).where(AdContract.ad_id == self._ad_id))).scalars().all()
        for row in rows:
            self._contract_ids.append(row.id)

        self.assertEqual(len(rows), 1, f"동시 요청으로 계약이 {len(rows)}건 만들어졌다")
        self.assertEqual(tokens[0], tokens[1])
        self.assertEqual(tokens[0], str(rows[0].contract_token))

    async def test_db_rejects_second_open_contract_for_same_ad(self):
        """앱 가드를 우회한 직접 INSERT 도 DB 가 막는다(제약이 실제로 걸려 있는지)."""
        from sqlalchemy.exc import IntegrityError

        from app.services.ad_payments import payment_code as payment_code_module

        await self._create_link()
        async with AsyncSessionLocal() as db:
            db.add(
                AdContract(
                    id=uuid.uuid4(),
                    ad_id=self._ad_id,
                    tier_id=_GENERAL_TIER_ID,
                    months=1,
                    amount_vnd=99000,
                    payment_code=payment_code_module.generate_payment_code(),
                    status="draft",
                    contract_token=uuid.uuid4(),
                )
            )
            with self.assertRaises(IntegrityError):
                await db.commit()


class UnwiredGetContractTests(_AdContractTestBase):
    async def test_get_shows_bank_null_and_stays_accepted(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            out = await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Nguyen Van A"),
                request=_fake_request(),
                db=db,
            )
        self.assertEqual(out.status, "accepted")

        with patch.dict(os.environ, _UNWIRED_ENV):
            async with AsyncSessionLocal() as db:
                out = await ad_contract.get_ad_contract(token=token, db=db)
        self.assertEqual(out.status, "accepted")
        self.assertIsNone(out.bank)
        self.assertIsNone(out.due_at)


class WiredGetContractTests(_AdContractTestBase):
    async def test_get_promotes_to_awaiting_payment_once(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Nguyen Van A"),
                request=_fake_request(),
                db=db,
            )

        with patch.dict(os.environ, _WIRED_ENV):
            async with AsyncSessionLocal() as db:
                out1 = await ad_contract.get_ad_contract(token=token, db=db)
            self.assertEqual(out1.status, "awaiting_payment")
            self.assertIsNotNone(out1.bank)
            self.assertEqual(out1.bank.name, "Vietcombank")
            first_due_at = out1.due_at
            self.assertIsNotNone(first_due_at)

            # 재조회해도 issued_at(따라서 due_at)이 최초 값 그대로여야 한다(멱등, 최초 1회).
            async with AsyncSessionLocal() as db:
                out2 = await ad_contract.get_ad_contract(token=token, db=db)
            self.assertEqual(out2.status, "awaiting_payment")
            self.assertEqual(out2.due_at, first_due_at)


class AcceptContractTests(_AdContractTestBase):
    async def test_rejects_unknown_token(self):
        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await ad_contract.accept_ad_contract(
                    token=uuid.uuid4(),
                    body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Nguyen"),
                    request=_fake_request(),
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 404)

    async def test_months_out_of_range_is_422(self):
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            ad_contract.AdContractAcceptRequest(months=2, signer_name="Nguyen")

    async def test_accept_is_idempotent(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            out1 = await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Original Signer"),
                request=_fake_request(),
                db=db,
            )
        async with AsyncSessionLocal() as db:
            out2 = await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=6, signer_name="Someone Else"),
                request=_fake_request(),
                db=db,
            )
        self.assertEqual(out1.months, 3)
        self.assertEqual(out2.months, 3)  # 재호출해도 최초 값 유지
        self.assertEqual(out1.amount_vnd, out2.amount_vnd)

    async def test_accept_snapshots_tier_price_for_chosen_months(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            out = await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Nguyen Van A"),
                request=_fake_request(),
                db=db,
            )
        self.assertEqual(out.months, 3)
        self.assertEqual(out.amount_vnd, 539000)
        self.assertIsNotNone(out.snapshot)
        self.assertEqual(out.snapshot["months"], 3)

    async def test_accept_snapshots_exact_presented_text_version_and_locale(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            presented = await ad_contract.get_ad_contract(token=token, locale="en", db=db)
        async with AsyncSessionLocal() as db:
            accepted = await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(
                    months=3,
                    signer_name="Nguyen Van A",
                    locale="en",
                    presented_text_version=presented.contract_text_version,
                    presented_text_sha256=presented.contract_text_sha256,
                    presented_quote=True,
                    presented_amount_vnd=presented.tier_price_options.month_3_vnd,
                    presented_amount_krw=presented.tier_price_options.month_3_krw,
                ),
                request=_fake_request(),
                db=db,
            )

        self.assertEqual(accepted.contract_text, presented.contract_text)
        self.assertEqual(accepted.contract_locale, "en")
        self.assertEqual(accepted.snapshot["contract_text"], presented.contract_text)
        self.assertEqual(accepted.snapshot["contract_text_version"], presented.contract_text_version)
        self.assertEqual(accepted.snapshot["contract_locale"], "en")
        self.assertEqual(
            accepted.snapshot["contract_text_sha256"],
            hashlib.sha256(presented.contract_text.encode("utf-8")).hexdigest(),
        )

    async def test_accept_rejects_stale_presented_contract_and_keeps_draft(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await ad_contract.accept_ad_contract(
                    token=token,
                    body=ad_contract.AdContractAcceptRequest(
                        months=3,
                        signer_name="Nguyen Van A",
                        locale="ko",
                        presented_text_version="stale",
                        presented_text_sha256="0" * 64,
                    ),
                    request=_fake_request(),
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail, {"error": "contract_version_changed"})
        async with AsyncSessionLocal() as db:
            contract = await ad_contract._load_contract_by_token(db, token)
            self.assertEqual(contract.status, "draft")
            self.assertIsNone(contract.contract_snapshot)

    async def test_accept_rejects_changed_presented_quote(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            with self.assertRaises(HTTPException) as raised:
                await ad_contract.accept_ad_contract(
                    token=token,
                    body=ad_contract.AdContractAcceptRequest(
                        months=3,
                        signer_name="Nguyen Van A",
                        locale="en",
                        presented_quote=True,
                        presented_amount_vnd=1,
                        presented_amount_krw=None,
                    ),
                    request=_fake_request(),
                    db=db,
                )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail, {"error": "contract_version_changed"})

    async def test_unknown_locale_falls_back_to_vietnamese(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            out = await ad_contract.get_ad_contract(token=token, locale="fr", db=db)
        self.assertEqual(out.contract_locale, "vi")
        self.assertTrue(out.contract_text.startswith("Hợp đồng này"))

    async def test_second_accept_preserves_first_contract_evidence(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            first = await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=3, signer_name="First", locale="ko"),
                request=_fake_request(),
                db=db,
            )
        async with AsyncSessionLocal() as db:
            second = await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=6, signer_name="Second", locale="en"),
                request=_fake_request(),
                db=db,
            )
        self.assertEqual(second.snapshot, first.snapshot)
        self.assertEqual(second.contract_text, first.contract_text)
        self.assertEqual(second.contract_locale, "ko")


class RailOffersTests(_AdContractTestBase):
    """rails[] 응답 — 260907_toss_payment_rail_design.md §8 P2-5. `_GENERAL_TIER_ID` 는
    price_*_krw 가 전부 NULL(init/229) 이므로 toss_card 는 STUB 모드에서도 항상 미노출이어야
    한다(seam-D, 무료/오가 계약 방지 — design 절대 지켜야 할 경계 8)."""

    async def test_rails_always_include_both_rail_keys(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            out = await ad_contract.get_ad_contract(token=token, db=db)
        rail_keys = {r.rail for r in out.rails}
        self.assertEqual(rail_keys, {"bank_transfer", "toss_card"})

    async def test_toss_card_hidden_when_off(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Nguyen Van A"),
                request=_fake_request(),
                db=db,
            )
        async with AsyncSessionLocal() as db:
            out = await ad_contract.get_ad_contract(token=token, db=db)
        toss_offer = next(r for r in out.rails if r.rail == "toss_card")
        self.assertFalse(toss_offer.wired)
        self.assertIsNone(toss_offer.checkout)

    async def test_toss_card_hidden_when_stub_but_krw_price_null(self):
        # 260907 D-F(VAT 영세율 확인 후 KRW 확정가 반영, init/231)로 공용 _GENERAL_TIER_ID 는
        # 더 이상 KRW NULL 이 아니다 — 이 테스트가 검증하려는 "KRW 미설정" 상태를 재현하려면
        # 전용 tier(가격 미설정)를 따로 만들어야 한다.
        no_krw_tier_id = uuid.uuid4()
        no_krw_ad_id = uuid.uuid4()
        async with AsyncSessionLocal() as db:
            tier = AdTier(id=no_krw_tier_id, name="__test_no_krw__", monthly_price_vnd=199000, price_3m_vnd=539000)
            db.add(tier)
            ad = MarketplaceAd(
                id=no_krw_ad_id,
                partner_name="Test Shop",
                title="Test Ad (no KRW)",
                tier_id=no_krw_tier_id,
                owner_business_profile_id=self._profile_id,
                review_status="APPROVED",
            )
            db.add(ad)
            await db.commit()
        try:
            async with AsyncSessionLocal() as db:
                link_out = await ad_contract.create_contract_link(ad_id=no_krw_ad_id, db=db, session_uid=self._user_id)
            token = uuid.UUID(link_out.url.rsplit("token=", 1)[1])
            async with AsyncSessionLocal() as db:
                from sqlalchemy import select

                contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one()
                self._contract_ids.append(contract.id)
                await ad_contract.accept_ad_contract(
                    token=token,
                    body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Nguyen Van A"),
                    request=_fake_request(),
                    db=db,
                )
            stub_env = {
                "AD_PAYMENT_TOSS_CLIENT_KEY": "",
                "AD_PAYMENT_TOSS_SECRET_KEY": "",
                "AD_PAYMENT_TOSS_STUB": "1",
                "APP_ENV": "development",
            }
            with patch.dict(os.environ, stub_env):
                async with AsyncSessionLocal() as db:
                    out = await ad_contract.get_ad_contract(token=token, db=db)
            toss_offer = next(r for r in out.rails if r.rail == "toss_card")
            self.assertFalse(toss_offer.wired)  # KRW NULL — seam-D 미배선, 카드 rail 항상 숨김
        finally:
            # FK ON DELETE RESTRICT(ad_contracts.ad_id/tier_id) — 계약부터 지워야 ad/tier 삭제가
            # 가능하다. contract_id 는 이미 self._contract_ids 에 들어있어 asyncTearDown 이 다시
            # db.get() 하지만 None 이라 건너뛴다(위 가드 참고).
            async with AsyncSessionLocal() as db:
                for contract_id in list(self._contract_ids):
                    contract = await db.get(AdContract, contract_id)
                    if contract is not None:
                        await db.delete(contract)
                ad = await db.get(MarketplaceAd, no_krw_ad_id)
                if ad is not None:
                    await db.delete(ad)
                tier = await db.get(AdTier, no_krw_tier_id)
                if tier is not None:
                    await db.delete(tier)
                await db.commit()

    async def test_no_secret_key_string_in_response(self):
        token = await self._create_link()
        async with AsyncSessionLocal() as db:
            await ad_contract.accept_ad_contract(
                token=token,
                body=ad_contract.AdContractAcceptRequest(months=3, signer_name="Nguyen Van A"),
                request=_fake_request(),
                db=db,
            )
        fake_secret = "test_sk_should_never_leak_0000000000000000"
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "test_ck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": fake_secret,
        }
        with patch.dict(os.environ, env):
            async with AsyncSessionLocal() as db:
                out = await ad_contract.get_ad_contract(token=token, db=db)
        self.assertNotIn(fake_secret, out.model_dump_json())


def _fake_request():
    from unittest.mock import MagicMock

    request = MagicMock()
    request.headers.get.return_value = None
    request.client.host = "203.0.113.9"
    return request


if __name__ == "__main__":
    unittest.main()
