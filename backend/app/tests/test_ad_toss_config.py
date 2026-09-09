"""토스 배선 판정(config.toss_mode) 회귀 — 260907_toss_payment_rail_design.md §5-1/§8 P2-2.

키·환경변수를 patch.dict 로 명시 구성한다(기존 관례, test_ad_contract.py 헤더 참조).
"""

import os
import unittest
from unittest.mock import patch

from app.services.ad_payments import config

_TOSS_ENV = ("AD_PAYMENT_TOSS_CLIENT_KEY", "AD_PAYMENT_TOSS_SECRET_KEY", "AD_PAYMENT_TOSS_STUB", "APP_ENV")


class TossModeTests(unittest.TestCase):
    def test_live_pair_in_production_uses_http_gateway(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "live_ck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "live_sk_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "production",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "live")
            self.assertTrue(config.toss_wiring_ready())

    def test_test_pair_in_development_uses_http_gateway(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "test_ck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "test_sk_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "development",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "live")

    def test_test_pair_in_production_is_off(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "test_ck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "test_sk_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "production",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_live_pair_in_development_is_off(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "live_ck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "live_sk_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "development",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_mixed_test_live_pair_is_off(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "test_ck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "live_sk_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "development",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_unknown_app_env_is_off(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "test_ck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "test_sk_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "stagin-typo",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_role_swapped_keys_are_off(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "test_sk_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "test_ck_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "development",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_widget_keys_are_off_for_legacy_payment_window_sdk(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "test_gck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "test_gsk_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "development",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_only_client_key_is_off(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "test_ck_dummy",
            "AD_PAYMENT_TOSS_SECRET_KEY": "",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "production",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")
            self.assertFalse(config.toss_wiring_ready())

    def test_only_secret_key_is_off(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "",
            "AD_PAYMENT_TOSS_SECRET_KEY": "test_sk_dummy",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "production",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_stub_flag_in_dev_env_is_stub(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "",
            "AD_PAYMENT_TOSS_SECRET_KEY": "",
            "AD_PAYMENT_TOSS_STUB": "1",
            "APP_ENV": "development",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "stub")
            self.assertTrue(config.toss_wiring_ready())

    def test_stub_flag_ignored_in_production(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "",
            "AD_PAYMENT_TOSS_SECRET_KEY": "",
            "AD_PAYMENT_TOSS_STUB": "1",
            "APP_ENV": "production",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_no_keys_no_stub_is_off(self):
        env = {
            "AD_PAYMENT_TOSS_CLIENT_KEY": "",
            "AD_PAYMENT_TOSS_SECRET_KEY": "",
            "AD_PAYMENT_TOSS_STUB": "",
            "APP_ENV": "development",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(config.toss_mode(), "off")

    def test_client_key_getter_hides_secret(self):
        env = {"AD_PAYMENT_TOSS_CLIENT_KEY": "test_ck_dummy", "AD_PAYMENT_TOSS_SECRET_KEY": "test_sk_dummy"}
        with patch.dict(os.environ, env):
            self.assertEqual(config.get_toss_client_key(), "test_ck_dummy")
            self.assertEqual(config.get_toss_secret_key(), "test_sk_dummy")
        with patch.dict(os.environ, {"AD_PAYMENT_TOSS_CLIENT_KEY": ""}):
            self.assertIsNone(config.get_toss_client_key())


if __name__ == "__main__":
    unittest.main()
