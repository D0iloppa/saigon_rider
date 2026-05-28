import contextlib
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_service_key, verify_user_session
from ..engine_client import engine_client
from ..models import GasStation, GasStationWaitReport
from ..services.fuel_price_service import get_station_with_price, get_today_reference_prices
from ..services.redis_cache import CacheKeys, cache_get, cache_invalidate, cache_set

router = APIRouter(prefix="/info/gas", tags=["Info — 주유소"])


# ── XP helper ──────────────────────────────────────────────────────────────


async def _earn_gp_safe(user_id: uuid.UUID, action_code: str, idem_key: str, payload: dict | None = None) -> None:
    with contextlib.suppress(Exception):
        await engine_client.post_event(
            user_id=str(user_id),
            action_code=action_code,
            occurred_at=datetime.now(UTC).isoformat(),
            payload=payload or {},
            idempotency_key=idem_key,
        )


# ── Schemas ─────────────────────────────────────────────────────────────────


class WaitReportCreate(BaseModel):
    station_id: int
    wait_minutes: int = Field(..., ge=0, le=120)


_FUEL_BRANDS = ("PETROLIMEX", "PVOIL", "SAIGON_PETRO", "MIPEC", "COMECO", "MARKET_AVG")
_FUEL_TYPES = ("RON95_III", "RON95_V", "E5_RON92_II", "DO_001S_V", "DO_005S_II")


class FuelPriceUpsert(BaseModel):
    brand: str = Field(..., description="PETROLIMEX | PVOIL | SAIGON_PETRO | MIPEC | COMECO | MARKET_AVG")
    fuel_type: str = Field(..., description="RON95_III | RON95_V | E5_RON92_II | DO_001S_V | DO_005S_II")
    price_vnd: int = Field(..., ge=10_000, le=60_000)
    effective_time: datetime | None = Field(None, description="기본: 현재 시각 (UTC)")
    region: str = "VUNG_1"
    source_label: str = "manual:admin"


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/nearby")
async def get_nearby_gas_stations(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    fuel_type: str = "RON95",
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            WITH nearby AS (
                SELECT
                    gs.station_id, gs.brand, gs.name,
                    CAST(gs.lat AS FLOAT) AS lat,
                    CAST(gs.lng AS FLOAT) AS lng,
                    gs.district_code, gs.street_name, gs.opening_hours,
                    ST_Distance(
                        gs.geom,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                    ) / 1000.0 AS distance_km
                FROM gas_station gs
                WHERE gs.status = 'ACTIVE'
                  AND ST_DWithin(
                        gs.geom,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                        :radius_m
                      )
                ORDER BY distance_km
                LIMIT 20
            ),
            wait_summary AS (
                SELECT
                    station_id,
                    AVG(wait_minutes)::INT AS wait_minutes,
                    COUNT(*) AS wait_confidence,
                    MAX(reported_at) AS wait_reported_at
                FROM gas_station_wait_report
                WHERE reported_at > NOW() - INTERVAL '90 minutes'
                GROUP BY station_id
            ),
            current_price AS (
                SELECT price_vnd FROM fuel_price_snapshot
                WHERE fuel_type = CASE
                        WHEN :fuel_type IN ('RON95', 'RON95_III') THEN 'RON95_III'
                        WHEN :fuel_type IN ('E5', 'E5_RON92')     THEN 'E5_RON92_II'
                        ELSE :fuel_type
                      END
                  AND region = 'VUNG_1'
                  AND status = 'ACTIVE'
                ORDER BY effective_time DESC LIMIT 1
            )
            SELECT
                n.*,
                (SELECT price_vnd FROM current_price) AS price_vnd,
                COALESCE(w.wait_minutes, 0) AS wait_minutes,
                COALESCE(w.wait_confidence, 0) AS wait_confidence,
                w.wait_reported_at
            FROM nearby n
            LEFT JOIN wait_summary w USING (station_id)
            ORDER BY n.distance_km
        """),
        {"lat": lat, "lng": lng, "radius_m": radius_km * 1000, "fuel_type": fuel_type},
    )

    stations = [dict(row._mapping) for row in result]

    today = datetime.now(UTC).date().isoformat()
    idem_key = f"gas-view-{user_id}-{today}"
    await _earn_gp_safe(user_id, "INFO_GAS_NEARBY_VIEW", idem_key)

    return {"stations": stations}


@router.post("/wait-report", status_code=201)
async def report_wait_time(
    body: WaitReportCreate,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    # Verify station exists
    station = await db.get(GasStation, body.station_id)
    if not station:
        raise HTTPException(404, "Gas station not found")

    # Abuse guard: one report per station per 90 minutes per user
    recent = await db.scalar(
        select(GasStationWaitReport).where(
            GasStationWaitReport.station_id == body.station_id,
            GasStationWaitReport.reporter_user_id == user_id,
            GasStationWaitReport.reported_at > datetime.now(UTC) - timedelta(minutes=90),
        )
    )
    if recent:
        raise HTTPException(429, "Already reported within 90 minutes")

    expires_at = datetime.now(UTC) + timedelta(minutes=90)
    report = GasStationWaitReport(
        station_id=body.station_id,
        reporter_user_id=user_id,
        wait_minutes=body.wait_minutes,
        expires_at=expires_at,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    bucket = int(datetime.now(UTC).timestamp()) // 5400
    idem_key = f"gas-wait-{user_id}-{body.station_id}-{bucket}"
    await _earn_gp_safe(user_id, "INFO_GAS_WAIT_REPORT", idem_key)

    return {"wait_id": report.wait_id, "xp_earned": 5}


# ── v2 Endpoints (fuel_price_snapshot 기반, "오늘의 참고가") ────────────────


@router.get("/today-prices")
async def get_today_prices(db: AsyncSession = Depends(get_db)):
    """오늘의 브랜드 x 연료별 참고가 매트릭스. 인증 불요 (공개 정보)."""
    return await get_today_reference_prices(db)


@router.get("/stations/nearby-v2")
async def get_nearby_v2(
    lat: float,
    lng: float,
    radius_km: float = 3.0,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    """근처 주유소 + 브랜드별 참고가 (v2 응답 형식)."""
    cache_key = CacheKeys.STATIONS_NEARBY.format(lat=round(lat, 3), lng=round(lng, 3), radius=radius_km)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        text("""
        SELECT gs.station_id, gs.name, gs.brand, gs.brand_normalized,
               CAST(gs.lat AS FLOAT) AS lat, CAST(gs.lng AS FLOAT) AS lng,
               gs.is_24h, gs.district_code, gs.street_name, gs.opening_hours,
               ST_Distance(
                   gs.geom,
                   ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
               ) / 1000.0 AS distance_km
        FROM gas_station gs
        WHERE gs.status = 'ACTIVE'
          AND ST_DWithin(
                gs.geom,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius_m
              )
        ORDER BY distance_km
        LIMIT 50
    """),
        {"lat": lat, "lng": lng, "radius_m": radius_km * 1000},
    )

    stations = [dict(r._mapping) for r in result]

    today_prices = await get_today_reference_prices(db)

    for s in stations:
        brand_norm = s.get("brand_normalized") or "UNKNOWN"
        brand_key = brand_norm if brand_norm != "UNKNOWN" else "MARKET_AVG"
        brand_prices = today_prices.get(brand_key) or today_prices.get("MARKET_AVG") or {}
        s["reference_price"] = {
            "RON95_III": (brand_prices.get("RON95_III") or {}).get("price"),
            "E5_RON92_II": (brand_prices.get("E5_RON92_II") or {}).get("price"),
            "updated_at": today_prices.get("updated_at"),
            "source": f"{brand_key} 공식" if brand_key != "MARKET_AVG" else "시장 평균",
        }

    response = {
        "stations": stations,
        "global_updated_at": today_prices.get("updated_at"),
    }

    await cache_set(cache_key, response, ttl=600)
    return response


@router.post("/admin/refresh", dependencies=[Depends(verify_service_key)])
async def admin_trigger_fetch_cycle():
    """운영자 수동 트리거: fetch_cycle 1회 실행 (현재 스텁, 로그만 남김)."""
    from ..jobs.fetch_fuel_prices import run_fetch_cycle

    return await run_fetch_cycle()


@router.post("/admin/upsert", dependencies=[Depends(verify_service_key)])
async def admin_upsert_fuel_price(
    body: FuelPriceUpsert,
    db: AsyncSession = Depends(get_db),
):
    """운영자 수동 입력: fuel_price_snapshot 직접 upsert + 캐시 무효화.

    외부 자동 수집(scraper)이 v1.1 R&D 이월된 상태에서 1차 운영 수단.
    X-Service-Key 헤더 필요 (.env ENGINE_SERVICE_KEY).
    """
    if body.brand not in _FUEL_BRANDS:
        raise HTTPException(400, f"brand must be one of {_FUEL_BRANDS}")
    if body.fuel_type not in _FUEL_TYPES:
        raise HTTPException(400, f"fuel_type must be one of {_FUEL_TYPES}")

    now = datetime.now(UTC)
    effective = body.effective_time or now
    if effective.tzinfo is None:
        effective = effective.replace(tzinfo=UTC)

    # 기존 같은 날짜 같은 brand/fuel_type 의 다른 source ACTIVE 행은 SUPERSEDED 로
    await db.execute(
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
        {"d": effective.date(), "r": body.region, "b": body.brand, "f": body.fuel_type, "s": body.source_label},
    )

    # upsert (same source key)
    await db.execute(
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
            "r": body.region,
            "b": body.brand,
            "f": body.fuel_type,
            "p": body.price_vnd,
            "s": body.source_label,
            "n": now,
            "v": '{"manual":true}',
        },
    )
    await db.commit()

    invalidated = await cache_invalidate("*")
    return {"ok": True, "cache_invalidated": invalidated}


@router.get("/station/{station_id}")
async def get_station_detail(
    station_id: int,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    """주유소 상세 (바텀시트용) — 브랜드별 가격 + 갱신 시각."""
    result = await get_station_with_price(db, station_id)
    if not result:
        raise HTTPException(404, "Gas station not found")
    return result
