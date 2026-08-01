"""Saigon Rider — Fuel price scraper base class.

자식 스크래퍼는 SOURCE_NAME / SOURCE_URL 정의 + fetch() 구현.
공통 retry / timeout / 정규화 헬퍼 제공. tz-aware datetime 강제.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

log = logging.getLogger(__name__)

DEFAULT_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36 "
    "SaigonRider/1.0 (+https://saigonrider.app/contact)"
)
DEFAULT_HEADERS = {
    "User-Agent": DEFAULT_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
}
DEFAULT_TIMEOUT = 15.0


@dataclass
class FuelPriceRecord:
    """스크래퍼가 반환하는 표준 레코드."""

    brand: str  # PETROLIMEX / PVOIL / SAIGON_PETRO / MIPEC / COMECO / MARKET_AVG
    fuel_type: str  # RON95_III / RON95_V / E5_RON92_II / DO_001S_V / DO_005S_II
    price_vnd: int
    effective_time: datetime  # tz-aware
    region: str = "VUNG_1"
    source: str = ""
    source_url: str | None = None


class BaseFuelScraper(ABC):
    SOURCE_NAME: str = ""
    SOURCE_URL: str = ""

    def __init__(self, timeout: float = DEFAULT_TIMEOUT) -> None:
        self.timeout = timeout

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=4, max=30), reraise=True)
    async def _get(self, url: str) -> str:
        async with httpx.AsyncClient(headers=DEFAULT_HEADERS, timeout=self.timeout, follow_redirects=True) as client:
            log.info("[%s] GET %s", self.SOURCE_NAME, url)
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.text

    @abstractmethod
    async def fetch(self) -> list[FuelPriceRecord]: ...

    @staticmethod
    def _normalize_fuel_type(raw: str) -> str | None:
        s = raw.lower().replace(" ", "").replace("-", "").replace(".", "")
        if "ron95v" in s:
            return "RON95_V"
        if "ron95" in s:
            return "RON95_III"
        if "e5ron92" in s or "e5xăng" in s or s.startswith("e5"):
            return "E5_RON92_II"
        if "do001" in s or "do0001" in s:
            return "DO_001S_V"
        if "do005" in s:
            return "DO_005S_II"
        return None

    @staticmethod
    def _parse_price(raw: str) -> int | None:
        if not raw:
            return None
        cleaned = "".join(c for c in raw if c.isdigit())
        if not cleaned:
            return None
        n = int(cleaned)
        if 15_000 <= n <= 35_000:
            return n
        if 1_500 <= n <= 3_500:  # "21.5" style
            return n * 1000
        log.warning("[%s] suspicious price: raw=%s parsed=%s", "scraper", raw, n)
        return n if 10_000 <= n <= 50_000 else None

    @staticmethod
    def _now_utc() -> datetime:
        return datetime.now(UTC)
