"""정본 §5 #3, D-11 — 신고 큐 우선순위 정렬 + 적체 경보.

완료 검증 조건: ① FRAUD 신규 건이 3일 묵은 SPAM 보다 위에 온다 ② PENDING 24h 초과 시
경보 1회 발송(중복 억제 포함) ③ 이 기능이 어떤 신고 대상의 status 도 자동으로 바꾸지 않는다
(D-11 스코프 — 자동 숨김/자동 조치는 범위 밖).
"""

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from app.jobs import alert_report_backlog
from app.routers.admin_api import reports


class ReportPriorityScoreTest(unittest.TestCase):
    """SQL 표현식(_priority_score_column)과 같은 가중치 테이블을 쓰는 순수 함수로 검증한다."""

    def test_fraud_new_outranks_spam_three_days_old(self):
        now = datetime(2026, 8, 17, tzinfo=UTC)
        fraud_new = reports._priority_score("FRAUD", now, now=now)
        spam_3d = reports._priority_score("SPAM", now - timedelta(days=3), now=now)
        self.assertGreater(fraud_new, spam_3d)

    def test_fraud_like_reasons_outrank_spam_like_reasons(self):
        now = datetime(2026, 8, 17, tzinfo=UTC)
        for high in ("FRAUD", "SCAM"):
            for low in ("SPAM", "DUPLICATE"):
                self.assertGreater(
                    reports._priority_score(high, now, now=now),
                    reports._priority_score(low, now, now=now),
                )

    def test_unknown_reason_falls_back_to_default_weight(self):
        now = datetime(2026, 8, 17, tzinfo=UTC)
        self.assertEqual(
            reports._priority_score("SOME_NEW_REASON", now, now=now),
            reports._DEFAULT_REASON_PRIORITY_HOURS,
        )

    def test_same_reason_older_wait_scores_higher(self):
        now = datetime(2026, 8, 17, tzinfo=UTC)
        older = reports._priority_score("SPAM", now - timedelta(days=1), now=now)
        newer = reports._priority_score("SPAM", now, now=now)
        self.assertGreater(older, newer)


class ReportListSortParamTest(unittest.IsolatedAsyncioTestCase):
    async def test_default_sort_is_priority_and_available_as_query_param(self):
        import inspect

        sig = inspect.signature(reports.list_reports)
        sort_param = sig.parameters["sort"]
        self.assertEqual(sort_param.default.default, "priority")


class ReportBacklogAlertTest(unittest.IsolatedAsyncioTestCase):
    async def test_no_backlog_sends_no_alert(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=AsyncMock(scalar_one=lambda: 0))
        with (
            patch("app.jobs.alert_report_backlog.AsyncSessionLocal") as session_factory,
            patch.object(alert_report_backlog, "send_ops_alert", AsyncMock()) as mock_alert,
        ):
            session_factory.return_value.__aenter__ = AsyncMock(return_value=db)
            session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
            count = await alert_report_backlog.check_report_backlog()
        self.assertEqual(count, 0)
        mock_alert.assert_not_awaited()

    async def test_backlog_present_sends_alert_with_dedup_key(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=AsyncMock(scalar_one=lambda: 3))
        with (
            patch("app.jobs.alert_report_backlog.AsyncSessionLocal") as session_factory,
            patch.object(alert_report_backlog, "send_ops_alert", AsyncMock()) as mock_alert,
        ):
            session_factory.return_value.__aenter__ = AsyncMock(return_value=db)
            session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
            count = await alert_report_backlog.check_report_backlog()
        self.assertEqual(count, 3)
        mock_alert.assert_awaited_once()
        _text, kwargs = mock_alert.await_args.args, mock_alert.await_args.kwargs
        self.assertEqual(kwargs["key"], "report_backlog")
        self.assertEqual(kwargs["cooldown_s"], 24 * 60 * 60)
        self.assertIn("3", _text[0])

    async def test_repeated_calls_are_deduped_by_real_send_ops_alert_cooldown(self):
        """새 채널을 만들지 않고 기존 send_ops_alert 쓰로틀을 그대로 타는지 — 목킹 없이 확인."""
        from app.services import ops_alerts

        ops_alerts._last_sent.clear()
        db = AsyncMock()
        db.execute = AsyncMock(return_value=AsyncMock(scalar_one=lambda: 1))
        with (
            patch("app.jobs.alert_report_backlog.AsyncSessionLocal") as session_factory,
            patch.object(ops_alerts, "_WEBHOOK_URL", ""),
        ):
            session_factory.return_value.__aenter__ = AsyncMock(return_value=db)
            session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
            with patch("app.services.ops_alerts.log") as mock_log:
                await alert_report_backlog.check_report_backlog()
                await alert_report_backlog.check_report_backlog()
                # 웹훅 미설정이라도 쿨다운 자체는 key 등록 시점에 걸린다 — 두 번째 호출은 조기 return.
                self.assertEqual(mock_log.info.call_count, 1)


class ReportBacklogNoAutoActionTest(unittest.IsolatedAsyncioTestCase):
    """D-11 스코프 고정 — 이 배치는 Report(혹은 다른 어떤 모델)의 status 도 바꾸지 않는다."""

    async def test_check_report_backlog_never_writes(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=AsyncMock(scalar_one=lambda: 2))
        with (
            patch("app.jobs.alert_report_backlog.AsyncSessionLocal") as session_factory,
            patch.object(alert_report_backlog, "send_ops_alert", AsyncMock()),
        ):
            session_factory.return_value.__aenter__ = AsyncMock(return_value=db)
            session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
            await alert_report_backlog.check_report_backlog()
        db.add.assert_not_called()
        db.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
