"""유가 갱신 cron job.

자동 수집(A): Petrolimex 공식 홈페이지를 Playwright 헤드리스로 렌더해 권역(Vùng 1=호치민)
유종별 소매가를 추출 → upsert_fuel_price 로 ACTIVE 반영(이전 source 자동 supersede + 캐시 무효화).
권역 규제가라 전 주유소 공통. 실패 시 fetch_log 에 FAILED 기록 → 관리자 패널이 노후도/연속실패로
경고하고, 운영자가 /admin/fuel 에서 수동 보정(B)한다.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import text

from ..database import AsyncSessionLocal
from ..scrapers.petrolimex_headless_scraper import PetrolimexHeadlessScraper
from ..services.fuel_price_service import upsert_fuel_price

log = logging.getLogger(__name__)


async def run_fetch_cycle() -> dict:
    """1회 fetch cycle: Petrolimex 헤드리스 렌더 → 유종별 ACTIVE upsert → fetch_log 기록."""
    start = datetime.now(UTC)
    log.info("=== Fuel price fetch cycle started %s ===", start.isoformat())

    scraper = PetrolimexHeadlessScraper()
    error_message: str | None = None
    records: list = []
    try:
        records = await scraper.fetch()
    except Exception as e:
        error_message = f"{type(e).__name__}: {e}"[:500]
        log.error("[%s] fetch failed: %s", scraper.SOURCE_NAME, e, exc_info=True)

    inserted = 0
    for rec in records:
        try:
            async with AsyncSessionLocal() as session:
                await upsert_fuel_price(
                    session,
                    brand=rec.brand,
                    fuel_type=rec.fuel_type,
                    price_vnd=rec.price_vnd,
                    effective_time=rec.effective_time,
                    region=rec.region,
                    source_label=rec.source,
                )
            inserted += 1
        except Exception as e:
            error_message = (error_message or "") + f" | upsert {rec.fuel_type}: {e}"

    status_overall = "SUCCESS" if inserted > 0 else "FAILED"
    if status_overall == "FAILED" and not error_message:
        error_message = "scraper returned 0 records"

    # 수집 성공 시 갓 수집한 set(source+적용일)만 ACTIVE 유지, 나머지(이전 조정·타소스·잘못된 날짜)는 SUPERSEDED.
    if inserted > 0 and records:
        eff_date = records[0].effective_time.date()
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                UPDATE fuel_price_snapshot
                   SET status = 'SUPERSEDED'
                 WHERE status = 'ACTIVE' AND region = 'VUNG_1'
                   AND NOT (source = :src AND effective_date = :d)
            """),
                {"d": eff_date, "src": records[0].source},
            )
            await session.commit()

    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
            INSERT INTO fuel_price_fetch_log
                (source, scheduled_at, finished_at, status, items_found, items_inserted, error_message)
            VALUES ('cycle', :start, NOW(), :st, :found, :ins, :err)
        """),
            {
                "start": start,
                "st": status_overall,
                "found": len(records),
                "ins": inserted,
                "err": error_message,
            },
        )
        await session.commit()

    log.info("Fuel cycle done: status=%s found=%d inserted=%d", status_overall, len(records), inserted)
    return {
        "source": scraper.SOURCE_NAME,
        "found": len(records),
        "inserted": inserted,
        "status": status_overall,
        "error": error_message,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = asyncio.run(run_fetch_cycle())
    print(f"Cycle complete: {result}")
