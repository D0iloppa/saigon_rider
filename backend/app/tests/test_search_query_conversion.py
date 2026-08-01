"""P4 계약 테스트 — market.py/biz.py 검색 경로가 search_blob LIKE 매칭으로 전환됐고
검색 시점 외부 번역 API 호출(translate_all)이 완전히 제거됐는지 정적으로 확인한다.

수정 전 FAIL 실증: 이 세션 이전 `market.py:270-282` 는 `translate_all(kw, db)` 를 호출했고
`or_(*(MarketplaceListing.title.ilike(...)))` 로 원문 title 만 매칭했다(설계문서 §3.2 실측: helmet/
Mũ bảo hiểm 결과 집합 완전 분리). 이 테스트를 그 커밋 이전 코드에 돌리면
`test_market_search_has_no_translate_all_call` 은 "translate_all" 이 소스에 존재해 FAIL, 즉
`assertNotIn` 이 실패한다.
"""

import inspect
import unittest

from app.routers import biz, market


class MarketSearchConversionTest(unittest.TestCase):
    def test_market_search_has_no_translate_all_call(self):
        src = inspect.getsource(market)
        self.assertNotIn("translate_all", src)
        self.assertNotIn("import httpx", src)

    def test_market_keyword_condition_uses_coalesced_search_blob_like(self):
        src = inspect.getsource(market.get_listings)
        self.assertIn("search_blob", src)
        self.assertIn("coalesce", src.lower())
        self.assertIn(".like(", src)

    def test_market_withdrawn_filter_untouched(self):
        """대표 결정 — WITHDRAWN 매물은 검색에서 항상 제외(page-map :86, ADR). 이 where 절을
        건드리지 않았는지 확인."""
        src = inspect.getsource(market.get_listings)
        self.assertIn('MarketplaceListing.status.notin_(("HIDDEN", "REMOVED", "WITHDRAWN"))', src)


class BizSearchConversionTest(unittest.TestCase):
    def test_biz_map_keyword_condition_uses_coalesced_search_blob_like(self):
        src = inspect.getsource(biz.get_public_map)
        self.assertIn("search_blob", src)
        self.assertIn("coalesce", src.lower())
        self.assertIn(".like(", src)
        self.assertNotIn("name.ilike", src)


if __name__ == "__main__":
    unittest.main()
