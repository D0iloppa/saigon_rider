"""광고주 tier 계약 웹 게이트(ad_contract.py) 회귀 테스트.

Apple 3.1.3(g) 회피 — 계약동의/결제안내를 앱 밖 웹(business.saigon-rider.com)에서
처리하기 위한 게이트. 라우터 함수를 직접 호출해 mock db로 검증한다
(test_idor_p0_fixes.py / test_ads_application.py 스타일 — 실 DB 불필요).
"""

import inspect
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers import ad_contract


def _scalar_one_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _fake_ad(**overrides):
    tier = MagicMock(name="tier")
    tier.name = overrides.pop("tier_name", "Premium")
    ad = MagicMock()
    ad.id = overrides.pop("id", uuid.uuid4())
    ad.subscription_status = overrides.pop("subscription_status", "pending_payment")
    ad.contract_token = overrides.pop("contract_token", None)
    ad.contract_accepted_at = overrides.pop("contract_accepted_at", None)
    ad.contract_method = None
    ad.contract_signer_name = None
    ad.contract_signer_ip = None
    ad.monthly_price_snapshot_vnd = overrides.pop("monthly_price_snapshot_vnd", 900_000)
    ad.partner_name = overrides.pop("partner_name", "Shop")
    ad.tier = tier
    return ad


class ContractLinkOwnershipTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_ad_not_owned_by_session_user(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(None))
        with self.assertRaises(HTTPException) as raised:
            await ad_contract.create_contract_link(ad_id=uuid.uuid4(), db=db, session_uid=uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 404)

    async def test_rejects_ad_not_pending_payment(self):
        ad = _fake_ad(subscription_status="active")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(ad))
        with self.assertRaises(HTTPException) as raised:
            await ad_contract.create_contract_link(ad_id=ad.id, db=db, session_uid=uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 409)

    async def test_issues_new_token_when_missing(self):
        ad = _fake_ad(contract_token=None)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(ad))
        db.commit = AsyncMock()
        out = await ad_contract.create_contract_link(ad_id=ad.id, db=db, session_uid=uuid.uuid4())
        self.assertIsNotNone(ad.contract_token)
        self.assertIn(str(ad.contract_token), out.url)
        db.commit.assert_awaited_once()

    async def test_reuses_existing_token_idempotently(self):
        existing_token = uuid.uuid4()
        ad = _fake_ad(contract_token=existing_token)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(ad))
        db.commit = AsyncMock()
        out = await ad_contract.create_contract_link(ad_id=ad.id, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ad.contract_token, existing_token)
        self.assertIn(str(existing_token), out.url)
        db.commit.assert_not_awaited()


class PublicContractLookupTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_unknown_token(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(None))
        with self.assertRaises(HTTPException) as raised:
            await ad_contract.get_ad_contract(token=uuid.uuid4(), db=db)
        self.assertEqual(raised.exception.status_code, 404)

    async def test_returns_minimal_fields_only(self):
        ad = _fake_ad(tier_name="Premium", monthly_price_snapshot_vnd=900_000, partner_name="Shop")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(ad))
        out = await ad_contract.get_ad_contract(token=uuid.uuid4(), db=db)
        self.assertEqual(out.tier_name, "Premium")
        self.assertEqual(out.monthly_price_vnd, 900_000)
        self.assertEqual(out.partner_name, "Shop")
        self.assertFalse(out.already_accepted)
        self.assertEqual(out.contract_text_version, "v1")

    async def test_already_accepted_reflected(self):
        from datetime import UTC, datetime

        ad = _fake_ad(contract_accepted_at=datetime.now(UTC))
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(ad))
        out = await ad_contract.get_ad_contract(token=uuid.uuid4(), db=db)
        self.assertTrue(out.already_accepted)


class AcceptContractTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_unknown_token(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(None))
        request = MagicMock()
        with self.assertRaises(HTTPException) as raised:
            await ad_contract.accept_ad_contract(
                token=uuid.uuid4(),
                body=ad_contract.AdContractAcceptRequest(signer_name="Nguyen"),
                request=request,
                db=db,
            )
        self.assertEqual(raised.exception.status_code, 404)

    async def test_first_accept_records_signer_time_and_ip(self):
        ad = _fake_ad(contract_accepted_at=None)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(ad))
        db.commit = AsyncMock()
        request = MagicMock()
        request.headers.get.return_value = None  # X-Real-IP 없음 → request.client.host 폴백
        request.client.host = "203.0.113.9"
        out = await ad_contract.accept_ad_contract(
            token=uuid.uuid4(),
            body=ad_contract.AdContractAcceptRequest(signer_name="Nguyen"),
            request=request,
            db=db,
        )
        self.assertEqual(ad.contract_signer_name, "Nguyen")
        self.assertEqual(ad.contract_method, "checkbox_v1")
        self.assertEqual(ad.contract_signer_ip, "203.0.113.9")
        self.assertIsNotNone(ad.contract_accepted_at)
        self.assertEqual(out.accepted_at, ad.contract_accepted_at)
        self.assertIsInstance(out.bank_transfer_info, str)
        db.commit.assert_awaited_once()

    async def test_prefers_x_real_ip_header_over_proxy_socket_ip(self):
        """nginx 가 uvicorn 컨테이너로 직접 붙으므로 request.client.host 는 프록시(nginx) IP
        뿐이다 — nginx 가 세팅하는 X-Real-IP(실제 클라이언트)를 우선해야 한다."""
        ad = _fake_ad(contract_accepted_at=None)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(ad))
        db.commit = AsyncMock()
        request = MagicMock()
        request.headers.get.return_value = "203.0.113.42"
        request.client.host = "172.18.0.5"  # nginx 컨테이너 내부 IP — 이 값이 저장되면 버그
        await ad_contract.accept_ad_contract(
            token=uuid.uuid4(),
            body=ad_contract.AdContractAcceptRequest(signer_name="Nguyen"),
            request=request,
            db=db,
        )
        self.assertEqual(ad.contract_signer_ip, "203.0.113.42")

    async def test_duplicate_accept_is_idempotent_and_preserves_original(self):
        from datetime import UTC, datetime

        original_time = datetime.now(UTC)
        ad = _fake_ad(contract_accepted_at=original_time)
        ad.contract_signer_name = "Original Signer"
        ad.contract_method = "checkbox_v1"
        ad.contract_signer_ip = "203.0.113.1"
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(ad))
        db.commit = AsyncMock()
        request = MagicMock()
        request.client.host = "198.51.100.5"
        out = await ad_contract.accept_ad_contract(
            token=uuid.uuid4(),
            body=ad_contract.AdContractAcceptRequest(signer_name="Someone Else"),
            request=request,
            db=db,
        )
        self.assertEqual(ad.contract_signer_name, "Original Signer")
        self.assertEqual(ad.contract_signer_ip, "203.0.113.1")
        self.assertEqual(ad.contract_accepted_at, original_time)
        self.assertEqual(out.accepted_at, original_time)
        db.commit.assert_not_awaited()


class ContractLinkRequiresSessionTest(unittest.TestCase):
    def test_rejects_without_session_headers(self):
        response = TestClient(app).post(f"/api/bff/biz/ads/{uuid.uuid4()}/contract-link")
        self.assertEqual(response.status_code, 419)


class PublicEndpointsAreUnauthenticatedTest(unittest.TestCase):
    """공개 엔드포인트는 verify_user_session 의존성이 없어야 한다 (세션 헤더 무관 접근).

    실 DB round-trip을 여러 번 거치는 TestClient 호출은 이 테스트 프로세스에서
    이벤트루프 충돌을 일으켜(unittest 동기 TestCase + asyncpg) 별도 이벤트루프를
    새로 만들지 않는 서명 검사로 대체한다 — 404/멱등 동작 자체는 위 두 클래스가
    함수 직접호출로 이미 검증한다.
    """

    def test_lookup_has_no_session_dependency(self):
        params = inspect.signature(ad_contract.get_ad_contract).parameters
        self.assertNotIn("session_uid", params)

    def test_accept_has_no_session_dependency(self):
        params = inspect.signature(ad_contract.accept_ad_contract).parameters
        self.assertNotIn("session_uid", params)


if __name__ == "__main__":
    unittest.main()
