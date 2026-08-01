"""F-9: POST /profile/consent — 가입 시 약관/개인정보처리방침 동의 캡처."""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers import profile as profile_router
from app.schemas import ConsentSaveRequest


class ConsentAuthTests(unittest.TestCase):
    def test_rejects_without_session_headers(self):
        response = TestClient(app).post(
            "/api/profile/consent",
            json={"user_id": str(uuid.uuid4()), "terms_version": "2026-06-01", "privacy_version": "2026-06-01"},
        )
        self.assertEqual(response.status_code, 419)


class ConsentOwnershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_when_body_user_id_is_not_session_user(self):
        session_uid = uuid.uuid4()
        other_uid = uuid.uuid4()
        db = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await profile_router.save_consent(
                body=ConsentSaveRequest(user_id=other_uid, terms_version="2026-06-01", privacy_version="2026-06-01"),
                db=db,
                _session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 403)


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
        )
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = user
        db = AsyncMock()
        db.execute = AsyncMock(return_value=query_result)

        before = datetime.now(UTC)
        result = await profile_router.save_consent(
            body=ConsentSaveRequest(user_id=uid, terms_version="2026-06-01", privacy_version="2026-06-01"),
            db=db,
            _session_uid=uid,
        )
        after = datetime.now(UTC)

        self.assertEqual(user.consent_terms_version, "2026-06-01")
        self.assertEqual(user.consent_privacy_version, "2026-06-01")
        self.assertIsNotNone(user.consent_agreed_at)
        self.assertTrue(before <= user.consent_agreed_at <= after)
        db.commit.assert_awaited_once()
        self.assertEqual(result.id, uid)


if __name__ == "__main__":
    unittest.main()
