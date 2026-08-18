"""013/016 §8(L5 이슈) #26 — 처리 결과 코드 없이 종결 불가(B4 원칙).

완료 검증 조건(016 §9 #26): "미입력 종결 API 가 422". 신고 큐(reports)와 통합 문의
큐(support_tickets) 양쪽에 동일 원칙을 강제한다(admin_api/reports.py, admin_api/support.py).
"""

import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.models import Report, SupportTicket
from app.routers.admin_api import reports as reports_router
from app.routers.admin_api import support as support_router


def _fake_session():
    session = MagicMock()
    session.username = "ops_admin"
    session.role = "OPS"
    return session


class ReportResultCodeRequiredTest(unittest.IsolatedAsyncioTestCase):
    async def test_resolve_without_result_code_is_422(self):
        report = Report(
            id=uuid.uuid4(),
            target_type="LISTING",
            reporter_id=uuid.uuid4(),
            reported_user_id=uuid.uuid4(),
            reason="FRAUD",
            status="PENDING",
            created_at=datetime.now(UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=report)

        body = reports_router.ReportStatusUpdate(status="RESOLVED")
        with patch.object(reports_router, "audit", new=AsyncMock()), self.assertRaises(HTTPException) as ctx:
            await reports_router.update_report_status(
                report.id, body, request=MagicMock(), session=_fake_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_resolve_with_result_code_succeeds(self):
        report = Report(
            id=uuid.uuid4(),
            target_type="LISTING",
            reporter_id=uuid.uuid4(),
            reported_user_id=uuid.uuid4(),
            reason="FRAUD",
            status="PENDING",
            created_at=datetime.now(UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=report)

        body = reports_router.ReportStatusUpdate(status="RESOLVED", result_code="WARNING_ISSUED")
        with patch.object(reports_router, "audit", new=AsyncMock()):
            result = await reports_router.update_report_status(
                report.id, body, request=MagicMock(), session=_fake_session(), db=db
            )
        self.assertEqual(result["status"], "RESOLVED")
        self.assertEqual(report.result_code, "WARNING_ISSUED")

    async def test_reject_without_result_code_is_422(self):
        report = Report(
            id=uuid.uuid4(),
            target_type="LISTING",
            reporter_id=uuid.uuid4(),
            reported_user_id=uuid.uuid4(),
            reason="SPAM",
            status="PENDING",
            created_at=datetime.now(UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=report)

        body = reports_router.ReportStatusUpdate(status="REJECTED")
        with patch.object(reports_router, "audit", new=AsyncMock()), self.assertRaises(HTTPException) as ctx:
            await reports_router.update_report_status(
                report.id, body, request=MagicMock(), session=_fake_session(), db=db
            )
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_reviewing_transition_does_not_require_result_code(self):
        """REVIEWING 은 종결이 아니다 — B4 는 종결에만 적용."""
        report = Report(
            id=uuid.uuid4(),
            target_type="LISTING",
            reporter_id=uuid.uuid4(),
            reported_user_id=uuid.uuid4(),
            reason="SPAM",
            status="PENDING",
            created_at=datetime.now(UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=report)

        body = reports_router.ReportStatusUpdate(status="REVIEWING")
        with patch.object(reports_router, "audit", new=AsyncMock()):
            result = await reports_router.update_report_status(
                report.id, body, request=MagicMock(), session=_fake_session(), db=db
            )
        self.assertEqual(result["status"], "REVIEWING")


class TicketResultCodeRequiredTest(unittest.IsolatedAsyncioTestCase):
    async def test_resolve_without_severity_or_result_code_is_422(self):
        ticket = SupportTicket(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            title="t",
            body="b",
            status="OPEN",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=ticket)

        body = support_router.StatusUpdate(status="RESOLVED")
        with patch.object(support_router, "audit", new=AsyncMock()), self.assertRaises(HTTPException) as ctx:
            await support_router.update_status(ticket.id, body, request=MagicMock(), session=_fake_session(), db=db)
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_resolve_with_severity_and_result_code_succeeds(self):
        ticket = SupportTicket(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            title="t",
            body="b",
            status="OPEN",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=ticket)

        body = support_router.StatusUpdate(status="RESOLVED", severity="SEV3", result_code="NO_ACTION")
        with (
            patch.object(support_router, "audit", new=AsyncMock()),
            patch.object(support_router, "get_ticket", new=AsyncMock(return_value="ok")),
        ):
            result = await support_router.update_status(
                ticket.id, body, request=MagicMock(), session=_fake_session(), db=db
            )
        self.assertEqual(result, "ok")
        self.assertEqual(ticket.status, "RESOLVED")
        self.assertEqual(ticket.result_code, "NO_ACTION")


if __name__ == "__main__":
    unittest.main()
