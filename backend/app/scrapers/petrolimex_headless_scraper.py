"""Petrolimex 공식 홈페이지 헤드리스 스크래퍼 (Playwright).

petrolimex.com.vn 의 가격 위젯은 JS 렌더라 정적 파싱 불가 → Chromium 헤드리스로 렌더 후
본문 텍스트에서 유종별 Vùng 1(호치민) 소매가를 추출한다. 권역 규제가라 전 주유소 공통.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import httpx

from .base_scraper import FuelPriceRecord

log = logging.getLogger(__name__)

ICT = ZoneInfo("Asia/Ho_Chi_Minh")
URL = "https://www.petrolimex.com.vn/"
# 적용일시는 홈페이지 위젯에 없어 정적 파싱되는 xangdau 현재가 페이지에서 보강한다.
EFF_DATE_URL = "https://www.xangdau.net/gia-xang-dau-hien-tai-trong-nuoc"

# 본문 라벨 → 스냅샷 fuel_type. 라벨 직후 첫 숫자가 Vùng 1 가격.
_LABELS: list[tuple[str, str]] = [
    ("RON 95-V", "RON95_V"),
    ("RON 95-III", "RON95_III"),
    ("E5 RON 92-II", "E5_RON92_II"),
    ("DO 0,05S-II", "DO_005S_II"),
    ("DO 0,001S-V", "DO_001S_V"),
]
_PRICE = r"(\d{2}[.,]\d{3})"
# "áp dụng từ 15h ngày 04/06/2026" / "...15 giờ ... ngày 04-6-2026"
_EFF = re.compile(
    r"áp dụng[^0-9]{0,15}(\d{1,2})\s*(?:h|giờ)[^0-9]{0,12}ngày\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})",
    re.IGNORECASE,
)


class PetrolimexHeadlessScraper:
    SOURCE_NAME = "petrolimex.com.vn"

    async def fetch(self) -> list[FuelPriceRecord]:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
            try:
                page = await browser.new_page()
                await page.goto(URL, wait_until="domcontentloaded", timeout=45_000)
                # "Giá bán lẻ xăng dầu" 버튼을 눌러야 가격 위젯이 펼쳐짐
                try:
                    await page.click("a.f-btn", timeout=8_000)
                    await page.wait_for_timeout(2_000)
                except Exception as e:
                    log.warning("[PetrolimexHeadless] price button click failed: %s", e)
                text = await page.inner_text("body")
            finally:
                await browser.close()

        text = re.sub(r"[ \t]+", " ", text)
        effective = await self._effective_time()

        records: list[FuelPriceRecord] = []
        for label, fuel_type in _LABELS:
            m = re.search(re.escape(label) + r"\s*" + _PRICE, text)
            if not m:
                continue
            price = int(m.group(1).replace(".", "").replace(",", ""))
            if not 10_000 <= price <= 60_000:
                continue
            records.append(
                FuelPriceRecord(
                    brand="PETROLIMEX",
                    fuel_type=fuel_type,
                    price_vnd=price,
                    effective_time=effective,
                    region="VUNG_1",
                    source=self.SOURCE_NAME,
                    source_url=URL,
                )
            )
        log.info("[PetrolimexHeadless] %d records (eff=%s)", len(records), effective.date())
        return records

    @staticmethod
    async def _effective_time() -> datetime:
        """적용일시는 정적 파싱되는 xangdau 현재가 페이지에서 가져온다(없으면 now)."""
        try:
            async with httpx.AsyncClient(
                headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "vi-VN,vi;q=0.9"},
                timeout=15.0,
                follow_redirects=True,
            ) as client:
                body = (await client.get(EFF_DATE_URL)).text
            m = _EFF.search(re.sub(r"[ \t]+", " ", body))
            if m:
                hh, d, mo, y = (int(x) for x in m.groups())
                return datetime(y, mo, d, hh, 0, tzinfo=ICT)
        except Exception as e:
            log.warning("[PetrolimexHeadless] effective-date fetch failed: %s", e)
        return datetime.now(UTC)
