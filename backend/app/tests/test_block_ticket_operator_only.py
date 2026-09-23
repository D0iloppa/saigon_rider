"""대표 판정(260924) — 차단 자동 CS 티켓은 운영자 큐 전용, 블로커의 "내 문의"에 뜨면 안 된다.

`SupportTicket.user_id=None`(nullable, EXTERNAL 채널과 같은 관례)로 만든 티켓이
① `support.py list_tickets`(user_id 필터) 에서는 빠지고 ② `admin_api/issues.py`
통합 큐에서는 그대로 보이는지 확인한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

from app.models import SupportTicket
from app.routers import support
from app.routers.admin_api import issues as issues_router


class BlockTicketOperatorOnlyTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_tickets_query_excludes_null_user_tickets(self):
        # 블로커 본인의 "내 문의" 조회 — SQL `user_id == <자신>` 조건은 user_id=NULL 행과
        # 절대 일치하지 않는다(SQL NULL 비교 규칙). 쿼리에 그 조건이 실제로 실려 있는지 확인한다.
        blocker_id = uuid.uuid4()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db = AsyncMock()
        db.execute.return_value = result

        await support.list_tickets(user_id=blocker_id, db=db)

        sql = str(db.execute.await_args_list[0].args[0])
        self.assertIn("support_tickets.user_id", sql)

    async def test_admin_issue_queue_still_surfaces_operator_only_ticket(self):
        now = datetime(2026, 9, 24, tzinfo=UTC)
        ticket = SupportTicket(
            id=uuid.uuid4(),
            user_id=None,
            title="차단으로 거래가 취소됐어요",
            body="b",
            status="OPEN",
            category="X-BLOCK-TRADE",
            severity="SEV2",
            source="APP",
            persona="USER",
            contract_context={"blocker_id": str(uuid.uuid4()), "blocked_user_id": str(uuid.uuid4())},
            created_at=now,
            updated_at=now,
        )

        def _result(rows):
            result = MagicMock()
            result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=rows)))
            return result

        # list_issues 는 reports 쿼리를 먼저, support_tickets 쿼리를 그 다음 실행한다
        # (_fetch_report_rows → _fetch_ticket_rows 순서).
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_result([]), _result([ticket])])

        rows = await issues_router.list_issues(source=None, assignee=None, limit=50, session=MagicMock(), db=db)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].id, ticket.id)
        self.assertEqual(rows[0].category, "X-BLOCK-TRADE")


if __name__ == "__main__":
    unittest.main()
