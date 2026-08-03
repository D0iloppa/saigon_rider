"""P1-2 회귀 테스트 — 판매완료(SOLD)는 종결 상태다.

수정 전에는 `update_status` 가 목표 상태 SOLD 만 막고 **현재 상태가 SOLD 인 매물**은
막지 않아 SOLD→ON_SALE / SOLD→RESERVED 로 되돌릴 수 있었다. 이 파일은 그 회귀를 고정한다.
가격 변경(`update_price`)의 SOLD 거절은 기존에 이미 동작하던 것이므로 함께 고정만 한다.
약속 완료(`complete_appointment`)를 통한 정상 SOLD 전이는 이 가드와 무관한 별도 코드 경로임을
함께 확인한다(회귀 방지).
"""

import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import market
from app.schemas import MarketplaceListingPriceUpdate, MarketplaceListingStatusUpdate


def _listing(seller_id: uuid.UUID, status: str = "SOLD", price_vnd: int = 100_000):
    listing = MagicMock()
    listing.id = uuid.uuid4()
    listing.seller_id = seller_id
    listing.status = status
    listing.price_vnd = price_vnd
    listing.original_price_vnd = None
    return listing


def _exec_result(scalar=None, first=None):
    res = MagicMock()
    res.scalar_one_or_none = MagicMock(return_value=scalar)
    res.first = MagicMock(return_value=first)
    return res


class SoldIsTerminalTest(unittest.IsolatedAsyncioTestCase):
    async def test_sold_to_on_sale_rejected(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="SOLD")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalar=listing))
        with self.assertRaises(HTTPException) as ctx:
            await market.update_status(
                listing_id=listing.id,
                body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="ON_SALE"),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, {"code": "already_sold"})

    async def test_sold_to_reserved_rejected(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="SOLD")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalar=listing))
        with self.assertRaises(HTTPException) as ctx:
            await market.update_status(
                listing_id=listing.id,
                body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="RESERVED"),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, {"code": "already_sold"})

    async def test_price_change_on_sold_listing_rejected(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="SOLD", price_vnd=200_000)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalar=listing))
        with self.assertRaises(HTTPException) as ctx:
            await market.update_price(
                listing_id=listing.id,
                body=MarketplaceListingPriceUpdate(seller_id=session_uid, price_vnd=150_000),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 409)


class AppointmentCompleteStillWorksTest(unittest.IsolatedAsyncioTestCase):
    """약속 완료(complete_appointment) 를 통한 SOLD 전이는 update_status 가드와 별도 경로이므로
    영향을 받지 않아야 한다."""

    async def test_complete_appointment_still_marks_listing_sold(self):
        session_uid = uuid.uuid4()  # 판매자
        listing = _listing(seller_id=session_uid, status="ON_SALE", price_vnd=300_000)

        appt = MagicMock()
        appt.id = uuid.uuid4()
        appt.listing_id = listing.id
        appt.conversation_id = uuid.uuid4()
        appt.proposer_id = uuid.uuid4()
        appt.when_at = datetime.now(UTC)
        appt.place_name = None
        appt.place_lat = None
        appt.place_lng = None
        appt.status = "ACCEPTED"

        conv = MagicMock()
        conv.id = appt.conversation_id

        db = AsyncMock()
        # complete_appointment 내부: 수락된 가격제안 조회(없음) → scalar_one_or_none=None
        db.execute = AsyncMock(return_value=_exec_result(scalar=None))
        db.commit = AsyncMock()

        with patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))):
            result = await market.complete_appointment(
                appointment_id=appt.id,
                db=db,
                session_uid=session_uid,
            )

        self.assertEqual(appt.status, "COMPLETED")
        self.assertEqual(listing.status, "SOLD")
        self.assertEqual(listing.agreed_price_vnd, listing.price_vnd)
        self.assertEqual(result.id, appt.id)


if __name__ == "__main__":
    unittest.main()
