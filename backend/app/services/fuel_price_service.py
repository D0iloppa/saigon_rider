"""Fuel price 비즈니스 로직 (캐시 + DB 조회)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .redis_cache import CacheKeys, cache_get, cache_set

log = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1h


async def get_today_reference_prices(session: AsyncSession) -> dict:
    """오늘의 brand x fuel_type 참고가 + 마지막 갱신 시각.

    Returns:
        {
            "PETROLIMEX": {"RON95_III": {"price": 21560, "effective_time": "..."}, ...},
            "MARKET_AVG": {...},
            "updated_at": "16:30",            # 사용자 노출용 HH:MM
            "updated_at_iso": "2026-05-27T09:30:00+00:00"
        }
    """
    cached = await cache_get(CacheKeys.TODAY_PRICES)
    if cached:
        return cached

    result = await session.execute(
        text("""
        SELECT brand, fuel_type, price_vnd, effective_time, raw_fetched_at
        FROM fuel_price_snapshot
        WHERE status = 'ACTIVE'
          AND region = 'VUNG_1'
          AND effective_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY brand, fuel_type, effective_time DESC
    """)
    )

    output: dict[str, dict] = {}
    latest_update = None

    for row in result:
        brand = row.brand
        bucket = output.setdefault(brand, {})
        if row.fuel_type not in bucket:
            bucket[row.fuel_type] = {
                "price": row.price_vnd,
                "effective_time": row.effective_time.isoformat(),
            }
        if latest_update is None or row.raw_fetched_at > latest_update:
            latest_update = row.raw_fetched_at

    output["updated_at"] = latest_update.strftime("%H:%M") if latest_update else None
    output["updated_at_iso"] = latest_update.isoformat() if latest_update else None

    await cache_set(CacheKeys.TODAY_PRICES, output, ttl=CACHE_TTL)
    return output


async def get_station_with_price(session: AsyncSession, station_id: int) -> dict | None:
    """주유소 메타 + 브랜드별 오늘 가격 (바텀시트용)."""
    cached = await cache_get(CacheKeys.STATION_PRICE.format(station_id=station_id))
    if cached:
        return cached

    station_row = (
        await session.execute(
            text("""
        SELECT station_id, name, brand, brand_normalized,
               CAST(lat AS FLOAT) AS lat, CAST(lng AS FLOAT) AS lng,
               is_24h, district_code, street_name, opening_hours
        FROM gas_station
        WHERE station_id = :id AND status = 'ACTIVE'
    """),
            {"id": station_id},
        )
    ).first()

    if not station_row:
        return None

    brand_norm = station_row.brand_normalized or "UNKNOWN"
    brand_to_query = brand_norm if brand_norm not in ("UNKNOWN",) else "MARKET_AVG"

    price_rows = await session.execute(
        text("""
        SELECT fuel_type, price_vnd, raw_fetched_at
        FROM fuel_price_snapshot
        WHERE brand = :brand
          AND status = 'ACTIVE'
          AND region = 'VUNG_1'
          AND effective_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY fuel_type, effective_time DESC
    """),
        {"brand": brand_to_query},
    )

    fuel_prices: dict[str, int] = {}
    last_update = None
    for r in price_rows:
        fuel_prices.setdefault(r.fuel_type, r.price_vnd)
        if last_update is None or r.raw_fetched_at > last_update:
            last_update = r.raw_fetched_at

    source_label = "시장 평균" if brand_to_query == "MARKET_AVG" else f"{brand_to_query} 공식"

    result = {
        "station_id": station_row.station_id,
        "name": station_row.name,
        "brand": station_row.brand,
        "brand_normalized": brand_norm,
        "lat": station_row.lat,
        "lng": station_row.lng,
        "is_24h": bool(station_row.is_24h),
        "district_code": station_row.district_code,
        "street_name": station_row.street_name,
        "opening_hours": station_row.opening_hours,
        "reference_price": {
            **fuel_prices,
            "source": source_label,
            "updated_at": last_update.strftime("%H:%M") if last_update else None,
            "updated_at_iso": last_update.isoformat() if last_update else None,
        },
        "crowd_price": None,  # v2
    }

    await cache_set(CacheKeys.STATION_PRICE.format(station_id=station_id), result, ttl=CACHE_TTL)
    return result
