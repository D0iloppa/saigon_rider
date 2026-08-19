"""R-1(260819 W3) — 신고 이력 상세: 신고자 본인의 note/첨부사진/공개 요약 사유 노출.

result_code/resolution_note 원본은 여전히 노출하지 않는다(test_support_reports.py 가 그 계약을
고정) — 이 파일은 "본인 소유 데이터(note·사진·공개 요약)는 노출해야 한다"는 반대 방향의 계약을
고정한다. list_reports 는 Report.reporter_id == user_id 필터를 거치므로 타인의 신고는
쿼리 결과에 애초에 나타나지 않는다(소유권 검증은 SQL where 절이 담당, 여기서는 매핑만 검증).

_to_report_out 은 속성 접근만 하므로 실제 ORM 인스턴스 대신 SimpleNamespace 로 흉내낸다
(test_report_result_notification.py 와 동일한 방식 — ORM 관계(relationship) 이벤트를
건드리지 않아 부작용이 없다).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from app.routers.support import _to_report_out


def _image(file_path: str):
    return SimpleNamespace(content=SimpleNamespace(file_path=file_path))


def _make_report(*, note=None, images=None, public_resolution_summary=None, status="PENDING"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        target_type="LISTING",
        reporter_id=uuid.uuid4(),
        reported_user_id=uuid.uuid4(),
        listing_id=None,
        reason="SPAM",
        note=note,
        status=status,
        resolution_note="내부 메모 — 절대 노출 금지",
        public_resolution_summary=public_resolution_summary,
        created_at=datetime.now(UTC),
        handled_at=None,
        images=images or [],
    )


class ReportDetailExposureTest(unittest.TestCase):
    def test_own_note_is_exposed(self):
        report = _make_report(note="판매자가 연락을 안 받아요")
        out = _to_report_out(report, {}, {})
        self.assertEqual(out.note, "판매자가 연락을 안 받아요")

    def test_own_images_are_exposed_as_imgproxy_urls(self):
        report = _make_report(images=[_image("reports/a.jpg"), _image("reports/b.jpg")])
        out = _to_report_out(report, {}, {})
        self.assertEqual(len(out.images), 2)
        for url in out.images:
            self.assertIsInstance(url, str)
            self.assertTrue(url)

    def test_missing_content_or_file_path_is_skipped_not_500(self):
        broken = SimpleNamespace(content=None)
        report = _make_report(images=[broken])
        out = _to_report_out(report, {}, {})
        self.assertEqual(out.images, [])

    def test_public_resolution_summary_is_exposed(self):
        report = _make_report(status="RESOLVED", public_resolution_summary="판매자 경고 조치했습니다")
        out = _to_report_out(report, {}, {})
        self.assertEqual(out.resolution_summary, "판매자 경고 조치했습니다")

    def test_internal_resolution_note_never_leaks_into_output(self):
        """resolution_note(내부 메모)는 어떤 필드로도 새어나가면 안 된다."""
        report = _make_report(status="RESOLVED", public_resolution_summary="공개 요약")
        out = _to_report_out(report, {}, {})
        dumped = out.model_dump()
        self.assertNotIn("내부 메모", str(dumped.values()))
        self.assertFalse(hasattr(out, "resolution_note"))

    def test_no_summary_falls_back_to_none_not_internal_note(self):
        report = _make_report(status="RESOLVED", public_resolution_summary=None)
        out = _to_report_out(report, {}, {})
        self.assertIsNone(out.resolution_summary)


if __name__ == "__main__":
    unittest.main()
