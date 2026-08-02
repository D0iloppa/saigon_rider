"""F-9: POST /profile/consent — 가입 시 약관/개인정보처리방침 동의 캡처."""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.routers import profile as profile_router
from app.schemas import ConsentSaveRequest


class ConsentAuthTests(unittest.TestCase):
    def test_rejects_without_session_headers(self):
        response = TestClient(app).post(
            "/api/profile/consent",
            json={
                "user_id": str(uuid.uuid4()),
                "terms_version": "2026-06-01",
                "privacy_version": "2026-06-01",
                "age_confirmed": True,
            },
        )
        self.assertEqual(response.status_code, 419)


class ConsentOwnershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_when_body_user_id_is_not_session_user(self):
        session_uid = uuid.uuid4()
        other_uid = uuid.uuid4()
        db = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await profile_router.save_consent(
                body=ConsentSaveRequest(
                    user_id=other_uid,
                    terms_version="2026-06-01",
                    privacy_version="2026-06-01",
                    age_confirmed=True,
                ),
                db=db,
                _session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 403)


class ConsentAgeGateTests(unittest.IsolatedAsyncioTestCase):
    """연령(만 14세 이상) 확인 — 미확인이면 서버가 동의 기록 자체를 거부해 가입이 진행되지 않는다."""

    async def test_rejects_when_age_not_confirmed(self):
        uid = uuid.uuid4()
        db = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await profile_router.save_consent(
                body=ConsentSaveRequest(
                    user_id=uid,
                    terms_version="2026-06-01",
                    privacy_version="2026-06-01",
                    age_confirmed=False,
                ),
                db=db,
                _session_uid=uid,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        db.commit.assert_not_awaited()

    def test_age_confirmed_field_is_required(self):
        # 구 클라이언트 페이로드(age_confirmed 미포함)는 422 — 프론트 가드 없이도 서버가 막는다.
        with self.assertRaises(ValidationError):
            ConsentSaveRequest(user_id=uuid.uuid4(), terms_version="2026-06-01", privacy_version="2026-06-01")


class ConsentRecordTests(unittest.IsolatedAsyncioTestCase):
    async def test_records_agreed_at_and_versions(self):
        uid = uuid.uuid4()
        user = SimpleNamespace(
            id=uid,
            phone=None,
            phone_verified_at=None,
            nickname="tester",
            rider_type=None,
            level=1,
            exp=0,
            xp=0,
            gold=0,
            skill_pt=0,
            skill_distance_rider=0,
            skill_gold_hunter=0,
            skill_quest_slot=0,
            skill_cost_discount=0,
            skill_mileage_rate=0,
            avatar_content=None,
            avatar_url=None,
            manner_temp=None,
            created_at=datetime.now(UTC),
            consent_agreed_at=None,
            consent_terms_version=None,
            consent_privacy_version=None,
            consent_age_confirmed_at=None,
            consent_age_version=None,
        )
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = user
        db = AsyncMock()
        db.execute = AsyncMock(return_value=query_result)

        before = datetime.now(UTC)
        result = await profile_router.save_consent(
            body=ConsentSaveRequest(
                user_id=uid, terms_version="2026-06-01", privacy_version="2026-06-01", age_confirmed=True
            ),
            db=db,
            _session_uid=uid,
        )
        after = datetime.now(UTC)

        self.assertEqual(user.consent_terms_version, "2026-06-01")
        self.assertEqual(user.consent_privacy_version, "2026-06-01")
        self.assertIsNotNone(user.consent_agreed_at)
        self.assertTrue(before <= user.consent_agreed_at <= after)
        # 연령 확인도 시각·버전을 기록한다 (연령 요건 문구는 이용약관 §1 — 버전은 terms_version 기준).
        self.assertIsNotNone(user.consent_age_confirmed_at)
        self.assertTrue(before <= user.consent_age_confirmed_at <= after)
        self.assertEqual(user.consent_age_version, "2026-06-01")
        db.commit.assert_awaited_once()
        self.assertEqual(result.id, uid)


if __name__ == "__main__":
    unittest.main()
