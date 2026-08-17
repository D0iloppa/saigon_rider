"""D-21(감사 260817) — price_vnd/amount 상한 200억 VND.

cd41866 이 넣은 1000억 VND 상한은 오버플로 가드일 뿐 오입력 가드가 아니었다(실DB 에
100억 VND "소파"가 그대로 통과하는 사례 확인). D-21 승인에 따라 상한을 200억 VND 로
조인다 — 매물 등록(price_vnd), 가격 수정(price_vnd), 가격 제안(amount) 세 곳 모두
같은 상수(_MAX_PRICE_VND)를 공유한다.
"""

import unittest
import uuid

from pydantic import ValidationError

from app.schemas import (
    MarketplaceListingCreateRequest,
    MarketplaceListingPriceUpdate,
    PriceOfferProposeRequest,
)

_CAP = 20_000_000_000


class MarketplaceListingCreatePriceCapTest(unittest.TestCase):
    def test_at_cap_is_valid(self):
        req = MarketplaceListingCreateRequest(seller_id=uuid.uuid4(), title="오토바이", price_vnd=_CAP)
        self.assertEqual(req.price_vnd, _CAP)

    def test_over_cap_raises(self):
        with self.assertRaises(ValidationError):
            MarketplaceListingCreateRequest(seller_id=uuid.uuid4(), title="소파", price_vnd=_CAP + 1)


class MarketplaceListingPriceUpdateCapTest(unittest.TestCase):
    def test_at_cap_is_valid(self):
        req = MarketplaceListingPriceUpdate(seller_id=uuid.uuid4(), price_vnd=_CAP)
        self.assertEqual(req.price_vnd, _CAP)

    def test_over_cap_raises(self):
        with self.assertRaises(ValidationError):
            MarketplaceListingPriceUpdate(seller_id=uuid.uuid4(), price_vnd=_CAP + 1)


class PriceOfferProposeCapTest(unittest.TestCase):
    def test_at_cap_is_valid(self):
        req = PriceOfferProposeRequest(conversation_id=uuid.uuid4(), amount=_CAP)
        self.assertEqual(req.amount, _CAP)

    def test_over_cap_raises(self):
        with self.assertRaises(ValidationError):
            PriceOfferProposeRequest(conversation_id=uuid.uuid4(), amount=_CAP + 1)


if __name__ == "__main__":
    unittest.main()
