"""F-10 확장 — 탈퇴 파기 배치가 feed_posts/post_comments 를 지울 때 그 글/댓글에 대한
reports 행까지 CASCADE 로 사라지던 문제(대표 결정: 신고 사유·대상 유저·처리 결과는
보존하고 원문 링크만 끊는다)를 FK 레벨(ON DELETE SET NULL)로 고정한다.

관리자 모더레이션 삭제(admin_api/feed.py)·작성자 자진 삭제(routers/feed.py)도 같은
CASCADE 구조를 공유해 동일한 문제가 이미 발생 중이었으므로, 파기 배치 국한이 아니라
FK 레벨 수정(167_reports_content_detach.sql)으로 모든 삭제 경로를 한 번에 커버한다.
"""

import unittest
from pathlib import Path

from app.models import Report


class ReportForeignKeyDetachTest(unittest.TestCase):
    """post_id/comment_id 가 CASCADE 로 신고 행 전체를 지우지 않고 SET NULL 로 detach 하는지."""

    def _ondelete(self, column_name: str) -> str | None:
        column = Report.__table__.columns[column_name]
        for fk in column.foreign_keys:
            return fk.ondelete
        return None

    def test_post_id_detaches_instead_of_cascading(self):
        self.assertEqual(self._ondelete("post_id"), "SET NULL")

    def test_comment_id_detaches_instead_of_cascading(self):
        self.assertEqual(self._ondelete("comment_id"), "SET NULL")

    def test_listing_and_conversation_fk_untouched(self):
        # 매물/DM 신고는 이번 변경 범위 밖 — 파기 배치가 그 테이블을 지우지 않으므로 그대로 CASCADE.
        self.assertEqual(self._ondelete("listing_id"), "CASCADE")
        self.assertEqual(self._ondelete("conversation_id"), "CASCADE")


class ReportsMigrationWiringContractTest(unittest.TestCase):
    def _root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    def test_migration_sets_post_and_comment_fk_to_set_null(self):
        sql = (self._root() / "database" / "init" / "167_reports_content_detach.sql").read_text(encoding="utf-8")
        normalized = " ".join(sql.lower().split())
        self.assertIn("references feed_posts(id) on delete set null", normalized)
        self.assertIn("references post_comments(id) on delete set null", normalized)

    def test_compose_migrate_registers_167(self):
        compose = (self._root() / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn("167_reports_content_detach.sql", compose)
        self.assertIn("VALUES (167)", compose)


if __name__ == "__main__":
    unittest.main()
