"""무인증/IDOR P0 결함 5건(F-1~F-5) 회귀 테스트.

근거: ai-docs/260731_launch_readiness_verdict.md §3.1
- F-1 GET /api/users/search: 세션 없이 가입자 열거 + 전화번호 부분일치
- F-2 GET /api/quests/ride-trail: 세션 없이 원본 GPS 궤적 조회
- F-3 GET /api/quests/active-card: 세션/소유자 검사 없이 임의 user_quest_id 조회
- F-4 follows.py GET 4종: 세션 없이 + X-User-Id 헤더 원시 신뢰
- F-5 GET /api/users/{id}/profile: 세션 없이 + requester_id 쿼리 신뢰 + deleted_at 미필터

TestClient(app).get(...) 로 세션 헤더 없이 호출 → 419(test_biz_follow_list.py 스타일).
소유자 검사·SQL 필터는 라우터 함수를 직접 호출해 mock db/의존성으로 검증한다
(test_biz_follow_list.py / test_security_boundaries.py 스타일 — 실 DB 불필요).
"""

import inspect
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from app.main import app
from app.routers import quests, users


def _scalars_result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


def _scalar_one_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


class F1SearchUsersTest(unittest.TestCase):
    def test_rejects_without_session_headers(self):
        response = TestClient(app).get("/api/users/search?query=ab")
        self.assertEqual(response.status_code, 419)


class F1SearchUsersQueryTest(unittest.IsolatedAsyncioTestCase):
    async def test_phone_match_is_exact_and_excludes_deleted(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalars_result([]))
        await users.search_users(query="0912345678", db=db, _session_uid=uuid.uuid4())
        statement = db.execute.await_args_list[0].args[0]
        sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        # 전화번호는 정확일치(=)여야 하고, ILIKE 부분일치 대상이면 안 된다.
        self.assertIn("users.phone = '0912345678'", sql)
        self.assertNotIn("users.phone LIKE", sql)
        self.assertNotIn("users.phone ILIKE", sql)
        # 탈퇴 계정 제외 필터
        self.assertIn("users.deleted_at IS NULL", sql)


class F2RideTrailTest(unittest.TestCase):
    def test_rejects_without_session_headers(self):
        response = TestClient(app).get("/api/quests/ride-trail?device_uuid=dev-1")
        self.assertEqual(response.status_code, 419)


class F2RideTrailOwnershipTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_device_not_owned_by_session_user(self):
        session_uid = uuid.uuid4()
        with (
            patch.object(
                quests.engine_client,
                "lookup_device_map",
                AsyncMock(return_value={"device_uuid": "someone-elses-device"}),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await quests.get_ride_trail(device_uuid="victim-device", since_ts=None, count=500, _session_uid=session_uid)
        self.assertEqual(raised.exception.status_code, 403)

    async def test_lookup_failure_fails_closed(self):
        session_uid = uuid.uuid4()
        with (
            patch.object(
                quests.engine_client,
                "lookup_device_map",
                AsyncMock(side_effect=RuntimeError("engine down")),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            await quests.get_ride_trail(device_uuid="dev-1", since_ts=None, count=500, _session_uid=session_uid)
        self.assertEqual(raised.exception.status_code, 403)


class F3ActiveCardTest(unittest.TestCase):
    def test_rejects_without_session_headers(self):
        response = TestClient(app).get(f"/api/quests/active-card?user_quest_id={uuid.uuid4()}")
        self.assertEqual(response.status_code, 419)


class F3ActiveCardOwnershipTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_non_owner_user_quest(self):
        session_uid = uuid.uuid4()
        other_users_quest = MagicMock(user_id=uuid.uuid4())
        db = AsyncMock()
        db.get = AsyncMock(return_value=other_users_quest)
        with self.assertRaises(HTTPException) as raised:
            await quests.get_active_quest_card(user_quest_id=uuid.uuid4(), db=db, _session_uid=session_uid)
        self.assertEqual(raised.exception.status_code, 404)

    async def test_rejects_missing_user_quest(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        with self.assertRaises(HTTPException) as raised:
            await quests.get_active_quest_card(user_quest_id=uuid.uuid4(), db=db, _session_uid=uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 404)


class F4FollowsGetEndpointsTest(unittest.TestCase):
    """POST/DELETE(:60,:87)가 이미 verify_user_session 을 요구하는 것과 비대칭이던 GET 4종."""

    def test_followers_requires_session(self):
        response = TestClient(app).get(f"/api/users/{uuid.uuid4()}/followers")
        self.assertEqual(response.status_code, 419)

    def test_following_requires_session(self):
        response = TestClient(app).get(f"/api/users/{uuid.uuid4()}/following")
        self.assertEqual(response.status_code, 419)

    def test_follow_counts_requires_session(self):
        response = TestClient(app).get(f"/api/users/{uuid.uuid4()}/follow-counts")
        self.assertEqual(response.status_code, 419)

    def test_friends_requires_session(self):
        response = TestClient(app).get(f"/api/users/{uuid.uuid4()}/friends")
        self.assertEqual(response.status_code, 419)

    def test_x_user_id_header_alone_is_not_trusted(self):
        """세션 토큰 없이 X-User-Id 헤더만 보내는 위조 시도도 여전히 거부돼야 한다."""
        response = TestClient(app).get(
            f"/api/users/{uuid.uuid4()}/followers",
            headers={"X-User-Id": str(uuid.uuid4())},
        )
        self.assertEqual(response.status_code, 419)


class F5UserProfileTest(unittest.TestCase):
    def test_rejects_without_session_headers(self):
        """F-5 완전 해소: 익명 조회 자체를 차단 (세션 필수)."""
        response = TestClient(app).get(f"/api/users/{uuid.uuid4()}/profile")
        self.assertEqual(response.status_code, 419)


class F5UserProfileQueryTest(unittest.IsolatedAsyncioTestCase):
    async def test_excludes_soft_deleted_users(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_one_result(None))
        with self.assertRaises(HTTPException) as raised:
            await users.get_user_profile(user_id=uuid.uuid4(), db=db, viewer_id=uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 404)
        statement = db.execute.await_args_list[0].args[0]
        sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        self.assertIn("users.deleted_at IS NULL", sql)

    def test_requester_id_query_param_no_longer_accepted(self):
        """requester_id 를 임의 뷰어로 신뢰하던 쿼리 파라미터 제거 확인 — 뷰어는 세션에서만 도출."""
        params = inspect.signature(users.get_user_profile).parameters
        self.assertNotIn("requester_id", params)

    def test_viewer_is_mandatory_session_not_optional(self):
        """optional_user_session(익명 허용) 이 아니라 verify_user_session(세션 필수) 을 써야 한다."""
        viewer_param = inspect.signature(users.get_user_profile).parameters["viewer_id"]
        self.assertEqual(viewer_param.annotation, uuid.UUID)
