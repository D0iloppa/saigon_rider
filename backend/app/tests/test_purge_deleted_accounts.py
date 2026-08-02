import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.jobs import purge_deleted_accounts as job
from app.jobs.purge_deleted_accounts import _is_purge_eligible


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class PurgeEligibilityTest(unittest.TestCase):
    """F-10 안전장치 ①②를 함수 단위로 고정한다."""

    def setUp(self):
        self.now = datetime(2026, 8, 1, tzinfo=UTC)

    def test_excludes_live_account_not_deleted(self):
        # ② 살아있는 계정(탈퇴하지 않은 계정)을 절대 지우지 않는다.
        self.assertFalse(_is_purge_eligible(None, "del_abc123", self.now))

    def test_excludes_deletion_within_30_days(self):
        # ① 30일 미경과 계정을 지우지 않는다.
        recent = self.now - timedelta(days=10)
        self.assertFalse(_is_purge_eligible(recent, "del_abc123", self.now))

    def test_excludes_deletion_exactly_at_boundary(self):
        boundary = self.now - timedelta(days=30)
        self.assertFalse(_is_purge_eligible(boundary, "del_abc123", self.now))

    def test_excludes_non_anonymized_phone(self):
        # delete_account 가 아직 익명화하지 않은(비정상) 행은 방어적으로 제외.
        old = self.now - timedelta(days=31)
        self.assertFalse(_is_purge_eligible(old, "0901234567", self.now))
        self.assertFalse(_is_purge_eligible(old, None, self.now))

    def test_includes_eligible_account(self):
        old = self.now - timedelta(days=31)
        self.assertTrue(_is_purge_eligible(old, "del_abc123", self.now))


class PurgeBatchExecutionTest(unittest.IsolatedAsyncioTestCase):
    """실제 배치 실행이 위 안전장치를 지키며 소유 데이터 테이블만 지우는지 검증."""

    def setUp(self):
        # Engine device-map(FCM 토큰 포함) 파기는 HTTP 경유 — 테스트에서 네트워크 차단.
        self.engine = MagicMock(
            lookup_device_map=AsyncMock(return_value={}),
            delete_device_map=AsyncMock(return_value={"removed": True}),
        )
        patcher = patch.object(job, "engine_client", self.engine)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _make_session(self, rows, content_rows=()):
        def _route(stmt, params=None):
            result = MagicMock()
            if "FROM contents" in str(stmt):
                result.all.return_value = list(content_rows)
            else:
                result.all.return_value = rows
            return result

        session = MagicMock()
        session.execute = AsyncMock(side_effect=_route)
        session.commit = AsyncMock()
        return session

    async def test_skips_ineligible_and_deletes_only_eligible_user(self):
        now = datetime.now(UTC)
        eligible_id = uuid.uuid4()
        ineligible_id = uuid.uuid4()
        rows = [
            (eligible_id, now - timedelta(days=31), "del_eligible"),
            (ineligible_id, now - timedelta(days=5), "del_ineligible"),
        ]
        session = self._make_session(rows)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["purged_count"], 1)
        self.assertEqual(result["skipped_not_eligible"], 1)
        self.assertEqual(result["purged_user_ids"], [str(eligible_id)])

        delete_calls = [
            c
            for c in session.execute.await_args_list
            if "DELETE FROM" in str(c.args[0]) and "withdrawn_member_archive" not in str(c.args[0])
        ]
        # 소유 데이터 테이블 개수만큼 DELETE 가 실행되고, 전부 eligible id 로만 스코프됨.
        # (별도 단계인 식별자 해시 아카이브 파기는 test_withdrawn_archive.py 에서 검증)
        self.assertEqual(len(delete_calls), len(job._OWN_DATA_TABLES))
        for call in delete_calls:
            self.assertEqual(call.args[1]["uid"], eligible_id)
        # 거래·리뷰·신고·DM 등 타인 권리 테이블은 이 리스트에 없어야 한다.
        deleted_tables = {str(c.args[0]).split("DELETE FROM ")[1].split(" WHERE")[0] for c in delete_calls}
        for protected in ("marketplace_listings", "marketplace_reviews", "reports", "dm_messages", "business_profile"):
            self.assertNotIn(protected, deleted_tables)

        # 유저 단위 파기 1회 + 아카이브 단계 1회
        self.assertEqual(session.commit.await_count, 2)

    async def test_dry_run_executes_no_deletes(self):
        now = datetime.now(UTC)
        eligible_id = uuid.uuid4()
        rows = [(eligible_id, now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=True)

        self.assertEqual(result["purged_count"], 1)
        delete_calls = [c for c in session.execute.await_args_list if "DELETE FROM" in str(c.args[0])]
        self.assertEqual(len(delete_calls), 0)
        session.commit.assert_not_awaited()

    async def test_no_candidates_purges_nothing(self):
        session = self._make_session([])

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["purged_count"], 0)
        self.assertEqual(result["status"], "ok")

    def test_feed_posts_and_post_comments_are_purge_targets(self):
        # 대표 결정 ②(2026-08-01): 피드글·댓글도 본인 소유 데이터로 삭제 대상에 포함.
        self.assertIn(("feed_posts", "user_id"), job._OWN_DATA_TABLES)
        self.assertIn(("post_comments", "user_id"), job._OWN_DATA_TABLES)

    async def test_feed_posts_and_comments_deleted_scoped_to_eligible_user(self):
        now = datetime.now(UTC)
        eligible_id = uuid.uuid4()
        rows = [(eligible_id, now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["purged_count"], 1)
        delete_calls = [c for c in session.execute.await_args_list if "DELETE FROM" in str(c.args[0])]
        deleted_tables = {str(c.args[0]).split("DELETE FROM ")[1].split(" WHERE")[0] for c in delete_calls}
        self.assertIn("feed_posts", deleted_tables)
        self.assertIn("post_comments", deleted_tables)
        for c in delete_calls:
            table = str(c.args[0]).split("DELETE FROM ")[1].split(" WHERE")[0]
            if table in ("feed_posts", "post_comments"):
                self.assertEqual(c.args[1]["uid"], eligible_id)

    async def test_reserved_tables_stay_untouched_by_own_data_purge(self):
        # 대표 결정 ②: user_sanctions/support_tickets/internal_reward_grants 는 계속 보존.
        now = datetime.now(UTC)
        eligible_id = uuid.uuid4()
        rows = [(eligible_id, now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            await job.purge_deleted_accounts(dry_run=False)

        delete_calls = [c for c in session.execute.await_args_list if "DELETE FROM" in str(c.args[0])]
        deleted_tables = {str(c.args[0]).split("DELETE FROM ")[1].split(" WHERE")[0] for c in delete_calls}
        for protected in ("user_sanctions", "support_tickets", "internal_reward_grants"):
            self.assertNotIn(protected, deleted_tables)


class PurgeEngineDeviceMapTest(unittest.IsolatedAsyncioTestCase):
    """탈퇴 파기 시 Engine device_user_map(기기 매핑 + FCM 푸시 토큰) 도 함께 해제되는지 검증.

    FCM 토큰은 BFF DB 어디에도 없고 Engine `device_user_map.fcm_token` 에만 있다 —
    이 행을 지우지 않으면 탈퇴자에게 푸시가 계속 갈 수 있다 (방침 §1·§4 불일치).
    """

    def setUp(self):
        self.engine = MagicMock(
            lookup_device_map=AsyncMock(return_value={"device_uuid": "dev-1", "fcm_token": "tok"}),
            delete_device_map=AsyncMock(return_value={"removed": True}),
        )
        patcher = patch.object(job, "engine_client", self.engine)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _make_session(self, rows):
        def _route(stmt, params=None):
            result = MagicMock()
            result.all.return_value = [] if "FROM contents" in str(stmt) else rows
            return result

        session = MagicMock()
        session.execute = AsyncMock(side_effect=_route)
        session.commit = AsyncMock()
        return session

    async def test_engine_device_map_purged_for_eligible_user(self):
        now = datetime.now(UTC)
        eligible_id = uuid.uuid4()
        rows = [(eligible_id, now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["purged_count"], 1)
        self.engine.lookup_device_map.assert_awaited_once_with(str(eligible_id))
        self.engine.delete_device_map.assert_awaited_once_with("dev-1", str(eligible_id))
        self.assertEqual(result["device_maps_purged"], 1)

    async def test_no_device_map_row_skips_delete_call(self):
        self.engine.lookup_device_map = AsyncMock(return_value={})
        now = datetime.now(UTC)
        rows = [(uuid.uuid4(), now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["purged_count"], 1)
        self.engine.delete_device_map.assert_not_awaited()

    async def test_engine_failure_does_not_abort_batch(self):
        # 파기 대상 유저는 다음 실행에서도 후보로 남으므로(users 행 유지) 재시도로 자가 치유된다.
        self.engine.lookup_device_map = AsyncMock(side_effect=RuntimeError("engine down"))
        now = datetime.now(UTC)
        rows = [(uuid.uuid4(), now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["purged_count"], 1)
        self.assertEqual(result["device_maps_purged"], 0)

    async def test_dry_run_skips_engine_calls(self):
        now = datetime.now(UTC)
        rows = [(uuid.uuid4(), now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows)

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            await job.purge_deleted_accounts(dry_run=True)

        self.engine.lookup_device_map.assert_not_awaited()
        self.engine.delete_device_map.assert_not_awaited()


class PurgeOwnContentsTest(unittest.IsolatedAsyncioTestCase):
    """탈퇴 파기 시 본인 소유 이미지(contents 행 + 디스크 파일)도 함께 파기되는지 검증.

    방침 §4 파기 대상(프로필 사진·피드 게시물 사진)에 한정 — 매물·DM·업체 프로필 등
    보존 대상 엔티티에 붙은 이미지는 방침이 "계속 보관"을 공표하므로 건드리지 않는다.
    """

    def setUp(self):
        self.engine = MagicMock(
            lookup_device_map=AsyncMock(return_value={}),
            delete_device_map=AsyncMock(return_value={"removed": True}),
        )
        patcher = patch.object(job, "engine_client", self.engine)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _make_session(self, rows, content_rows=()):
        def _route(stmt, params=None):
            result = MagicMock()
            if "FROM contents" in str(stmt):
                result.all.return_value = list(content_rows)
            else:
                result.all.return_value = rows
            return result

        session = MagicMock()
        session.execute = AsyncMock(side_effect=_route)
        session.commit = AsyncMock()
        return session

    async def test_contents_rows_deleted_and_files_unlinked(self):
        now = datetime.now(UTC)
        eligible_id = uuid.uuid4()
        cid1, cid2 = uuid.uuid4(), uuid.uuid4()
        content_rows = [
            (cid1, "user-contents/2026/07/a.jpg"),
            (cid2, "user-contents/2026/07/b.png"),
        ]
        rows = [(eligible_id, now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows, content_rows)

        with (
            patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(job, "_unlink_content_file", new=AsyncMock(return_value=True)) as unlink,
        ):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["purged_count"], 1)
        self.assertEqual(result["contents_purged"], 2)

        calls_sql = [str(c.args[0]) for c in session.execute.await_args_list]
        # 소유자 판정: owner_type='user' AND owner_id=본인 으로 스코프된 SELECT.
        select_idx = next(i for i, s in enumerate(calls_sql) if "FROM contents" in s and "SELECT" in s.upper())
        self.assertIn("owner_type = 'user'", calls_sql[select_idx])
        self.assertIn("owner_id = :uid", calls_sql[select_idx])
        # 수집은 feed_posts DELETE 보다 먼저여야 한다 — CASCADE 로 feed_post_images 가
        # 사라지기 전에 content_id 를 확보해야 하므로.
        feed_delete_idx = next(i for i, s in enumerate(calls_sql) if "DELETE FROM feed_posts" in s)
        self.assertLess(select_idx, feed_delete_idx)

        content_deletes = [c for c in session.execute.await_args_list if "DELETE FROM contents" in str(c.args[0])]
        self.assertEqual(len(content_deletes), 1)
        self.assertEqual(content_deletes[0].args[1]["content_ids"], [cid1, cid2])

        unlinked_paths = [c.args[0] for c in unlink.await_args_list]
        self.assertEqual(unlinked_paths, ["user-contents/2026/07/a.jpg", "user-contents/2026/07/b.png"])

    async def test_no_own_contents_issues_no_content_delete(self):
        now = datetime.now(UTC)
        rows = [(uuid.uuid4(), now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows, content_rows=())

        with patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["contents_purged"], 0)
        content_deletes = [c for c in session.execute.await_args_list if "DELETE FROM contents" in str(c.args[0])]
        self.assertEqual(len(content_deletes), 0)

    async def test_file_unlink_failure_does_not_abort_batch(self):
        now = datetime.now(UTC)
        eligible_id = uuid.uuid4()
        content_rows = [(uuid.uuid4(), "user-contents/2026/07/a.jpg")]
        rows = [(eligible_id, now - timedelta(days=31), "del_eligible")]
        session = self._make_session(rows, content_rows)

        with (
            patch.object(job, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(job, "_unlink_content_file", new=AsyncMock(return_value=False)),
        ):
            result = await job.purge_deleted_accounts(dry_run=False)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["purged_count"], 1)
