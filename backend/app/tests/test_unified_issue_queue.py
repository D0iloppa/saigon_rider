"""013/016 §8(L5 이슈) #25 — 통합 이슈 인테이크.

완료 검증 조건(016 §9 #25): 신고·티켓·수기 등록 건이 하나의 큐에 심각도 순으로 정렬되어
표시되고 source 로 필터된다. D-27=(a) — 신규 incident 테이블 없이 admin_api/issues.py 가
reports + support_tickets 를 애플리케이션 레벨에서 병합·정렬한다.
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from app.models import Report, SupportTicket
from app.routers.admin_api import issues as issues_router


def _report(reason: str, created_at: datetime) -> Report:
    return Report(
        id=uuid.uuid4(),
        target_type="LISTING",
        reporter_id=uuid.uuid4(),
        reported_user_id=uuid.uuid4(),
        reason=reason,
        status="PENDING",
        created_at=created_at,
    )


def _ticket(*, source: str, severity: str | None, created_at: datetime) -> SupportTicket:
    return SupportTicket(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        title="t",
        body="b",
        status="OPEN",
        source=source,
        persona="USER",
        severity=severity,
        created_at=created_at,
        updated_at=created_at,
    )


class UnifiedIssueQueueTest(unittest.IsolatedAsyncioTestCase):
    async def test_stolen_goods_report_outranks_external_ticket_and_spam(self):
        now = datetime(2026, 8, 18, tzinfo=UTC)
        stolen = _report("STOLEN_GOODS", now)
        spam = _report("SPAM", now - timedelta(hours=1))
        biz_ticket = _ticket(source="BIZ", severity="SEV2", created_at=now - timedelta(hours=1))
        external_ticket = _ticket(source="EXTERNAL", severity="SEV4", created_at=now - timedelta(days=3))

        def _result(rows):
            result = MagicMock()
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=rows)))
            return result

        # list_issues(source=None) 는 reports 쿼리를 먼저, support_tickets 쿼리를 그 다음 실행한다
        # (_fetch_report_rows → _fetch_ticket_rows 순서, admin_api/issues.py 참조).
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_result([stolen, spam]), _result([biz_ticket, external_ticket])])

        rows = await issues_router.list_issues(source=None, limit=50, _session=MagicMock(), db=db)

        ordered_ids = [r.id for r in rows]
        self.assertEqual(ordered_ids[0], stolen.id, "STOLEN_GOODS(SEV1)가 큐 최상단에 와야 한다")
        # SPAM(SEV4, 오프셋 24h + 대기 1h = 25h)이 넷 중 점수가 가장 낮다 — 3일 대기한 SEV4 문의
        # (오프셋 24h + 대기 72h = 96h)보다도 아래. reports 와 tickets 가 같은 정렬 단위를 쓰는지
        # 확인하는 것이 이 테스트의 목적이다.
        self.assertEqual(ordered_ids[-1], spam.id, "가장 낮은 점수(SPAM, 대기 짧음)가 최하단이어야 한다")

    async def test_source_filter_only_returns_matching_kind(self):
        now = datetime(2026, 8, 18, tzinfo=UTC)
        biz_ticket = _ticket(source="BIZ", severity="SEV2", created_at=now)

        result = MagicMock()
        result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[biz_ticket])))
        db = AsyncMock()
        db.execute = AsyncMock(return_value=result)

        rows = await issues_router.list_issues(source="BIZ", limit=50, _session=MagicMock(), db=db)
        self.assertTrue(all(r.source == "BIZ" for r in rows))
        self.assertEqual(len(rows), 1)


if __name__ == "__main__":
    unittest.main()
