import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers.feed import get_feed


class FeedBboxTest(unittest.IsolatedAsyncioTestCase):
    async def test_bbox_uses_public_ward_centroid_and_reports_completion(self):
        count_result = MagicMock()
        count_result.scalar_one.return_value = 0
        rows_result = MagicMock()
        rows_result.all.return_value = []
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[count_result, rows_result])

        page = await get_feed(
            filter="all",
            page=1,
            size=20,
            user_id=None,
            author_id=None,
            lat=None,
            lng=None,
            radius_m=5000,
            min_lat=Decimal("10.70"),
            max_lat=Decimal("10.80"),
            min_lng=Decimal("106.60"),
            max_lng=Decimal("106.80"),
            lang=None,
            db=db,
        )

        count_sql = str(db.execute.await_args_list[0].args[0])
        rows_sql = str(db.execute.await_args_list[1].args[0])
        self.assertIn("wards.center_lat", count_sql)
        self.assertIn("wards.center_lng", count_sql)
        self.assertNotIn("feed_posts.latitude >=", count_sql)
        self.assertIn("feed_posts.created_at DESC, feed_posts.id DESC", rows_sql)
        self.assertFalse(page.has_more)

    async def test_partial_bbox_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            await get_feed(
                filter="all",
                page=1,
                size=20,
                user_id=None,
                author_id=None,
                lat=None,
                lng=None,
                radius_m=5000,
                min_lat=Decimal("10.70"),
                max_lat=None,
                min_lng=None,
                max_lng=None,
                lang=None,
                db=AsyncMock(),
            )

        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
