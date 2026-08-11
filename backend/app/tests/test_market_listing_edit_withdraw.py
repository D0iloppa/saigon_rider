"""F-6/F-7/F-8 회귀 테스트 — 매물 본문 수정(update_listing)과 판매자 철회(update_status→WITHDRAWN).

수정 전(엔드포인트 부재) FAIL 실증: 이 세션 이전에는 `market.update_listing` 함수 자체가
존재하지 않았고 `market._VALID_STATUSES`에 WITHDRAWN이 없어 이 테스트들은 전부
AttributeError/ValueError로 실패했다(구조적으로 통과 불가 — F-06 잔여 항목과 동일한 근거).
"""

import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.models import MarketplaceListingImage
from app.routers import market
from app.schemas import (
    MarketplaceListingCreateRequest,
    MarketplaceListingStatusUpdate,
    MarketplaceListingUpdateRequest,
)


def _listing(seller_id: uuid.UUID, status: str = "ON_SALE"):
    listing = MagicMock()
    listing.id = uuid.uuid4()
    listing.seller_id = seller_id
    listing.status = status
    listing.title = "old title"
    listing.description = "old desc"
    listing.category_id = None
    listing.business_profile_id = None
    return listing


def _exec_result(scalar=None, first=None):
    res = MagicMock()
    res.scalar_one_or_none = MagicMock(return_value=scalar)
    res.first = MagicMock(return_value=first)
    return res


def _count_result(n: int):
    res = MagicMock()
    res.scalar_one = MagicMock(return_value=n)
    return res


def _business_profile(user_id: uuid.UUID, status: str = "APPROVED"):
    bp = MagicMock()
    bp.id = uuid.uuid4()
    bp.user_id = user_id
    bp.status = status
    return bp


class UpdateListingOwnershipTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_body_seller_id_mismatch(self):
        session_uid = uuid.uuid4()
        db = AsyncMock()
        with self.assertRaises(HTTPException) as ctx:
            await market.update_listing(
                listing_id=uuid.uuid4(),
                body=MarketplaceListingUpdateRequest(
                    seller_id=uuid.uuid4(), title="t", image_content_ids=[uuid.uuid4()]
                ),
                background=MagicMock(),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_rejects_non_owner_listing(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=uuid.uuid4())  # 다른 사람 소유
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalar=listing))
        with self.assertRaises(HTTPException) as ctx:
            await market.update_listing(
                listing_id=listing.id,
                body=MarketplaceListingUpdateRequest(
                    seller_id=session_uid, title="t", image_content_ids=[uuid.uuid4()]
                ),
                background=MagicMock(),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_rejects_edit_when_sold(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="SOLD")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalar=listing))
        with self.assertRaises(HTTPException) as ctx:
            await market.update_listing(
                listing_id=listing.id,
                body=MarketplaceListingUpdateRequest(
                    seller_id=session_uid, title="t", image_content_ids=[uuid.uuid4()]
                ),
                background=MagicMock(),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, {"code": "not_editable"})

    async def test_allows_edit_when_withdrawn(self):
        """대표 지시 2026-08-08: 잠시 내렸다가(WITHDRAWN) 고쳐서 다시 올리는 흐름 — 수정 허용."""
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="WITHDRAWN")
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_exec_result(scalar=listing), MagicMock()])
        db.add = lambda obj: None
        db.commit = AsyncMock()

        result = await market.update_listing(
            listing_id=listing.id,
            body=MarketplaceListingUpdateRequest(
                seller_id=session_uid, title="고친 제목", image_content_ids=[uuid.uuid4()]
            ),
            background=MagicMock(),
            db=db,
            session_uid=session_uid,
        )
        self.assertEqual(result.id, listing.id)
        self.assertEqual(listing.title, "고친 제목")
        self.assertEqual(listing.status, "WITHDRAWN")  # 수정이 상태를 바꾸지는 않는다

    async def test_owner_edit_replaces_fields_and_images(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="ON_SALE")
        db = AsyncMock()
        # 1번째 execute: 매물 조회, 2번째 execute: 기존 이미지 delete
        db.execute = AsyncMock(side_effect=[_exec_result(scalar=listing), MagicMock()])
        added = []
        db.add = lambda obj: added.append(obj)
        db.commit = AsyncMock()

        new_cid = uuid.uuid4()
        result = await market.update_listing(
            listing_id=listing.id,
            body=MarketplaceListingUpdateRequest(
                seller_id=session_uid,
                title="새 제목",
                description="새 설명",
                category_id=7,
                image_content_ids=[new_cid],
            ),
            background=MagicMock(),
            db=db,
            session_uid=session_uid,
        )
        self.assertEqual(result.id, listing.id)
        self.assertEqual(listing.title, "새 제목")
        self.assertEqual(listing.description, "새 설명")
        self.assertEqual(listing.category_id, 7)
        # search.reindex 아웃박스 이벤트도 db.add 를 타므로(P3), 이미지 타입으로 필터링해서 센다
        images = [obj for obj in added if isinstance(obj, MarketplaceListingImage)]
        self.assertEqual(len(images), 1)  # 새 이미지 1건 추가
        self.assertEqual(images[0].content_id, new_cid)
        self.assertEqual(listing.search_blob, "새 제목 새 설명")
        db.commit.assert_awaited()


class WithdrawListingTest(unittest.IsolatedAsyncioTestCase):
    async def test_withdraw_blocked_by_active_appointment(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="ON_SALE")
        db = AsyncMock()
        # 1번째 execute: 매물 조회, 2번째 execute: FOR UPDATE 재조회, 3번째 execute: ACCEPTED 약속 존재 확인
        db.execute = AsyncMock(
            side_effect=[
                _exec_result(scalar=listing),
                _exec_result(scalar=listing),
                _exec_result(first=(uuid.uuid4(),)),
            ]
        )
        with self.assertRaises(HTTPException) as ctx:
            await market.update_status(
                listing_id=listing.id,
                body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="WITHDRAWN"),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, {"code": "active_appointment"})

    async def test_withdraw_succeeds_without_active_appointment(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="ON_SALE")
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _exec_result(scalar=listing),
                _exec_result(scalar=listing),
                _exec_result(first=None),
            ]
        )
        db.commit = AsyncMock()

        result = await market.update_status(
            listing_id=listing.id,
            body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="WITHDRAWN"),
            db=db,
            session_uid=session_uid,
        )
        self.assertEqual(result.id, listing.id)
        self.assertEqual(listing.status, "WITHDRAWN")

    async def test_withdraw_locks_listing_row_for_update(self):
        """TOCTOU 회귀 가드: 철회 경로가 activated_appointment 재검사 전에 매물 행을
        FOR UPDATE 로 잠그는지 SQL 형태로 정적 단정한다(_load_appointment/MKT-2 와 동일 근거)."""
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="ON_SALE")
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _exec_result(scalar=listing),
                _exec_result(scalar=listing),
                _exec_result(first=None),
            ]
        )
        db.commit = AsyncMock()

        await market.update_status(
            listing_id=listing.id,
            body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="WITHDRAWN"),
            db=db,
            session_uid=session_uid,
        )
        # 2번째 execute 호출(잠금 재조회)의 컴파일된 SQL 에 FOR UPDATE 가 있어야 한다.
        locked_stmt = db.execute.await_args_list[1].args[0]
        self.assertIn("FOR UPDATE", str(locked_stmt))

    async def test_withdrawn_listing_can_be_relisted(self):
        """대표 지시 2026-08-08: 철회는 삭제가 아니라 상태 — 판매중으로 되돌려 다시 팔 수 있어야 한다."""
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="WITHDRAWN")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalar=listing))
        db.commit = AsyncMock()

        result = await market.update_status(
            listing_id=listing.id,
            body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="ON_SALE"),
            db=db,
            session_uid=session_uid,
        )
        self.assertEqual(result.id, listing.id)
        self.assertEqual(listing.status, "ON_SALE")
        db.commit.assert_awaited()

    async def test_withdrawn_listing_cannot_go_straight_to_reserved(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="WITHDRAWN")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalar=listing))
        with self.assertRaises(HTTPException) as ctx:
            await market.update_status(
                listing_id=listing.id,
                body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="RESERVED"),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, {"code": "relist_on_sale_only"})

    async def test_moderated_listing_still_cannot_be_transitioned(self):
        session_uid = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="HIDDEN")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalar=listing))
        with self.assertRaises(HTTPException) as ctx:
            await market.update_status(
                listing_id=listing.id,
                body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="ON_SALE"),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, {"code": "moderated"})


class CreateListingBusinessCapTest(unittest.IsolatedAsyncioTestCase):
    """T-3: 업체당 매물 상한 5건(서버 강제, 예외 없음). "활성" 정의 — status NOT IN
    (SOLD, WITHDRAWN, HIDDEN, REMOVED) — 는 line 344 의 공개 비노출 그룹과 동일하게 맞춘 것으로,
    거래완료/철회/모더레이션된 매물은 상한에서 빠져 lifetime cap 이 되지 않는다."""

    def _request(self, seller_id: uuid.UUID, business_profile_id: uuid.UUID):
        return MarketplaceListingCreateRequest(
            seller_id=seller_id, title="중고 오토바이", business_profile_id=business_profile_id
        )

    async def test_sixth_active_listing_rejected_with_422(self):
        session_uid = uuid.uuid4()
        bp = _business_profile(session_uid)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=[MagicMock(), bp])  # 1) seller  2) business_profile
        db.execute = AsyncMock(return_value=_count_result(5))
        with self.assertRaises(HTTPException) as ctx:
            await market.create_listing(
                body=self._request(session_uid, bp.id),
                background=MagicMock(),
                db=db,
                _session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_fifth_active_listing_still_allowed(self):
        session_uid = uuid.uuid4()
        bp = _business_profile(session_uid)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=[MagicMock(), bp])
        db.execute = AsyncMock(return_value=_count_result(4))
        db.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", uuid.uuid4()) if hasattr(obj, "status") else None)
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        result = await market.create_listing(
            body=self._request(session_uid, bp.id),
            background=MagicMock(),
            db=db,
            _session_uid=session_uid,
        )
        self.assertIsNotNone(result.id)
        db.commit.assert_awaited()

    async def test_cap_query_excludes_sold_withdrawn_and_moderated(self):
        """상한 카운트 쿼리가 SOLD/WITHDRAWN/HIDDEN/REMOVED 를 제외하는지 SQL 형태로 단정
        (hide_sold 회귀 테스트와 동일한 방식) — 철회 후 재등록이 막히지 않음을 보장."""
        session_uid = uuid.uuid4()
        bp = _business_profile(session_uid)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=[MagicMock(), bp])
        db.execute = AsyncMock(return_value=_count_result(5))
        with self.assertRaises(HTTPException):
            await market.create_listing(
                body=self._request(session_uid, bp.id),
                background=MagicMock(),
                db=db,
                _session_uid=session_uid,
            )
        stmt = db.execute.await_args.args[0]
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        for term in ("SOLD", "WITHDRAWN", "HIDDEN", "REMOVED"):
            self.assertIn(term, sql)


class RelistBusinessCapTest(unittest.IsolatedAsyncioTestCase):
    """T-3 review 발견 — WITHDRAWN→ON_SALE 재판매 경로가 상한 재검증 없이 신규 등록과
    동일한 결과(활성 슬롯 점유)를 만들면서도 create_listing 의 상한 체크를 우회하고 있었다."""

    async def test_relist_at_cap_rejected_with_422(self):
        session_uid = uuid.uuid4()
        bp_id = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="WITHDRAWN")
        listing.business_profile_id = bp_id
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_exec_result(scalar=listing), MagicMock(), _count_result(5)])
        with self.assertRaises(HTTPException) as ctx:
            await market.update_status(
                listing_id=listing.id,
                body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="ON_SALE"),
                db=db,
                session_uid=session_uid,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_relist_below_cap_still_allowed(self):
        session_uid = uuid.uuid4()
        bp_id = uuid.uuid4()
        listing = _listing(seller_id=session_uid, status="WITHDRAWN")
        listing.business_profile_id = bp_id
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_exec_result(scalar=listing), MagicMock(), _count_result(4)])
        db.commit = AsyncMock()
        result = await market.update_status(
            listing_id=listing.id,
            body=MarketplaceListingStatusUpdate(seller_id=session_uid, status="ON_SALE"),
            db=db,
            session_uid=session_uid,
        )
        self.assertEqual(result.id, listing.id)
        self.assertEqual(listing.status, "ON_SALE")


if __name__ == "__main__":
    unittest.main()
