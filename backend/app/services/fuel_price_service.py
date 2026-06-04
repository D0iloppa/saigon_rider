"""Fuel price 비즈니스 로직 (캐시 + DB 조회)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .redis_cache import CacheKeys, cache_get, cache_invalidate, cache_set

log = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1h

FUEL_BRANDS = ("PETROLIMEX", "PVOIL", "SAIGON_PETRO", "MIPEC", "COMECO", "MARKET_AVG")
FUEL_TYPES = ("RON95_III", "RON95_V", "E5_RON92_II", "DO_001S_V", "DO_005S_II")


async def upsert_fuel_price(
    session: AsyncSession,
    *,
    brand: str,
    fuel_type: str,
    price_vnd: int,
    effective_time: datetime | None = None,
    region: str = "VUNG_1",
    source_label: str = "manual:admin",
) -> dict:
    """운영자 수동 입력: fuel_price_snapshot upsert + 캐시 무효화.

    BFF service-key 엔드포인트(/info/gas/admin/upsert)와 admin 세션 페이지가 공유한다.
    호출자가 brand/fuel_type 유효성(FUEL_BRANDS/FUEL_TYPES)을 검증한다.
    """
    now = datetime.now(UTC)
    effective = effective_time or now
    if effective.tzinfo is None:
        effective = effective.replace(tzinfo=UTC)

    # 같은 날짜·region·brand·fuel_type 의 다른 source ACTIVE 행은 SUPERSEDED 로
    await session.execute(
        text("""
        UPDATE fuel_price_snapshot
           SET status = 'SUPERSEDED'
         WHERE effective_date = :d
           AND region = :r
           AND brand  = :b
           AND fuel_type = :f
           AND status = 'ACTIVE'
           AND source <> :s
    """),
        {"d": effective.date(), "r": region, "b": brand, "f": fuel_type, "s": source_label},
    )

    await session.execute(
        text("""
        INSERT INTO fuel_price_snapshot
            (effective_date, effective_time, region, brand, fuel_type, price_vnd,
             source, raw_fetched_at, validated_by, status)
        VALUES
            (:d, :et, :r, :b, :f, :p, :s, :n, CAST(:v AS JSONB), 'ACTIVE')
        ON CONFLICT (effective_date, region, brand, fuel_type, source)
        DO UPDATE SET price_vnd = EXCLUDED.price_vnd,
                      effective_time = EXCLUDED.effective_time,
                      raw_fetched_at = EXCLUDED.raw_fetched_at,
                      status = 'ACTIVE',
                      validated_by = EXCLUDED.validated_by
    """),
        {
            "d": effective.date(),
            "et": effective,
            "r": region,
            "b": brand,
            "f": fuel_type,
            "p": price_vnd,
            "s": source_label,
            "n": now,
            "v": '{"manual":true}',
        },
    )
    await session.commit()

    invalidated = await cache_invalidate("*")
    return {"ok": True, "cache_invalidated": invalidated}


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
               is_24h, district_code, street_name, opening_hours, phone
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
        "phone": station_row.phone,
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
