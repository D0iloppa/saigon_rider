"""지적 4 후속 — 관리자 계정 아이디로 issues.py 의 assignee 예약어("me"/"unassigned")를
쓸 수 없게 계정 생성 단계에서 차단한다(대소문자 무관). 그 외 정상 아이디 생성은 회귀 없어야 한다.
"""

import unittest
import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers.admin_api import accounts


def _request():
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))


def _session():
    return SimpleNamespace(username="root", role="root")


def _db_no_conflict():
    res = MagicMock()
    res.scalar_one_or_none = MagicMock(return_value=None)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=res)
    db.flush = AsyncMock()
    db.refresh = AsyncMock(
        side_effect=lambda obj: (
            setattr(obj, "created_at", datetime.now())
            or setattr(obj, "updated_at", datetime.now())
            or setattr(obj, "id", uuid.uuid4())
        )
    )
    db.add = MagicMock()
    return db


class ReservedUsernameTest(unittest.IsolatedAsyncioTestCase):
    async def test_me_rejected(self):
        db = _db_no_conflict()
        body = accounts.AdminAccountCreate(username="me", password="secret1")
        with self.assertRaises(HTTPException) as ctx:
            await accounts.create_account(body, _request(), session=_session(), db=db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_unassigned_rejected_case_insensitive(self):
        db = _db_no_conflict()
        body = accounts.AdminAccountCreate(username="Unassigned", password="secret1")
        with self.assertRaises(HTTPException) as ctx:
            await accounts.create_account(body, _request(), session=_session(), db=db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_normal_username_still_allowed(self):
        db = _db_no_conflict()
        body = accounts.AdminAccountCreate(username="bob", password="secret1")

        result = await accounts.create_account(body, _request(), session=_session(), db=db)

        self.assertEqual(result.username, "bob")
        db.add.assert_called()


if __name__ == "__main__":
    unittest.main()
