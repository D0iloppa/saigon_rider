"""줍고 이식 P2 — 문의/신고 담당자 배정.

이 파일이 고정하는 계약:
 1) PATCH .../assignee 는 assignee_username 컬럼을 세팅하고 SUPPORT_ASSIGN/REPORT_ASSIGN 감사로그를
    {"from": prev, "to": new} 로 남긴다.
 2) assignee_username=None(또는 공백)을 주면 배정이 해제된다.
 3) issues.list_issues(assignee=...) 는 "me"=세션 유저, "unassigned"=NULL, 그 외=정확매칭으로 필터한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.models import AdminAuditLog
from app.routers.admin_api import issues, reports, support


def _request():
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))


def _session(username="root"):
    return SimpleNamespace(username=username, role="root")


def _ticket_fixture(**overrides):
    defaults = dict(
        id=uuid.uuid4(),
        user_id=None,
        user=None,
        title="문의",
        body="본문",
        status="OPEN",
        has_unread_reply=False,
        created_at=datetime.now(UTC),
        category=None,
        severity=None,
        source="APP",
        persona="USER",
        result_code=None,
        contract_context=None,
        assignee_username=None,
        replies=[],
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _report_fixture(**overrides):
    defaults = dict(
        id=uuid.uuid4(),
        target_type="LISTING",
        reporter_id=uuid.uuid4(),
        reported_user_id=uuid.uuid4(),
        listing_id=None,
        conversation_id=None,
        reason="SPAM",
        note=None,
        status="PENDING",
        created_at=datetime.now(UTC),
        handled_by=None,
        handled_at=None,
        result_code=None,
        assignee_username=None,
        images=[],
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class AssignTicketTest(unittest.IsolatedAsyncioTestCase):
    async def test_sets_assignee_and_audits(self):
        ticket = _ticket_fixture()
        db = AsyncMock()
        db.get = AsyncMock(return_value=ticket)
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))
        detail_res = MagicMock()
        detail_res.scalar_one_or_none = MagicMock(return_value=ticket)
        db.execute = AsyncMock(return_value=detail_res)

        await support.assign_ticket(
            ticket.id, support.AssigneeUpdate(assignee_username="alice"), _request(), session=_session(), db=db
        )

        self.assertEqual(ticket.assignee_username, "alice")
        audits = [o for o in added if isinstance(o, AdminAuditLog)]
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0].action, "SUPPORT_ASSIGN")
        self.assertEqual(audits[0].detail, {"from": None, "to": "alice"})
        db.commit.assert_awaited_once()

    async def test_none_clears_assignee(self):
        ticket = _ticket_fixture(assignee_username="alice")
        db = AsyncMock()
        db.get = AsyncMock(return_value=ticket)
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))
        detail_res = MagicMock()
        detail_res.scalar_one_or_none = MagicMock(return_value=ticket)
        db.execute = AsyncMock(return_value=detail_res)

        await support.assign_ticket(
            ticket.id, support.AssigneeUpdate(assignee_username=None), _request(), session=_session(), db=db
        )

        self.assertIsNone(ticket.assignee_username)
        audits = [o for o in added if isinstance(o, AdminAuditLog)]
        self.assertEqual(audits[0].detail, {"from": "alice", "to": None})

    async def test_blank_string_normalizes_to_none(self):
        ticket = _ticket_fixture(assignee_username="alice")
        db = AsyncMock()
        db.get = AsyncMock(return_value=ticket)
        db.add = MagicMock()
        detail_res = MagicMock()
        detail_res.scalar_one_or_none = MagicMock(return_value=ticket)
        db.execute = AsyncMock(return_value=detail_res)

        await support.assign_ticket(
            ticket.id, support.AssigneeUpdate(assignee_username="   "), _request(), session=_session(), db=db
        )

        self.assertIsNone(ticket.assignee_username)


class AssignReportTest(unittest.IsolatedAsyncioTestCase):
    async def test_sets_assignee_and_audits(self):
        report = _report_fixture()
        db = AsyncMock()
        db.get = AsyncMock(return_value=report)
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        result = await reports.assign_report(
            report.id, reports.AssigneeUpdate(assignee_username="bob"), _request(), session=_session(), db=db
        )

        self.assertEqual(report.assignee_username, "bob")
        self.assertEqual(result["assignee_username"], "bob")
        audits = [o for o in added if isinstance(o, AdminAuditLog)]
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0].action, "REPORT_ASSIGN")
        self.assertEqual(audits[0].detail, {"from": None, "to": "bob"})
        db.commit.assert_awaited_once()

    async def test_none_clears_assignee(self):
        report = _report_fixture(assignee_username="bob")
        db = AsyncMock()
        db.get = AsyncMock(return_value=report)
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        result = await reports.assign_report(
            report.id, reports.AssigneeUpdate(assignee_username=None), _request(), session=_session(), db=db
        )

        self.assertIsNone(report.assignee_username)
        self.assertIsNone(result["assignee_username"])
        audits = [o for o in added if isinstance(o, AdminAuditLog)]
        self.assertEqual(audits[0].detail, {"from": "bob", "to": None})


class ListIssuesAssigneeFilterTest(unittest.IsolatedAsyncioTestCase):
    def _db(self, report_rows, ticket_rows):
        db = AsyncMock()
        report_res = MagicMock()
        report_res.scalars.return_value.all.return_value = report_rows
        ticket_res = MagicMock()
        ticket_res.scalars.return_value.all.return_value = ticket_rows
        db.execute = AsyncMock(side_effect=[report_res, ticket_res])
        return db

    async def test_me_filters_to_session_username(self):
        mine = _report_fixture(assignee_username="root")
        others = _report_fixture(assignee_username="alice")
        db = self._db([mine, others], [])

        rows = await issues.list_issues(source=None, assignee="me", limit=50, session=_session("root"), db=db)

        self.assertEqual([r.id for r in rows], [mine.id])

    async def test_unassigned_filters_null_only(self):
        unassigned = _ticket_fixture(assignee_username=None)
        assigned = _ticket_fixture(assignee_username="alice")
        db = self._db([], [unassigned, assigned])

        rows = await issues.list_issues(source=None, assignee="unassigned", limit=50, session=_session(), db=db)

        self.assertEqual([r.id for r in rows], [unassigned.id])

    async def test_exact_match_filters_named_assignee(self):
        target = _report_fixture(assignee_username="bob")
        other = _report_fixture(assignee_username="alice")
        db = self._db([target, other], [])

        rows = await issues.list_issues(source=None, assignee="bob", limit=50, session=_session(), db=db)

        self.assertEqual([r.id for r in rows], [target.id])


if __name__ == "__main__":
    unittest.main()
