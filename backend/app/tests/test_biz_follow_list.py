"""GET /biz/follow (내 단골 업체 목록) 회귀 테스트 — get_favorites 미러 검증 (SGR-330).

test_biz_news_feed.py 스타일 미러: 실 DB 없이 db.execute 를 mock 해 컴파일된 SQL 문자열을 검사
(내 user_id 로만 필터 + APPROVED 필터) + Fake row 매핑 + 고정 쿼리 수(N+1 없음)를 확인한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from app.main import app
from app.routers import biz


class BizFollowListAuthTests(unittest.TestCase):
    """세션 헤더 없이 호출하면 인증 없이는 거부됨을 증명 (verify_user_session 공용 의존성)."""

    def test_rejects_without_session_headers(self):
        response = TestClient(app).get("/api/biz/follow")
        self.assertEqual(response.status_code, 419)


def _rows_result(rows):
    result = MagicMock()
    result.all.return_value = rows
    return result


def _scalars_result(rows):
    """_latest_news_map 은 .scalars().all() 로 읽는다 — get_follows 목록 조회(.all())와 다름."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


class BizFollowListQueryTests(unittest.IsolatedAsyncioTestCase):
    """SQL 형태 검증 — 로그인 유저 본인 단골만, APPROVED 프로필만."""

    async def _compiled(self, session_uid):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_rows_result([]))
        await biz.get_follows(db=db, session_uid=session_uid)
        statement = db.execute.await_args_list[0].args[0]
        return str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))

    async def test_filters_by_requesting_user_only(self):
        uid = uuid.uuid4()
        sql = await self._compiled(uid)
        self.assertIn(f"business_follow.user_id = '{uid}'", sql)

    async def test_only_approved_profiles_exposed(self):
        sql = await self._compiled(uuid.uuid4())
        self.assertIn("business_profile.status = 'APPROVED'", sql)

    async def test_does_not_leak_other_users_follows(self):
        """다른 유저의 user_id 리터럴이 SQL 에 섞이지 않는지 — 본인 것만 필터됨을 재확인."""
        uid_a = uuid.uuid4()
        uid_b = uuid.uuid4()
        sql = await self._compiled(uid_a)
        self.assertIn(str(uid_a), sql)
        self.assertNotIn(str(uid_b), sql)


class BizFollowListNPlusOneTests(unittest.IsolatedAsyncioTestCase):
    """최신 소식 포함해도 고정 쿼리 수(2회: 목록 1 + 소식맵 1) — 업체 수에 비례하지 않음."""

    async def test_fixed_query_count_regardless_of_row_count(self):
        pids = [uuid.uuid4() for _ in range(5)]
        profiles = [
            SimpleNamespace(
                id=pid,
                name=f"Shop {i}",
                category="food",
                address=None,
                latitude=None,
                longitude=None,
                photo_content=None,
            )
            for i, pid in enumerate(pids)
        ]
        followed_at = datetime(2026, 7, 20, tzinfo=UTC)
        list_result = _rows_result([(p, followed_at) for p in profiles])
        news_result = _rows_result([])
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[list_result, news_result])

        result = await biz.get_follows(db=db, session_uid=uuid.uuid4())

        self.assertEqual(len(result), 5)
        self.assertEqual(db.execute.await_count, 2)


class BizFollowListMappingTests(unittest.IsolatedAsyncioTestCase):
    """행 → BusinessFollowOut 매핑 — 최신 소식이 함께 실리는지(구독의 실체) 확인."""

    async def test_maps_profile_and_latest_news(self):
        profile = SimpleNamespace(
            id=uuid.uuid4(),
            name="Pho Shop",
            category="food",
            address="123 St",
            latitude=10.0,
            longitude=106.0,
            photo_content=None,
        )
        followed_at = datetime(2026, 7, 20, tzinfo=UTC)
        news = SimpleNamespace(
            id=uuid.uuid4(),
            profile_id=profile.id,
            title="New menu",
            created_at=datetime(2026, 7, 21, tzinfo=UTC),
            photos=[],
        )
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_rows_result([(profile, followed_at)]), _scalars_result([news])])

        result = await biz.get_follows(db=db, session_uid=uuid.uuid4())

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].id, profile.id)
        self.assertEqual(result[0].followed_at, followed_at)
        self.assertIsNotNone(result[0].latest_news)
        self.assertEqual(result[0].latest_news.title, "New menu")

    async def test_no_news_maps_to_none(self):
        profile = SimpleNamespace(
            id=uuid.uuid4(),
            name="Quiet Shop",
            category=None,
            address=None,
            latitude=None,
            longitude=None,
            photo_content=None,
        )
        followed_at = datetime(2026, 7, 20, tzinfo=UTC)
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_rows_result([(profile, followed_at)]), _rows_result([])])

        result = await biz.get_follows(db=db, session_uid=uuid.uuid4())

        self.assertIsNone(result[0].latest_news)


if __name__ == "__main__":
    unittest.main()
