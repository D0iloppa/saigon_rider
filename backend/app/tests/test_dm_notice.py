"""방 공지(217_dm_conversation_notice) 회귀 테스트.

- 멤버 누구나 등록 → 3개 컬럼 세팅 + 'notice_set' 시스템 메시지 삽입 + 응답에 notice 채워짐
- direct 방은 400 (공지는 group/open 전용)
- 내리기는 등록자 본인 또는 owner/admin — 그 외 멤버는 403
- 원본이 소프트삭제되면 조회 시 notice 는 null

test_dm_message_sync.py 스타일 — mock db 로 라우터 함수 직접 호출한다(실 DB 불필요).
"""

import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.models import DmConversation, DmMessage, User
from app.routers import dm
from app.schemas import DmConversationNoticeRequest


def _group_conv(conv_id, **kwargs):
    conv = MagicMock()
    conv.id = conv_id
    conv.conversation_type = kwargs.pop("conversation_type", "group")
    conv.title = "우리방"
    conv.photo_content = None
    conv.member_count = 3
    conv.community_group_id = None
    conv.last_message_at = datetime.now(UTC)
    conv.notice_message_id = kwargs.pop("notice_message_id", None)
    conv.notice_set_by = kwargs.pop("notice_set_by", None)
    conv.notice_set_at = kwargs.pop("notice_set_at", None)
    return conv


def _message(conv_id, sender_id, **kwargs):
    now = datetime.now(UTC)
    return DmMessage(
        id=kwargs.pop("id", uuid.uuid4()),
        conversation_id=conv_id,
        sender_id=sender_id,
        content=kwargs.pop("content", "공지할 내용"),
        message_type=kwargs.pop("message_type", "text"),
        created_at=now,
        updated_at=now,
        deleted_at=kwargs.pop("deleted_at", None),
    )


def _db(conv, msg=None, setter_nickname="등록자"):
    setter = MagicMock(spec=User)
    setter.nickname = setter_nickname

    async def _get(model, key):
        if model is DmConversation:
            return conv
        if model is User:
            return setter
        if model is DmMessage:
            return msg
        return None

    msg_result = MagicMock()
    msg_result.scalar_one_or_none.return_value = msg

    added = []
    db = MagicMock()
    db.get = AsyncMock(side_effect=_get)
    db.execute = AsyncMock(return_value=msg_result)
    db.add = MagicMock(side_effect=added.append)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db, added


class SetNoticeTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.me = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.conv = _group_conv(self.conv_id)
        self.msg = _message(self.conv_id, self.me)
        member = MagicMock()
        member.role = "member"
        patcher = patch.object(dm, "require_member", AsyncMock(return_value=member))
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_member_can_set_notice_and_system_message_is_inserted(self):
        db, added = _db(self.conv, self.msg)

        out = await dm.set_conversation_notice(
            self.conv_id, DmConversationNoticeRequest(message_id=self.msg.id), db=db, _session_uid=self.me
        )

        self.assertEqual(self.conv.notice_message_id, self.msg.id)
        self.assertEqual(self.conv.notice_set_by, self.me)
        self.assertIsNotNone(self.conv.notice_set_at)
        # 시스템 메시지 1건 — 프론트가 meta.kind 로 분기한다
        system = added[0]
        self.assertEqual(system.message_type, "system")
        self.assertEqual(system.content, "")
        self.assertEqual(system.meta["kind"], "notice_set")
        self.assertEqual(system.meta["noticeMessageId"], str(self.msg.id))
        self.assertEqual(system.meta["setByName"], "등록자")
        # 워터마크 — created_at == updated_at 이라 상대 폴링(after=updated_at)에 실린다
        self.assertEqual(system.created_at, system.updated_at)
        self.assertEqual(self.conv.last_message_at, system.created_at)
        # 응답에 공지가 실린다
        self.assertEqual(out.notice.message_id, self.msg.id)
        self.assertEqual(out.notice.content, "공지할 내용")
        self.assertEqual(out.notice.set_by, self.me)
        self.assertEqual(out.notice.set_by_nickname, "등록자")
        db.commit.assert_awaited_once()

    async def test_direct_conversation_is_rejected(self):
        conv = _group_conv(self.conv_id, conversation_type="direct")
        db, _added = _db(conv, self.msg)

        with self.assertRaises(HTTPException) as raised:
            await dm.set_conversation_notice(
                self.conv_id, DmConversationNoticeRequest(message_id=self.msg.id), db=db, _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 400)

    async def test_message_outside_conversation_is_404(self):
        db, _added = _db(self.conv, msg=None)

        with self.assertRaises(HTTPException) as raised:
            await dm.set_conversation_notice(
                self.conv_id, DmConversationNoticeRequest(message_id=uuid.uuid4()), db=db, _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 404)

    async def test_non_text_message_cannot_become_a_notice(self):
        # 배너는 content 만 렌더한다 — 스티커/사진은 빈 공지가 되므로 서버가 막는다
        for message_type, content in (("sticker", ""), ("image", None)):
            with self.subTest(message_type=message_type):
                msg = _message(self.conv_id, self.me, message_type=message_type, content=content)
                db, _added = _db(self.conv, msg)

                with self.assertRaises(HTTPException) as raised:
                    await dm.set_conversation_notice(
                        self.conv_id, DmConversationNoticeRequest(message_id=msg.id), db=db, _session_uid=self.me
                    )
                self.assertEqual(raised.exception.status_code, 400)

    async def test_blank_text_message_cannot_become_a_notice(self):
        blank = _message(self.conv_id, self.me, content="   ")
        db, _added = _db(self.conv, blank)

        with self.assertRaises(HTTPException) as raised:
            await dm.set_conversation_notice(
                self.conv_id, DmConversationNoticeRequest(message_id=blank.id), db=db, _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 400)

    async def test_deleted_message_cannot_become_a_notice(self):
        deleted = _message(self.conv_id, self.me, deleted_at=datetime.now(UTC))
        db, _added = _db(self.conv, deleted)

        with self.assertRaises(HTTPException) as raised:
            await dm.set_conversation_notice(
                self.conv_id, DmConversationNoticeRequest(message_id=deleted.id), db=db, _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 404)


class ClearNoticeTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.setter = uuid.uuid4()
        self.other = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.msg_id = uuid.uuid4()

    def _conv(self):
        return _group_conv(
            self.conv_id,
            notice_message_id=self.msg_id,
            notice_set_by=self.setter,
            notice_set_at=datetime.now(UTC),
        )

    def _patch_role(self, role):
        member = MagicMock()
        member.role = role
        patcher = patch.object(dm, "require_member", AsyncMock(return_value=member))
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_setter_can_clear(self):
        conv = self._conv()
        self._patch_role("member")
        db, _added = _db(conv)

        out = await dm.clear_conversation_notice(self.conv_id, db=db, _session_uid=self.setter)

        self.assertIsNone(conv.notice_message_id)
        self.assertIsNone(conv.notice_set_by)
        self.assertIsNone(conv.notice_set_at)
        self.assertIsNone(out.notice)

    async def test_owner_can_clear_someone_elses_notice(self):
        conv = self._conv()
        self._patch_role("owner")
        db, _added = _db(conv)

        await dm.clear_conversation_notice(self.conv_id, db=db, _session_uid=self.other)

        self.assertIsNone(conv.notice_message_id)

    async def test_plain_member_who_did_not_set_it_is_403(self):
        conv = self._conv()
        self._patch_role("member")
        db, _added = _db(conv)

        with self.assertRaises(HTTPException) as raised:
            await dm.clear_conversation_notice(self.conv_id, db=db, _session_uid=self.other)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(conv.notice_message_id, self.msg_id)


class ResolveNoticeTest(unittest.IsolatedAsyncioTestCase):
    """소프트삭제된 원본은 공지로 남지 않는다 (하드삭제는 DB 의 ON DELETE SET NULL 이 처리)."""

    async def test_soft_deleted_notice_message_resolves_to_none(self):
        conv_id, uid = uuid.uuid4(), uuid.uuid4()
        deleted = _message(conv_id, uid, deleted_at=datetime.now(UTC))
        conv = _group_conv(conv_id, notice_message_id=deleted.id, notice_set_by=uid)
        db, _added = _db(conv, deleted)

        self.assertIsNone(await dm._resolve_notice(db, conv))

    async def test_no_notice_column_resolves_to_none_without_a_query(self):
        conv = _group_conv(uuid.uuid4())
        db, _added = _db(conv)

        self.assertIsNone(await dm._resolve_notice(db, conv))
        db.get.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
