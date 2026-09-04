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
    def _db_with(self, ticket, *, account_exists: bool = True):
        """검증(is_valid_assignee) 쿼리와 get_ticket 재조회(selectinload) 쿼리를 순서대로 흉내낸다."""
        detail_res = MagicMock()
        detail_res.scalar_one_or_none = MagicMock(return_value=ticket)
        db = AsyncMock()
        db.get = AsyncMock(return_value=ticket)
        db.execute = AsyncMock(side_effect=[_account_exists_db(account_exists), detail_res])
        return db

    async def test_sets_assignee_and_audits(self):
        ticket = _ticket_fixture()
        db = self._db_with(ticket)
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

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
        detail_res = MagicMock()
        detail_res.scalar_one_or_none = MagicMock(return_value=ticket)
        db = AsyncMock()
        db.get = AsyncMock(return_value=ticket)
        db.execute = AsyncMock(return_value=detail_res)  # 검증 스킵 → get_ticket 재조회만 호출됨
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        await support.assign_ticket(
            ticket.id, support.AssigneeUpdate(assignee_username=None), _request(), session=_session(), db=db
        )

        self.assertIsNone(ticket.assignee_username)
        audits = [o for o in added if isinstance(o, AdminAuditLog)]
        self.assertEqual(audits[0].detail, {"from": "alice", "to": None})

    async def test_blank_string_normalizes_to_none(self):
        ticket = _ticket_fixture(assignee_username="alice")
        detail_res = MagicMock()
        detail_res.scalar_one_or_none = MagicMock(return_value=ticket)
        db = AsyncMock()
        db.get = AsyncMock(return_value=ticket)
        db.execute = AsyncMock(return_value=detail_res)
        db.add = MagicMock()

        await support.assign_ticket(
            ticket.id, support.AssigneeUpdate(assignee_username="   "), _request(), session=_session(), db=db
        )

        self.assertIsNone(ticket.assignee_username)

    async def test_unknown_username_rejected(self):
        from fastapi import HTTPException

        ticket = _ticket_fixture()
        db = self._db_with(ticket, account_exists=False)

        with self.assertRaises(HTTPException) as ctx:
            await support.assign_ticket(
                ticket.id, support.AssigneeUpdate(assignee_username="ghost"), _request(), session=_session(), db=db
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIsNone(ticket.assignee_username)
        db.commit.assert_not_awaited()


def _account_exists_db(exists: bool):
    """지적 3: assign_* 가 is_valid_assignee(db, username) 호출 시 쓰는 db.execute(select(AdminAccount.id)...)
    를 흉내낸다 — exists=True 면 계정이 있는 것처럼(scalar_one_or_none 이 값 반환), False 면 없는 것처럼."""
    res = MagicMock()
    res.scalar_one_or_none = MagicMock(return_value=uuid.uuid4() if exists else None)
    return res


class AssignReportTest(unittest.IsolatedAsyncioTestCase):
    async def test_sets_assignee_and_audits(self):
        report = _report_fixture()
        db = AsyncMock()
        db.get = AsyncMock(return_value=report)
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))
        db.execute = AsyncMock(return_value=_account_exists_db(True))

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
        db.execute.assert_not_awaited()  # None(해제)은 검증 스킵

    async def test_unknown_username_rejected(self):
        from fastapi import HTTPException

        report = _report_fixture()
        db = AsyncMock()
        db.get = AsyncMock(return_value=report)
        db.execute = AsyncMock(return_value=_account_exists_db(False))

        with self.assertRaises(HTTPException) as ctx:
            await reports.assign_report(
                report.id, reports.AssigneeUpdate(assignee_username="ghost"), _request(), session=_session(), db=db
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIsNone(report.assignee_username)
        db.commit.assert_not_awaited()


class ListIssuesAssigneeFilterTest(unittest.IsolatedAsyncioTestCase):
    """지적 6: assignee 필터는 fetch 후 파이썬이 아니라 DB 쿼리(WHERE)에서 적용된다 — 아래 테스트는
    (a) DB 가 이미 필터링된 행만 돌려줬을 때 그대로 통과시키는지, (b) 실행된 SELECT 문 자체에
    WHERE 절이 실려 있는지(SQL 레벨 필터링 검증) 둘 다 확인한다."""

    def _db(self, report_rows, ticket_rows):
        calls: list = []

        async def execute(stmt):
            calls.append(stmt)
            res = MagicMock()
            res.scalars.return_value.all.return_value = report_rows if len(calls) == 1 else ticket_rows
            return res

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=execute)
        db._calls = calls
        return db

    async def test_me_filters_to_session_username(self):
        # DB가 세션 유저로 이미 필터링한 결과만 돌려준다고 가정(SQL WHERE 시뮬레이션).
        mine = _report_fixture(assignee_username="root")
        db = self._db([mine], [])

        rows = await issues.list_issues(source=None, assignee="me", limit=50, session=_session("root"), db=db)

        self.assertEqual([r.id for r in rows], [mine.id])
        report_sql = str(db._calls[0])
        self.assertIn("assignee_username = ", report_sql)

    async def test_unassigned_filters_null_only(self):
        unassigned = _ticket_fixture(assignee_username=None)
        db = self._db([], [unassigned])

        rows = await issues.list_issues(source=None, assignee="unassigned", limit=50, session=_session(), db=db)

        self.assertEqual([r.id for r in rows], [unassigned.id])
        ticket_sql = str(db._calls[1])
        self.assertIn("assignee_username IS NULL", ticket_sql)

    async def test_exact_match_filters_named_assignee(self):
        target = _report_fixture(assignee_username="bob")
        db = self._db([target], [])

        rows = await issues.list_issues(source=None, assignee="bob", limit=50, session=_session(), db=db)

        self.assertEqual([r.id for r in rows], [target.id])
        report_sql = str(db._calls[0])
        self.assertIn("assignee_username = ", report_sql)

    async def test_no_filter_has_no_assignee_where(self):
        db = self._db([_report_fixture()], [_ticket_fixture()])

        await issues.list_issues(source=None, assignee=None, limit=50, session=_session(), db=db)

        self.assertNotIn("WHERE", str(db._calls[0]))
        self.assertNotIn("WHERE", str(db._calls[1]))


if __name__ == "__main__":
    unittest.main()
