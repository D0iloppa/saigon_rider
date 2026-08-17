"""퍼널 계측 최소 스키마 회귀 테스트 (정본 §5 #5, D-18(a)).

- services/funnel_events.record() 가 SAVEPOINT 로 격리해 적재하고, 실패해도 예외를 올리지
  않는지(호출 흐름 차단 금지).
- 핵심 이벤트 8종 중 자기완결적으로 mocking 가능한 지점(매물조회·등록·거래완료)이 실제로
  record() 를 호출하는지 — 나머지(문의·가격제안·약속·후기·가입 4경로)는 소스 위치 계약으로
  고정한다(요청 흐름 전체를 mocking 하는 비용 대비, 이 계측 훅이 올바른 이벤트 타입으로 올바른
  커밋 직전 위치에 있는지를 고정하는 것이 회귀 방지 목적에는 충분하다 — OutboxWiringContractTest
  와 동일한 계열의 판단).
- jobs/rollup_funnel_stats.py 의 멱등성(같은 날짜를 두 번 돌려도 값이 그대로).
"""

import inspect
import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.models import FunnelEvent
from app.routers import auth, dm, market
from app.schemas import FunnelEventType
from app.services import funnel_events


class _Savepoint:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class RecordSavepointTest(unittest.IsolatedAsyncioTestCase):
    async def test_record_adds_event_within_savepoint(self):
        db = MagicMock()
        db.begin_nested = MagicMock(return_value=_Savepoint())
        user_id = uuid.uuid4()
        entity_id = uuid.uuid4()

        await funnel_events.record(db, FunnelEventType.LISTING_VIEW, user_id=user_id, entity_id=entity_id)

        db.add.assert_called_once()
        added = db.add.call_args.args[0]
        self.assertIsInstance(added, FunnelEvent)
        self.assertEqual(added.event_type, "listing_view")
        self.assertEqual(added.user_id, user_id)
        self.assertEqual(added.entity_id, entity_id)
        self.assertIsNotNone(added.stat_date)

    async def test_record_swallows_insert_failure(self):
        """계측 실패가 본래 요청을 막으면 안 된다 — SAVEPOINT 실패도 예외를 올리지 않는다."""

        class _FailingSavepoint:
            async def __aenter__(self):
                raise RuntimeError("insert failed")

            async def __aexit__(self, exc_type, exc, traceback):
                return False

        db = MagicMock()
        db.begin_nested = MagicMock(return_value=_FailingSavepoint())

        # 예외 없이 반환되어야 한다.
        await funnel_events.record(db, FunnelEventType.SIGNUP, user_id=uuid.uuid4())


def _listing(seller_id, status="ON_SALE"):
    from types import SimpleNamespace

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
    )


def _db_for_listing_view(listing):
    listing_result = MagicMock(scalar_one_or_none=MagicMock(return_value=listing))
    blocked_result = MagicMock(first=MagicMock(return_value=None))
    review_result = MagicMock()
    review_result.scalars.return_value.all.return_value = []
    sold_count_result = MagicMock(scalar_one=MagicMock(return_value=0))
    others_result = MagicMock()
    others_result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[listing_result, blocked_result, review_result, sold_count_result, others_result]
    )
    db.get = AsyncMock(return_value=None)
    return db


class ListingViewFiresFunnelEventTest(unittest.IsolatedAsyncioTestCase):
    async def test_non_owner_view_fires_listing_view_event(self):
        seller_id = uuid.uuid4()
        viewer_id = uuid.uuid4()
        listing = _listing(seller_id)
        db = _db_for_listing_view(listing)

        with patch.object(market.funnel_events, "record", AsyncMock()) as record:
            await market.get_listing(listing.id, db=db, session_uid=viewer_id)

        record.assert_awaited_once()
        _db, event_type = record.await_args.args
        self.assertEqual(event_type, FunnelEventType.LISTING_VIEW)
        self.assertEqual(record.await_args.kwargs["user_id"], viewer_id)
        self.assertEqual(record.await_args.kwargs["entity_id"], listing.id)

    async def test_owner_self_view_does_not_fire_event(self):
        """Q-8 view_count 자기조회 배제와 동일한 이유로 퍼널에서도 제외."""
        seller_id = uuid.uuid4()
        listing = _listing(seller_id)
        db = _db_for_listing_view(listing)

        with patch.object(market.funnel_events, "record", AsyncMock()) as record:
            await market.get_listing(listing.id, db=db, session_uid=seller_id)

        record.assert_not_awaited()


class CompleteAppointmentFiresFunnelEventTest(unittest.IsolatedAsyncioTestCase):
    async def test_complete_appointment_fires_trade_complete_event(self):
        session_uid = uuid.uuid4()
        listing = _listing(session_uid, status="ON_SALE")
        listing.price_vnd = 300_000

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
        # S-16 신규 필드 — MagicMock 자동 속성이 UUID/datetime 검증을 깨므로 명시적으로 비운다.
        appt.completion_requested_by = None
        appt.completion_requested_at = None
        appt.completion_declined_at = None
        appt.completion_declined_by = None

        conv = MagicMock()
        conv.id = appt.conversation_id

        exec_result = MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        db = AsyncMock()
        db.execute = AsyncMock(return_value=exec_result)
        db.commit = AsyncMock()

        with (
            patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing))),
            patch.object(market.funnel_events, "record", AsyncMock()) as record,
        ):
            await market.complete_appointment(appointment_id=appt.id, db=db, session_uid=session_uid)

        record.assert_awaited_once()
        _db, event_type = record.await_args.args
        self.assertEqual(event_type, FunnelEventType.TRADE_COMPLETE)
        self.assertEqual(record.await_args.kwargs["entity_id"], listing.id)


class FunnelWiringContractTest(unittest.TestCase):
    """요청 처리 흐름 전체를 mocking 하기엔 비용이 큰 4개 지점(문의·가격제안·약속·후기)과
    가입 4경로(oauth_login/google/apple/zalo callback)를 소스 위치로 고정한다 —
    (a) 올바른 FunnelEventType 을 쓰는지 (b) db.commit() 이전에 호출되는지."""

    def test_price_offer_propose_fires_event_before_commit(self):
        src = inspect.getsource(market.propose_price_offer)
        self.assertIn("funnel_events.record(db, FunnelEventType.PRICE_OFFER", src)
        self.assertLess(src.index("funnel_events.record"), src.index("await db.commit()"))

    def test_appointment_propose_fires_event_before_commit(self):
        src = inspect.getsource(market.propose_appointment)
        self.assertIn("funnel_events.record(db, FunnelEventType.APPOINTMENT", src)
        self.assertLess(src.index("funnel_events.record"), src.index("await db.commit()"))

    def test_create_listing_fires_event_before_commit(self):
        src = inspect.getsource(market.create_listing)
        self.assertIn("funnel_events.record(db, FunnelEventType.LISTING_CREATE", src)
        self.assertLess(src.index("funnel_events.record"), src.index("await db.commit()"))

    def test_review_create_fires_event_before_commit(self):
        src = inspect.getsource(market.create_review)
        self.assertIn("funnel_events.record(db, FunnelEventType.REVIEW", src)
        self.assertLess(src.index("funnel_events.record"), src.index("await db.commit()"))

    def test_dm_conversation_create_fires_inquiry_only_for_new_listing_conversation(self):
        src = inspect.getsource(dm.create_conversation)
        self.assertIn("funnel_events.record(db, FunnelEventType.INQUIRY", src)
        # 기존 대화 재사용(existing) 분기가 아니라 신규 생성(else) 분기에만 있어야 한다.
        self.assertLess(src.index("else:"), src.index("funnel_events.record"))

    def test_all_four_signup_callbacks_fire_signup_event_when_is_new(self):
        for fn in (
            auth.oauth_login,
            auth.oauth_google_callback,
            auth.oauth_apple_callback,
            auth.oauth_zalo_callback,
        ):
            src = inspect.getsource(fn)
            self.assertIn(
                "funnel_events.record(db, FunnelEventType.SIGNUP", src, msg=f"{fn.__name__} missing signup event"
            )
            self.assertIn("if is_new:", src, msg=f"{fn.__name__} should gate signup event on is_new")


class RollupFunnelStatsIdempotencyTest(unittest.IsolatedAsyncioTestCase):
    """같은 날짜를 두 번 돌려도 event_count 가 그대로여야 한다 — 증분 합산이 아니라
    "전체 재계산 후 upsert" 방식이라 멱등(rollup_ad_stats.py 와 동일 설계)."""

    async def test_running_twice_upserts_same_count_not_doubled(self):
        from app.jobs import rollup_funnel_stats

        class _SessionContext:
            def __init__(self, session):
                self.session = session

            async def __aenter__(self):
                return self.session

            async def __aexit__(self, exc_type, exc, traceback):
                return False

        group_result = MagicMock()
        group_result.all.return_value = [MagicMock(event_type="signup", event_count=3)]

        upserted_values = []

        def _make_session():
            session = MagicMock()
            session.execute = AsyncMock(side_effect=lambda stmt: _record_and_return(stmt))
            session.commit = AsyncMock()
            return session

        def _record_and_return(stmt):
            # SELECT (group by) 호출과 INSERT(upsert) 호출을 구분한다.
            compiled = str(stmt)
            if "funnel_daily_stats" in compiled.lower() or "insert" in compiled.lower():
                upserted_values.append(stmt)
            result = MagicMock()
            result.all.return_value = group_result.all.return_value
            return result

        session1 = _make_session()
        session2 = _make_session()

        target = datetime(2026, 8, 16).date()
        with patch.object(
            rollup_funnel_stats, "AsyncSessionLocal", side_effect=[_SessionContext(session1), _SessionContext(session2)]
        ):
            count1 = await rollup_funnel_stats._rollup_date(target)
            count2 = await rollup_funnel_stats._rollup_date(target)

        self.assertEqual(count1, 1)
        self.assertEqual(count2, 1)
        # 두 번 다 같은 그룹 집계 결과(event_count=3)로 upsert 시도 — 누적되지 않는다.
        self.assertEqual(len(upserted_values), 2)


if __name__ == "__main__":
    unittest.main()
