"""Q-3(감사 260817) — HIDDEN/REMOVED 매물 소유자 열람 허용.

수정 전에는 get_listing 이 소유자 예외 없이 HIDDEN/REMOVED 를 전부 404 처리해,
관리자가 매물을 조치하면 판매자 본인도 자기 매물을 다시 볼 수 없었다(사유 알림
딥링크도 같이 깨짐). 이 파일은 그 계약을 고정한다:
 - 소유자(seller_id == session_uid)는 HIDDEN/REMOVED 도 200 으로 조회 가능.
 - 비소유자는 기존과 동일하게 404 (회귀 금지).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers import market


def _listing(status, seller_id):
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        seller_id=seller_id,
        seller=SimpleNamespace(
            id=seller_id, nickname="seller", level=1, manner_temp=36.5, phone_verified_at=None, phone=None
        ),
        status=status,
        images=[],
        business_profile_id=None,
        category=None,
        district=None,
        like_count=0,
        view_count=0,
        created_at=now,
        bumped_at=now,
        price_vnd=100000,
        original_price_vnd=None,
        is_negotiable=False,
        title="매물",
        description=None,
        paper_status=None,
        plate_province=None,
    )


def _db_for_owner_view(listing):
    """소유자 조회가 access-control 을 지나 상세 조립까지 끝까지 도달할 때 필요한
    조회(매물조회·차단여부·리뷰·완료건수·다른매물) 응답을 순서대로 흉내낸다."""
    listing_result = MagicMock(scalar_one_or_none=MagicMock(return_value=listing))
    blocked_result = MagicMock(first=MagicMock(return_value=None))
    review_result = MagicMock()
    review_result.scalars.return_value.all.return_value = []
    sold_count_result = MagicMock(scalar_one=MagicMock(return_value=0))
    others_result = MagicMock()
    others_result.scalars.return_value.all.return_value = []
    # 016 §4-7 #42: get_listing 이 미응답 거래결과핑 존재 여부를 조회하는 마지막 execute.
    deal_ping_result = MagicMock(first=MagicMock(return_value=None))
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            listing_result,
            blocked_result,
            review_result,
            sold_count_result,
            others_result,
            deal_ping_result,
        ]
    )
    db.get = AsyncMock(return_value=None)  # MarketplaceListingLike 조회 — 찜 안 함
    return db


class OwnerCanViewModeratedListingTest(unittest.IsolatedAsyncioTestCase):
    async def test_owner_sees_hidden_listing(self):
        seller_id = uuid.uuid4()
        listing = _listing("HIDDEN", seller_id)
        db = _db_for_owner_view(listing)
        detail = await market.get_listing(listing.id, db=db, session_uid=seller_id)
        self.assertEqual(detail.status, "HIDDEN")

    async def test_owner_sees_removed_listing(self):
        seller_id = uuid.uuid4()
        listing = _listing("REMOVED", seller_id)
        db = _db_for_owner_view(listing)
        detail = await market.get_listing(listing.id, db=db, session_uid=seller_id)
        self.assertEqual(detail.status, "REMOVED")

    async def test_non_owner_still_gets_404_for_hidden(self):
        listing = _listing("HIDDEN", uuid.uuid4())
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=listing)))
        with self.assertRaises(HTTPException) as ctx:
            await market.get_listing(listing.id, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_anonymous_still_gets_404_for_removed(self):
        listing = _listing("REMOVED", uuid.uuid4())
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=listing)))
        with self.assertRaises(HTTPException) as ctx:
            await market.get_listing(listing.id, db=db, session_uid=None)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
