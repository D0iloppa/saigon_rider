"""업체 가격표(business_price) CRUD 회귀 테스트 — business_news 패턴 미러.

오너십 검증(_get_own_profile 이 모든 쿼리보다 먼저 호출됨)과
공개 조회의 APPROVED 게이트를 실 DB 없이 Fake 세션으로 검증한다 (test_biz_news_feed.py 스타일).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers import biz
from app.schemas import BusinessPriceCreateRequest


def _rows_result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


def _count_result(n):
    result = MagicMock()
    result.scalar_one.return_value = n
    return result


class BusinessPriceOwnershipTests(unittest.IsolatedAsyncioTestCase):
    """타인 profile_id 로는 등록/삭제가 거부돼야 한다."""

    async def test_create_price_rejects_non_owner(self):
        owner_id = uuid.uuid4()
        other_user_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)

        body = BusinessPriceCreateRequest(profile_id=profile.id, name="엔진오일 교체", price_vnd=150000)
        with self.assertRaises(HTTPException) as ctx:
            await biz.create_price(body, background=MagicMock(), db=db, session_uid=other_user_id)
        self.assertEqual(ctx.exception.status_code, 404)
        db.execute.assert_not_called()  # 오너십 검증이 쿼리보다 먼저

    async def test_delete_price_rejects_non_owner(self):
        owner_id = uuid.uuid4()
        other_user_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id)
        price = SimpleNamespace(id=uuid.uuid4(), profile_id=profile.id)

        db = AsyncMock()

        async def fake_get(model, item_id):
            if model is biz.BusinessPrice:
                return price
            return profile

        db.get = AsyncMock(side_effect=fake_get)

        with self.assertRaises(HTTPException) as ctx:
            await biz.delete_price(price.id, db=db, session_uid=other_user_id)
        self.assertEqual(ctx.exception.status_code, 404)
        db.delete.assert_not_called()

    async def test_create_price_succeeds_for_owner(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock(return_value=_count_result(0))
        db.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", uuid.uuid4()))

        body = BusinessPriceCreateRequest(profile_id=profile.id, name="엔진오일 교체", price_vnd=150000)
        result = await biz.create_price(body, background=MagicMock(), db=db, session_uid=owner_id)
        self.assertEqual(result.name, "엔진오일 교체")
        self.assertEqual(result.price_vnd, 150000)
        self.assertEqual(result.sort_order, 0)
        db.add.assert_called_once()
        db.commit.assert_awaited()


class BusinessPricePublicGateTests(unittest.IsolatedAsyncioTestCase):
    """공개 조회는 APPROVED 프로필만 노출한다."""

    async def test_hides_unapproved_profile(self):
        profile = SimpleNamespace(id=uuid.uuid4(), status="PENDING")
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)

        with self.assertRaises(HTTPException) as ctx:
            await biz.get_public_prices(profile.id, db=db)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_empty_list_for_no_prices(self):
        profile = SimpleNamespace(id=uuid.uuid4(), status="APPROVED")
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock(return_value=_rows_result([]))

        result = await biz.get_public_prices(profile.id, db=db)
        self.assertEqual(result, [])

    async def test_maps_price_fields(self):
        profile = SimpleNamespace(id=uuid.uuid4(), status="APPROVED")
        price = SimpleNamespace(
            id=uuid.uuid4(),
            name="엔진오일 교체",
            price_vnd=150000,
            sort_order=0,
            created_at=datetime(2026, 7, 26, tzinfo=UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock(return_value=_rows_result([price]))

        result = await biz.get_public_prices(profile.id, db=db)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].name, "엔진오일 교체")
        self.assertEqual(result[0].price_vnd, 150000)


if __name__ == "__main__":
    unittest.main()
