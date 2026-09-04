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


def _empty_liquidity_panel():
    return LiquidityPanelOut(demo_excluded=True, targets=LiquidityTargets(), listings=[], search=[])


class ChannelBoardTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_8_slots_with_expected_keys(self):
        db = _db_scalar(0)
        with (
            patch.object(channel_board.funnel_router, "get_daily_funnel", AsyncMock(return_value=[])),
            patch.object(channel_board.funnel_router, "get_segmented_funnel", AsyncMock(return_value=[])),
            patch.object(
                channel_board.funnel_router,
                "get_first_touch",
                AsyncMock(return_value=FirstTouchOut(status=MetricStatus(state="cold"), rows=[])),
            ),
            patch.object(channel_board.retention_router, "get_retention_cohorts", AsyncMock(return_value=[])),
            patch.object(
                channel_board.liquidity_router, "get_liquidity_panel", AsyncMock(return_value=_empty_liquidity_panel())
            ),
        ):
            out = await channel_board.get_channel_board(_session=None, db=db)

        self.assertEqual(len(out.slots), 8)
        self.assertEqual({s.key for s in out.slots}, _EXPECTED_KEYS)

    async def test_youtube_and_blog_always_not_wired(self):
        db = _db_scalar(0)
        with (
            patch.object(channel_board.funnel_router, "get_daily_funnel", AsyncMock(return_value=[])),
            patch.object(channel_board.funnel_router, "get_segmented_funnel", AsyncMock(return_value=[])),
            patch.object(
                channel_board.funnel_router,
                "get_first_touch",
                AsyncMock(return_value=FirstTouchOut(status=MetricStatus(state="cold"), rows=[])),
            ),
            patch.object(channel_board.retention_router, "get_retention_cohorts", AsyncMock(return_value=[])),
            patch.object(
                channel_board.liquidity_router, "get_liquidity_panel", AsyncMock(return_value=_empty_liquidity_panel())
            ),
        ):
            out = await channel_board.get_channel_board(_session=None, db=db)

        by_key = {s.key: s for s in out.slots}
        for key in ("youtube", "blog"):
            slot = by_key[key]
            self.assertEqual(slot.status.state, "not_wired")
            self.assertIsNone(slot.headline)
            self.assertIsNone(slot.detail_path)

    def _patch_common(self, stack: ExitStack) -> None:
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
            out = await channel_board.get_channel_board(_session=None, db=_db_scalar(0))
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
            out = await channel_board.get_channel_board(_session=None, db=_db_scalar(0))
        liquidity_slot = next(s for s in out.slots if s.key == "liquidity")
        self.assertEqual(liquidity_slot.status.state, "live")
        self.assertEqual(liquidity_slot.headline, 3)


if __name__ == "__main__":
    unittest.main()
