"""정본 §5 #1 — 신고자 처리 결과 통보.

수정 전에는 신고를 RESOLVED/REJECTED 로 전이해도 신고자에게 알리는 코드가 0건이었다
(신고가 블랙홀). `admin_api/listings.py`의 `_apply_moderation` 알림 선례를 그대로 재사용해
`update_report_status`가 상태별 템플릿 알림 1건을 신고자 앞으로 적재하는지 고정한다.

조치 세부(제재 종류·기간)는 문구에 담기지 않는다 — 법무 미확인 항목(피신고자 개인정보·보복 리스크).
"""

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.models import Notification
from app.routers.admin_api import reports


def _request():
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))


def _session():
    return SimpleNamespace(username="root", role="root")


def _fixture(*, status="PENDING"):
    reporter_id = uuid.uuid4()
    report = SimpleNamespace(
        id=uuid.uuid4(),
        reporter_id=reporter_id,
        status=status,
        resolution_note=None,
        handled_by=None,
        handled_at=None,
    )
    return report, reporter_id


def _db(report):
    db = AsyncMock()
    db.get = AsyncMock(return_value=report)
    added: list = []
    db.add = MagicMock(side_effect=lambda obj: added.append(obj))
    return db, added


class ReportResultNotificationTest(unittest.IsolatedAsyncioTestCase):
    async def test_resolved_notifies_reporter_without_sanction_detail(self):
        report, reporter_id = _fixture()
        db, added = _db(report)

        await reports.update_report_status(
            report.id,
            reports.ReportStatusUpdate(status="RESOLVED"),
            _request(),
            session=_session(),
            db=db,
        )

        notis = [o for o in added if isinstance(o, Notification)]
        self.assertEqual(len(notis), 1)
        self.assertEqual(notis[0].user_id, reporter_id)
        self.assertEqual(notis[0].type, "MODERATION")
        self.assertIn("조치했습니다", notis[0].body)
        # 조치 세부(제재 종류·기간)는 노출하지 않는다.
        self.assertNotIn("SUSPEND", notis[0].body)
        self.assertNotIn("BAN", notis[0].body)

    async def test_rejected_notifies_reporter_with_different_template(self):
        report, reporter_id = _fixture()
        db, added = _db(report)

        await reports.update_report_status(
            report.id,
            reports.ReportStatusUpdate(status="REJECTED"),
            _request(),
            session=_session(),
            db=db,
        )

        notis = [o for o in added if isinstance(o, Notification)]
        self.assertEqual(len(notis), 1)
        self.assertEqual(notis[0].user_id, reporter_id)
        self.assertIn("조치가 필요하지 않았습니다", notis[0].body)

    async def test_reviewing_transition_sends_no_notification(self):
        report, _reporter_id = _fixture()
        db, added = _db(report)

        await reports.update_report_status(
            report.id,
            reports.ReportStatusUpdate(status="REVIEWING"),
            _request(),
            session=_session(),
            db=db,
        )

        self.assertFalse(any(isinstance(o, Notification) for o in added))

    async def test_re_resolving_already_terminal_report_is_rejected_no_duplicate_notification(self):
        """종결 상태(RESOLVED/REJECTED)는 `_ALLOWED_TRANSITIONS`에 키가 없어 어떤 재전이도 400 —
        같은 신고에 중복 알림이 가지 않는 구조를 그대로 검증한다."""
        report, _reporter_id = _fixture(status="RESOLVED")
        db, added = _db(report)

        with self.assertRaises(HTTPException) as ctx:
            await reports.update_report_status(
                report.id,
                reports.ReportStatusUpdate(status="RESOLVED"),
                _request(),
                session=_session(),
                db=db,
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertFalse(any(isinstance(o, Notification) for o in added))


if __name__ == "__main__":
    unittest.main()
