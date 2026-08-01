import unittest
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException

from app import deps
from app.schemas import DmConversationCreateRequest, DmMessageCreateRequest
from app.services.dm_policy import require_participant


class SessionBoundaryTest(unittest.IsolatedAsyncioTestCase):
    def _user(self, token: str, *, status: str = "ACTIVE", deleted_at=None):
        return SimpleNamespace(
            passcode_hash=deps._session_pwd_ctx.hash(token),
            session_expires_at=datetime.now(UTC) + timedelta(days=1),
            status=status,
            suspended_until=None,
            deleted_at=deleted_at,
            last_seen_at=datetime.now(UTC),
        )

    async def test_missing_token_is_rejected_even_with_valid_user_id(self):
        with self.assertRaises(HTTPException) as raised:
            await deps.verify_user_session(str(uuid.uuid4()), None, AsyncMock())
        self.assertEqual(raised.exception.status_code, 419)

    async def test_token_for_different_user_is_rejected(self):
        db = AsyncMock()
        db.get.return_value = self._user("user-a-token")
        with self.assertRaises(HTTPException) as raised:
            await deps.verify_user_session(str(uuid.uuid4()), "user-b-token", db)
        self.assertEqual(raised.exception.status_code, 419)

    async def test_valid_token_returns_principal(self):
        uid = uuid.uuid4()
        db = AsyncMock()
        db.get.return_value = self._user("valid-token")
        self.assertEqual(await deps.verify_user_session(str(uid), "valid-token", db), uid)

    async def test_soft_deleted_user_is_rejected(self):
        db = AsyncMock()
        db.get.return_value = self._user("valid-token", deleted_at=datetime.now(UTC))
        with self.assertRaises(HTTPException) as raised:
            await deps.verify_user_session(str(uuid.uuid4()), "valid-token", db)
        self.assertEqual(raised.exception.status_code, 419)

    async def test_expired_token_is_rejected(self):
        db = AsyncMock()
        user = self._user("expired-token")
        user.session_expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.get.return_value = user
        with self.assertRaises(HTTPException) as raised:
            await deps.verify_user_session(str(uuid.uuid4()), "expired-token", db)
        self.assertEqual(raised.exception.status_code, 419)


class DmBoundaryTest(unittest.TestCase):
    def test_identity_fields_are_not_part_of_mutation_contracts(self):
        self.assertNotIn("user_id", DmConversationCreateRequest.model_fields)
        self.assertNotIn("sender_id", DmMessageCreateRequest.model_fields)

    def test_non_participant_is_rejected(self):
        conv = SimpleNamespace(participant_1=uuid.uuid4(), participant_2=uuid.uuid4())
        with self.assertRaises(HTTPException) as raised:
            require_participant(conv, uuid.uuid4())
        self.assertEqual(raised.exception.status_code, 403)

    def test_conversation_context_requires_both_fields(self):
        with self.assertRaises(ValueError):
            DmConversationCreateRequest(other_user_id=uuid.uuid4(), context_type="listing")
