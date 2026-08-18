"""T-4(검수 큐 하루 54건 대비) — 일괄 승인/반려 엔드포인트 + 기계 판정 자동 플래그.

이 파일이 고정하는 계약:
 1) `_flags_for` — 사진 2장 미만 / 가격 0동 / 카테고리 미지정 / 중복(별도 계산돼 들어온 id셋)을
    각각 독립적으로 플래그한다.
 2) `_duplicate_ids` — 같은 business_profile_id 안에서 제목 + 첫 사진 content_id 가 완전히 같은
    매물끼리만 서로를 중복으로 표시한다(다른 업체·다른 제목·사진 없음은 걸리지 않는다).
 3) `bulk_moderate_listings` — 단건 `/{listing_id}/moderate` 와 동일한 상태전이·알림·감사로그를
    선택된 id 각각에 적용하고, 존재하지 않는 id 는 `missing_ids` 로 알려준다.
"""

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.models import MarketplaceListing, MarketplaceListingImage
from app.routers.admin_api import listings as admin_listings


def _listing(**overrides) -> MarketplaceListing:
    defaults = dict(
        id=uuid.uuid4(),
        seller_id=uuid.uuid4(),
        business_profile_id=None,
        category_id=1,
        title="Honda Wave 2020",
        price_vnd=5_000_000,
        status="ON_SALE",
    )
    defaults.update(overrides)
    listing = MarketplaceListing(**defaults)
    listing.images = overrides.get("images", [])
    return listing


def _image(content_id: uuid.UUID, sort_order: int = 0) -> MarketplaceListingImage:
    return MarketplaceListingImage(id=uuid.uuid4(), content_id=content_id, sort_order=sort_order)


class FlagsForTests(unittest.TestCase):
    def test_low_photos_flagged_under_two_images(self):
        listing = _listing(images=[_image(uuid.uuid4())])
        self.assertIn("LOW_PHOTOS", admin_listings._flags_for(listing, set()))

    def test_two_photos_not_flagged(self):
        listing = _listing(images=[_image(uuid.uuid4()), _image(uuid.uuid4(), 1)])
        self.assertNotIn("LOW_PHOTOS", admin_listings._flags_for(listing, set()))

    def test_zero_price_flagged(self):
        listing = _listing(price_vnd=0)
        self.assertIn("ZERO_PRICE", admin_listings._flags_for(listing, set()))

    def test_nonzero_price_not_flagged(self):
        listing = _listing(price_vnd=1)
        self.assertNotIn("ZERO_PRICE", admin_listings._flags_for(listing, set()))

    def test_no_category_flagged(self):
        listing = _listing(category_id=None)
        self.assertIn("NO_CATEGORY", admin_listings._flags_for(listing, set()))

    def test_duplicate_flag_only_when_in_given_id_set(self):
        listing = _listing()
        self.assertNotIn("DUPLICATE", admin_listings._flags_for(listing, set()))
        self.assertIn("DUPLICATE", admin_listings._flags_for(listing, {listing.id}))


class DuplicateIdsTests(unittest.IsolatedAsyncioTestCase):
    async def test_no_business_profile_short_circuits_without_query(self):
        db = AsyncMock()
        listing = _listing(business_profile_id=None)
        result = await admin_listings._duplicate_ids(db, [listing])
        self.assertEqual(result, set())
        db.execute.assert_not_called()

    async def test_same_title_and_photo_in_same_business_are_flagged(self):
        biz_id = uuid.uuid4()
        content_id = uuid.uuid4()
        a = _listing(business_profile_id=biz_id, title="Wave 2020", images=[_image(content_id)])
        b = _listing(business_profile_id=biz_id, title="Wave 2020", images=[_image(content_id)])
        c = _listing(business_profile_id=biz_id, title="Air Blade 2019", images=[_image(uuid.uuid4())])

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [a, b, c]
        db.execute.return_value = result_mock

        flagged = await admin_listings._duplicate_ids(db, [a])
        self.assertEqual(flagged, {a.id, b.id})
        self.assertNotIn(c.id, flagged)

    async def test_different_business_profiles_not_cross_matched(self):
        content_id = uuid.uuid4()
        a = _listing(business_profile_id=uuid.uuid4(), title="Wave 2020", images=[_image(content_id)])
        b = _listing(business_profile_id=uuid.uuid4(), title="Wave 2020", images=[_image(content_id)])

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [a, b]
        db.execute.return_value = result_mock

        flagged = await admin_listings._duplicate_ids(db, [a, b])
        self.assertEqual(flagged, set())


class BulkModerateListingsTests(unittest.IsolatedAsyncioTestCase):
    def _request(self):
        request = MagicMock()
        request.headers.get.return_value = None
        request.client = None
        return request

    def _session(self):
        return SimpleNamespace(username="root", role="root")

    async def test_applies_action_to_each_found_id_and_reports_missing(self):
        listing_a = _listing(status="ON_SALE")
        listing_b = _listing(status="ON_SALE")
        missing_id = uuid.uuid4()

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [listing_a, listing_b]
        db.execute.return_value = result_mock
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        body = admin_listings.BulkModerateRequest(
            listing_ids=[listing_a.id, listing_b.id, missing_id],
            action="REMOVE",
            reason="가격 0동 · 중복 확인됨",
        )

        result = await admin_listings.bulk_moderate_listings(body, self._request(), session=self._session(), db=db)

        self.assertEqual(listing_a.status, "REMOVED")
        self.assertEqual(listing_b.status, "REMOVED")
        self.assertEqual(result["missing_ids"], [str(missing_id)])
        self.assertEqual({row["id"] for row in result["updated"]}, {listing_a.id, listing_b.id})
        # 매물당 알림 1건 + 감사로그 1건 + 상태전이 로그 1건(016 §4-1 #36) = 총 6건 add
        self.assertEqual(len(added), 6)
        db.commit.assert_awaited_once()

    async def test_rejects_invalid_action(self):
        db = AsyncMock()
        body = admin_listings.BulkModerateRequest(listing_ids=[uuid.uuid4()], action="APPROVE", reason="ok")
        with self.assertRaises(Exception) as ctx:
            await admin_listings.bulk_moderate_listings(body, self._request(), session=self._session(), db=db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_rejects_empty_reason(self):
        db = AsyncMock()
        body = admin_listings.BulkModerateRequest(listing_ids=[uuid.uuid4()], action="REMOVE", reason="   ")
        with self.assertRaises(Exception) as ctx:
            await admin_listings.bulk_moderate_listings(body, self._request(), session=self._session(), db=db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_rejects_empty_listing_ids(self):
        db = AsyncMock()
        body = admin_listings.BulkModerateRequest(listing_ids=[], action="REMOVE", reason="ok")
        with self.assertRaises(Exception) as ctx:
            await admin_listings.bulk_moderate_listings(body, self._request(), session=self._session(), db=db)
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
