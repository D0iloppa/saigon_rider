"""DM 메시지 365일 보관정책 배치(purge_old_dm_messages) 테스트 — purge_deleted_accounts 테스트 스타일."""

import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app.jobs import purge_old_dm_messages as job


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


def _make_session(content_rows=(), deleted_count=0, dry_run_count=0):
    def _route(stmt, params=None):
        result = MagicMock()
        sql = str(stmt)
        if "FROM contents" in sql:
            result.all.return_value = list(content_rows)
        elif "SELECT count(*)" in sql:
            result.scalar_one.return_value = dry_run_count
        else:
            result.rowcount = deleted_count
        return result

    session = MagicMock()
    session.execute = AsyncMock(side_effect=_route)
    session.commit = AsyncMock()
    return session


class PurgeOldDmMessagesTest(unittest.IsolatedAsyncioTestCase):
    async def test_collects_contents_before_deleting_messages(self):
        content_id = uuid.uuid4()
        session = _make_session(content_rows=[(content_id, "dm/img.jpg")], deleted_count=3)

        with (
            patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(job, "_unlink_content_file", AsyncMock(return_value=True)) as unlink,
        ):
            result = await job.purge_old_dm_messages()

        sqls = [str(c.args[0]) for c in session.execute.await_args_list]
        # 수집(SELECT contents) → 메시지 DELETE → contents DELETE 순서 (역순이면 content_id 를 잃는다)
        self.assertIn("FROM contents", sqls[0])
        self.assertIn("DELETE FROM dm_messages", sqls[1])
        self.assertIn("DELETE FROM contents", sqls[2])
        session.commit.assert_awaited_once()
        unlink.assert_awaited_once_with("dm/img.jpg")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["purged_count"], 3)
        self.assertEqual(result["contents_purged"], 1)

    async def test_no_attachments_skips_contents_delete(self):
        session = _make_session(content_rows=[], deleted_count=1)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_old_dm_messages()

        sqls = [str(c.args[0]) for c in session.execute.await_args_list]
        self.assertFalse(any("DELETE FROM contents" in s for s in sqls))
        self.assertEqual(result["contents_purged"], 0)

    async def test_dry_run_executes_no_deletes(self):
        session = _make_session(dry_run_count=7)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_old_dm_messages(dry_run=True)

        sqls = [str(c.args[0]) for c in session.execute.await_args_list]
        self.assertFalse(any("DELETE" in s for s in sqls))
        session.commit.assert_not_awaited()
        self.assertEqual(result["purged_count"], 7)

    async def test_reported_messages_and_shared_contents_are_excluded(self):
        # code-review 백엔드 #1/#4 회귀 — 신고(T&S) 이력이 걸린 메시지는 하드 삭제에서 제외해야 한다
        # (reports.group_message_id 가 ON DELETE CASCADE 라 신고 이력까지 사라진다). 또한 파기 대상
        # 첨부 contents 가 다른 엔티티(아바타·매물 이미지 등)에서 재사용 중이면 지우지 않는다.
        session = _make_session(content_rows=[], deleted_count=0)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            await job.purge_old_dm_messages()

        sqls = [str(c.args[0]) for c in session.execute.await_args_list]
        self.assertIn("NOT IN (SELECT group_message_id FROM reports", sqls[1])  # 메시지 DELETE
        contents_sql = sqls[0]  # 첨부 contents 수집도 같은 파기 조건 + 타 엔티티 참조 가드
        self.assertIn("NOT IN (SELECT group_message_id FROM reports", contents_sql)
        for table, column in (("users", "avatar_content_id"), ("marketplace_listing_images", "content_id")):
            self.assertIn(f"SELECT {column} FROM {table}", contents_sql)

    async def test_dry_run_count_uses_same_report_exclusion(self):
        session = _make_session(dry_run_count=0)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            await job.purge_old_dm_messages(dry_run=True)

        count_sql = str(session.execute.await_args_list[0].args[0])
        self.assertIn("NOT IN (SELECT group_message_id FROM reports", count_sql)

    async def test_failure_is_contained(self):
        session = MagicMock()
        session.execute = AsyncMock(side_effect=RuntimeError("db down"))

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_old_dm_messages()

        self.assertEqual(result["status"], "error")


if __name__ == "__main__":
    unittest.main()
