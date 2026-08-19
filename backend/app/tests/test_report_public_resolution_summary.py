"""R-2(260819 W3) — 어드민 종결 시 공개 요약 사유 저장 + 알림 body 반영.

resolution_note(내부 메모)와 분리된 별도 필드(public_resolution_summary)에 저장하고,
`admin_api/reviews.py moderate_review` 의 "사유: {reason}" 통보 패턴을 미러링해 알림 body 에
싣는다. 요약이 비어있으면 기존 고정 문구로 폴백해야 한다(test_report_result_notification.py 가
고정한 기존 계약과 회귀 없이 공존해야 함).
"""

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.models import Notification
from app.routers.admin_api import reports


def _request():
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))


def _session():
    return SimpleNamespace(username="root", role="root")


def _fixture(*, status="PENDING", public_resolution_summary=None):
    reporter_id = uuid.uuid4()
    report = SimpleNamespace(
        id=uuid.uuid4(),
        reporter_id=reporter_id,
        status=status,
        resolution_note=None,
        public_resolution_summary=public_resolution_summary,
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


class PublicResolutionSummaryTest(unittest.IsolatedAsyncioTestCase):
    async def test_summary_is_saved_on_separate_field_not_resolution_note(self):
        report, _reporter_id = _fixture()
        db, _added = _db(report)

        await reports.update_report_status(
            report.id,
            reports.ReportStatusUpdate(
                status="RESOLVED",
                result_code="WARNING_ISSUED",
                public_resolution_summary="판매자에게 경고 조치했습니다",
            ),
            _request(),
            session=_session(),
            db=db,
        )

        self.assertEqual(report.public_resolution_summary, "판매자에게 경고 조치했습니다")
        self.assertIsNone(report.resolution_note)  # 내부 메모 필드는 건드리지 않는다

    async def test_summary_is_included_in_notification_body(self):
        report, reporter_id = _fixture()
        db, added = _db(report)

        await reports.update_report_status(
            report.id,
            reports.ReportStatusUpdate(
                status="RESOLVED",
                result_code="WARNING_ISSUED",
                public_resolution_summary="판매자에게 경고 조치했습니다",
            ),
            _request(),
            session=_session(),
            db=db,
        )

        notis = [o for o in added if isinstance(o, Notification)]
        self.assertEqual(len(notis), 1)
        self.assertEqual(notis[0].user_id, reporter_id)
        self.assertIn("판매자에게 경고 조치했습니다", notis[0].body)

    async def test_empty_summary_falls_back_to_fixed_copy(self):
        """빈 요약이면 기존 고정 문구 그대로 — 회귀 금지."""
        report, _reporter_id = _fixture()
        db, added = _db(report)

        await reports.update_report_status(
            report.id,
            reports.ReportStatusUpdate(status="REJECTED", result_code="INVALID"),
            _request(),
            session=_session(),
            db=db,
        )

        notis = [o for o in added if isinstance(o, Notification)]
        self.assertEqual(len(notis), 1)
        self.assertIn("조치가 필요하지 않았습니다", notis[0].body)
        self.assertNotIn("사유:", notis[0].body)

    async def test_summary_not_saved_on_non_terminal_transition(self):
        """F1-2: REVIEWING 전이에 실린 요약은 미확정 초안이라 저장하지 않는다(신고자 즉시 노출 방지)."""
        report, _reporter_id = _fixture(status="PENDING")
        db, _added = _db(report)

        await reports.update_report_status(
            report.id,
            reports.ReportStatusUpdate(status="REVIEWING", public_resolution_summary="검토중 초안 사유"),
            _request(),
            session=_session(),
            db=db,
        )

        self.assertIsNone(report.public_resolution_summary)

    async def test_whitespace_only_summary_treated_as_none(self):
        """F1-2: 공백-only 요약은 None 처리 — 알림 body 에 '사유:' 꼬리를 남기지 않는다."""
        report, _reporter_id = _fixture()
        db, added = _db(report)

        await reports.update_report_status(
            report.id,
            reports.ReportStatusUpdate(
                status="RESOLVED", result_code="WARNING_ISSUED", public_resolution_summary="   "
            ),
            _request(),
            session=_session(),
            db=db,
        )

        self.assertIsNone(report.public_resolution_summary)
        notis = [o for o in added if isinstance(o, Notification)]
        self.assertEqual(len(notis), 1)
        self.assertNotIn("사유:", notis[0].body)


if __name__ == "__main__":
    unittest.main()
