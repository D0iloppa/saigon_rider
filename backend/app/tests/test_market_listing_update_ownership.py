"""code-review high #8(감사 260817) — 매물 수정(PATCH)의 소유권 검증이 금칙어 검사보다 먼저.

수정 전에는 update_listing 이 실제 매물을 로드해 소유권을 확인하기 전에 금칙어 검사부터
돌렸다. body.seller_id 만 세션과 일치시키면(자기 자신의 id), 남의 listing_id 를 지정한
PATCH 가 403/404 대신 400 {"code":"banned_keyword"} 를 받아 — 문자열을 바꿔가며 응답 코드
차이로 금칙어 사전을 추출할 수 있는 oracle 이 됐다(공격자가 소유자가 아니어도 도달).

이 파일은 그 계약을 고정한다: 비소유자의 PATCH 는 금칙어 포함 여부와 무관하게 403/404 를
받고, 그 경로에서 금칙어 사전 조회 자체가 일어나지 않는다(오라클 차단 확인).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import market
from app.schemas import MarketplaceListingUpdateRequest


def _listing(status, seller_id):
    return SimpleNamespace(
        id=uuid.uuid4(),
        seller_id=seller_id,
        status=status,
        title="old title",
        description="old desc",
        category_id=None,
        updated_at=datetime.now(UTC),
        search_blob=None,
    )


class UpdateListingOwnershipBeforeBannedKeywordTest(unittest.IsolatedAsyncioTestCase):
    async def test_non_owner_patch_gets_403_not_banned_keyword(self):
        """공격자는 자기 자신의 session_uid 를 body.seller_id 로 넣어 첫 자기신원 검사는 통과시키되,
        listing_id 는 남의 매물을 지정한다 — 실제 소유자 검증은 DB 로드 후에만 가능하다."""
        attacker_id = uuid.uuid4()
        real_owner_id = uuid.uuid4()
        listing = _listing("ON_SALE", real_owner_id)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=listing)))

        body = MarketplaceListingUpdateRequest(seller_id=attacker_id, title="금칙어포함 텍스트")

        with (
            patch.object(market, "banned_keywords", AsyncMock(return_value=["금칙어"])) as banned_mock,
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.update_listing(listing.id, body, background=MagicMock(), db=db, session_uid=attacker_id)

        self.assertEqual(ctx.exception.status_code, 403)
        banned_mock.assert_not_awaited()  # 소유권 검증에서 막혀 금칙어 사전 조회 자체가 안 일어남

    async def test_nonexistent_listing_gets_404_not_banned_keyword(self):
        attacker_id = uuid.uuid4()
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

        body = MarketplaceListingUpdateRequest(seller_id=attacker_id, title="금칙어포함 텍스트")

        with (
            patch.object(market, "banned_keywords", AsyncMock(return_value=["금칙어"])) as banned_mock,
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.update_listing(uuid.uuid4(), body, background=MagicMock(), db=db, session_uid=attacker_id)

        self.assertEqual(ctx.exception.status_code, 404)
        banned_mock.assert_not_awaited()

    async def test_owner_still_blocked_by_banned_keyword(self):
        """회귀 방지: 소유자 본인의 정상 경로는 여전히 금칙어 검사를 통과해야 400 을 받는다."""
        owner_id = uuid.uuid4()
        listing = _listing("ON_SALE", owner_id)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=listing)))

        body = MarketplaceListingUpdateRequest(seller_id=owner_id, title="금칙어포함 텍스트")

        with (
            patch.object(market, "banned_keywords", AsyncMock(return_value=["금칙어"])),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.update_listing(listing.id, body, background=MagicMock(), db=db, session_uid=owner_id)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, {"code": "banned_keyword"})


if __name__ == "__main__":
    unittest.main()
