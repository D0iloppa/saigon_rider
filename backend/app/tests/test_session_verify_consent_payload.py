"""F-9 우회 차단: /auth/session/verify(부팅 시 자동로그인) 응답에 동의 여부가 실려야
프론트가 로컬 상태가 아니라 서버 값으로 서비스 진입을 게이트할 수 있다."""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.routers import auth as auth_router


def _make_user(consent_agreed_at):
    token = "plaintext-session-token"
    return (
        token,
        SimpleNamespace(
            id=uuid.uuid4(),
            phone="0901234567",
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
            consent_agreed_at=consent_agreed_at,
            passcode_hash=auth_router._hash(token),
            session_expires_at=datetime.now(UTC) + timedelta(days=1),
            status="ACTIVE",
            suspended_until=None,
        ),
        token,
    )


class SessionVerifyConsentPayloadTest(unittest.IsolatedAsyncioTestCase):
    async def _verify(self, consent_agreed_at):
        _token, user, plain_token = _make_user(consent_agreed_at)
        query_result = MagicMock()
        query_result.scalar_one_or_none.return_value = user
        db = AsyncMock()
        db.execute = AsyncMock(return_value=query_result)

        body = SimpleNamespace(user_id=user.id, session_token=plain_token)
        response = await auth_router.verify_session(body=body, db=db)
        return response

    async def test_unconsented_account_reports_null_consent(self):
        response = await self._verify(consent_agreed_at=None)
        self.assertIsNone(response.user.consent_agreed_at)

    async def test_consented_account_reports_timestamp(self):
        agreed_at = datetime.now(UTC)
        response = await self._verify(consent_agreed_at=agreed_at)
        self.assertEqual(response.user.consent_agreed_at, agreed_at)


if __name__ == "__main__":
    unittest.main()
