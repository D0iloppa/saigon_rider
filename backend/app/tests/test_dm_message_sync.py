"""DM 메시지 동기화 고도화(215_dm_message_sync) 회귀 테스트.

- (a) `after` 폴링 커서가 created_at 이 아니라 **updated_at 워터마크**로 동작하는지
  (신규/수정/소프트삭제/공감변경이 전부 한 커서에 실리는 구조의 전제)
- (b) 공감 토글이 유니크 제약(PK) 기반 멱등 upsert 이고, 실제 변경 시에만 워터마크를 bump 하는지
- (c) 소프트 삭제 후 콘텐츠(content/image/meta)가 응답에 노출되지 않는지
- (d) 답장 전송 시 서버가 원본 스냅샷(reply_preview)을 정확히 생성하는지

test_biz_favorite_count.py / test_idor_p0_fixes.py 스타일 — mock db 로 라우터 함수 직접 호출,
SQL 은 compile 문자열로 검증한다 (실 DB 불필요).
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.models import DmMessage
from app.routers import dm
from app.schemas import DmMessageCreateRequest, DmMessageEditRequest


def _direct_conv(conv_id, p1, p2):
    conv = MagicMock()
    conv.id = conv_id
    conv.conversation_type = "direct"
    conv.participant_1 = p1
    conv.participant_2 = p2
    conv.context_type = None
    conv.context_id = None
    return conv


def _message(conv_id, sender_id, **kwargs):
    now = datetime.now(UTC)
    msg = DmMessage(
        id=kwargs.pop("id", uuid.uuid4()),
        conversation_id=conv_id,
        sender_id=sender_id,
        content=kwargs.pop("content", "hello"),
        message_type=kwargs.pop("message_type", "text"),
        created_at=kwargs.pop("created_at", now),
        updated_at=kwargs.pop("updated_at", now),
    )
    for key, value in kwargs.items():
        setattr(msg, key, value)
    return msg


class WatermarkPollingTest(unittest.IsolatedAsyncioTestCase):
    """(a) after 커서 = updated_at 워터마크."""

    def setUp(self):
        self.me = uuid.uuid4()
        self.other = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.conv = _direct_conv(self.conv_id, self.me, self.other)
        patcher = patch.object(dm, "require_unblocked", AsyncMock())
        patcher.start()
        self.addCleanup(patcher.stop)

    def _db(self, rows, reaction_rows=()):
        select_result = MagicMock()
        select_result.scalars.return_value.all.return_value = rows
        reactions_result = MagicMock()
        reactions_result.all.return_value = list(reaction_rows)
        db = MagicMock()
        db.get = AsyncMock(return_value=self.conv)
        db.execute = AsyncMock(side_effect=[select_result, reactions_result])
        return db

    async def test_after_cursor_filters_and_orders_by_updated_at(self):
        db = self._db([])
        after = datetime.now(UTC) - timedelta(seconds=5)

        await dm.get_messages(self.conv_id, page=1, size=50, after=after, db=db, _session_uid=self.me)

        sql = str(db.execute.await_args_list[0].args[0].compile(dialect=postgresql.dialect()))
        self.assertIn("dm_messages.updated_at >", sql)
        self.assertIn("ORDER BY dm_messages.updated_at", sql)
        self.assertNotIn("created_at >", sql)

    async def test_initial_load_without_cursor_keeps_created_at_order(self):
        # 커서 없는 요청 — 종전 offset 페이지네이션(과거분 로드)이 회귀하지 않아야 한다.
        select_result = MagicMock()
        select_result.scalars.return_value.all.return_value = []
        count_result = MagicMock()
        count_result.scalar_one.return_value = 0
        reactions_result = MagicMock()
        reactions_result.all.return_value = []
        db = MagicMock()
        db.get = AsyncMock(return_value=self.conv)
        db.execute = AsyncMock(side_effect=[select_result, count_result, reactions_result])

        await dm.get_messages(self.conv_id, page=2, size=50, after=None, db=db, _session_uid=self.me)

        sql = str(db.execute.await_args_list[0].args[0].compile(dialect=postgresql.dialect()))
        self.assertIn("ORDER BY dm_messages.created_at", sql)
        self.assertNotIn("updated_at >", sql)

    async def test_poll_response_carries_edit_delete_and_reactions(self):
        # 한 폴링 응답에 수정본·삭제본이 함께 실리고, 공감 집계가 붙는다.
        now = datetime.now(UTC)
        edited = _message(self.conv_id, self.me, content="edited!", edited_at=now, updated_at=now)
        deleted = _message(self.conv_id, self.other, content="secret", deleted_at=now, updated_at=now)
        reaction_rows = [(edited.id, "👍", 2, True)]
        db = self._db([edited, deleted], reaction_rows)

        page = await dm.get_messages(
            self.conv_id, page=1, size=50, after=now - timedelta(seconds=5), db=db, _session_uid=self.me
        )

        out_edited = next(i for i in page.items if i.id == edited.id)
        self.assertEqual(out_edited.content, "edited!")
        self.assertIsNotNone(out_edited.edited_at)
        self.assertEqual(out_edited.reactions[0].emoji, "👍")
        self.assertEqual(out_edited.reactions[0].count, 2)
        self.assertTrue(out_edited.reactions[0].reacted_by_me)

        out_deleted = next(i for i in page.items if i.id == deleted.id)
        self.assertIsNotNone(out_deleted.deleted_at)
        # (c) 소프트 삭제 후 콘텐츠 미노출
        self.assertIsNone(out_deleted.content)
        self.assertIsNone(out_deleted.image_url)
        self.assertIsNone(out_deleted.meta)


class SoftDeleteAndEditTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.me = uuid.uuid4()
        self.other = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.msg = _message(self.conv_id, self.me)

    def _patch_access(self, msg):
        patcher = patch.object(dm, "_require_message_access", AsyncMock(return_value=msg))
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_delete_marks_deleted_and_bumps_watermark(self):
        self._patch_access(self.msg)
        before = self.msg.updated_at
        db = MagicMock()
        db.commit = AsyncMock()

        result = await dm.delete_message(self.conv_id, self.msg.id, db=db, _session_uid=self.me)

        self.assertEqual(result, {"ok": True})
        self.assertIsNotNone(self.msg.deleted_at)
        self.assertGreater(self.msg.updated_at, before)
        db.commit.assert_awaited_once()

    async def test_delete_rejects_someone_elses_message(self):
        self._patch_access(self.msg)
        db = MagicMock()
        with self.assertRaises(HTTPException) as raised:
            await dm.delete_message(self.conv_id, self.msg.id, db=db, _session_uid=self.other)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIsNone(self.msg.deleted_at)

    async def test_delete_is_idempotent_without_second_bump(self):
        already = datetime.now(UTC) - timedelta(minutes=1)
        self.msg.deleted_at = already
        self.msg.updated_at = already
        self._patch_access(self.msg)
        db = MagicMock()
        db.commit = AsyncMock()

        await dm.delete_message(self.conv_id, self.msg.id, db=db, _session_uid=self.me)

        self.assertEqual(self.msg.updated_at, already)
        db.commit.assert_not_awaited()

    async def test_edit_sets_content_edited_at_and_bumps_watermark(self):
        self._patch_access(self.msg)
        before = self.msg.updated_at
        reactions_result = MagicMock()
        reactions_result.all.return_value = []
        db = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock(return_value=reactions_result)

        with patch.object(dm, "_banned_keywords", AsyncMock(return_value=set())):
            out = await dm.edit_message(
                self.conv_id, self.msg.id, DmMessageEditRequest(content="fixed"), db=db, _session_uid=self.me
            )

        self.assertEqual(self.msg.content, "fixed")
        self.assertIsNotNone(self.msg.edited_at)
        self.assertGreater(self.msg.updated_at, before)
        self.assertEqual(out.content, "fixed")
        self.assertIsNotNone(out.edited_at)

    async def test_edit_rejects_someone_elses_message(self):
        self._patch_access(self.msg)
        with self.assertRaises(HTTPException) as raised:
            await dm.edit_message(
                self.conv_id, self.msg.id, DmMessageEditRequest(content="x"), db=MagicMock(), _session_uid=self.other
            )
        self.assertEqual(raised.exception.status_code, 403)

    async def test_edit_rejects_deleted_message(self):
        self.msg.deleted_at = datetime.now(UTC)
        self._patch_access(self.msg)
        with self.assertRaises(HTTPException) as raised:
            await dm.edit_message(
                self.conv_id, self.msg.id, DmMessageEditRequest(content="x"), db=MagicMock(), _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 400)


class ReactionToggleTest(unittest.IsolatedAsyncioTestCase):
    """(b) 고정 팔레트 + PK(message_id, user_id, emoji) 유니크 기반 멱등 토글."""

    def setUp(self):
        self.me = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.msg = _message(self.conv_id, self.me)
        patcher = patch.object(dm, "_require_message_access", AsyncMock(return_value=self.msg))
        patcher.start()
        self.addCleanup(patcher.stop)

    def _db(self, insert_rowcount=1):
        insert_result = MagicMock()
        insert_result.rowcount = insert_rowcount
        reactions_result = MagicMock()
        reactions_result.all.return_value = [(self.msg.id, "👍", 1, True)]
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[insert_result, reactions_result])
        db.commit = AsyncMock()
        return db

    async def test_add_reaction_upserts_on_unique_key_and_bumps(self):
        db = self._db(insert_rowcount=1)
        before = self.msg.updated_at

        out = await dm.add_reaction(self.conv_id, self.msg.id, "👍", db=db, _session_uid=self.me)

        insert_sql = str(db.execute.await_args_list[0].args[0].compile(dialect=postgresql.dialect()))
        self.assertIn("INSERT INTO dm_message_reactions", insert_sql)
        self.assertIn("ON CONFLICT (message_id, user_id, emoji) DO NOTHING", insert_sql)
        self.assertGreater(self.msg.updated_at, before)
        db.commit.assert_awaited_once()
        self.assertEqual(out[0].emoji, "👍")
        self.assertTrue(out[0].reacted_by_me)

    async def test_duplicate_reaction_is_noop_and_does_not_bump(self):
        db = self._db(insert_rowcount=0)  # ON CONFLICT DO NOTHING — 이미 눌러둔 이모지
        before = self.msg.updated_at

        await dm.add_reaction(self.conv_id, self.msg.id, "👍", db=db, _session_uid=self.me)

        self.assertEqual(self.msg.updated_at, before)

    async def test_rejects_emoji_outside_fixed_palette(self):
        with self.assertRaises(HTTPException) as raised:
            await dm.add_reaction(self.conv_id, self.msg.id, "🦄", db=MagicMock(), _session_uid=self.me)
        self.assertEqual(raised.exception.status_code, 400)

    async def test_rejects_reaction_on_deleted_message(self):
        self.msg.deleted_at = datetime.now(UTC)
        with self.assertRaises(HTTPException) as raised:
            await dm.add_reaction(self.conv_id, self.msg.id, "👍", db=MagicMock(), _session_uid=self.me)
        self.assertEqual(raised.exception.status_code, 400)

    async def test_remove_reaction_deletes_row_and_bumps(self):
        reaction = MagicMock()
        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = reaction
        reactions_result = MagicMock()
        reactions_result.all.return_value = []
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[select_result, reactions_result])
        db.delete = AsyncMock()
        db.commit = AsyncMock()
        before = self.msg.updated_at

        out = await dm.remove_reaction(self.conv_id, self.msg.id, "👍", db=db, _session_uid=self.me)

        db.delete.assert_awaited_once_with(reaction)
        self.assertGreater(self.msg.updated_at, before)
        self.assertEqual(out, [])

    async def test_remove_absent_reaction_is_noop(self):
        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = None
        reactions_result = MagicMock()
        reactions_result.all.return_value = []
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[select_result, reactions_result])
        db.delete = AsyncMock()
        db.commit = AsyncMock()
        before = self.msg.updated_at

        await dm.remove_reaction(self.conv_id, self.msg.id, "👍", db=db, _session_uid=self.me)

        db.delete.assert_not_awaited()
        db.commit.assert_not_awaited()
        self.assertEqual(self.msg.updated_at, before)


class ReplyPreviewSnapshotTest(unittest.IsolatedAsyncioTestCase):
    """(d) 답장 전송 시 reply_preview 스냅샷 정합성."""

    def setUp(self):
        self.me = uuid.uuid4()
        self.other = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.conv = _direct_conv(self.conv_id, self.me, self.other)
        for name in ("require_unblocked", "noti_events"):
            patcher = patch.object(dm, name, MagicMock() if name == "noti_events" else AsyncMock())
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch.object(dm, "_banned_keywords", AsyncMock(return_value=set()))
        patcher.start()
        self.addCleanup(patcher.stop)

    def _db(self, original):
        sender = MagicMock()
        sender.nickname = "보낸이"
        original_sender = MagicMock()
        original_sender.nickname = "원본작성자"

        async def _get(model, key):
            from app.models import DmConversation, User

            if model is DmConversation:
                return self.conv
            if model is User:
                return original_sender if key == self.other else sender
            return None

        added = []

        def _add(obj):
            # 실 흐름에선 flush 시 컬럼 default 가 id 를 채운다 — mock 세션이라 직접 채워준다.
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            added.append(obj)

        original_result = MagicMock()
        original_result.scalar_one_or_none.return_value = original

        def _reselect_result():
            result = MagicMock()
            result.scalar_one.side_effect = lambda: added[0]
            return result

        db = MagicMock()
        db.get = AsyncMock(side_effect=_get)
        db.add = MagicMock(side_effect=_add)
        db.commit = AsyncMock()
        db.execute = AsyncMock(side_effect=[original_result, _reselect_result()])
        return db, added

    async def test_snapshot_captures_sender_and_content_prefix(self):
        long_content = "원본 메시지 " * 30  # 80자 초과
        original = _message(self.conv_id, self.other, content=long_content)
        db, added = self._db(original)

        body = DmMessageCreateRequest(content="답장입니다", reply_to_message_id=original.id)
        out = await dm.send_message(self.conv_id, body, db=db, _session_uid=self.me)

        saved = added[0]
        self.assertEqual(saved.reply_to_message_id, original.id)
        self.assertEqual(
            saved.reply_preview,
            {
                "senderId": str(self.other),
                "senderNickname": "원본작성자",
                "content": long_content[:80],
                "messageType": "text",
            },
        )
        self.assertEqual(out.reply_preview, saved.reply_preview)

    async def test_reply_to_deleted_original_is_rejected(self):
        original = _message(self.conv_id, self.other, deleted_at=datetime.now(UTC))
        db, _added = self._db(original)

        body = DmMessageCreateRequest(content="답장", reply_to_message_id=original.id)
        with self.assertRaises(HTTPException) as raised:
            await dm.send_message(self.conv_id, body, db=db, _session_uid=self.me)
        self.assertEqual(raised.exception.status_code, 400)

    async def test_reply_target_outside_conversation_is_404(self):
        db, _added = self._db(original=None)  # 같은 대화방 스코프 조회에서 미발견

        body = DmMessageCreateRequest(content="답장", reply_to_message_id=uuid.uuid4())
        with self.assertRaises(HTTPException) as raised:
            await dm.send_message(self.conv_id, body, db=db, _session_uid=self.me)
        self.assertEqual(raised.exception.status_code, 404)


class VoicePlayedWatermarkTest(unittest.IsolatedAsyncioTestCase):
    """code-review 백엔드 #2 회귀 — 음성 재생완료가 updated_at 을 bump 하고 동기화 필드셋을 반환해야
    상대 클라이언트의 워터마크 폴링(after=updated_at)에 이 변경이 실린다."""

    async def test_mark_voice_played_bumps_watermark_and_returns_sync_fields(self):
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = _direct_conv(conv_id, me, other)
        before = datetime.now(UTC) - timedelta(minutes=1)
        msg = _message(
            conv_id,
            other,
            content=None,
            message_type="voice",
            created_at=before,
            updated_at=before,
            audio_content_id=uuid.uuid4(),
        )
        content = MagicMock()
        content.file_path = "dm/voice.m4a"

        async def _get(model, _key):
            from app.models import DmConversation

            return conv if model is DmConversation else content

        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = msg
        reactions_result = MagicMock()
        reactions_result.all.return_value = [(msg.id, "👍", 1, False)]
        db = MagicMock()
        db.get = AsyncMock(side_effect=_get)
        db.execute = AsyncMock(side_effect=[msg_result, reactions_result])
        db.delete = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        with (
            patch.object(dm, "require_unblocked", AsyncMock()),
            patch.object(dm.asyncio, "to_thread", AsyncMock(return_value=False)),
        ):
            out = await dm.mark_voice_played(conv_id, msg.id, db=db, _session_uid=me)

        self.assertGreater(msg.updated_at, before)  # 워터마크 bump — 폴링에 실린다
        self.assertEqual(out.updated_at, msg.updated_at)
        self.assertEqual(out.reactions[0].emoji, "👍")  # 다른 엔드포인트와 동일 필드셋
        self.assertIsNone(out.deleted_at)
        self.assertIsNone(out.reply_to_message_id)


class ConversationListDeletedMessageTest(unittest.IsolatedAsyncioTestCase):
    """code-review 백엔드 #3 회귀 — 소프트 삭제된 메시지가 대화 목록에 노출/집계되지 않아야 한다."""

    async def test_deleted_last_message_is_masked_and_excluded_from_unread(self):
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = _direct_conv(conv_id, me, other)
        conv.last_message_at = datetime.now(UTC)
        conv.title = None
        conv.photo_content = None
        conv.member_count = 2
        conv.community_group_id = None
        deleted_last = _message(conv_id, other, content="비밀 내용", deleted_at=datetime.now(UTC))

        blocks = MagicMock()
        blocks.all.return_value = []
        members = MagicMock()
        members.all.return_value = [(conv_id, datetime.now(UTC) - timedelta(days=1))]
        convs = MagicMock()
        convs.scalars.return_value.all.return_value = [conv]
        trades = MagicMock()
        trades.all.return_value = []
        last_msg = MagicMock()
        last_msg.scalar_one_or_none.return_value = deleted_last
        unread = MagicMock()
        unread.scalar_one.return_value = 0

        db = MagicMock()
        db.get = AsyncMock(return_value=MagicMock(nickname="상대"))
        db.execute = AsyncMock(side_effect=[blocks, members, convs, trades, last_msg, unread])

        with patch.object(dm, "resolve_avatar_url", return_value=None):
            result = await dm.get_conversations(user_id=me, db=db, _session_uid=me)

        # 삭제된 마지막 메시지 — 원문 대신 플레이스홀더 (DmDetail 의 dm.deletedMessage 와 동일 문구)
        self.assertEqual(result[0].last_message_preview, "삭제된 메시지입니다")
        # 안읽음 카운트 쿼리에 deleted_at IS NULL 조건이 들어간다
        unread_sql = str(db.execute.await_args_list[5].args[0].compile(dialect=postgresql.dialect()))
        self.assertIn("deleted_at IS NULL", unread_sql)


if __name__ == "__main__":
    unittest.main()
