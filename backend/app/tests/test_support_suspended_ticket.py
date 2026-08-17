"""Q-4(감사 260817) — 정지 사용자의 고객센터 티켓 생성 허용.

수정 전에는 support.py 티켓 생성이 verify_user_session -> enforce_account_active 를
거쳐 SUSPENDED/BANNED 계정을 403 으로 막아, "고객센터로 문의하세요" 안내(Suspended.tsx)가
가리키는 경로를 코드가 스스로 막고 있었다. 이 파일은 아래 계약을 고정한다:
 - verify_user_session_allow_suspended 는 세션 자체는 그대로 검증하되 제재 상태는 통과시킨다.
 - 기존 verify_user_session 은 여전히 SUSPENDED/BANNED 를 403 으로 막는다(회귀 금지 — 다른
   라우트에는 영향이 없어야 한다).
 - create_ticket 라우트는 정지 사용자로도 정상 생성된다.
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app import deps
from app.models import User
from app.routers import support
from app.schemas import SupportTicketCreate


def _make_user(*, status="ACTIVE", suspended_until=None) -> User:
    now = datetime.now(UTC)
    token = "plaintext-session-token"
    return User(
        id=uuid.uuid4(),
        phone=f"suspend_{uuid.uuid4().hex[:16]}",
        nickname="tester",
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
        manner_temp=36.5,
        passcode_hash=deps._session_pwd_ctx.hash(token),
        session_expires_at=now + timedelta(days=1),
        status=status,
        suspended_until=suspended_until,
    ), token


class VerifyUserSessionAllowSuspendedTest(unittest.IsolatedAsyncioTestCase):
    async def test_suspended_user_passes(self):
        user, token = _make_user(status="SUSPENDED", suspended_until=datetime.now(UTC) + timedelta(days=1))
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)
        uid = await deps.verify_user_session_allow_suspended(x_user_id=str(user.id), x_session_token=token, db=db)
        self.assertEqual(uid, user.id)

    async def test_banned_user_passes(self):
        user, token = _make_user(status="BANNED")
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)
        uid = await deps.verify_user_session_allow_suspended(x_user_id=str(user.id), x_session_token=token, db=db)
        self.assertEqual(uid, user.id)

    async def test_normal_verify_user_session_still_blocks_suspended(self):
        """회귀 금지 — 다른 라우트가 쓰는 verify_user_session 은 그대로 막혀야 한다."""
        user, token = _make_user(status="SUSPENDED", suspended_until=datetime.now(UTC) + timedelta(days=1))
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)
        with self.assertRaises(HTTPException) as ctx:
            await deps.verify_user_session(x_user_id=str(user.id), x_session_token=token, db=db)
        self.assertEqual(ctx.exception.status_code, 403)


class CreateTicketAllowsSuspendedTest(unittest.IsolatedAsyncioTestCase):
    async def test_suspended_user_can_create_ticket(self):
        user, _token = _make_user(status="SUSPENDED", suspended_until=datetime.now(UTC) + timedelta(days=1))
        db = AsyncMock()
        db.add = MagicMock()

        async def _fake_refresh(ticket):
            ticket.id = uuid.uuid4()
            ticket.has_unread_reply = False
            ticket.created_at = datetime.now(UTC)
            ticket.updated_at = ticket.created_at

        db.refresh = AsyncMock(side_effect=_fake_refresh)
        body = SupportTicketCreate(title="억울해요", body="오신고로 정지됐습니다")
        out = await support.create_ticket(body, user_id=user.id, db=db)
        db.commit.assert_awaited()
        self.assertEqual(db.add.call_args[0][0].user_id, user.id)
        self.assertEqual(out.title, "억울해요")


if __name__ == "__main__":
    unittest.main()
