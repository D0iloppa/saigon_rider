"""P1: 번역 워밍 실패가 조용히 삼켜지던 지점(translate.warm_translations)을 운영 알림으로 승격.

3주간 Google Translate 403 이 원문 폴백으로 조용히 흡수돼 아무도 몰랐던 사고(260801 설계문서 §2.1)
재발 방지. 쓰로틀은 기존 ops_alerts.send_ops_alert 의 60초 cooldown 을 그대로 재사용한다(신규
알림 인프라 없음).
"""

import unittest
from unittest.mock import AsyncMock, patch

from app.services import translate


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class WarmTranslationsOpsAlertTest(unittest.IsolatedAsyncioTestCase):
    async def test_provider_failure_triggers_ops_alert(self):
        with (
            patch("app.database.AsyncSessionLocal", return_value=_SessionContext(AsyncMock())),
            patch.object(translate, "translate_all", AsyncMock(side_effect=RuntimeError("403 Forbidden"))),
            patch.object(translate, "send_ops_alert", AsyncMock()) as mock_alert,
        ):
            await translate.warm_translations(["자전거"])

        mock_alert.assert_awaited_once()
        args, kwargs = mock_alert.await_args
        self.assertIn("번역 워밍 실패", args[0])
        self.assertEqual(kwargs.get("key"), "translate.warm_fail")

    async def test_success_does_not_alert(self):
        with (
            patch("app.database.AsyncSessionLocal", return_value=_SessionContext(AsyncMock())),
            patch.object(translate, "translate_all", AsyncMock(return_value={"kr": "x", "en": "x", "vi": "x"})),
            patch.object(translate, "send_ops_alert", AsyncMock()) as mock_alert,
        ):
            await translate.warm_translations(["hello"])

        mock_alert.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
