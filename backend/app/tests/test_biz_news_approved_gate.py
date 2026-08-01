"""N-6 회귀 테스트 — 가게소식 등록(create_news)이 소유권만 검사하고 프로필 status(APPROVED)를
검사하지 않던 결함. create_ad(:319-321) 와 동일한 게이트를 미러링했는지 확인한다.
"""

import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers import biz
from app.schemas import BusinessNewsCreateRequest


def _profile(status: str, user_id: uuid.UUID, profile_id: uuid.UUID):
    profile = AsyncMock()
    profile.id = profile_id
    profile.user_id = user_id
    profile.status = status
    return profile


class CreateNewsApprovedGateTest(unittest.IsolatedAsyncioTestCase):
    async def test_pending_profile_is_rejected(self):
        user_id = uuid.uuid4()
        profile_id = uuid.uuid4()
        db = AsyncMock()
        db.get = AsyncMock(return_value=_profile("PENDING", user_id, profile_id))

        with self.assertRaises(HTTPException) as ctx:
            await biz.create_news(
                body=BusinessNewsCreateRequest(profile_id=profile_id, title="t", body="b", photo_content_ids=[]),
                background=MagicMock(),
                db=db,
                session_uid=user_id,
            )
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_approved_profile_is_accepted(self):
        user_id = uuid.uuid4()
        profile_id = uuid.uuid4()
        db = AsyncMock()
        db.get = AsyncMock(return_value=_profile("APPROVED", user_id, profile_id))
        added: dict = {}
        db.add = lambda obj: added.setdefault("news", obj)
        db.flush = AsyncMock(side_effect=lambda: setattr(added["news"], "id", uuid.uuid4()))
        db.commit = AsyncMock()

        result = await biz.create_news(
            body=BusinessNewsCreateRequest(profile_id=profile_id, title="t", body="b", photo_content_ids=[]),
            background=MagicMock(),
            db=db,
            session_uid=user_id,
        )
        self.assertEqual(result.title, "t")


if __name__ == "__main__":
    unittest.main()
