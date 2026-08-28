"""퍼널 계측 최소 스키마 회귀 테스트 (정본 §5 #5, D-18(a)).

- services/funnel_events.record() 가 호출부 세션(`db`)과 완전히 분리된 독립 세션에 적재하는지 —
  코드리뷰 HIGH #1: 예전에는 `db.begin_nested()` 를 썼는데, SQLAlchemy 1.4+ 에서 nested
  transaction 커밋이 세션 전체를 flush 하므로 호출부의 pending 도메인 쓰기까지 같은 SAVEPOINT
  에 실려 롤백·삼켜지는 결함이 있었다. 아래 테스트는 실제 asyncpg 커넥션(saigon_bff 컨테이너의
  `database` 서비스)에 대해 이 두 성질을 검증한다 — 세션 내부(`begin_nested`/`execute`)를
  스텁으로 목킹하지 않는다:
    1) 이벤트 적재가 실제로 실패해도(varchar(24) 초과값으로 유발한 진짜 DataError) 호출부가
       같은 세션에 올려둔 도메인 행이 커밋에서 살아남는다.
    2) 호출부 자신의 flush/commit 실패(진짜 unique violation)는 계측과 무관하게 그대로
       전파된다 — 계측이 남의 예외를 먹지 않는다.
- 핵심 이벤트 8종 중 자기완결적으로 mocking 가능한 지점(매물조회·등록·거래완료)이 실제로
  record() 를 호출하는지 — 나머지(문의·가격제안·약속·후기·가입 4경로)는 소스 위치 계약으로
  고정한다(요청 흐름 전체를 mocking 하는 비용 대비, 이 계측 훅이 올바른 이벤트 타입으로 올바른
  커밋 직전 위치에 있는지를 고정하는 것이 회귀 방지 목적에는 충분하다 — OutboxWiringContractTest
  와 동일한 계열의 판단).
- routers/dm.py create_conversation 의 중복 생성 레이스 복구(IntegrityError → 기존 행 재조회)가
  살아있는지 — 실제 unique index(132_dm_conversation_context_unique.sql) 위반을 두 개의 실제
  세션으로 유발해 검증한다(코드리뷰 HIGH #2).
- jobs/rollup_funnel_stats.py 의 멱등성(같은 날짜를 두 번 돌려도 값이 그대로).

DB 필요 테스트는 `backend/app/tests/` 관례상 실제 컨테이너 DB(`saigon_bff` 가 바라보는
`DATABASE_URL`)에 그대로 연결해서 돈다 — 이 리포의 다른 테스트들처럼 in-memory/sqlite 대체가
없다(예: test_notification_outbox.py 등도 세션 자체는 목킹하지만, 이 파일의 신규 테스트는 명시적
으로 실제 DB 세션·실제 제약조건을 쓴다).
"""

import inspect
import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database import AsyncSessionLocal, engine
from app.models import DmConversation, User
from app.routers import auth, dm, market
from app.schemas import DmConversationCreateRequest, FunnelEventType
from app.services import funnel_events


def _unique_nickname(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _norm_ws(src: str) -> str:
    """소스 문자열에서 공백을 전부 제거한다 — ruff-format 이 인자를 한 줄/여러 줄로 감싸는
    방식(줄 길이 기준)에 따라 흔들리는 literal 계약 검사를(init/213 이 anon_id/session_id
    인자를 추가하며 여러 줄로 늘어났다) 공백 무관하게 만든다. 이 함수로 정규화한 소스와
    비교할 literal 도 공백 없이 적어야 한다(예: "record(db,FunnelEventType.X")."""
    return "".join(src.split())


class RecordIsolationTest(unittest.IsolatedAsyncioTestCase):
    """실제 DB 세션으로 record() 의 격리 성질을 검증한다 — begin_nested 등 내부를 목킹하지 않는다."""

    async def asyncSetUp(self):
        self._cleanup_user_ids: list[uuid.UUID] = []

    async def asyncTearDown(self):
        try:
            if not self._cleanup_user_ids:
                return
            async with AsyncSessionLocal() as db:
                for uid in self._cleanup_user_ids:
                    user = await db.get(User, uid)
                    if user is not None:
                        await db.delete(user)
                await db.commit()
        finally:
            # IsolatedAsyncioTestCase 는 테스트마다 새 이벤트루프를 만드는데, 엔진의 커넥션 풀은
            # 모듈 전역(app.database.engine)이라 이전 루프에서 만든 asyncpg 커넥션이 다음 테스트의
            # 새 루프로 넘어가면 "another operation is in progress" 로 깨진다 — 매 테스트 후
            # 풀을 비워 다음 테스트가 새 루프에서 새 커넥션을 만들게 한다.
            await engine.dispose()

    async def test_event_insert_failure_does_not_roll_back_domain_write(self):
        """이벤트 적재가 실패해도(진짜 DataError) 같은 세션의 도메인 쓰기는 커밋에서 살아남는다."""
        user_id = uuid.uuid4()
        self._cleanup_user_ids.append(user_id)

        class _OversizedEventType:
            # FunnelEvent.event_type 은 varchar(24) — 실제 DB 제약을 어겨 진짜 실패를 유발한다.
            value = "x" * 100

        async with AsyncSessionLocal() as db:
            db.add(User(id=user_id, nickname=_unique_nickname("funnel")))

            await funnel_events.record(db, _OversizedEventType(), user_id=user_id)

            # record() 는 독립 세션에서 실패했을 뿐 — 이 세션(db)은 여전히 정상 커밋 가능해야 한다.
            await db.commit()

        async with AsyncSessionLocal() as verify_db:
            persisted = await verify_db.get(User, user_id)
            self.assertIsNotNone(persisted, "도메인 쓰기가 계측 실패에 휩쓸려 롤백되면 안 된다")

    async def test_caller_own_flush_failure_still_propagates(self):
        """호출부 자신의 실패(진짜 unique violation)는 계측과 무관하게 그대로 전파돼야 한다."""
        shared_nickname = _unique_nickname("dupe")
        user_a = uuid.uuid4()
        user_b = uuid.uuid4()
        self._cleanup_user_ids.extend([user_a, user_b])

        async with AsyncSessionLocal() as db:
            db.add(User(id=user_a, nickname=shared_nickname))
            await db.commit()

        async with AsyncSessionLocal() as db:
            db.add(User(id=user_b, nickname=shared_nickname))  # nickname unique 위반 예정

            # 계측 자체는 정상 동작(별도 세션이므로 이 실패와 무관) — 그래도 호출부 실패를 가리면 안 된다.
            await funnel_events.record(db, FunnelEventType.SIGNUP, user_id=user_b)

            with self.assertRaises(IntegrityError):
                await db.commit()
            await db.rollback()


class DmConversationRaceRecoveryTest(unittest.IsolatedAsyncioTestCase):
    """dm.create_conversation 의 IntegrityError 복구 분기(코드리뷰 HIGH #2)가 실제 unique index
    위반에도 살아있는지 — 초기 조회와 insert 사이에 실제 두 번째 세션이 끼어드는 레이스를 재현한다."""

    async def asyncSetUp(self):
        self.user_a = uuid.uuid4()
        self.user_b = uuid.uuid4()
        async with AsyncSessionLocal() as db:
            db.add(User(id=self.user_a, nickname=_unique_nickname("dm_a")))
            db.add(User(id=self.user_b, nickname=_unique_nickname("dm_b"), status="ACTIVE"))
            await db.commit()

    async def asyncTearDown(self):
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(
                    DmConversation.__table__.delete().where(
                        DmConversation.participant_1.in_([self.user_a, self.user_b])
                    )
                )
                for uid in (self.user_a, self.user_b):
                    user = await db.get(User, uid)
                    if user is not None:
                        await db.delete(user)
                await db.commit()
        finally:
            # RecordIsolationTest.asyncTearDown 과 같은 이유 — 크로스 이벤트루프 커넥션 재사용 방지.
            await engine.dispose()

    async def test_duplicate_conversation_race_recovers_existing_row(self):
        p1, p2 = sorted([self.user_a, self.user_b])
        body = DmConversationCreateRequest(other_user_id=self.user_b)

        async with AsyncSessionLocal() as db:
            orig_execute = db.execute
            call_count = 0

            async def racing_execute(stmt, *args, **kwargs):
                nonlocal call_count
                call_count += 1
                result = await orig_execute(stmt, *args, **kwargs)
                if call_count == 2:
                    # call #1 = require_unblocked 의 UserBlock 조회, #2 = "existing" 대화 조회.
                    # 이 시점 이후 다른 세션이 같은 대화를 실제로 먼저 커밋해 레이스를 재현한다.
                    async with AsyncSessionLocal() as racer:
                        racer.add(DmConversation(participant_1=p1, participant_2=p2))
                        await racer.commit()
                return result

            db.execute = racing_execute

            with patch.object(dm.funnel_events, "record", AsyncMock()):
                out = await dm.create_conversation(body, db=db, _session_uid=self.user_a)

        async with AsyncSessionLocal() as verify_db:
            rows = (
                (
                    await verify_db.execute(
                        select(DmConversation).where(
                            DmConversation.participant_1 == p1, DmConversation.participant_2 == p2
                        )
                    )
                )
                .scalars()
                .all()
            )
        self.assertEqual(len(rows), 1, "IntegrityError 복구가 실패하면 중복 행이 생긴다")
        self.assertEqual(out.id, rows[0].id)


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
        paper_status=None,
        plate_province=None,
    )


def _db_for_listing_view(listing):
    listing_result = MagicMock(scalar_one_or_none=MagicMock(return_value=listing))
    blocked_result = MagicMock(first=MagicMock(return_value=None))
    review_result = MagicMock()
    review_result.scalars.return_value.all.return_value = []
    sold_count_result = MagicMock(scalar_one=MagicMock(return_value=0))
    others_result = MagicMock()
    others_result.scalars.return_value.all.return_value = []
    # 016 §4-7 #42: get_listing 이 미응답 거래결과핑 존재 여부를 조회하는 마지막 execute.
    deal_ping_result = MagicMock(first=MagicMock(return_value=None))
    # R-2(017 §12-B): get_listing 이 매물 조회 **직후** 신고 여부를 조회한다(가드보다 먼저).
    report_result = MagicMock(first=MagicMock(return_value=None))
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            listing_result,
            report_result,
            blocked_result,
            review_result,
            sold_count_result,
            others_result,
            deal_ping_result,
        ]
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
        self.assertIn("funnel_events.record(db,FunnelEventType.PRICE_OFFER", _norm_ws(src))
        self.assertLess(src.index("funnel_events.record"), src.index("await db.commit()"))

    def test_appointment_propose_fires_event_before_commit(self):
        src = inspect.getsource(market.propose_appointment)
        self.assertIn("funnel_events.record(db,FunnelEventType.APPOINTMENT", _norm_ws(src))
        self.assertLess(src.index("funnel_events.record"), src.index("await db.commit()"))

    def test_create_listing_fires_event_before_commit(self):
        src = inspect.getsource(market.create_listing)
        self.assertIn("funnel_events.record(db,FunnelEventType.LISTING_CREATE", _norm_ws(src))
        self.assertLess(src.index("funnel_events.record"), src.index("await db.commit()"))

    def test_review_create_fires_event_before_commit(self):
        src = inspect.getsource(market.create_review)
        self.assertIn("funnel_events.record(db,FunnelEventType.REVIEW", _norm_ws(src))
        self.assertLess(src.index("funnel_events.record"), src.index("await db.commit()"))

    def test_dm_conversation_create_fires_inquiry_only_for_new_listing_conversation(self):
        src = inspect.getsource(dm.create_conversation)
        self.assertIn("funnel_events.record(db,FunnelEventType.INQUIRY", _norm_ws(src))
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
                "funnel_events.record(db,FunnelEventType.SIGNUP",
                _norm_ws(src),
                msg=f"{fn.__name__} missing signup event",
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
