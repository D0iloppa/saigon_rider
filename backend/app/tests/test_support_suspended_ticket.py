"""Q-4/D-22(감사 260817) — 정지 사용자의 고객센터 티켓 생성·열람 허용.

수정 전에는 support.py 티켓 생성이 verify_user_session -> enforce_account_active 를
거쳐 SUSPENDED/BANNED 계정을 403 으로 막아, "고객센터로 문의하세요" 안내(Suspended.tsx)가
가리키는 경로를 코드가 스스로 막고 있었다. D-22 는 여기서 한 걸음 더 나가 목록·상세·답글도
열었다 — 이의는 제출할 수 있는데 답을 볼 수 없으면 구제 절차가 절반만 열린 것이기 때문이다.
이 파일은 아래 계약을 고정한다:
 - verify_user_session_allow_suspended 는 세션 자체는 그대로 검증하되 제재 상태는 통과시킨다.
 - 기존 verify_user_session 은 여전히 SUSPENDED/BANNED 를 403 으로 막는다(회귀 금지 — 다른
   라우트에는 영향이 없어야 한다).
 - create_ticket/list_tickets/get_ticket/create_reply 는 정지 사용자로도 정상 동작한다.
 - 단 스코프는 본인 티켓으로 한정된다 — 타인 티켓은 정지 여부와 무관하게 404.
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app import deps
from app.models import SupportTicket, User
from app.routers import support
from app.schemas import SupportReplyCreateRequest, SupportTicketCreate


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

    async def test_suspension_still_valid_stays_suspended(self):
        """code-review high 지적 #10 ② — 정지가 유효한 사용자는 계속 통과하되 status 는 SUSPENDED 유지."""
        user, token = _make_user(status="SUSPENDED", suspended_until=datetime.now(UTC) + timedelta(days=1))
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)
        uid = await deps.verify_user_session_allow_suspended(x_user_id=str(user.id), x_session_token=token, db=db)
        self.assertEqual(uid, user.id)
        self.assertEqual(user.status, "SUSPENDED")

    async def test_expired_suspension_is_lazy_lifted_to_active(self):
        """code-review high 지적 #10 ① — 정지가 만료됐으면 support 경로에서도 ACTIVE 로 되돌린다."""
        user, token = _make_user(status="SUSPENDED", suspended_until=datetime.now(UTC) - timedelta(hours=1))
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)
        uid = await deps.verify_user_session_allow_suspended(x_user_id=str(user.id), x_session_token=token, db=db)
        self.assertEqual(uid, user.id)
        self.assertEqual(user.status, "ACTIVE")
        self.assertIsNone(user.suspended_until)
        db.commit.assert_awaited()

    async def test_enforce_account_active_unchanged_for_valid_suspension(self):
        """code-review high 지적 #10 ③ — enforce_account_active 의 정지 403 동작은 무변화."""
        user, _token = _make_user(status="SUSPENDED", suspended_until=datetime.now(UTC) + timedelta(days=1))
        with self.assertRaises(HTTPException) as ctx:
            deps.enforce_account_active(user, datetime.now(UTC))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(user.status, "SUSPENDED")

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


def _make_ticket(*, owner_id: uuid.UUID, replies: list | None = None) -> SupportTicket:
    now = datetime.now(UTC)
    ticket = SupportTicket(
        id=uuid.uuid4(),
        user_id=owner_id,
        title="억울해요",
        body="오신고로 정지됐습니다",
        status="OPEN",
        has_unread_reply=True,
        created_at=now,
        updated_at=now,
    )
    # relationship 은 세션 없이 접근하면 lazy-load 를 시도하므로 인스턴스 dict 에 직접 주입한다.
    ticket.__dict__["replies"] = replies if replies is not None else []
    return ticket


def _mock_scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=value)
    return result


class SupportTicketScopeForSuspendedUserTest(unittest.IsolatedAsyncioTestCase):
    """D-22(감사 260817): 정지 사용자의 목록·상세·답글 접근 — 본인 티켓 200 / 타인 티켓 403·404."""

    async def test_list_tickets_returns_only_own_tickets_when_suspended(self):
        owner = uuid.uuid4()
        ticket = _make_ticket(owner_id=owner)
        db = AsyncMock()
        list_result = MagicMock()
        list_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[ticket])))
        counts_result = MagicMock()
        counts_result.all = MagicMock(return_value=[])
        db.execute = AsyncMock(side_effect=[list_result, counts_result])

        out = await support.list_tickets(user_id=owner, db=db)

        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].title, "억울해요")

    async def test_get_ticket_own_ticket_returns_200(self):
        owner = uuid.uuid4()
        ticket = _make_ticket(owner_id=owner)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(ticket))

        out = await support.get_ticket(ticket.id, user_id=owner, db=db)

        self.assertEqual(out.id, ticket.id)

    async def test_get_ticket_other_users_ticket_raises_404(self):
        owner = uuid.uuid4()
        attacker = uuid.uuid4()
        ticket = _make_ticket(owner_id=owner)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(ticket))

        with self.assertRaises(HTTPException) as ctx:
            await support.get_ticket(ticket.id, user_id=attacker, db=db)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_create_reply_own_ticket_succeeds(self):
        owner = uuid.uuid4()
        ticket = _make_ticket(owner_id=owner)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(ticket))
        db.add = MagicMock()

        out = await support.create_reply(
            ticket.id, SupportReplyCreateRequest(body="추가 소명입니다"), user_id=owner, db=db
        )

        db.add.assert_called_once()
        self.assertEqual(out.id, ticket.id)

    async def test_create_reply_other_users_ticket_raises_404(self):
        owner = uuid.uuid4()
        attacker = uuid.uuid4()
        ticket = _make_ticket(owner_id=owner)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(ticket))

        with self.assertRaises(HTTPException) as ctx:
            await support.create_reply(
                ticket.id, SupportReplyCreateRequest(body="남의 티켓에 답글"), user_id=attacker, db=db
            )
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
