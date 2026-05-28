"""유가 갱신 cron job.

⚠️ Phase 0/2 검증 결과 (2026-05-27): 외부 소스 자동 스크래핑이 실제로 불가능 상태.
   - Petrolimex: 보도자료가 이미지로 발표됨 → HTML 파싱 불가
   - VNExpress /chu-de/: 일반 뉴스 목록, 가격 페이지 아님
   - PVOil: 403 WAF 차단
   현재 cron 은 골격(스크래퍼 호출 + 3-way validation + 로그) 만 유지. fetch() 본문이 모두 빈 리스트.
   1차 운영은 admin manual upsert (/info/gas/admin/upsert). 자동 수집은 v1.1 R&D 이월.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime

from sqlalchemy import text

from ..database import AsyncSessionLocal
from ..scrapers.base_scraper import BaseFuelScraper
from ..scrapers.petrolimex_scraper import PetrolimexScraper
from ..scrapers.price_validator import validate_prices
from ..scrapers.pvoil_scraper import PVOilScraper
from ..scrapers.vnexpress_scraper import VNExpressScraper
from ..services.redis_cache import cache_invalidate

log = logging.getLogger(__name__)


async def _safe_fetch(scraper: BaseFuelScraper) -> list:
    try:
        return await scraper.fetch()
    except Exception as e:
        log.error("[%s] fetch failed: %s", scraper.SOURCE_NAME, e, exc_info=True)
        return []


async def run_fetch_cycle() -> dict:
    """1회 fetch cycle 실행. 모든 소스 병렬 호출 → validation → DB insert → cache invalidate."""
    start = datetime.now(UTC)
    log.info("=== Fuel price fetch cycle started %s ===", start.isoformat())

    p, v, o = await asyncio.gather(
        _safe_fetch(PetrolimexScraper()),
        _safe_fetch(VNExpressScraper()),
        _safe_fetch(PVOilScraper()),
    )

    validation = validate_prices(p, v, o)
    log.info("Validation: %d fuel_types", len(validation))

    inserted = 0
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
            UPDATE fuel_price_snapshot
               SET status = 'SUPERSEDED'
             WHERE status = 'ACTIVE' AND effective_date < CURRENT_DATE
        """)
        )

        for record in p + v + o:
            v_info = validation.get(record.fuel_type, {})
            await session.execute(
                text("""
                INSERT INTO fuel_price_snapshot
                    (effective_date, effective_time, region, brand, fuel_type, price_vnd,
                     source, source_url, raw_fetched_at, validated_by, status)
                VALUES
                    (:d, :et, :r, :b, :f, :p, :s, :u, :n, CAST(:v AS JSONB), :st)
                ON CONFLICT (effective_date, region, brand, fuel_type, source)
                DO UPDATE SET price_vnd = EXCLUDED.price_vnd,
                              raw_fetched_at = EXCLUDED.raw_fetched_at,
                              validated_by = EXCLUDED.validated_by
            """),
                {
                    "d": record.effective_time.date(),
                    "et": record.effective_time,
                    "r": record.region,
                    "b": record.brand,
                    "f": record.fuel_type,
                    "p": record.price_vnd,
                    "s": record.source,
                    "u": record.source_url,
                    "n": start,
                    "v": json.dumps(v_info, default=str),
                    "st": "ACTIVE" if v_info.get("trusted") else "PENDING",
                },
            )
            inserted += 1

        status_overall = "SUCCESS" if (len(p) + len(v) + len(o)) > 0 else "FAILED"
        await session.execute(
            text("""
            INSERT INTO fuel_price_fetch_log
                (source, scheduled_at, finished_at, status, items_found, items_inserted, error_message)
            VALUES ('cycle', :start, NOW(), :st, :found, :ins, :err)
        """),
            {
                "start": start,
                "st": status_overall,
                "found": len(p) + len(v) + len(o),
                "ins": inserted,
                "err": None if status_overall == "SUCCESS" else "all scrapers returned empty (R&D pending)",
            },
        )
        await session.commit()

    invalidated = await cache_invalidate("*")
    log.info("Cache invalidated: %d keys", invalidated)

    return {
        "petrolimex": len(p),
        "vnexpress": len(v),
        "pvoil": len(o),
        "inserted": inserted,
        "validated_trusted": sum(1 for x in validation.values() if x.get("trusted")),
        "cache_invalidated": invalidated,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = asyncio.run(run_fetch_cycle())
    print(f"Cycle complete: {result}")
