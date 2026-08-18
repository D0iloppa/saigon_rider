"""R-1(260817 §12-B) — GET /support/reports 결과 노출 뭉개기 검증.

result_code/resolution_note 원본이 사용자에게 노출되면 안 된다(상대방 제재 내역 노출은
개인정보이자 보복 위험). status 는 PENDING/REVIEWING/RESOLVED/REJECTED 4단계를
REVIEWING/RESOLVED/REJECTED 3단계로 뭉갠 값만 내려간다.
"""

import unittest
import uuid
from datetime import UTC, datetime

from app.models import MarketplaceListing, Report, User
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
