"""P7 — 거래중 위치공유 테스트 매트릭스.

설계서: ai-docs/task/active/260827_deal_location_sharing_task.md §3(정밀도매트릭스),
§10(확정판단), §11(P7). 선행 구현: P1(`location_privacy.resolve_precision_level`),
P2(`MarketplaceLocationShare` + `location_share.is_location_share_expired`/
`purge_location_shares`), P3(`market.py` 위치공유 4종 엔드포인트).

스타일은 `test_market_completion_request.py`/`test_feed_block_boundaries.py` 를 그대로
따른다 — 실 DB 대신 `AsyncMock`/`SimpleNamespace` 로 라우터 함수를 직접 호출한다.
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import market
from app.schemas import LocationSharePingRequest, LocationShareStartRequest
from app.services.location_privacy import resolve_precision_level
from app.services.location_share import is_location_share_expired, purge_location_shares

# ── 공용 픽스처 ─────────────────────────────────────────────────────


def _appointment(*, status="ACCEPTED", when_at=None, completion_requested_at=None, proposer_id=None):
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        listing_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
        proposer_id=proposer_id or uuid.uuid4(),
        when_at=when_at or now,
        place_name=None,
        place_lat=None,
        place_lng=None,
        status=status,
        completion_requested_by=None,
        completion_requested_at=completion_requested_at,
        completion_declined_at=None,
        completion_declined_by=None,
        updated_at=None,
    )


def _conversation(appt, seller_id, buyer_id):
    return SimpleNamespace(
        id=appt.conversation_id,
        participant_1=seller_id,
        participant_2=buyer_id,
        context_type="listing",
        context_id=appt.listing_id,
    )


def _listing(appt, seller_id, *, status="RESERVED"):
    return SimpleNamespace(
        id=appt.listing_id,
        seller_id=seller_id,
        status=status,
        title="혼다 웨이브",
        price_vnd=15_000_000,
        agreed_price_vnd=None,
        updated_at=None,
    )


def _share(*, accuracy_m=20, revoked_at=None, expires_at=None, lat="10.771234", lng="106.691234"):
    now = datetime.now(UTC)
    return SimpleNamespace(
        lat=Decimal(lat),
        lng=Decimal(lng),
        accuracy_m=accuracy_m,
        revoked_at=revoked_at,
        expires_at=expires_at or (now + timedelta(hours=1)),
        updated_at=now,
    )


def _rig(appt, conv, listing):
    """appt/conv/listing 세트로 `_load_appointment` 를 우회하는 표준 리그."""
    db = AsyncMock()
    db.add = MagicMock()
    load = patch.object(market, "_load_appointment", AsyncMock(return_value=(appt, conv, listing)))
    return db, load


# ── 1. 상태x정밀도 계약 (resolve_precision_level) ──────────────────
# 참고: "약속 없음/대화만" 케이스는 이 순수함수의 입력 자체가 없는 상태(호출부가 애초에
# appointment 객체 없이 처리)라 여기서 검증할 대상이 아니다 — API 레벨에서 자연히 none.


class PrecisionMatrixTest(unittest.TestCase):
    def test_proposed_is_approx(self):
        appt = _appointment(status="PROPOSED")
        self.assertEqual(resolve_precision_level(appt, appt.when_at), "approx")

    def test_accepted_far_before_meeting_is_approx(self):
        when_at = datetime.now(UTC) + timedelta(hours=3)
        appt = _appointment(status="ACCEPTED", when_at=when_at)
        self.assertEqual(resolve_precision_level(appt, datetime.now(UTC)), "approx")

    def test_accepted_just_outside_window_before_is_approx(self):
        when_at = datetime.now(UTC)
        appt = _appointment(status="ACCEPTED", when_at=when_at)
        now = when_at - timedelta(minutes=30, seconds=1)
        self.assertEqual(resolve_precision_level(appt, now), "approx")

    def test_accepted_exactly_at_t_minus_30_is_exact(self):
        when_at = datetime.now(UTC)
        appt = _appointment(status="ACCEPTED", when_at=when_at)
        now = when_at - timedelta(minutes=30)
        self.assertEqual(resolve_precision_level(appt, now), "exact")

    def test_accepted_at_meeting_time_is_exact(self):
        when_at = datetime.now(UTC)
        appt = _appointment(status="ACCEPTED", when_at=when_at)
        self.assertEqual(resolve_precision_level(appt, when_at), "exact")

    def test_accepted_exactly_at_t_plus_60_is_exact(self):
        when_at = datetime.now(UTC)
        appt = _appointment(status="ACCEPTED", when_at=when_at)
        now = when_at + timedelta(minutes=60)
        self.assertEqual(resolve_precision_level(appt, now), "exact")

    def test_accepted_just_outside_window_after_is_approx(self):
        when_at = datetime.now(UTC)
        appt = _appointment(status="ACCEPTED", when_at=when_at)
        now = when_at + timedelta(minutes=60, seconds=1)
        self.assertEqual(resolve_precision_level(appt, now), "approx")

    def test_accepted_with_completion_requested_stays_exact_outside_window(self):
        """완료요청됨(`completion_requested_at`)이면 시간창을 벗어나도 exact 유지 — 대면 중일 수 있음."""
        when_at = datetime.now(UTC) - timedelta(hours=5)
        appt = _appointment(status="ACCEPTED", when_at=when_at, completion_requested_at=datetime.now(UTC))
        self.assertEqual(resolve_precision_level(appt, datetime.now(UTC)), "exact")

    def test_completed_is_approx(self):
        appt = _appointment(status="COMPLETED")
        self.assertEqual(resolve_precision_level(appt, appt.when_at), "approx")

    def test_cancelled_is_none(self):
        appt = _appointment(status="CANCELLED")
        self.assertEqual(resolve_precision_level(appt, appt.when_at), "none")

    def test_unknown_status_defensively_none(self):
        appt = _appointment(status="WHATEVER")
        self.assertEqual(resolve_precision_level(appt, appt.when_at), "none")


# ── 2. 만료 자동차단 ────────────────────────────────────────────────


class LocationShareExpiryTest(unittest.TestCase):
    def test_expired_by_elapsed_time(self):
        share = _share(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        self.assertTrue(is_location_share_expired(share, datetime.now(UTC)))

    def test_expired_by_revocation_even_before_expires_at(self):
        share = _share(expires_at=datetime.now(UTC) + timedelta(hours=1), revoked_at=datetime.now(UTC))
        self.assertTrue(is_location_share_expired(share, datetime.now(UTC)))

    def test_not_expired_while_active(self):
        share = _share(expires_at=datetime.now(UTC) + timedelta(hours=1))
        self.assertFalse(is_location_share_expired(share, datetime.now(UTC)))


class GetLocationShareApiTest(unittest.IsolatedAsyncioTestCase):
    """API 레벨: 만료된 상대 공유는 peer_lat/peer_lng=None 으로 내려온다."""

    async def test_expired_peer_share_hides_coordinates(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED")  # when_at=now → exact 창 내부
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id)
        db, load = _rig(appt, conv, listing)

        my_share = _share()
        peer_share = _share(revoked_at=datetime.now(UTC))  # 옵트아웃 → 만료 취급
        with load, patch.object(market, "_get_share", AsyncMock(side_effect=[my_share, peer_share])):
            out = await market.get_location_share(appt.id, db=db, session_uid=buyer_id)

        self.assertEqual(out.peer_status, "stopped")
        self.assertIsNone(out.peer_lat)
        self.assertIsNone(out.peer_lng)

    async def test_active_peer_share_in_exact_window_reveals_coordinates(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED")
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id)
        db, load = _rig(appt, conv, listing)

        my_share = _share()
        peer_share = _share(lat="10.5", lng="106.5")
        with load, patch.object(market, "_get_share", AsyncMock(side_effect=[my_share, peer_share])):
            out = await market.get_location_share(appt.id, db=db, session_uid=buyer_id)

        self.assertEqual(out.peer_status, "sharing")
        self.assertEqual(out.peer_lat, 10.5)
        self.assertEqual(out.peer_lng, 106.5)

    async def test_peer_share_without_gps_fix_yet_is_not_exposed(self):
        """동의만 하고 아직 ping 이 없으면 accuracy_m=None — 노출하지 않는다."""
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED")
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id)
        db, load = _rig(appt, conv, listing)

        my_share = _share()
        peer_share = _share(accuracy_m=None)
        with load, patch.object(market, "_get_share", AsyncMock(side_effect=[my_share, peer_share])):
            out = await market.get_location_share(appt.id, db=db, session_uid=buyer_id)

        self.assertEqual(out.peer_status, "sharing")
        self.assertIsNone(out.peer_lat)
        self.assertIsNone(out.peer_lng)

    async def test_precision_outside_exact_window_hides_peer_coordinates(self):
        """정밀도가 exact 가 아니면 상대가 sharing 중이어도 좌표는 감춘다(PROPOSED 단계)."""
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="PROPOSED")
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id, status="ON_SALE")
        db, load = _rig(appt, conv, listing)

        my_share = _share()
        peer_share = _share(lat="10.5", lng="106.5")
        with load, patch.object(market, "_get_share", AsyncMock(side_effect=[my_share, peer_share])):
            out = await market.get_location_share(appt.id, db=db, session_uid=buyer_id)

        self.assertEqual(out.peer_status, "sharing")
        self.assertIsNone(out.peer_lat)
        self.assertIsNone(out.peer_lng)


# ── 3. 저정확도 미전송 ──────────────────────────────────────────────


class PingAccuracyGateTest(unittest.IsolatedAsyncioTestCase):
    async def test_accuracy_over_35m_rejected_before_touching_db(self):
        db = AsyncMock()
        body = LocationSharePingRequest(lat=10.77, lng=106.69, accuracy_m=36)
        with self.assertRaises(HTTPException) as ctx:
            await market.ping_location_share(uuid.uuid4(), body, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 400)
        db.get.assert_not_called()
        db.execute.assert_not_called()

    async def test_accuracy_exactly_35m_is_accepted(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED")
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id)
        db, load = _rig(appt, conv, listing)

        my_share = _share(accuracy_m=None)  # 아직 fix 없는 최초 ping
        peer_share = None
        body = LocationSharePingRequest(lat=10.5, lng=106.5, accuracy_m=35)
        with load, patch.object(market, "_get_share", AsyncMock(side_effect=[my_share, peer_share])):
            out = await market.ping_location_share(appt.id, body, db=db, session_uid=buyer_id)

        self.assertEqual(my_share.accuracy_m, 35)
        self.assertEqual(my_share.lat, Decimal("10.5"))
        self.assertEqual(out.my_status, "sharing")
        db.commit.assert_awaited()


# ── 4. exact 창 밖 ping 거부 ────────────────────────────────────────


class PingExactWindowGateTest(unittest.IsolatedAsyncioTestCase):
    async def test_ping_rejected_while_proposed(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="PROPOSED")
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id, status="ON_SALE")
        db, load = _rig(appt, conv, listing)
        body = LocationSharePingRequest(lat=10.77, lng=106.69, accuracy_m=10)

        with load, self.assertRaises(HTTPException) as ctx:
            await market.ping_location_share(appt.id, body, db=db, session_uid=buyer_id)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_ping_rejected_when_accepted_outside_time_window(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        when_at = datetime.now(UTC) + timedelta(hours=5)
        appt = _appointment(status="ACCEPTED", when_at=when_at)
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id)
        db, load = _rig(appt, conv, listing)
        body = LocationSharePingRequest(lat=10.77, lng=106.69, accuracy_m=10)

        with load, self.assertRaises(HTTPException) as ctx:
            await market.ping_location_share(appt.id, body, db=db, session_uid=buyer_id)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_ping_rejected_when_share_not_started(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED")  # exact 창 내부
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id)
        db, load = _rig(appt, conv, listing)
        body = LocationSharePingRequest(lat=10.77, lng=106.69, accuracy_m=10)

        with (
            load,
            patch.object(market, "_get_share", AsyncMock(return_value=None)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.ping_location_share(appt.id, body, db=db, session_uid=buyer_id)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_ping_rejected_after_revoked(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED")
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id)
        db, load = _rig(appt, conv, listing)
        body = LocationSharePingRequest(lat=10.77, lng=106.69, accuracy_m=10)
        revoked_share = _share(revoked_at=datetime.now(UTC))

        with (
            load,
            patch.object(market, "_get_share", AsyncMock(return_value=revoked_share)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.ping_location_share(appt.id, body, db=db, session_uid=buyer_id)
        self.assertEqual(ctx.exception.status_code, 403)


# ── 5. 차단/신고 시 즉시 차단 ───────────────────────────────────────
# `_load_appointment` 가 모든 4개 엔드포인트 공통 게이트다(`require_unblocked` 호출).
# dm_policy.require_unblocked 자체의 계약은 test_feed_block_boundaries.py 가 고정하므로,
# 여기서는 그 게이트가 실제로 각 엔드포인트 진입을 막는지만 확인한다.


class BlockedPeerTest(unittest.IsolatedAsyncioTestCase):
    async def test_load_appointment_itself_rejects_blocked_pair(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED", proposer_id=buyer_id)
        conv = _conversation(appt, seller_id, buyer_id)

        db = AsyncMock()
        db.get = AsyncMock(side_effect=[appt, conv])
        blocked_result = MagicMock()
        blocked_result.first.return_value = (seller_id,)  # UserBlock row found
        db.execute = AsyncMock(return_value=blocked_result)

        with self.assertRaises(HTTPException) as ctx:
            await market._load_appointment(db, appt.id, buyer_id)
        self.assertEqual(ctx.exception.status_code, 403)
        # 차단이 확인되면 매물 잠금 조회(두 번째 execute)까지 가지 않는다.
        self.assertEqual(db.execute.await_count, 1)

    async def test_all_four_endpoints_reject_when_gate_blocks(self):
        appointment_id = uuid.uuid4()
        session_uid = uuid.uuid4()
        gate = patch.object(
            market, "_load_appointment", AsyncMock(side_effect=HTTPException(status_code=403, detail="blocked"))
        )
        with gate:
            with self.assertRaises(HTTPException) as ctx:
                await market.start_location_share(
                    appointment_id,
                    LocationShareStartRequest(consent_version="v1"),
                    db=AsyncMock(),
                    session_uid=session_uid,
                )
            self.assertEqual(ctx.exception.status_code, 403)

            with self.assertRaises(HTTPException) as ctx:
                await market.stop_location_share(appointment_id, db=AsyncMock(), session_uid=session_uid)
            self.assertEqual(ctx.exception.status_code, 403)

            with self.assertRaises(HTTPException) as ctx:
                await market.ping_location_share(
                    appointment_id,
                    LocationSharePingRequest(lat=10.77, lng=106.69, accuracy_m=10),
                    db=AsyncMock(),
                    session_uid=session_uid,
                )
            self.assertEqual(ctx.exception.status_code, 403)

            with self.assertRaises(HTTPException) as ctx:
                await market.get_location_share(appointment_id, db=AsyncMock(), session_uid=session_uid)
            self.assertEqual(ctx.exception.status_code, 403)


# ── 6. 옵트아웃 즉시삭제 ────────────────────────────────────────────


class StopLocationShareTest(unittest.IsolatedAsyncioTestCase):
    async def test_stop_deletes_the_callers_row_and_commits(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED", proposer_id=buyer_id)
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id)
        db, load = _rig(appt, conv, listing)

        with load:
            await market.stop_location_share(appt.id, db=db, session_uid=buyer_id)

        db.execute.assert_awaited_once()
        stmt = db.execute.await_args.args[0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        self.assertIn("marketplace_location_shares", compiled)
        self.assertIn(appt.id.hex, compiled)
        self.assertIn(buyer_id.hex, compiled)
        db.commit.assert_awaited_once()


# ── 7. COMPLETED/CANCELLED 전이 시 삭제 ─────────────────────────────


class PurgeOnTerminalTransitionTest(unittest.IsolatedAsyncioTestCase):
    async def test_purge_location_shares_deletes_by_appointment_id(self):
        db = AsyncMock()
        appointment_id = uuid.uuid4()

        await purge_location_shares(db, appointment_id)

        db.execute.assert_awaited_once()
        stmt = db.execute.await_args.args[0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        self.assertIn("marketplace_location_shares", compiled)
        self.assertIn(appointment_id.hex, compiled)

    async def test_complete_appointment_purges_location_shares(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED", proposer_id=buyer_id)
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id, status="RESERVED")
        db, load = _rig(appt, conv, listing)
        offer_result = MagicMock()
        offer_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=offer_result)

        with (
            load,
            patch.object(market, "purge_location_shares", AsyncMock()) as purge,
            patch.object(market.funnel_events, "record", AsyncMock()),
        ):
            await market.complete_appointment(appt.id, db=db, session_uid=seller_id)

        self.assertEqual(appt.status, "COMPLETED")
        purge.assert_awaited_once_with(db, appt.id)

    async def test_cancel_appointment_purges_location_shares(self):
        seller_id, buyer_id = uuid.uuid4(), uuid.uuid4()
        appt = _appointment(status="ACCEPTED", proposer_id=buyer_id)
        conv = _conversation(appt, seller_id, buyer_id)
        listing = _listing(appt, seller_id, status="RESERVED")
        db, load = _rig(appt, conv, listing)

        with load, patch.object(market, "purge_location_shares", AsyncMock()) as purge:
            await market.cancel_appointment(appt.id, db=db, session_uid=buyer_id)

        self.assertEqual(appt.status, "CANCELLED")
        purge.assert_awaited_once_with(db, appt.id)


if __name__ == "__main__":
    unittest.main()
