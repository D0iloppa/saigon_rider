"""VNExpress 유가 페이지 스크래퍼 (Cross-check, MARKET_AVG)."""

from __future__ import annotations

import logging

from bs4 import BeautifulSoup

from .base_scraper import BaseFuelScraper, FuelPriceRecord

log = logging.getLogger(__name__)


class VNExpressScraper(BaseFuelScraper):
    SOURCE_NAME = "vnexpress.net"
    # 지시서의 /gia-xang-dau 는 406. Phase 0 검증으로 /chu-de/gia-xang-dau-4015 가 정상.
    SOURCE_URL = "https://vnexpress.net/chu-de/gia-xang-dau-4015"

    async def fetch(self) -> list[FuelPriceRecord]:
        html = await self._get(self.SOURCE_URL)
        soup = BeautifulSoup(html, "lxml")

        records: list[FuelPriceRecord] = []
        effective_time = self._now_utc()

        for table in soup.find_all("table"):
            for row in table.find_all("tr"):
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue
                fuel_type = self._normalize_fuel_type(cells[0].get_text(strip=True))
                if not fuel_type:
                    continue
                price = self._parse_price(cells[1].get_text(strip=True))
                if not price:
                    continue
                records.append(
                    FuelPriceRecord(
                        brand="MARKET_AVG",
                        fuel_type=fuel_type,
                        price_vnd=price,
                        effective_time=effective_time,
                        region="VUNG_1",
                        source=self.SOURCE_NAME,
                        source_url=self.SOURCE_URL,
                    )
                )

        dedup: dict[str, FuelPriceRecord] = {}
        for r in records:
            dedup.setdefault(r.fuel_type, r)
        result = list(dedup.values())
        log.info("[VNExpress] %d records", len(result))
        return result
