"""F-06 회귀 테스트 — 사업자 검증 문서 제출의 content 소유권 검사.

수정 전: `_require_content` 는 content_id의 *존재만* 확인해, 유출된 타인 소유
UUID를 자기 신청(POST /biz/verification)에 그대로 붙일 수 있었다(biz.py:115, :240).
수정 후: `_require_owned_content` 가 owner_type='user' && owner_id==신청자 를 요구한다.

test_biz_public_profile.py 스타일 미러 — 실 DB 없이 db.get 을 mock 해 라우터 함수를 직접 호출한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException

from app.routers import biz


def _profile(owner_id: uuid.UUID, verification_status: str = "unverified"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=owner_id,
        verification_status=verification_status,
        biz_license_content_id=None,
        signboard_content_id=None,
        rep_name=None,
        verification_reject_reason=None,
        updated_at=None,
        name="Shop",
        category=None,
        address=None,
        intro=None,
        latitude=None,
        longitude=None,
        phone=None,
        photo_content_id=None,
        photo_content=None,
        status="APPROVED",
        reject_reason=None,
        verified_at=None,
        created_at=datetime(2026, 7, 1, tzinfo=UTC),
    )


def _content(owner_type: str, owner_id: uuid.UUID | None):
    return SimpleNamespace(owner_type=owner_type, owner_id=owner_id)


class SubmitVerificationOwnershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_foreign_content_id_is_rejected(self):
        """타인이 업로드한 content UUID 를 자기 신청에 붙이면 400 — 존재만으로 통과하면 안 된다."""
        applicant = uuid.uuid4()
        stranger = uuid.uuid4()
        profile = _profile(applicant)
        foreign_content = _content("user", stranger)

        db = AsyncMock()
        db.get = AsyncMock(side_effect=[profile, foreign_content])

        body = SimpleNamespace(
            profile_id=profile.id,
            biz_license_content_id=uuid.uuid4(),
            signboard_content_id=None,
            rep_name=None,
        )

        with self.assertRaises(HTTPException) as ctx:
            await biz.submit_verification(body, db=db, session_uid=applicant)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_own_content_id_is_accepted(self):
        """신청자 본인 소유 content 는 그대로 통과해야 한다 (회귀 방지)."""
        applicant = uuid.uuid4()
        profile = _profile(applicant)
        own_content = _content("user", applicant)

        db = AsyncMock()
        db.get = AsyncMock(side_effect=[profile, own_content])
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        body = SimpleNamespace(
            profile_id=profile.id,
            biz_license_content_id=uuid.uuid4(),
            signboard_content_id=None,
            rep_name=None,
        )

        result = await biz.submit_verification(body, db=db, session_uid=applicant)
        self.assertEqual(result.verification_status, "docs_submitted")


if __name__ == "__main__":
    unittest.main()
