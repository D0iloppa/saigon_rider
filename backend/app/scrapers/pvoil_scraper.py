"""PVOil 공식 사이트 스크래퍼 (Secondary).

⚠️ Phase 0 검증: pvoil.com.vn 은 봇 차단(403) 상태. WAF 우회는 별도 협의 필요.
   현재는 always-empty 스텁 — fetch_cycle 의 safe_fetch 가 빈 리스트로 처리 → 2-way validation 으로 동작.
   대안 소스 확보되면 fetch() 본문 구현.
"""

from __future__ import annotations

import logging

from .base_scraper import BaseFuelScraper, FuelPriceRecord

log = logging.getLogger(__name__)


class PVOilScraper(BaseFuelScraper):
    SOURCE_NAME = "pvoil.com.vn"
    SOURCE_URL = "https://www.pvoil.com.vn/truyen-thong/tin-pvoil/gia-ban-le-xang-dau"

    async def fetch(self) -> list[FuelPriceRecord]:
        log.info("[PVOil] stub (WAF blocked); returning empty")
        return []
