"""홈 '업체 소식' 피드 — GET /biz/public/news/recent 회귀 테스트.

기존 test_map_bbox_pagination.py 스타일 미러: 실 DB 없이 db.execute 를 mock 해
컴파일된 SQL 문자열을 검사(DISTINCT ON, APPROVED 필터, LIMIT 캡) + Fake row 매핑을 확인한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.dialects import postgresql

from app.routers import biz


def _rows_result(rows):
    result = MagicMock()
    result.all.return_value = rows
    return result


class BizNewsFeedQueryTests(unittest.IsolatedAsyncioTestCase):
    """SQL 형태 검증 — 업체당 1건 묶임(DISTINCT ON) + APPROVED 공개 조건 + limit 상한."""

    async def _compiled(self, limit: int) -> str:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_rows_result([]))
        await biz.get_public_news_recent(limit=limit, db=db)
        statement = db.execute.await_args.args[0]
        return str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))

    async def test_groups_one_news_per_profile(self):
        sql = await self._compiled(limit=8)
        self.assertIn("DISTINCT ON (business_news.profile_id)", sql)

    async def test_only_approved_profiles_exposed(self):
        sql = await self._compiled(limit=8)
        self.assertIn("business_profile.status = 'APPROVED'", sql)

    async def test_limit_is_applied(self):
        sql = await self._compiled(limit=8)
        self.assertIn("LIMIT 8", sql)

    async def test_limit_is_capped_at_max(self):
        sql = await self._compiled(limit=999)
        self.assertIn("LIMIT 20", sql)
        self.assertNotIn("LIMIT 999", sql)

    async def test_limit_has_floor(self):
        sql = await self._compiled(limit=0)
        self.assertIn("LIMIT 1", sql)


class BizNewsFeedMappingTests(unittest.IsolatedAsyncioTestCase):
    """행 → BusinessNewsFeedItemOut 매핑 — 업체 식별정보 + 소식이 한 응답에 함께 담기는지 확인."""

    async def test_maps_profile_and_news_fields(self):
        profile = SimpleNamespace(id=uuid.uuid4(), name="Pho Shop", category="food", photo_content=None)
        news = SimpleNamespace(
            id=uuid.uuid4(),
            title="New menu",
            created_at=datetime(2026, 7, 20, tzinfo=UTC),
            photos=[],
        )
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_rows_result([(news, profile)]))

        result = await biz.get_public_news_recent(limit=8, db=db)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].profile_id, profile.id)
        self.assertEqual(result[0].profile_name, "Pho Shop")
        self.assertEqual(result[0].category, "food")
        self.assertIsNone(result[0].photo_url)
        self.assertEqual(result[0].news_id, news.id)
        self.assertEqual(result[0].title, "New menu")
        self.assertEqual(result[0].photos, [])


if __name__ == "__main__":
    unittest.main()
