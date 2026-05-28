"""Petrolimex 공식 사이트 스크래퍼 (Primary)."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from .base_scraper import BaseFuelScraper, FuelPriceRecord

log = logging.getLogger(__name__)

ICT = ZoneInfo("Asia/Ho_Chi_Minh")
EFFECTIVE_PATTERN = re.compile(
    r"(?:áp dụng từ|hiệu lực|từ)\s*(\d{1,2}):(\d{2})\s*ngày\s*(\d{1,2})/(\d{1,2})/(\d{4})",
    re.IGNORECASE,
)


class PetrolimexScraper(BaseFuelScraper):
    SOURCE_NAME = "petrolimex.com.vn"
    SOURCE_URL = "https://www.petrolimex.com.vn/nd/gia-xang-dau-pet/"

    async def fetch(self) -> list[FuelPriceRecord]:
        html = await self._get(self.SOURCE_URL)
        soup = BeautifulSoup(html, "lxml")

        effective_time = self._extract_effective_time(soup) or self._now_utc()

        records: list[FuelPriceRecord] = []
        for table in soup.find_all("table"):
            text = table.get_text(" ", strip=True).lower()
            if "ron" not in text and "vùng" not in text:
                continue
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
                        brand="PETROLIMEX",
                        fuel_type=fuel_type,
                        price_vnd=price,
                        effective_time=effective_time,
                        region="VUNG_1",
                        source=self.SOURCE_NAME,
                        source_url=self.SOURCE_URL,
                    )
                )

        # 한 fuel_type 당 최신 1건만 (테이블 중복 방지)
        dedup: dict[str, FuelPriceRecord] = {}
        for r in records:
            dedup.setdefault(r.fuel_type, r)
        result = list(dedup.values())
        log.info("[Petrolimex] %d records", len(result))
        return result

    @staticmethod
    def _extract_effective_time(soup: BeautifulSoup) -> datetime | None:
        match = EFFECTIVE_PATTERN.search(soup.get_text(" ", strip=True))
        if not match:
            return None
        h, m, d, mo, y = match.groups()
        try:
            return datetime(int(y), int(mo), int(d), int(h), int(m), tzinfo=ICT)
        except ValueError:
            return None
