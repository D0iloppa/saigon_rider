import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import feed
from app.schemas import LikeToggleRequest


class FeedBlockBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_stories_filter_both_directions_of_a_block(self):
        result = MagicMock()
        result.all.return_value = []
        db = AsyncMock()
        db.execute.return_value = result

        await feed.get_stories(db=db, session_uid=uuid.uuid4())

        sql = str(db.execute.await_args.args[0])
        self.assertIn("user_blocks.blocker_id", sql)
        self.assertIn("user_blocks.blocked_id", sql)

    async def test_direct_post_returns_not_found_when_block_filter_excludes_it(self):
        result = MagicMock()
        result.first.return_value = None
        db = AsyncMock()
        db.execute.return_value = result

        with self.assertRaises(HTTPException) as raised:
            await feed.get_feed_post(
                post_id=uuid.uuid4(),
                lang=None,
                db=db,
                session_uid=uuid.uuid4(),
            )

        self.assertEqual(raised.exception.status_code, 404)
        sql = str(db.execute.await_args.args[0])
        self.assertIn("user_blocks.blocker_id", sql)
        self.assertIn("user_blocks.blocked_id", sql)

    async def test_post_like_rejects_blocked_author_interaction(self):
        session_uid = uuid.uuid4()
        author_id = uuid.uuid4()
        post = SimpleNamespace(user_id=author_id, like_count=0)
        db = AsyncMock()

        with (
            patch.object(feed, "_get_post_or_404", AsyncMock(return_value=post)),
            patch.object(feed, "require_unblocked", AsyncMock()) as guard,
        ):
            db.get.return_value = SimpleNamespace()
            await feed.toggle_like(
                uuid.uuid4(),
                LikeToggleRequest(user_id=session_uid),
                db,
                session_uid,
            )

        guard.assert_awaited_once_with(db, session_uid, author_id)

    async def test_comment_like_checks_post_and_comment_authors(self):
        session_uid = uuid.uuid4()
        post_author = uuid.uuid4()
        comment_author = uuid.uuid4()
        post = SimpleNamespace(user_id=post_author)
        comment = SimpleNamespace(user_id=comment_author, like_count=0)
        result = MagicMock()
        result.scalar_one_or_none.return_value = comment
        db = AsyncMock()
        db.execute.return_value = result
        db.get.return_value = SimpleNamespace()

        with (
            patch.object(feed, "_get_post_or_404", AsyncMock(return_value=post)),
            patch.object(feed, "require_unblocked", AsyncMock()) as guard,
        ):
            await feed.toggle_comment_like(
                uuid.uuid4(),
                uuid.uuid4(),
                LikeToggleRequest(user_id=session_uid),
                session_uid,
                db,
            )

        self.assertEqual(
            [call.args for call in guard.await_args_list],
            [(db, session_uid, post_author), (db, session_uid, comment_author)],
        )


if __name__ == "__main__":
    unittest.main()
