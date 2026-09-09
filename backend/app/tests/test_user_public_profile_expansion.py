import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers import users


def _result(*, scalar=None, first=None, scalars=None, one=None):
    result = MagicMock()
    result.scalar_one_or_none.return_value = scalar
    result.scalar_one.return_value = scalar
    result.first.return_value = first
    result.scalars.return_value.all.return_value = scalars or []
    if one is not None:
        result.one.return_value = one
    return result


class PublicUserProfileExpansionTest(unittest.IsolatedAsyncioTestCase):
    async def test_mutual_block_returns_uniform_not_found(self):
        target_id, viewer_id = uuid.uuid4(), uuid.uuid4()
        user = SimpleNamespace(id=target_id)
        db = SimpleNamespace(execute=AsyncMock(side_effect=[_result(scalar=user), _result(first=(viewer_id,))]))

        with self.assertRaises(HTTPException) as raised:
            await users.get_user_profile(target_id, db, viewer_id)

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail, "User not found")

    async def test_profile_uses_completed_sales_and_real_review_values(self):
        target_id = uuid.uuid4()
        created_at = users.datetime(2025, 2, 3, tzinfo=users.UTC)
        user = SimpleNamespace(
            id=target_id,
            nickname="Rider",
            avatar_content=None,
            avatar_content_id=None,
            avatar_url=None,
            level=4,
            rider_type=None,
            phone_verified_at=None,
            phone=None,
            created_at=created_at,
            manner_temp=36.5,
        )
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    _result(scalar=user),
                    _result(scalar=3),
                    _result(scalar=2),
                    _result(one=(2, 4.5)),
                    _result(scalar=7),
                ]
            ),
            get=AsyncMock(return_value=None),
        )

        result = await users.get_user_profile(target_id, db, target_id)

        self.assertEqual(result.member_since, created_at)
        self.assertEqual(result.marketplace_sold_count, 7)
        self.assertEqual(result.marketplace_review_count, 2)
        self.assertEqual(result.marketplace_avg_rating, 4.5)
        sold_query = str(db.execute.await_args_list[-1].args[0])
        self.assertIn("count(distinct(marketplace_appointments.listing_id))", sold_query.lower())
        # WP-4(2026-09-09, F049) — 공개 프로필은 티어 문자열만 실어야 한다. 원값(manner_temp)이
        # 그대로 노출되지 않도록 서버 변환 결과만 검증한다.
        self.assertEqual(result.trust_tier, "new")
        self.assertFalse(hasattr(result, "manner_temp"))


if __name__ == "__main__":
    unittest.main()
