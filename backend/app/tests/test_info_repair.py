import asyncio
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.routers import info_repair


class RepairReviewRequestPathTest(unittest.IsolatedAsyncioTestCase):
    async def test_duplicate_commit_rolls_back_without_reward(self):
        diag = MagicMock(constraint_name="uq_repair_review_user_service_nulls_not_distinct")
        original = MagicMock(diag=diag)
        db = MagicMock()
        db.scalar = AsyncMock(return_value=None)
        db.commit = AsyncMock(side_effect=IntegrityError("duplicate", {}, original))
        db.rollback = AsyncMock()
        reward = AsyncMock()
        body = info_repair.ReviewCreate(shop_id=1, service_code=None, rating=5, comment="Good")

        with (
            patch.object(info_repair, "_earn_gp_safe", reward),
            self.assertRaises(HTTPException) as raised,
        ):
            await info_repair.create_repair_review(body, uuid.uuid4(), db)

        self.assertEqual(raised.exception.status_code, 409)
        db.rollback.assert_awaited_once()
        reward.assert_not_awaited()

    async def test_unrelated_integrity_error_is_not_reported_as_duplicate(self):
        diag = MagicMock(constraint_name="repair_review_shop_id_fkey")
        original = MagicMock(diag=diag)
        error = IntegrityError("foreign key", {}, original)
        db = MagicMock()
        db.scalar = AsyncMock(return_value=None)
        db.commit = AsyncMock(side_effect=error)
        db.rollback = AsyncMock()
        body = info_repair.ReviewCreate(shop_id=999999, rating=5)

        with self.assertRaises(IntegrityError) as raised:
            await info_repair.create_repair_review(body, uuid.uuid4(), db)

        self.assertIs(raised.exception, error)
        db.rollback.assert_awaited_once()

    async def test_create_review_does_not_refresh_materialized_view(self):
        db = MagicMock()
        db.scalar = AsyncMock(return_value=None)
        db.commit = AsyncMock()

        async def assign_review_id(review):
            review.review_id = 123

        db.refresh = AsyncMock(side_effect=assign_review_id)
        body = info_repair.ReviewCreate(
            shop_id=1,
            service_code="OIL_CHANGE",
            motorcycle_model="Honda Wave",
            rating=5,
            price_vnd=100_000,
            comment="Good",
            is_anonymous=False,
        )

        with patch.object(info_repair, "_earn_gp_safe", new=AsyncMock(return_value=False)):
            result = await info_repair.create_repair_review(body, uuid.uuid4(), db)

        self.assertEqual(result, {"review_id": 123, "rp_earned": 0})
        db.execute.assert_not_called()
        db.commit.assert_awaited_once()

    async def test_ten_concurrent_reviews_do_not_refresh_materialized_view(self):
        databases = []
        bodies = []
        for index in range(10):
            db = MagicMock()
            db.scalar = AsyncMock(return_value=None)
            db.commit = AsyncMock()

            async def assign_review_id(review, review_id=index + 1):
                review.review_id = review_id

            db.refresh = AsyncMock(side_effect=assign_review_id)
            databases.append(db)
            bodies.append(
                info_repair.ReviewCreate(
                    shop_id=1,
                    service_code=f"SERVICE_{index}",
                    rating=5,
                    comment="Good",
                )
            )

        with patch.object(info_repair, "_earn_gp_safe", new=AsyncMock(return_value=False)):
            results = await asyncio.gather(
                *[
                    info_repair.create_repair_review(body, uuid.uuid4(), db)
                    for body, db in zip(bodies, databases, strict=True)
                ]
            )

        self.assertEqual(len(results), 10)
        for db in databases:
            db.execute.assert_not_called()
            db.commit.assert_awaited_once()
