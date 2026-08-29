"""대화방 게시판(218_dm_channel_board) 회귀 테스트.

- 채널 생성은 운영진만 — 일반 멤버 403, owner 201
- 채널 순서변경은 PATCH 한 번으로 옮기고 0..n-1 재번호 (범위 밖 position 은 양끝으로 클램프)
- 글 작성은 멤버 누구나 201, 비멤버는 require_member 가 403
- 본문 금칙어는 400 {"code": "banned_keyword"} (dm.py 와 동일 계약)
- direct 방은 게시판 자체가 400
- 목록 쿼리는 소프트삭제(deleted_at) 글을 제외한다

test_dm_notice.py 스타일 — mock db 로 라우터 함수 직접 호출한다(실 DB 불필요).
"""

import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement

from app.models import DmChannelPost, DmChannelPostComment, DmConversation, DmConversationChannel
from app.routers import dm_channels
from app.schemas import (
    DmChannelCommentCreateRequest,
    DmChannelCreateRequest,
    DmChannelPatchRequest,
    DmChannelPostCreateRequest,
)


def _conv(conv_id, conversation_type="group"):
    conv = MagicMock(spec=DmConversation)
    conv.id = conv_id
    conv.conversation_type = conversation_type
    return conv


def _channel(conv_id, channel_id=None):
    return DmConversationChannel(
        id=channel_id or uuid.uuid4(),
        conversation_id=conv_id,
        name="공지사항",
        position=0,
        created_at=datetime.now(UTC),
    )


def _author(uid, nickname="글쓴이"):
    user = MagicMock()
    user.id = uid
    user.nickname = nickname
    user.avatar_content = None
    user.avatar_url = None
    return user


def _result(*, scalar_one=None, scalar_one_or_none=None, rows=None):
    res = MagicMock()
    res.scalar_one.return_value = scalar_one
    res.scalar_one_or_none.return_value = scalar_one_or_none
    res.scalars.return_value.all.return_value = rows if rows is not None else []
    return res


def _db(conv, results):
    """execute 결과를 호출 순서대로 큐잉하는 mock db. 실행된 statement 는 db.statements 에 쌓인다."""
    queue = list(results)
    statements = []

    async def _execute(stmt, *args, **kwargs):
        statements.append(stmt)
        return queue.pop(0) if queue else _result()

    async def _refresh(obj):
        # 실 DB 라면 INSERT 시 컬럼 default 로 채워지는 값들 — mock 에서는 refresh 가 대신 채운다
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "comment_count", 0) is None:
            obj.comment_count = 0

    db = MagicMock()
    db.get = AsyncMock(return_value=conv)
    db.execute = AsyncMock(side_effect=_execute)
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock(side_effect=_refresh)
    db.statements = statements
    return db


class _BoardTestBase(unittest.IsolatedAsyncioTestCase):
    role = "member"

    def setUp(self):
        self.me = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.conv = _conv(self.conv_id)
        member = MagicMock()
        member.role = self.role
        for name, mock in (
            ("require_member", AsyncMock(return_value=member)),
            ("require_not_banned", AsyncMock(return_value=None)),
            ("_banned_keywords", AsyncMock(return_value=["도박"])),
        ):
            patcher = patch.object(dm_channels, name, mock)
            patcher.start()
            self.addCleanup(patcher.stop)


class CreateChannelTest(_BoardTestBase):
    async def test_plain_member_cannot_create_a_channel(self):
        db = _db(self.conv, [])

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.create_channel(
                self.conv_id, DmChannelCreateRequest(name="공지"), db=db, _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 403)
        db.add.assert_not_called()

    async def test_direct_conversation_has_no_board(self):
        direct = _conv(self.conv_id, conversation_type="direct")
        db = _db(direct, [])

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.create_channel(
                self.conv_id, DmChannelCreateRequest(name="공지"), db=db, _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 400)

    async def test_missing_conversation_is_404(self):
        db = _db(None, [])

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.list_channels(self.conv_id, db=db, _session_uid=self.me)
        self.assertEqual(raised.exception.status_code, 404)


class CreateChannelAsOwnerTest(_BoardTestBase):
    role = "owner"

    async def test_owner_creates_a_channel_at_the_end(self):
        db = _db(self.conv, [_result(scalar_one=3)])  # max(position)+1

        out = await dm_channels.create_channel(
            self.conv_id, DmChannelCreateRequest(name="  자유게시판  "), db=db, _session_uid=self.me
        )

        self.assertEqual(out.name, "자유게시판")  # 앞뒤 공백 제거
        self.assertEqual(out.position, 3)
        self.assertEqual(out.conversation_id, self.conv_id)
        db.add.assert_called_once()
        db.commit.assert_awaited_once()


class ReorderChannelTest(_BoardTestBase):
    """순서변경은 서버가 한 트랜잭션 안에서 옮기고 0..n-1 로 재번호한다 (PATCH 한 번)."""

    role = "owner"

    def _row(self, name, position):
        channel = _channel(self.conv_id)
        channel.name = name
        channel.position = position
        return channel

    async def _move(self, rows, target, position):
        db = _db(
            self.conv,
            [
                _result(scalar_one_or_none=target),  # _get_channel
                _result(rows=rows),  # _ordered_channels
            ],
        )
        await dm_channels.update_channel(
            self.conv_id, target.id, DmChannelPatchRequest(position=position), db=db, _session_uid=self.me
        )
        db.commit.assert_awaited_once()
        return [(c.name, c.position) for c in sorted(rows, key=lambda c: c.position)]

    async def test_moving_a_channel_up_renumbers_contiguously(self):
        rows = [self._row("A", 0), self._row("B", 1), self._row("C", 2)]

        self.assertEqual(await self._move(rows, rows[2], 0), [("C", 0), ("A", 1), ("B", 2)])

    async def test_moving_a_channel_down_renumbers_contiguously(self):
        rows = [self._row("A", 0), self._row("B", 1), self._row("C", 2)]

        self.assertEqual(await self._move(rows, rows[0], 2), [("B", 0), ("C", 1), ("A", 2)])

    async def test_out_of_range_position_is_clamped(self):
        rows = [self._row("A", 0), self._row("B", 1), self._row("C", 2)]
        self.assertEqual(await self._move(rows, rows[0], 99), [("B", 0), ("C", 1), ("A", 2)])

        rows = [self._row("A", 0), self._row("B", 1), self._row("C", 2)]
        self.assertEqual(await self._move(rows, rows[2], -5), [("C", 0), ("A", 1), ("B", 2)])

    async def test_plain_member_cannot_reorder(self):
        with patch.object(dm_channels, "require_member", AsyncMock(return_value=MagicMock(role="member"))):
            db = _db(self.conv, [])
            with self.assertRaises(HTTPException) as raised:
                await dm_channels.update_channel(
                    self.conv_id, uuid.uuid4(), DmChannelPatchRequest(position=0), db=db, _session_uid=self.me
                )
        self.assertEqual(raised.exception.status_code, 403)
        db.commit.assert_not_awaited()


class CreatePostTest(_BoardTestBase):
    async def test_member_can_post(self):
        channel = _channel(self.conv_id)
        db = _db(
            self.conv,
            [
                _result(scalar_one_or_none=channel),  # _get_channel
                _result(rows=[_author(self.me)]),  # _post_out_batch 의 작성자 조회
            ],
        )

        out = await dm_channels.create_post(
            self.conv_id,
            channel.id,
            DmChannelPostCreateRequest(body="주말 라이딩 갑니다"),
            db=db,
            _session_uid=self.me,
        )

        self.assertEqual(out.body, "주말 라이딩 갑니다")
        self.assertEqual(out.channel_id, channel.id)
        self.assertEqual(out.author_id, self.me)
        self.assertEqual(out.author_nickname, "글쓴이")
        self.assertEqual(out.image_urls, [])
        self.assertEqual(out.comment_count, 0)  # 댓글은 P2
        db.commit.assert_awaited_once()

    async def test_banned_keyword_is_rejected_like_dm(self):
        channel = _channel(self.conv_id)
        db = _db(self.conv, [_result(scalar_one_or_none=channel)])

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.create_post(
                self.conv_id,
                channel.id,
                DmChannelPostCreateRequest(body="여기서 도박 하실 분"),
                db=db,
                _session_uid=self.me,
            )
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, {"code": "banned_keyword"})
        db.add.assert_not_called()

    async def test_non_member_is_403(self):
        with patch.object(
            dm_channels, "require_member", AsyncMock(side_effect=HTTPException(status_code=403, detail="Not a member"))
        ):
            db = _db(self.conv, [])
            with self.assertRaises(HTTPException) as raised:
                await dm_channels.create_post(
                    self.conv_id,
                    uuid.uuid4(),
                    DmChannelPostCreateRequest(body="안녕하세요"),
                    db=db,
                    _session_uid=self.me,
                )
        self.assertEqual(raised.exception.status_code, 403)

    async def test_channel_from_another_room_is_404(self):
        db = _db(self.conv, [_result(scalar_one_or_none=None)])

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.create_post(
                self.conv_id, uuid.uuid4(), DmChannelPostCreateRequest(body="안녕"), db=db, _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 404)


class ListPostsTest(_BoardTestBase):
    async def test_soft_deleted_posts_are_excluded(self):
        channel = _channel(self.conv_id)
        db = _db(
            self.conv,
            [
                _result(scalar_one_or_none=channel),  # _get_channel
                _result(scalar_one=0),  # count
                _result(rows=[]),  # 목록
            ],
        )

        page = await dm_channels.list_posts(self.conv_id, channel.id, db=db, _session_uid=self.me)

        self.assertEqual(page.items, [])
        self.assertEqual(page.total, 0)
        # count·목록 두 쿼리 모두 deleted_at IS NULL 로 소프트삭제를 걸러야 한다
        for stmt in db.statements[1:]:
            self.assertIn("deleted_at IS NULL", str(stmt))


class DeletePostTest(_BoardTestBase):
    def _post(self, author_id):
        post = MagicMock()
        post.id = uuid.uuid4()
        post.author_id = author_id
        post.deleted_at = None
        return post

    async def test_author_can_soft_delete(self):
        post = self._post(self.me)
        db = _db(self.conv, [_result(scalar_one_or_none=post)])

        await dm_channels.delete_post(self.conv_id, post.id, db=db, _session_uid=self.me)

        self.assertIsNotNone(post.deleted_at)  # 하드삭제가 아니다
        db.delete.assert_not_awaited()
        db.commit.assert_awaited_once()

    async def test_other_member_cannot_delete(self):
        post = self._post(uuid.uuid4())
        db = _db(self.conv, [_result(scalar_one_or_none=post)])

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.delete_post(self.conv_id, post.id, db=db, _session_uid=self.me)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIsNone(post.deleted_at)


class DeletePostAsOwnerTest(DeletePostTest):
    role = "owner"

    async def test_other_member_cannot_delete(self):
        """운영진은 남의 글도 내릴 수 있다 — 부모 클래스의 403 기대를 뒤집는다."""
        post = self._post(uuid.uuid4())
        db = _db(self.conv, [_result(scalar_one_or_none=post)])

        await dm_channels.delete_post(self.conv_id, post.id, db=db, _session_uid=self.me)

        self.assertIsNotNone(post.deleted_at)


class CommentTest(_BoardTestBase):
    """댓글(219) — 작성·답글·삭제 권한·금칙어·부모 소속 검사."""

    def _post(self, author_id=None, comment_count=0):
        post = MagicMock()
        post.id = uuid.uuid4()
        post.author_id = author_id or self.me
        post.comment_count = comment_count
        post.deleted_at = None
        return post

    def _assert_count_expr(self, post, expected):
        """댓글 수는 파이썬이 읽고-더해-쓰지 않는다 — 동시 작성에도 안전하도록 SQL 식을 대입한다."""
        self.assertIsInstance(post.comment_count, ColumnElement)
        self.assertEqual(str(post.comment_count), str(expected))

    def _comment(self, post_id, author_id, parent_id=None, deleted=False):
        return DmChannelPostComment(
            id=uuid.uuid4(),
            post_id=post_id,
            author_id=author_id,
            parent_id=parent_id,
            body="좋아요",
            deleted_at=datetime.now(UTC) if deleted else None,
            created_at=datetime.now(UTC),
        )

    async def test_comment_and_reply_raise_the_count_in_sql(self):
        post = self._post()
        db = _db(self.conv, [_result(scalar_one_or_none=post), _result(rows=[_author(self.me)])])

        top = await dm_channels.create_comment(
            self.conv_id, post.id, DmChannelCommentCreateRequest(body="첫 댓글"), db=db, _session_uid=self.me
        )

        self._assert_count_expr(post, DmChannelPost.comment_count + 1)
        self.assertIsNone(top.parent_id)
        self.assertFalse(top.deleted)
        self.assertEqual(top.author_nickname, "글쓴이")

        parent = self._comment(post.id, self.me)
        db = _db(
            self.conv,
            [
                _result(scalar_one_or_none=post),  # _get_post
                _result(scalar_one_or_none=parent),  # 부모 댓글 조회
                _result(rows=[_author(self.me)]),
            ],
        )
        reply = await dm_channels.create_comment(
            self.conv_id,
            post.id,
            DmChannelCommentCreateRequest(body="답글", parent_id=parent.id),
            db=db,
            _session_uid=self.me,
        )

        self.assertEqual(reply.parent_id, parent.id)
        self._assert_count_expr(post, DmChannelPost.comment_count + 1)

    async def test_reply_to_a_reply_is_folded_into_one_level(self):
        post = self._post()
        top = self._comment(post.id, self.me)
        reply = self._comment(post.id, self.me, parent_id=top.id)
        db = _db(
            self.conv,
            [
                _result(scalar_one_or_none=post),
                _result(scalar_one_or_none=reply),  # 답글에 답글
                _result(rows=[_author(self.me)]),
            ],
        )

        out = await dm_channels.create_comment(
            self.conv_id,
            post.id,
            DmChannelCommentCreateRequest(body="답답글", parent_id=reply.id),
            db=db,
            _session_uid=self.me,
        )

        self.assertEqual(out.parent_id, top.id)  # 들여쓰기는 한 단계까지만

    async def test_banned_keyword_is_rejected(self):
        post = self._post()
        db = _db(self.conv, [_result(scalar_one_or_none=post)])

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.create_comment(
                self.conv_id, post.id, DmChannelCommentCreateRequest(body="도박 하실 분"), db=db, _session_uid=self.me
            )
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, {"code": "banned_keyword"})
        db.add.assert_not_called()
        self.assertEqual(post.comment_count, 0)

    async def test_parent_from_another_post_is_rejected(self):
        post = self._post()
        db = _db(
            self.conv,
            [
                _result(scalar_one_or_none=post),
                _result(scalar_one_or_none=None),  # 다른 글의 댓글 id → 이 글에서는 안 나온다
            ],
        )

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.create_comment(
                self.conv_id,
                post.id,
                DmChannelCommentCreateRequest(body="답글", parent_id=uuid.uuid4()),
                db=db,
                _session_uid=self.me,
            )
        self.assertEqual(raised.exception.status_code, 400)
        db.add.assert_not_called()

    async def test_reply_to_a_soft_deleted_parent_is_rejected(self):
        """삭제된 댓글은 부모가 될 수 없다 — 쿼리의 deleted_at 필터가 남의 글 부모와 같은 400 으로 떨군다."""
        post = self._post()
        db = _db(
            self.conv,
            [
                _result(scalar_one_or_none=post),
                _result(scalar_one_or_none=None),  # deleted_at 필터에 걸려 안 나온다
            ],
        )

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.create_comment(
                self.conv_id,
                post.id,
                DmChannelCommentCreateRequest(body="답글", parent_id=uuid.uuid4()),
                db=db,
                _session_uid=self.me,
            )
        self.assertEqual(raised.exception.status_code, 400)
        db.add.assert_not_called()
        # 부모 조회에 소프트삭제 필터가 실제로 걸려 있는지 — 쿼리 문자열로 확인한다.
        self.assertIn("deleted_at IS NULL", str(db.statements[1]))

    async def test_other_member_cannot_delete_a_comment(self):
        post = self._post(comment_count=2)
        comment = self._comment(post.id, uuid.uuid4())
        db = _db(self.conv, [_result(scalar_one_or_none=post), _result(scalar_one_or_none=comment)])

        with self.assertRaises(HTTPException) as raised:
            await dm_channels.delete_comment(self.conv_id, post.id, comment.id, db=db, _session_uid=self.me)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIsNone(comment.deleted_at)
        self.assertEqual(post.comment_count, 2)

    async def test_author_soft_deletes_and_the_count_drops(self):
        post = self._post(comment_count=2)
        comment = self._comment(post.id, self.me)
        db = _db(self.conv, [_result(scalar_one_or_none=post), _result(scalar_one_or_none=comment)])

        await dm_channels.delete_comment(self.conv_id, post.id, comment.id, db=db, _session_uid=self.me)

        self.assertIsNotNone(comment.deleted_at)  # 하드삭제가 아니다
        self._assert_count_expr(post, func.greatest(DmChannelPost.comment_count - 1, 0))
        db.delete.assert_not_awaited()

    async def test_count_never_goes_below_zero(self):
        """0 클램프도 파이썬 max() 가 아니라 SQL greatest() 로 — 감소가 DB 쪽에서 원자적으로 일어난다."""
        post = self._post(comment_count=0)
        comment = self._comment(post.id, self.me)
        db = _db(self.conv, [_result(scalar_one_or_none=post), _result(scalar_one_or_none=comment)])

        await dm_channels.delete_comment(self.conv_id, post.id, comment.id, db=db, _session_uid=self.me)

        self._assert_count_expr(post, func.greatest(DmChannelPost.comment_count - 1, 0))

    async def test_deleted_comment_stays_only_when_it_still_has_replies(self):
        post = self._post()
        kept = self._comment(post.id, self.me, deleted=True)
        reply = self._comment(post.id, self.me, parent_id=kept.id)
        dropped = self._comment(post.id, self.me, deleted=True)
        db = _db(
            self.conv,
            [
                _result(scalar_one_or_none=post),  # _get_post
                _result(rows=[kept, reply, dropped]),  # 댓글 전체
                _result(rows=[_author(self.me)]),  # 작성자 배치
            ],
        )

        rows = await dm_channels.list_comments(self.conv_id, post.id, db=db, _session_uid=self.me)

        self.assertEqual([c.id for c in rows], [kept.id, reply.id])
        self.assertTrue(rows[0].deleted)
        self.assertEqual(rows[0].body, "")  # 자리표시 — 본문은 내리지 않는다
        self.assertIsNone(rows[0].author_nickname)
        self.assertFalse(rows[1].deleted)


class CommentAsOwnerTest(CommentTest):
    role = "owner"

    async def test_other_member_cannot_delete_a_comment(self):
        """운영진은 남의 댓글도 내릴 수 있다 — 부모 클래스의 403 기대를 뒤집는다."""
        post = self._post(comment_count=2)
        comment = self._comment(post.id, uuid.uuid4())
        db = _db(self.conv, [_result(scalar_one_or_none=post), _result(scalar_one_or_none=comment)])

        await dm_channels.delete_comment(self.conv_id, post.id, comment.id, db=db, _session_uid=self.me)

        self.assertIsNotNone(comment.deleted_at)
        self._assert_count_expr(post, func.greatest(DmChannelPost.comment_count - 1, 0))


if __name__ == "__main__":
    unittest.main()
