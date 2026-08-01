"""F-06 잔여 회귀 테스트 — 민감 content 판정은 BusinessProfile 역참조가 아니라
contents.is_private 플래그(업로드 시점에 지정)로 한다.

수정 전(1단계): GET /contents/{id} 는 BusinessProfile.biz_license_content_id /
signboard_content_id 역참조로 민감 여부를 판정했다. 이 방식은 업로드~검증 제출 전까지는
still 공개 상태라는 구멍이 있었다(ⓐ, 이번 변경의 핵심 검증 대상).

DB 없이 db.execute 를 mock 해 라우터 함수를 직접 호출한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers import contents


def _content(owner_id: uuid.UUID, is_private: bool):
    return SimpleNamespace(
        id=uuid.uuid4(),
        owner_type="user",
        owner_id=owner_id,
        file_path="user-contents/2026/07/x.jpg",
        mime_type="image/jpeg",
        original_filename="x.jpg",
        file_size=100,
        is_private=is_private,
        created_at=datetime(2026, 7, 1, tzinfo=UTC),
    )


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


class ContentSensitiveGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_stranger_cannot_fetch_private_content(self):
        """is_private=True 인 content 를 소유자가 아닌 익명/타인이 조회하면 404."""
        owner_id = uuid.uuid4()
        content = _content(owner_id, is_private=True)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_result(content))

        with self.assertRaises(HTTPException) as ctx:
            await contents.get_content(content.id, db=db, session_uid=None, admin_session=None)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_owner_can_fetch_own_private_content(self):
        """소유자 본인은 여전히 자기 비공개 문서를 조회할 수 있어야 한다 (회귀 방지)."""
        owner_id = uuid.uuid4()
        content = _content(owner_id, is_private=True)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_result(content))

        result = await contents.get_content(content.id, db=db, session_uid=owner_id, admin_session=None)
        self.assertEqual(result.id, content.id)

    async def test_non_private_content_stays_public(self):
        """is_private=False 인 일반 content(프로필 사진 등)는 기존처럼 인증 없이 조회 가능."""
        content = _content(uuid.uuid4(), is_private=False)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_result(content))

        result = await contents.get_content(content.id, db=db, session_uid=None, admin_session=None)
        self.assertEqual(result.id, content.id)

    async def test_private_content_blocked_before_profile_link(self):
        """ⓐ 핵심 검증: 업로드 직후 BusinessProfile 에 아직 연결되지 않은 상태에서도
        is_private=True 플래그만으로 비공개가 성립해야 한다(역참조 방식의 구멍 해소).
        BusinessProfile 조회를 아예 하지 않으므로 db.execute 는 1회만 호출된다."""
        owner_id = uuid.uuid4()
        content = _content(owner_id, is_private=True)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_result(content))

        with self.assertRaises(HTTPException) as ctx:
            await contents.get_content(content.id, db=db, session_uid=None, admin_session=None)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(db.execute.call_count, 1)


if __name__ == "__main__":
    unittest.main()
