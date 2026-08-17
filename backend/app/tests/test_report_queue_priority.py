"""정본 §5 #3, D-11 — 신고 큐 우선순위 정렬 + 적체 경보.

완료 검증 조건: ① FRAUD 신규 건이 3일 묵은 SPAM 보다 위에 온다 ② PENDING 24h 초과 시
경보 1회 발송(중복 억제 포함) ③ 이 기능이 어떤 신고 대상의 status 도 자동으로 바꾸지 않는다
(D-11 스코프 — 자동 숨김/자동 조치는 범위 밖).
"""

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

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
    async def test_sort_param_default_is_none_so_status_can_pick_it(self):
        """code-review high 지적 #9: sort 미지정 시 status 에 따라 기본 정렬이 갈려야 하므로
        시그니처 기본값 자체는 None 이어야 한다(명시 지정과 구분 불가능해지는 것을 막는다)."""
        import inspect

        sig = inspect.signature(reports.list_reports)
        sort_param = sig.parameters["sort"]
        self.assertIsNone(sort_param.default.default)


class ReportListDefaultSortByStatusTest(unittest.IsolatedAsyncioTestCase):
    """code-review high 지적 #9: PENDING 계열 조회는 우선순위 정렬, 종결(RESOLVED/REJECTED)
    조회는 최신순이 기본이어야 한다. sort 를 명시하면 그 값이 항상 우선한다."""

    async def _list_query_order_sql(self, *, status, sort):
        captured = {}
        count_result = MagicMock()
        count_result.scalar_one = MagicMock(return_value=0)
        list_result = MagicMock()
        list_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

        async def _fake_execute(query):
            if "count" not in captured:
                captured["count"] = query
                return count_result
            captured["list_query"] = query
            return list_result

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=_fake_execute)
        await reports.list_reports(
            target_type=None,
            status=status,
            reported_user_id=None,
            page=1,
            size=20,
            sort=sort,
            _session=MagicMock(),
            db=db,
        )
        return str(captured["list_query"]).upper()

    async def test_pending_status_defaults_to_priority_sort(self):
        sql = await self._list_query_order_sql(status="PENDING", sort=None)
        self.assertNotIn("ORDER BY REPORTS.CREATED_AT DESC", sql)

    async def test_resolved_status_defaults_to_recent_sort(self):
        sql = await self._list_query_order_sql(status="RESOLVED", sort=None)
        self.assertIn("ORDER BY REPORTS.CREATED_AT DESC", sql)

    async def test_explicit_priority_sort_overrides_resolved_default(self):
        sql = await self._list_query_order_sql(status="RESOLVED", sort="priority")
        self.assertNotIn("ORDER BY REPORTS.CREATED_AT DESC", sql)


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
