"""F-21(Engine DLQ 조회) / F-18(Engine 미처리 예외 알림) 테스트."""

import unittest
from unittest.mock import AsyncMock, patch

from app.routers import admin
from app.services import ops_alerts


class AdminStreamDlqMessagesTest(unittest.IsolatedAsyncioTestCase):
    async def test_reads_dlq_stream_with_prefix(self):
        fake_redis = AsyncMock()
        fake_redis.xrevrange = AsyncMock(return_value=[("1-0", {"type": "gps", "deliveries": "5"})])
        with patch("app.redis_client.get_redis", AsyncMock(return_value=fake_redis)):
            result = await admin.admin_stream_dlq_messages(count=10)

        fake_redis.xrevrange.assert_awaited_once_with("sre:messages:dlq", count=10)
        self.assertEqual(result, [{"id": "1-0", "type": "gps", "deliveries": "5"}])


class OpsAlertWebhookTest(unittest.IsolatedAsyncioTestCase):
    async def test_no_webhook_url_skips_http_call(self):
        with (
            patch.object(ops_alerts, "_WEBHOOK_URL", ""),
            patch("app.services.ops_alerts.httpx.AsyncClient") as mock_client_cls,
        ):
            await ops_alerts.send_ops_alert("hello")
        mock_client_cls.assert_not_called()

    async def test_webhook_url_set_posts_text(self):
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post = AsyncMock()
        with (
            patch.object(ops_alerts, "_WEBHOOK_URL", "http://example.invalid/webhook"),
            patch("app.services.ops_alerts.httpx.AsyncClient", return_value=mock_client),
        ):
            await ops_alerts.send_ops_alert("engine boom")
        mock_client.post.assert_awaited_once_with("http://example.invalid/webhook", json={"text": "engine boom"})


class EngineUnhandledExceptionHandlerTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_500_and_alerts(self):
        from unittest.mock import MagicMock

        from app.main import unhandled_exception_alert

        request = MagicMock()
        request.method = "GET"
        request.url.path = "/v1/boom"
        with patch("app.main.send_ops_alert", AsyncMock()) as mock_alert:
            resp = await unhandled_exception_alert(request, ValueError("engine boom"))
        self.assertEqual(resp.status_code, 500)
        mock_alert.assert_awaited_once()
        self.assertIn("engine boom", mock_alert.await_args.args[0])


if __name__ == "__main__":
    unittest.main()
