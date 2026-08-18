"""R-1(260817 §12-B) — GET /support/reports 결과 노출 뭉개기 검증.

result_code/resolution_note 원본이 사용자에게 노출되면 안 된다(상대방 제재 내역 노출은
개인정보이자 보복 위험). status 는 PENDING/REVIEWING/RESOLVED/REJECTED 4단계를
REVIEWING/RESOLVED/REJECTED 3단계로 뭉갠 값만 내려간다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.models import MarketplaceListing, Report, User
from app.routers import support
from app.routers.support import _REPORT_STATUS_DISPLAY, _to_report_out


def _make_report(*, target_type="LISTING", status="PENDING", listing_id=None, reported_user_id=None) -> Report:
    return Report(
        id=uuid.uuid4(),
        target_type=target_type,
        reporter_id=uuid.uuid4(),
        reported_user_id=reported_user_id or uuid.uuid4(),
        listing_id=listing_id,
        reason="SPAM",
        status=status,
        result_code="STRIKE_1" if status in ("RESOLVED", "REJECTED") else None,
        resolution_note="판매자에게 1차 경고 처리함" if status == "RESOLVED" else None,
        created_at=datetime.now(UTC),
        handled_at=datetime.now(UTC) if status in ("RESOLVED", "REJECTED") else None,
    )


class ReportStatusCollapseTest(unittest.TestCase):
    def test_status_map_covers_all_db_states(self):
        self.assertEqual(_REPORT_STATUS_DISPLAY["PENDING"], "REVIEWING")
        self.assertEqual(_REPORT_STATUS_DISPLAY["REVIEWING"], "REVIEWING")
        self.assertEqual(_REPORT_STATUS_DISPLAY["RESOLVED"], "RESOLVED")
        self.assertEqual(_REPORT_STATUS_DISPLAY["REJECTED"], "REJECTED")

    def test_resolved_report_does_not_leak_result_code_or_note(self):
        listing_id = uuid.uuid4()
        report = _make_report(status="RESOLVED", listing_id=listing_id)
        listing = MarketplaceListing(id=listing_id, seller_id=uuid.uuid4(), title="Honda Air Blade 2020")

        out = _to_report_out(report, {listing_id: listing}, {})

        self.assertEqual(out.status, "RESOLVED")
        self.assertFalse(hasattr(out, "result_code"))
        self.assertFalse(hasattr(out, "resolution_note"))
        self.assertEqual(out.target_title, "Honda Air Blade 2020")

    def test_rejected_report_collapses_and_hides_detail(self):
        report = _make_report(status="REJECTED")
        out = _to_report_out(report, {}, {})
        self.assertEqual(out.status, "REJECTED")
        self.assertFalse(hasattr(out, "result_code"))

    def test_user_target_uses_reported_user_nickname(self):
        reported_user_id = uuid.uuid4()
        report = _make_report(target_type="USER", reported_user_id=reported_user_id)
        user = User(id=reported_user_id, nickname="badrider99")

        out = _to_report_out(report, {}, {reported_user_id: user})

        self.assertEqual(out.target_title, "badrider99")
        self.assertIsNone(out.listing_id)

    def test_missing_listing_falls_back_to_none_title(self):
        """조치로 매물이 삭제돼(SET NULL 아님, listing_id 는 남지만 조회 실패) 매핑에 없을 때도 500 대신 빈 값."""
        report = _make_report(status="RESOLVED", listing_id=uuid.uuid4())
        out = _to_report_out(report, {}, {})
        self.assertIsNone(out.target_title)
        self.assertIsNone(out.target_thumbnail_url)


if __name__ == "__main__":
    unittest.main()


class CancelReportContractTest(unittest.IsolatedAsyncioTestCase):
    """R-3(017 §12-B) 취소 계약 고정 — 대표 확정 3결정이 조용히 뒤집히지 않게 한다:
    ① PENDING 한정 ② 하드 삭제 금지(행 보존·상태만 전환) ③ 남의 신고는 404.

    특히 ②가 중요하다 — 행을 지우면 R-5 기각률 집계(admin_api/reports.py)가 오염되고
    재신고 방지 UNIQUE(listing_id, reporter_id) 도 무력화된다.
    """

    @staticmethod
    def _db(report):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=report)))
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.delete = MagicMock()  # 호출되면 안 된다
        return db

    @staticmethod
    def _report(status, reporter_id):
        return SimpleNamespace(
            id=uuid.uuid4(),
            reporter_id=reporter_id,
            reported_user_id=uuid.uuid4(),
            target_type="LISTING",
            listing_id=None,
            reason="FRAUD",
            status=status,
            created_at=datetime.now(UTC),
            handled_at=None,
            cancelled_at=None,
        )

    async def test_pending_report_is_soft_cancelled_not_deleted(self):
        uid = uuid.uuid4()
        report = self._report("PENDING", uid)
        db = self._db(report)
        out = await support.cancel_report(report.id, user_id=uid, db=db)
        self.assertEqual(report.status, "CANCELLED")
        self.assertIsNotNone(report.cancelled_at)
        db.delete.assert_not_called()  # ② 하드 삭제 금지
        self.assertEqual(out.status, "CANCELLED")
        self.assertFalse(out.can_cancel)  # 취소된 건은 다시 취소 불가

    async def test_reviewing_report_cannot_be_cancelled(self):
        uid = uuid.uuid4()
        report = self._report("REVIEWING", uid)  # 운영자가 이미 열어본 건
        db = self._db(report)
        with self.assertRaises(HTTPException) as ctx:
            await support.cancel_report(report.id, user_id=uid, db=db)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "report_not_cancellable")
        self.assertEqual(report.status, "REVIEWING")  # 상태 불변
        db.delete.assert_not_called()

    async def test_other_users_report_is_404_not_403(self):
        """존재 여부 자체를 숨긴다 — 403 이면 '그 신고가 있다'는 정보가 샌다."""
        report = self._report("PENDING", uuid.uuid4())
        db = self._db(report)
        with self.assertRaises(HTTPException) as ctx:
            await support.cancel_report(report.id, user_id=uuid.uuid4(), db=db)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(report.status, "PENDING")
        db.delete.assert_not_called()
