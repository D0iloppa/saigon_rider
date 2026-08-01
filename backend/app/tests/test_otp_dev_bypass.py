import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import auth

_REAL_CODE = "999999"
_WRONG_CODE = "000000"
_PHONE = "+84987654321"


def _otp_row():
    return SimpleNamespace(
        otp_hash=auth._hash(_REAL_CODE),
        attempt_count=0,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        verified_at=None,
    )


def _db_mock(otp_row):
    """otp/verify 가 던지는 두 번의 db.execute(조회) 를 순서대로 목킹한다."""
    otp_result = MagicMock()
    otp_result.scalar_one_or_none.return_value = otp_row
    other_user_result = MagicMock()
    other_user_result.scalar_one_or_none.return_value = None  # 번호 충돌 없음

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[otp_result, other_user_result])
    db.get = AsyncMock(return_value=SimpleNamespace(phone=None, phone_verified_at=None))
    db.commit = AsyncMock()
    return db


class OtpDevBypassGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_production_ignores_bypass_flag_wrong_code_fails(self):
        """APP_ENV=production 이면 OTP_DEV_BYPASS=true 여도 우회되지 않는다."""
        otp = _otp_row()
        db = _db_mock(otp)
        body = auth.OtpVerifyIn(phone=_PHONE, code=_WRONG_CODE)
        with (
            patch.object(auth, "_DEV_MODE", False),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
            self.assertRaises(HTTPException) as raised,
        ):
            await auth.verify_otp(body, db, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 401)

    async def test_dev_without_flag_wrong_code_fails(self):
        """dev 환경이어도 OTP_DEV_BYPASS 미설정이면 정상 검증 경로를 그대로 탄다."""
        otp = _otp_row()
        db = _db_mock(otp)
        body = auth.OtpVerifyIn(phone=_PHONE, code=_WRONG_CODE)
        with (
            patch.object(auth, "_DEV_MODE", True),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": ""}),
            self.assertRaises(HTTPException) as raised,
        ):
            await auth.verify_otp(body, db, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 401)

    async def test_dev_with_flag_arbitrary_code_succeeds_and_binds_phone(self):
        """dev + OTP_DEV_BYPASS=true 면 임의 6자리로 성공하고 phone_verified_at 이 실제로 설정된다."""
        otp = _otp_row()
        db = _db_mock(otp)
        session_uid = uuid.uuid4()
        body = auth.OtpVerifyIn(phone=_PHONE, code="123456")  # 실제 코드(999999)와 다름
        with (
            patch.object(auth, "_DEV_MODE", True),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
        ):
            result = await auth.verify_otp(body, db, session_uid)

        self.assertTrue(result.phone_verified)
        bound_user = db.get.return_value
        self.assertIsNotNone(bound_user.phone_verified_at)
        self.assertIsNotNone(otp.verified_at)


def _request_db_mock(recent_count=0, hourly_count=0):
    """otp/request 가 던지는 두 번의 count 조회(쿨다운·시간당 상한)를 순서대로 목킹한다."""
    cooldown_result = MagicMock()
    cooldown_result.scalar_one.return_value = recent_count
    hourly_result = MagicMock()
    hourly_result.scalar_one.return_value = hourly_count
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[cooldown_result, hourly_result])
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


class OtpPhoneFormatBypassTests(unittest.IsolatedAsyncioTestCase):
    """__DEV 우회 활성 시 번호 형식 완화 + request/verify 정규화 일치 검증."""

    _MALFORMED_PHONES = ("12345678", "1234567890", "1234")  # 8자리 / 10자리 / 최소길이

    async def test_dev_with_flag_malformed_phone_request_then_verify_succeeds(self):
        """형식이 어긋난 번호도 dev+flag 면 request 성공 → 그 정규화 번호로 verify 도 성공한다."""
        for raw_phone in self._MALFORMED_PHONES:
            with self.subTest(raw_phone=raw_phone):
                with (
                    patch.object(auth, "_DEV_MODE", True),
                    patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
                    patch.object(auth.sms_client, "send_otp", new=AsyncMock()),
                ):
                    req_db = _request_db_mock()
                    req_body = auth.OtpRequestIn(phone=raw_phone)
                    req_result = await auth.request_otp(req_body, req_db, uuid.uuid4())

                    # request 가 저장한 UserOtp.phone 값 그대로 재사용해 verify — 두 엔드포인트가
                    # 같은 _normalize_vn_phone 을 공유하므로 raw_phone 을 그대로 넣어도 동일 결과.
                    otp = _otp_row()
                    verify_db = _db_mock(otp)
                    verify_body = auth.OtpVerifyIn(phone=raw_phone, code="654321")
                    verify_result = await auth.verify_otp(verify_body, verify_db, uuid.uuid4())

                self.assertEqual(verify_result.phone, req_result.phone)
                self.assertTrue(verify_result.phone_verified)

    async def test_production_ignores_flag_malformed_phone_request_rejected(self):
        """APP_ENV=production 이면 OTP_DEV_BYPASS=true 여도 형식 완화되지 않는다."""
        with (
            patch.object(auth, "_DEV_MODE", False),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
        ):
            req_db = _request_db_mock()
            req_body = auth.OtpRequestIn(phone="12345678")
            with self.assertRaises(HTTPException) as raised:
                await auth.request_otp(req_body, req_db, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "Invalid Vietnamese mobile number")

    async def test_dev_without_flag_malformed_phone_request_rejected(self):
        """dev 환경이어도 OTP_DEV_BYPASS 미설정이면 형식 완화되지 않는다."""
        with (
            patch.object(auth, "_DEV_MODE", True),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": ""}),
        ):
            req_db = _request_db_mock()
            req_body = auth.OtpRequestIn(phone="12345678")
            with self.assertRaises(HTTPException) as raised:
                await auth.request_otp(req_body, req_db, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 400)

    async def test_valid_vn_phone_normalizes_same_regardless_of_bypass(self):
        """정상 VN 번호는 우회 여부와 무관하게 기존과 동일한 E.164 정규형으로 정규화된다."""
        with patch.object(auth, "_DEV_MODE", False), patch.dict(os.environ, {"OTP_DEV_BYPASS": ""}):
            off = auth._normalize_vn_phone("0987654321")
        with patch.object(auth, "_DEV_MODE", True), patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}):
            on = auth._normalize_vn_phone("0987654321")
        self.assertEqual(off, "+84987654321")
        self.assertEqual(on, "+84987654321")

    async def test_empty_or_no_digits_still_rejected_even_with_bypass(self):
        """빈 문자열/숫자 없는 입력은 우회 활성이어도 400 이어야 한다."""
        with patch.object(auth, "_DEV_MODE", True), patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}):
            self.assertIsNone(auth._normalize_vn_phone(""))
            self.assertIsNone(auth._normalize_vn_phone("abc"))
            self.assertIsNone(auth._normalize_vn_phone("12"))  # 3자리 미만

    async def test_country_code_prefix_not_duplicated(self):
        """'+84'+'00000' 같은 입력이 84 중복 없이 정규화되고 request→verify 가 성공한다."""
        raw_phone = "+8400000"
        with (
            patch.object(auth, "_DEV_MODE", True),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
            patch.object(auth.sms_client, "send_otp", new=AsyncMock()),
        ):
            req_db = _request_db_mock()
            req_result = await auth.request_otp(auth.OtpRequestIn(phone=raw_phone), req_db, uuid.uuid4())

            otp = _otp_row()
            verify_db = _db_mock(otp)
            verify_result = await auth.verify_otp(
                auth.OtpVerifyIn(phone=raw_phone, code="111111"), verify_db, uuid.uuid4()
            )

        self.assertEqual(req_result.phone, "+8400000")  # 84 중복 없음 (버그 이전엔 +848400000)
        self.assertEqual(verify_result.phone, req_result.phone)
        self.assertTrue(verify_result.phone_verified)


class OtpSendAndRateLimitBypassTests(unittest.IsolatedAsyncioTestCase):
    """__DEV 우회 활성 시 SMS 실발송 스킵 + 쿨다운/시간당 상한 완화 검증."""

    async def test_bypass_active_skips_sms_send(self):
        """우회 활성 시 sms_client.send_otp 가 호출되지 않는다 — 이번 수정의 핵심 증거."""
        with (
            patch.object(auth, "_DEV_MODE", True),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
            patch.object(auth.sms_client, "send_otp", new=AsyncMock()) as send_mock,
        ):
            req_db = _request_db_mock()
            await auth.request_otp(auth.OtpRequestIn(phone=_PHONE), req_db, uuid.uuid4())
        send_mock.assert_not_called()

    async def test_bypass_inactive_still_sends_sms(self):
        """우회 비활성 시에는 종전대로 send_otp 가 호출된다(회귀 방지)."""
        with (
            patch.object(auth, "_DEV_MODE", False),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": ""}),
            patch.object(auth.sms_client, "send_otp", new=AsyncMock()) as send_mock,
        ):
            req_db = _request_db_mock()
            await auth.request_otp(auth.OtpRequestIn(phone=_PHONE), req_db, uuid.uuid4())
        send_mock.assert_awaited_once()
        self.assertEqual(send_mock.call_args.args[0], _PHONE)

    async def test_bypass_active_skips_rate_limit(self):
        """우회 활성 시 연속 요청이 429 에 걸리지 않는다 — 카운트 조회 자체를 스킵한다."""
        with (
            patch.object(auth, "_DEV_MODE", True),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
            patch.object(auth.sms_client, "send_otp", new=AsyncMock()),
        ):
            req_db = AsyncMock()
            req_db.execute = AsyncMock(
                side_effect=AssertionError("rate limit query should be skipped when bypass active")
            )
            req_db.add = MagicMock()
            req_db.commit = AsyncMock()
            result = await auth.request_otp(auth.OtpRequestIn(phone=_PHONE), req_db, uuid.uuid4())
        self.assertEqual(result.phone, _PHONE)

    async def test_bypass_inactive_cooldown_still_enforced(self):
        """우회 비활성 시에는 60s 쿨다운이 그대로 작동한다 (429)."""
        with patch.object(auth, "_DEV_MODE", False), patch.dict(os.environ, {"OTP_DEV_BYPASS": ""}):
            req_db = _request_db_mock(recent_count=1)
            with self.assertRaises(HTTPException) as raised:
                await auth.request_otp(auth.OtpRequestIn(phone=_PHONE), req_db, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 429)

    async def test_bypass_inactive_hourly_cap_still_enforced(self):
        """우회 비활성 시에는 시간당 5회 상한이 그대로 작동한다 (429)."""
        with patch.object(auth, "_DEV_MODE", False), patch.dict(os.environ, {"OTP_DEV_BYPASS": ""}):
            req_db = _request_db_mock(recent_count=0, hourly_count=5)
            with self.assertRaises(HTTPException) as raised:
                await auth.request_otp(auth.OtpRequestIn(phone=_PHONE), req_db, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 429)

    async def test_production_flag_true_sms_not_skipped(self):
        """APP_ENV=production + flag true 여도 SMS 스킵이 적용되지 않는다."""
        with (
            patch.object(auth, "_DEV_MODE", False),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
            patch.object(auth.sms_client, "send_otp", new=AsyncMock()) as send_mock,
        ):
            req_db = _request_db_mock()
            await auth.request_otp(auth.OtpRequestIn(phone=_PHONE), req_db, uuid.uuid4())
        send_mock.assert_awaited_once()

    async def test_production_flag_true_rate_limit_not_relaxed(self):
        """APP_ENV=production + flag true 여도 rate-limit 완화가 적용되지 않는다 (429)."""
        with patch.object(auth, "_DEV_MODE", False), patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}):
            req_db = _request_db_mock(recent_count=1)
            with self.assertRaises(HTTPException) as raised:
                await auth.request_otp(auth.OtpRequestIn(phone=_PHONE), req_db, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 429)


if __name__ == "__main__":
    unittest.main()
