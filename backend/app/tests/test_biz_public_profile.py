"""GET /biz/public/{profile_id} — is_owner 필드 회귀 테스트 (SGR-330).

test_biz_news_feed.py 스타일 미러: 실 DB 없이 db.get/db.execute 를 mock 해
라우터 함수를 직접 호출하고 응답 필드를 검증한다.
"""

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.routers import biz


def _count_result(n: int):
    result = MagicMock()
    result.scalar_one.return_value = n
    return result


class BizPublicProfileOwnerTests(unittest.IsolatedAsyncioTestCase):
    """is_owner — 세션 uid 와 profile.user_id 비교 (is_following 미러)."""

    def _profile(self, owner_id: uuid.UUID):
        return SimpleNamespace(
            id=uuid.uuid4(),
            name="Pho Shop",
            category="food",
            address=None,
            intro=None,
            latitude=None,
            longitude=None,
            phone=None,
            photo_content=None,
            status="APPROVED",
            user_id=owner_id,
        )

    @patch.object(biz.AdsApplication, "profile_public_ads", new_callable=AsyncMock, return_value=[])
    async def test_owner_viewing_own_profile_is_owner_true(self, _mock_ads):
        owner_id = uuid.uuid4()
        profile = self._profile(owner_id)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=[profile, None])  # BusinessProfile, BusinessFollow
        db.execute = AsyncMock(return_value=_count_result(0))

        result = await biz.get_public_profile(profile.id, db=db, session_uid=owner_id)

        self.assertTrue(result.is_owner)

    @patch.object(biz.AdsApplication, "profile_public_ads", new_callable=AsyncMock, return_value=[])
    async def test_other_user_viewing_profile_is_owner_false(self, _mock_ads):
        owner_id = uuid.uuid4()
        viewer_id = uuid.uuid4()
        profile = self._profile(owner_id)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=[profile, None])
        db.execute = AsyncMock(return_value=_count_result(0))

        result = await biz.get_public_profile(profile.id, db=db, session_uid=viewer_id)

        self.assertFalse(result.is_owner)

    @patch.object(biz.AdsApplication, "profile_public_ads", new_callable=AsyncMock, return_value=[])
    async def test_anonymous_viewer_is_owner_false(self, _mock_ads):
        owner_id = uuid.uuid4()
        profile = self._profile(owner_id)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=[profile, None])
        db.execute = AsyncMock(return_value=_count_result(0))

        result = await biz.get_public_profile(profile.id, db=db, session_uid=None)

        self.assertFalse(result.is_owner)


if __name__ == "__main__":
    unittest.main()
