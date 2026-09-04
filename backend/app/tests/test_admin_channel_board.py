"""채널 성과 통합보드 API 회귀 테스트 (줍고 이식 P6, 최종).

기존 admin_api 테스트들과 동일한 관례 — 실제 DB 연결 없이 하위 라우터 함수를 목킹하고,
채널보드 라우터 자체의 배선(슬롯 개수/키 집합/not_wired 고정/상태 판정)만 검증한다.
"""

import unittest
from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

from app.routers.admin_api import channel_board
from app.routers.admin_api.funnel import FirstTouchOut
from app.routers.admin_api.liquidity import LiquidityPanelOut, LiquidityTargets, ListingLiquidityRow
from app.routers.admin_api.metric_status import MetricStatus
from app.routers.admin_api.retention import CohortRetentionRow

_EXPECTED_KEYS = {
    "funnel_daily",
    "segmented",
    "referrals",
    "retention",
    "liquidity",
    "first_touch",
    "youtube",
    "blog",
}


def _db_scalar(value):
    result = MagicMock()
    result.scalar_one.return_value = value
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


class _FakeSessionCtx:
    """AsyncSessionLocal() 이 여는 `async with` 세션을 흉내낸다 — 지적 7 병렬화 후 각 슬롯이
    독립 세션을 여는 구조이므로, 테스트에서는 그 세션이 매번 같은 목 db 를 내주도록 고정한다."""

    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        return self._db

    async def __aexit__(self, *exc):
        return False


def _patch_session(stack: ExitStack, db) -> None:
    stack.enter_context(patch.object(channel_board, "AsyncSessionLocal", lambda: _FakeSessionCtx(db)))


def _empty_liquidity_panel():
    return LiquidityPanelOut(demo_excluded=True, targets=LiquidityTargets(), listings=[], search=[])


class ChannelBoardTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_8_slots_with_expected_keys(self):
        with ExitStack() as stack:
            _patch_session(stack, _db_scalar(0))
            stack.enter_context(
                patch.object(channel_board.funnel_router, "get_daily_funnel", AsyncMock(return_value=[]))
            )
            stack.enter_context(
                patch.object(channel_board.funnel_router, "get_segmented_funnel", AsyncMock(return_value=[]))
            )
            stack.enter_context(
                patch.object(
                    channel_board.funnel_router,
                    "get_first_touch",
                    AsyncMock(return_value=FirstTouchOut(status=MetricStatus(state="cold"), rows=[])),
                )
            )
            stack.enter_context(
                patch.object(channel_board.retention_router, "get_retention_cohorts", AsyncMock(return_value=[]))
            )
            stack.enter_context(
                patch.object(
                    channel_board.liquidity_router,
                    "get_liquidity_panel",
                    AsyncMock(return_value=_empty_liquidity_panel()),
                )
            )
            out = await channel_board.get_channel_board(_session=None)

        self.assertEqual(len(out.slots), 8)
        self.assertEqual({s.key for s in out.slots}, _EXPECTED_KEYS)

    async def test_youtube_and_blog_always_not_wired(self):
        with ExitStack() as stack:
            _patch_session(stack, _db_scalar(0))
            stack.enter_context(
                patch.object(channel_board.funnel_router, "get_daily_funnel", AsyncMock(return_value=[]))
            )
            stack.enter_context(
                patch.object(channel_board.funnel_router, "get_segmented_funnel", AsyncMock(return_value=[]))
            )
            stack.enter_context(
                patch.object(
                    channel_board.funnel_router,
                    "get_first_touch",
                    AsyncMock(return_value=FirstTouchOut(status=MetricStatus(state="cold"), rows=[])),
                )
            )
            stack.enter_context(
                patch.object(channel_board.retention_router, "get_retention_cohorts", AsyncMock(return_value=[]))
            )
            stack.enter_context(
                patch.object(
                    channel_board.liquidity_router,
                    "get_liquidity_panel",
                    AsyncMock(return_value=_empty_liquidity_panel()),
                )
            )
            out = await channel_board.get_channel_board(_session=None)

        by_key = {s.key: s for s in out.slots}
        for key in ("youtube", "blog"):
            slot = by_key[key]
            self.assertEqual(slot.status.state, "not_wired")
            self.assertIsNone(slot.headline)
            self.assertIsNone(slot.detail_path)

    def _patch_common(self, stack: ExitStack) -> None:
        _patch_session(stack, _db_scalar(0))
        stack.enter_context(patch.object(channel_board.funnel_router, "get_daily_funnel", AsyncMock(return_value=[])))
        stack.enter_context(
            patch.object(channel_board.funnel_router, "get_segmented_funnel", AsyncMock(return_value=[]))
        )
        stack.enter_context(
            patch.object(
                channel_board.funnel_router,
                "get_first_touch",
                AsyncMock(return_value=FirstTouchOut(status=MetricStatus(state="cold"), rows=[])),
            )
        )
        stack.enter_context(
            patch.object(channel_board.retention_router, "get_retention_cohorts", AsyncMock(return_value=[]))
        )

    async def test_liquidity_slot_zero_is_cold_nonzero_is_live(self):
        with ExitStack() as stack:
            self._patch_common(stack)
            stack.enter_context(
                patch.object(
                    channel_board.liquidity_router,
                    "get_liquidity_panel",
                    AsyncMock(return_value=_empty_liquidity_panel()),
                )
            )
            out = await channel_board.get_channel_board(_session=None)
        liquidity_slot = next(s for s in out.slots if s.key == "liquidity")
        self.assertEqual(liquidity_slot.status.state, "cold")
        self.assertEqual(liquidity_slot.headline, 0)

        nonzero_panel = LiquidityPanelOut(
            demo_excluded=True,
            targets=LiquidityTargets(),
            listings=[
                ListingLiquidityRow(
                    week_start="2026-08-31",
                    ward_id=None,
                    sample_listings=3,
                    l1_inquiry_rate=None,
                    l2_deal_rate=None,
                    l4_median_hours_to_inquiry=None,
                    l5_new_active_sellers=1,
                )
            ],
            search=[],
        )
        with ExitStack() as stack:
            self._patch_common(stack)
            stack.enter_context(
                patch.object(
                    channel_board.liquidity_router, "get_liquidity_panel", AsyncMock(return_value=nonzero_panel)
                )
            )
            out = await channel_board.get_channel_board(_session=None)
        liquidity_slot = next(s for s in out.slots if s.key == "liquidity")
        self.assertEqual(liquidity_slot.status.state, "live")
        self.assertEqual(liquidity_slot.headline, 3)

    async def test_retention_headline_skips_none_from_newest_cohort(self):
        # 최신 코호트(cohorts[0])는 아직 d7 미경과라 d7_retention=None 인 경우가 흔하다.
        # headline 은 None 이 아닌 첫 코호트 값을 써야 한다.
        cohorts = [
            CohortRetentionRow(
                cohort_week="2026-09-01",
                population=10,
                suppressed=False,
                d1_retention=0.5,
                d7_retention=None,
                d30_retention=None,
            ),
            CohortRetentionRow(
                cohort_week="2026-08-25",
                population=20,
                suppressed=False,
                d1_retention=0.6,
                d7_retention=0.42,
                d30_retention=None,
            ),
        ]
        with ExitStack() as stack:
            self._patch_common(stack)
            stack.enter_context(
                patch.object(channel_board.retention_router, "get_retention_cohorts", AsyncMock(return_value=cohorts))
            )
            stack.enter_context(
                patch.object(
                    channel_board.liquidity_router,
                    "get_liquidity_panel",
                    AsyncMock(return_value=_empty_liquidity_panel()),
                )
            )
            out = await channel_board.get_channel_board(_session=None)
        retention_slot = next(s for s in out.slots if s.key == "retention")
        self.assertEqual(retention_slot.headline, 0.42)

    async def test_one_slot_failure_is_isolated_after_parallelization(self):
        """지적 7: asyncio.gather 로 병렬화한 뒤에도 한 소스의 예외가 나머지 슬롯에 번지지
        않아야 한다 — liquidity 소스만 죽여도 나머지 5개 슬롯은 정상 데이터로 채워지는지 확인."""
        with ExitStack() as stack:
            self._patch_common(stack)
            stack.enter_context(
                patch.object(
                    channel_board.liquidity_router,
                    "get_liquidity_panel",
                    AsyncMock(side_effect=RuntimeError("boom")),
                )
            )
            out = await channel_board.get_channel_board(_session=None)

        by_key = {s.key: s for s in out.slots}
        liquidity_slot = by_key["liquidity"]
        self.assertEqual(liquidity_slot.status.state, "cold")
        self.assertIsNone(liquidity_slot.headline)
        # 죽지 않은 슬롯들은 여전히 정상적으로 8개 전부 채워진다.
        self.assertEqual(len(out.slots), 8)
        self.assertEqual({s.key for s in out.slots}, _EXPECTED_KEYS)


if __name__ == "__main__":
    unittest.main()
