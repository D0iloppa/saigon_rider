"""업체 소식(business_news) 수정 PATCH 회귀 테스트 — test_biz_price.py 스타일(Fake AsyncMock DB).

오너십 검증(_get_own_profile 이 모든 쿼리보다 먼저 호출됨)을 실 DB 없이 검증한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers import biz
from app.schemas import BusinessNewsUpdateRequest


class BusinessNewsUpdateOwnershipTests(unittest.IsolatedAsyncioTestCase):
    """타인 news_id 로는 수정이 거부돼야 한다 (404 로 통일)."""

    async def test_update_news_rejects_non_owner(self):
        owner_id = uuid.uuid4()
        other_user_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id)
        news = SimpleNamespace(id=uuid.uuid4(), profile_id=profile.id, photos=[])

        db = AsyncMock()

        async def fake_get(model, item_id):
            if model is biz.BusinessNews:
                return news
            return profile

        db.get = AsyncMock(side_effect=fake_get)

        body = BusinessNewsUpdateRequest(title="새 제목")
        with self.assertRaises(HTTPException) as ctx:
            await biz.update_news(news.id, body, background=MagicMock(), db=db, session_uid=other_user_id)
        self.assertEqual(ctx.exception.status_code, 404)
        db.commit.assert_not_called()

    async def test_update_news_rejects_missing_news(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        body = BusinessNewsUpdateRequest(title="새 제목")
        with self.assertRaises(HTTPException) as ctx:
            await biz.update_news(uuid.uuid4(), body, background=MagicMock(), db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_update_news_succeeds_for_owner(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id)
        news = SimpleNamespace(
            id=uuid.uuid4(),
            profile_id=profile.id,
            title="옛 제목",
            body="옛 본문",
            created_at=datetime(2026, 7, 26, tzinfo=UTC),
            search_blob=None,
            photos=[],
        )

        db = AsyncMock()

        async def fake_get(model, item_id):
            if model is biz.BusinessNews:
                return news
            return profile

        db.get = AsyncMock(side_effect=fake_get)

        body = BusinessNewsUpdateRequest(title="새 제목", body="새 본문")
        result = await biz.update_news(news.id, body, background=MagicMock(), db=db, session_uid=owner_id)

        self.assertEqual(result.title, "새 제목")
        self.assertEqual(result.body, "새 본문")
        self.assertEqual(news.title, "새 제목")
        self.assertEqual(news.body, "새 본문")
        db.commit.assert_awaited()


if __name__ == "__main__":
    unittest.main()
