"""3-way price validation.

2개 이상 소스가 200 VND 이내로 일치하면 trusted=True.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Iterable

from .base_scraper import FuelPriceRecord

log = logging.getLogger(__name__)

TOLERANCE_VND = 200


def validate_prices(*record_groups: Iterable[FuelPriceRecord]) -> dict[str, dict]:
    """모든 스크래퍼 결과를 fuel_type 별로 묶어 일치 여부 판정.

    Returns: { fuel_type: { 'median', 'sources_agree', 'sources_disagree', 'trusted', 'all_prices' } }
    """
    grouped: dict[str, dict[str, FuelPriceRecord]] = defaultdict(dict)
    for group in record_groups:
        for r in group:
            # 동일 fuel_type/source 충돌 시 마지막 우선
            grouped[r.fuel_type][r.source] = r

    results: dict[str, dict] = {}
    for fuel_type, sources in grouped.items():
        if not sources:
            continue
        prices = {name: rec.price_vnd for name, rec in sources.items()}
        ordered = sorted(prices.values())
        median = ordered[len(ordered) // 2]
        agree = [name for name, p in prices.items() if abs(p - median) <= TOLERANCE_VND]
        disagree = [name for name, p in prices.items() if abs(p - median) > TOLERANCE_VND]
        results[fuel_type] = {
            "median": median,
            "sources_agree": agree,
            "sources_disagree": disagree,
            "trusted": len(agree) >= 2,
            "all_prices": prices,
        }
        if disagree:
            log.warning("[%s] source disagreement: median=%s prices=%s", fuel_type, median, prices)

    return results
