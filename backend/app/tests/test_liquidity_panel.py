"""유동성 지표 패널 회귀 테스트 (016 §6-6 #34).

라우터 함수를 실제 DB 세션으로 직접 호출한다(SELECT 전용 — 원시 SQL(text())의 구문/컬럼
오류는 mock db 로는 못 잡으므로 이 파일만 실 DB 예외 — test_funnel_events.py 의 관례와 동일하게
이 레포는 DB 필요 테스트를 실제 컨테이너 DB에 그대로 붙인다).

핵심 회귀 포인트:
1) 쿼리가 예외 없이 끝까지 실행되고 응답 스키마가 채워진다(SQL 구문/컬럼 오탈자 조기 발견).
2) 시연 계정 제외(_DEMO_SELLER_IDS)가 실제로 표본 수를 줄인다 — include_demo=True 로 다시
   호출한 표본 합계가 include_demo=False 보다 크거나 같아야 한다(§6-6 핵심 요구사항).
3) ward_id 필터가 결과를 실제로 제한한다.
"""

import unittest

from app.database import AsyncSessionLocal, engine
from app.routers.admin_api import liquidity


class LiquidityPanelTest(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        # IsolatedAsyncioTestCase 는 테스트마다 새 이벤트루프를 만드는데, 엔진의 커넥션 풀은
        # 모듈 전역이라 이전 루프의 asyncpg 커넥션이 다음 루프로 넘어가면 깨진다(test_funnel_events.py
        # 와 동일한 관례) — 매 테스트 후 풀을 비운다.
        await engine.dispose()

    async def test_panel_shape_and_demo_exclusion(self):
        async with AsyncSessionLocal() as db:
            excluded = await liquidity.get_liquidity_panel(
                weeks=26, ward_id=None, include_demo=False, _session=None, db=db
            )
        async with AsyncSessionLocal() as db:
            included = await liquidity.get_liquidity_panel(
                weeks=26, ward_id=None, include_demo=True, _session=None, db=db
            )

        self.assertTrue(excluded.demo_excluded)
        self.assertFalse(included.demo_excluded)

        # 응답 스키마 — 실제 데이터 유무와 무관하게 항상 채워져야 하는 필드.
        self.assertEqual(excluded.targets.l1_inquiry_rate_target, liquidity._L1_INQUIRY_RATE_TARGET)
        self.assertEqual(excluded.targets.l2_deal_rate_target, liquidity._L2_DEAL_RATE_TARGET)
        self.assertEqual(excluded.targets.l3_zero_result_rate_target, liquidity._L3_ZERO_RESULT_RATE_TARGET)
        self.assertEqual(excluded.targets.l4_median_hours_target, liquidity._L4_MEDIAN_HOURS_TARGET)

        excluded_total = sum(row.sample_listings for row in excluded.listings)
        included_total = sum(row.sample_listings for row in included.listings)
        # 핵심 불변식(§6-6) — 시연 계정을 빼면 표본이 줄거나 같아야 한다(늘어나면 필터가
        # 거꾸로 동작하는 것).
        self.assertLessEqual(excluded_total, included_total)

        for row in excluded.listings:
            if row.l1_inquiry_rate is not None:
                self.assertGreaterEqual(row.l1_inquiry_rate, 0.0)
                self.assertLessEqual(row.l1_inquiry_rate, 1.0)
            if row.l2_deal_rate is not None:
                self.assertGreaterEqual(row.l2_deal_rate, 0.0)
                self.assertLessEqual(row.l2_deal_rate, 1.0)

        for row in excluded.search:
            if row.l3_zero_result_rate is not None:
                self.assertGreaterEqual(row.l3_zero_result_rate, 0.0)
                self.assertLessEqual(row.l3_zero_result_rate, 1.0)

    async def test_ward_filter_narrows_results(self):
        async with AsyncSessionLocal() as db:
            unfiltered = await liquidity.get_liquidity_panel(
                weeks=26, ward_id=None, include_demo=True, _session=None, db=db
            )
        # 실존하지 않을 가능성이 높은 ward id — 결과가 비거나 unfiltered 이하여야 한다.
        async with AsyncSessionLocal() as db:
            filtered = await liquidity.get_liquidity_panel(
                weeks=26, ward_id=999, include_demo=True, _session=None, db=db
            )

        filtered_total = sum(row.sample_listings for row in filtered.listings)
        unfiltered_total = sum(row.sample_listings for row in unfiltered.listings)
        self.assertLessEqual(filtered_total, unfiltered_total)


if __name__ == "__main__":
    unittest.main()
