import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.routers import app_version, auth


def _db_mock():
    """get_app_config 이 던지는 단일 select(AppConfig) 조회를 빈 결과로 목킹한다."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


class AppConfigOtpBypassFieldTests(unittest.IsolatedAsyncioTestCase):
    async def test_dev_with_flag_field_true(self):
        """dev + OTP_DEV_BYPASS=true 면 otp_dev_bypass 가 true."""
        with (
            patch.object(auth, "_DEV_MODE", True),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
        ):
            cfg = await app_version.get_app_config(_db_mock())
        self.assertTrue(cfg["otp_dev_bypass"])

    async def test_production_ignores_flag_field_false(self):
        """APP_ENV=production 이면 OTP_DEV_BYPASS=true 여도 otp_dev_bypass 가 false."""
        with (
            patch.object(auth, "_DEV_MODE", False),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": "true"}),
        ):
            cfg = await app_version.get_app_config(_db_mock())
        self.assertFalse(cfg["otp_dev_bypass"])

    async def test_dev_without_flag_field_false(self):
        """dev 환경이어도 OTP_DEV_BYPASS 미설정이면 otp_dev_bypass 가 false."""
        with (
            patch.object(auth, "_DEV_MODE", True),
            patch.dict(os.environ, {"OTP_DEV_BYPASS": ""}),
        ):
            cfg = await app_version.get_app_config(_db_mock())
        self.assertFalse(cfg["otp_dev_bypass"])

    async def test_existing_is_dev_field_unchanged(self):
        """기존 is_dev 필드가 새 필드 추가로 영향받지 않는다(회귀)."""
        with patch.dict(os.environ, {"APP_ENV": "production"}):
            cfg = await app_version.get_app_config(_db_mock())
        self.assertFalse(cfg["is_dev"])
        with patch.dict(os.environ, {"APP_ENV": "development"}):
            cfg = await app_version.get_app_config(_db_mock())
        self.assertTrue(cfg["is_dev"])


if __name__ == "__main__":
    unittest.main()
