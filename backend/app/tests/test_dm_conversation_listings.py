"""F-DM-02(260928) 방-매물 다:다 연결 회귀 테스트.

test_dm_message_sync.py / test_marketplace_transaction.py 스타일 — mock db 로 라우터 함수를
직접 호출한다(실 DB 불필요).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import dm, market


def _direct_conv(conv_id, p1, p2, *, context_id=None):
    conv = MagicMock()
    conv.id = conv_id
    conv.conversation_type = "direct"
    conv.participant_1 = p1
    conv.participant_2 = p2
    conv.context_type = "listing" if context_id else None
    conv.context_id = context_id
    return conv


class ConversationListingsEndpointTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.me = uuid.uuid4()
        self.other = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.conv = _direct_conv(self.conv_id, self.me, self.other)
        patcher = patch.object(dm, "require_unblocked", AsyncMock())
        patcher.start()
        self.addCleanup(patcher.stop)

    def _listing(self, **kwargs):
        defaults = dict(id=uuid.uuid4(), title="Xe máy", price_vnd=1_000_000, status="ON_SALE", images=[])
        defaults.update(kwargs)
        return SimpleNamespace(**defaults)

    async def test_stages_and_reserved_by_other(self):
        listing_in_progress = self._listing(status="RESERVED")
        listing_inquiry = self._listing(status="ON_SALE")
        listing_reserved_by_other = self._listing(status="RESERVED")

        link1 = SimpleNamespace(linked_at=datetime.now(UTC))
        link2 = SimpleNamespace(linked_at=datetime.now(UTC))
        link3 = SimpleNamespace(linked_at=datetime.now(UTC))

        listings_result = MagicMock()
        listings_result.all.return_value = [
            (link1, listing_in_progress),
            (link2, listing_inquiry),
            (link3, listing_reserved_by_other),
        ]
        appts_result = MagicMock()
        appts_result.all.return_value = [
            (listing_in_progress.id, "ACCEPTED"),
        ]
        db = MagicMock()
        db.get = AsyncMock(return_value=self.conv)
        db.execute = AsyncMock(side_effect=[listings_result, appts_result])

        items = await dm.get_conversation_listings(self.conv_id, db=db, _session_uid=self.me)

        by_id = {i.id: i for i in items}
        self.assertEqual(by_id[listing_in_progress.id].stage, "IN_PROGRESS")
        self.assertFalse(by_id[listing_in_progress.id].reserved_by_other)
        self.assertEqual(by_id[listing_inquiry.id].stage, "INQUIRY")
        self.assertFalse(by_id[listing_inquiry.id].reserved_by_other)
        self.assertEqual(by_id[listing_reserved_by_other.id].stage, "INQUIRY")
        self.assertTrue(by_id[listing_reserved_by_other.id].reserved_by_other)
        # 거래중(IN_PROGRESS) 이 먼저
        self.assertEqual(items[0].id, listing_in_progress.id)

    async def test_completed_in_this_conversation_is_excluded(self):
        # DB 쿼리 자체가 SOLD/HIDDEN/REMOVED 를 걸러내므로, 여기서는 COMPLETED 약속이 있는
        # 매물(이론상 status 는 SOLD 로 이미 걸러지지만 방어적으로 서비스 레이어에서도 제외)만 검증.
        listing = self._listing(status="ON_SALE")
        link = SimpleNamespace(linked_at=datetime.now(UTC))
        listings_result = MagicMock()
        listings_result.all.return_value = [(link, listing)]
        appts_result = MagicMock()
        appts_result.all.return_value = [(listing.id, "COMPLETED")]
        db = MagicMock()
        db.get = AsyncMock(return_value=self.conv)
        db.execute = AsyncMock(side_effect=[listings_result, appts_result])

        items = await dm.get_conversation_listings(self.conv_id, db=db, _session_uid=self.me)
        self.assertEqual(items, [])

    async def test_non_participant_forbidden(self):
        stranger = uuid.uuid4()
        db = MagicMock()
        db.get = AsyncMock(return_value=self.conv)
        db.execute = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await dm.get_conversation_listings(self.conv_id, db=db, _session_uid=stranger)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_conversation_not_found(self):
        db = MagicMock()
        db.get = AsyncMock(return_value=None)
        with self.assertRaises(HTTPException) as ctx:
            await dm.get_conversation_listings(uuid.uuid4(), db=db, _session_uid=self.me)
        self.assertEqual(ctx.exception.status_code, 404)


class ProposeAppointmentListingIdTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.buyer = uuid.uuid4()
        self.seller = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.context_listing_id = uuid.uuid4()
        self.conv = _direct_conv(self.conv_id, self.buyer, self.seller, context_id=self.context_listing_id)
        for p in (
            patch.object(market, "require_unblocked", AsyncMock()),
            patch.object(market, "_appointment_unlocked", AsyncMock(return_value=True)),
        ):
            p.start()
            self.addCleanup(p.stop)

    def _body(self, listing_id=None):
        return SimpleNamespace(
            conversation_id=self.conv_id,
            when_at=datetime.now(UTC),
            place_name=None,
            place_lat=None,
            place_lng=None,
            listing_id=listing_id,
        )

    async def test_unlinked_listing_rejected(self):
        other_listing_id = uuid.uuid4()
        linked_result = MagicMock()
        linked_result.scalar_one_or_none.return_value = None  # not linked
        db = MagicMock()
        db.get = AsyncMock(return_value=self.conv)
        db.execute = AsyncMock(return_value=linked_result)

        with self.assertRaises(HTTPException) as ctx:
            await market.propose_appointment(
                self._body(listing_id=other_listing_id), db=db, session_uid=self.buyer, tracking_ids=(None, None)
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_reserved_listing_rejected_409(self):
        linked_result = MagicMock()
        linked_result.scalar_one_or_none.return_value = self.context_listing_id
        listing = SimpleNamespace(id=self.context_listing_id, seller_id=self.seller, status="RESERVED")
        db = MagicMock()

        async def _get(model, pk):
            return self.conv if pk == self.conv_id else listing

        db.get = AsyncMock(side_effect=_get)
        db.execute = AsyncMock(return_value=linked_result)

        with self.assertRaises(HTTPException) as ctx:
            await market.propose_appointment(
                self._body(listing_id=self.context_listing_id),
                db=db,
                session_uid=self.buyer,
                tracking_ids=(None, None),
            )
        self.assertEqual(ctx.exception.status_code, 409)

    async def _capture_supersede_update(self, body_listing_id, resolved_listing_id):
        """propose_appointment 를 supersede UPDATE 직후( `db.flush()` )에서 멈추고 그 UPDATE 문을
        돌려준다 — 메시지/약속 DB 부수효과 전체를 재현하지 않고도 실제 바인드값을 검증한다."""
        listing = SimpleNamespace(id=resolved_listing_id, seller_id=self.seller, status="ON_SALE")

        async def _get(model, pk):
            return self.conv if pk == self.conv_id else listing

        results = []
        if resolved_listing_id != self.context_listing_id:
            linked_result = MagicMock()
            linked_result.scalar_one_or_none.return_value = resolved_listing_id
            results.append(linked_result)
        results.append(MagicMock())  # dm_conversation_listings pg_insert

        db = MagicMock()
        db.get = AsyncMock(side_effect=_get)
        db.execute = AsyncMock(side_effect=[*results, MagicMock()])  # last = supersede update
        db.flush = AsyncMock(side_effect=RuntimeError("stop-after-supersede"))

        with self.assertRaises(RuntimeError):
            await market.propose_appointment(
                self._body(listing_id=body_listing_id), db=db, session_uid=self.buyer, tracking_ids=(None, None)
            )
        return db.execute.await_args_list[-1].args[0]

    async def test_supersede_update_scoped_to_a_different_selected_listing(self):
        # 리뷰 지적(HIGH): 매물 B 에 제안하면 매물 A 의 PROPOSED 를 건드리면 안 된다.
        other_listing_id = uuid.uuid4()
        stmt = await self._capture_supersede_update(other_listing_id, other_listing_id)
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        self.assertIn(f"listing_id = '{other_listing_id.hex}'", sql)
        self.assertNotIn(self.context_listing_id.hex, sql)

    async def test_supersede_update_scoped_to_the_default_context_listing(self):
        # listing_id 생략(하위호환 폴백) 시에도 그 매물 하나로만 좁혀져야 한다.
        stmt = await self._capture_supersede_update(None, self.context_listing_id)
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        self.assertIn(f"listing_id = '{self.context_listing_id.hex}'", sql)


class CardMessageSendTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.me = uuid.uuid4()
        self.other = uuid.uuid4()
        self.conv_id = uuid.uuid4()
        self.conv = _direct_conv(self.conv_id, self.me, self.other)
        for p in (
            patch.object(dm, "require_unblocked", AsyncMock()),
            patch.object(dm, "_banned_keywords", AsyncMock(return_value=[])),
            patch.object(dm, "noti_events"),
        ):
            p.start()
            self.addCleanup(p.stop)

    def _body(self, **meta):
        from app.schemas import DmMessageCreateRequest

        return DmMessageCreateRequest(message_type="card", meta=meta or None)

    async def test_card_requires_item_subtype_and_listing_id(self):
        db = MagicMock()
        db.get = AsyncMock(return_value=self.conv)
        with self.assertRaises(HTTPException) as ctx:
            await dm.send_message(self.conv_id, self._body(subtype="item"), db=db, _session_uid=self.me)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_card_rejects_listing_from_a_third_party_seller(self):
        # 결정(대표): 이 방 참가자 누구의 매물도 아니면(제3자/무관 매물) 카드를 못 보낸다.
        listing_id = uuid.uuid4()
        stranger_id = uuid.uuid4()
        listing = SimpleNamespace(id=listing_id, seller_id=stranger_id, status="ON_SALE", images=[])

        async def _get(model, pk):
            return self.conv if pk == self.conv_id else listing

        db = MagicMock()
        db.get = AsyncMock(side_effect=_get)
        with self.assertRaises(HTTPException) as ctx:
            await dm.send_message(
                self.conv_id, self._body(subtype="item", listingId=str(listing_id)), db=db, _session_uid=self.me
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_card_rejects_sold_listing(self):
        # 결정(대표): SOLD(또는 그 외 ON_SALE/RESERVED 가 아닌 상태)는 문의중 티어로 새지 않는다.
        listing_id = uuid.uuid4()
        listing = SimpleNamespace(id=listing_id, seller_id=self.other, status="SOLD", images=[])

        async def _get(model, pk):
            return self.conv if pk == self.conv_id else listing

        db = MagicMock()
        db.get = AsyncMock(side_effect=_get)
        with self.assertRaises(HTTPException) as ctx:
            await dm.send_message(
                self.conv_id, self._body(subtype="item", listingId=str(listing_id)), db=db, _session_uid=self.me
            )
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_card_allows_seller_sharing_own_reserved_listing(self):
        # 결정(대표): 판매자가 자기 다른 매물(RESERVED 포함, 아직 거래 가능)을 공유하는 건 허용.
        listing_id = uuid.uuid4()
        listing = SimpleNamespace(
            id=listing_id, seller_id=self.me, status="RESERVED", images=[], title="t", price_vnd=1
        )

        async def _get(model, pk):
            name = getattr(model, "__name__", "")
            if name == "DmConversation":
                return self.conv
            if name == "MarketplaceListing":
                return listing
            if name == "DmConversationMember":
                return SimpleNamespace(left_at=None)
            if name == "User":
                return SimpleNamespace(nickname="me")
            return None

        insert_result = MagicMock()
        select_result = MagicMock()
        now = datetime.now(UTC)
        select_result.scalar_one.return_value = SimpleNamespace(
            id=uuid.uuid4(),
            conversation_id=self.conv_id,
            sender_id=self.me,
            content=None,
            message_type="card",
            meta={"subtype": "item", "listingId": str(listing_id), "title": "t", "priceVnd": 1, "thumbnailUrl": None},
            image_content=None,
            audio_content=None,
            read_at=None,
            created_at=now,
            updated_at=now,
            reply_to_message_id=None,
            reply_preview=None,
        )
        db = MagicMock()
        db.get = AsyncMock(side_effect=_get)
        db.execute = AsyncMock(side_effect=[insert_result, select_result])
        db.commit = AsyncMock()

        out = await dm.send_message(
            self.conv_id, self._body(subtype="item", listingId=str(listing_id)), db=db, _session_uid=self.me
        )
        self.assertEqual(out.meta["listingId"], str(listing_id))

    async def test_card_snapshot_ignores_client_payload(self):
        listing_id = uuid.uuid4()
        listing = SimpleNamespace(
            id=listing_id, seller_id=self.other, status="ON_SALE", title="실제 제목", price_vnd=999, images=[]
        )

        async def _get(model, pk):
            name = getattr(model, "__name__", "")
            if name == "DmConversation":
                return self.conv
            if name == "MarketplaceListing":
                return listing
            if name == "DmConversationMember":
                return SimpleNamespace(left_at=None)
            if name == "User":
                return SimpleNamespace(nickname="me")
            return None

        insert_result = MagicMock()
        select_result = MagicMock()
        now = datetime.now(UTC)
        select_result.scalar_one.return_value = SimpleNamespace(
            id=uuid.uuid4(),
            conversation_id=self.conv_id,
            sender_id=self.me,
            content=None,
            message_type="card",
            meta={
                "subtype": "item",
                "listingId": str(listing_id),
                "title": "실제 제목",
                "priceVnd": 999,
                "thumbnailUrl": None,
            },
            image_content=None,
            audio_content=None,
            read_at=None,
            created_at=now,
            updated_at=now,
            reply_to_message_id=None,
            reply_preview=None,
        )
        db = MagicMock()
        db.get = AsyncMock(side_effect=_get)
        db.execute = AsyncMock(side_effect=[insert_result, select_result])
        db.commit = AsyncMock()

        out = await dm.send_message(
            self.conv_id,
            self._body(subtype="item", listingId=str(listing_id), title="위조 제목", priceVnd=1),
            db=db,
            _session_uid=self.me,
        )
        self.assertEqual(out.meta["title"], "실제 제목")
        self.assertEqual(out.meta["priceVnd"], 999)


if __name__ == "__main__":
    unittest.main()
