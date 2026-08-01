"""F-17(신고 접수 운영자 알림) / F-18(미처리 예외 알림) 테스트.

F-17: Report INSERT 시 report.submitted 이벤트가 outbox 에 적재되는지(모든 report 엔드포인트를
개별 배선하는 대신 모델 레벨 after_insert 훅으로 일괄 커버 — market.py 포함, 파일을 건드리지 않음),
noti_worker 가 그 이벤트를 운영자 웹훅으로 발행하는지.
F-18: ops_alerts.send_ops_alert 의 웹훅 무동작/발송/쓰로틀, main.py 전역 예외 핸들러가
500 을 반환하면서 알림을 시도하는지.
"""

import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app import models
from app.models import Report
from app.noti_worker import __main__ as noti_worker
from app.services import ops_alerts


class ReportAfterInsertAlertTest(unittest.TestCase):
    """market.py 는 소유권상 손댈 수 없어, Report INSERT 자체에 훅을 걸어 전수 커버한다."""

    def test_after_insert_hook_is_registered_on_report(self):
        from sqlalchemy import event

        self.assertTrue(event.contains(Report, "after_insert", models._report_after_insert_alert_ops))

    def test_enqueues_report_submitted_outbox_row_via_same_connection(self):
        target = MagicMock()
        target.id = uuid.UUID("11111111-1111-1111-1111-111111111111")
        target.target_type = "LISTING"
        target.reason = "FRAUD"
        target.reporter_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
        target.reported_user_id = uuid.UUID("33333333-3333-3333-3333-333333333333")

        connection = MagicMock()
        models._report_after_insert_alert_ops(mapper=MagicMock(), connection=connection, target=target)

        connection.execute.assert_called_once()
        stmt = connection.execute.call_args.args[0]
        # Core insert() 컴파일 없이 values 딕트를 직접 검사
        compiled_params = stmt.compile().params
        self.assertEqual(compiled_params["event_type"], "report.submitted")
        self.assertEqual(compiled_params["payload"]["target_type"], "LISTING")
        self.assertEqual(compiled_params["payload"]["reason"], "FRAUD")
        self.assertEqual(compiled_params["payload"]["report_id"], str(target.id))


class NotiWorkerReportHandlerTest(unittest.IsolatedAsyncioTestCase):
    async def test_report_submitted_handler_sends_ops_alert(self):
        with patch.object(noti_worker, "send_ops_alert", AsyncMock()) as mock_alert:
            await noti_worker._handle_report_submitted(
                {"target_type": "USER", "reason": "ABUSE", "report_id": "abc-123"},
                source_event_id="1",
            )
        mock_alert.assert_awaited_once()
        text = mock_alert.await_args.args[0]
        self.assertIn("USER", text)
        self.assertIn("ABUSE", text)
        self.assertIn("abc-123", text)

    def test_report_submitted_registered_in_handlers(self):
        self.assertIs(noti_worker.HANDLERS["report.submitted"], noti_worker._handle_report_submitted)


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
            await ops_alerts.send_ops_alert("hello world")
        mock_client.post.assert_awaited_once_with("http://example.invalid/webhook", json={"text": "hello world"})

    async def test_cooldown_suppresses_repeat_alert_with_same_key(self):
        ops_alerts._last_sent.clear()
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post = AsyncMock()
        with (
            patch.object(ops_alerts, "_WEBHOOK_URL", "http://example.invalid/webhook"),
            patch("app.services.ops_alerts.httpx.AsyncClient", return_value=mock_client),
        ):
            await ops_alerts.send_ops_alert("first", key="k1", cooldown_s=60.0)
            await ops_alerts.send_ops_alert("second", key="k1", cooldown_s=60.0)
        mock_client.post.assert_awaited_once()

    async def test_cooldown_allows_alert_after_window_elapses(self):
        ops_alerts._last_sent.clear()
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post = AsyncMock()
        with (
            patch.object(ops_alerts, "_WEBHOOK_URL", "http://example.invalid/webhook"),
            patch("app.services.ops_alerts.httpx.AsyncClient", return_value=mock_client),
            patch.object(ops_alerts.time, "monotonic", side_effect=[0.0, 100.0]),
        ):
            await ops_alerts.send_ops_alert("first", key="k2", cooldown_s=60.0)
            await ops_alerts.send_ops_alert("second", key="k2", cooldown_s=60.0)
        self.assertEqual(mock_client.post.await_count, 2)


class BffUnhandledExceptionHandlerTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_500_and_alerts(self):
        from app.main import _unhandled_exception_alert

        request = MagicMock()
        request.method = "GET"
        request.url.path = "/api/boom"
        with patch("app.main.send_ops_alert", AsyncMock()) as mock_alert:
            resp = await _unhandled_exception_alert(request, ValueError("boom"))
        self.assertEqual(resp.status_code, 500)
        mock_alert.assert_awaited_once()
        self.assertIn("boom", mock_alert.await_args.args[0])


if __name__ == "__main__":
    unittest.main()
