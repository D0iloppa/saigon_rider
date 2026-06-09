import asyncio
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
from ..models import GasStation, GasStationSubmission, GasStationWaitReport
from ..services.fuel_price_service import (
    FUEL_BRANDS as _FUEL_BRANDS,
)
from ..services.fuel_price_service import (
    FUEL_TYPES as _FUEL_TYPES,
)
from ..services.fuel_price_service import (
    get_station_with_price,
    get_today_reference_prices,
    upsert_fuel_price,
)
from ..services.redis_cache import CacheKeys, cache_get, cache_invalidate, cache_set

router = APIRouter(prefix="/info/gas", tags=["Info — 주유소"])


# ── XP helper ──────────────────────────────────────────────────────────────


async def _earn_gp_safe(user_id: uuid.UUID, action_code: str, idem_key: str, payload: dict | None = None) -> None:
    with contextlib.suppress(Exception):
        await engine_client.post_event(
            user_uuid=str(user_id),
            action_code=action_code,
            occurred_at=datetime.now(UTC),
            payload=payload or {},
            idem_key=idem_key,
        )


# ── Schemas ─────────────────────────────────────────────────────────────────


class WaitReportCreate(BaseModel):
    station_id: int
    wait_minutes: int = Field(..., ge=0, le=120)


class GasStationReportCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    lat: float
    lng: float
    phone: str | None = Field(None, max_length=30)
    note: str | None = Field(None, max_length=500)


def _derive_brand(name: str) -> tuple[str | None, str]:
    """자유 텍스트 업체명 → (brand, brand_normalized). gas-tokens.ts deriveBrandCode 와 동일 매핑."""
    s = name.lower()
    if "petrolimex" in s:
        return ("Petrolimex", "PETROLIMEX")
    if "pvoil" in s or "pv oil" in s or "pv-oil" in s:
        return ("PVOil", "PVOIL")
    if "saigon petro" in s or "saigonpetro" in s or "sài gòn petro" in s or "sai gon petro" in s:
        return ("Saigon Petro", "SAIGON_PETRO")
    if "mipec" in s:
        return ("Mipec", "MIPEC")
    if "comeco" in s:
        return ("Comeco", "COMECO")
    return (None, "UNKNOWN")


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
    cache_key = f"nearby:v1:{round(lat, 3)}:{round(lng, 3)}:{radius_km}:{fuel_type}"
    cached = await cache_get(cache_key)
    if cached is not None:
        today = datetime.now(UTC).date().isoformat()
        idem_key = f"gas-view-{user_id}-{today}"
        asyncio.create_task(_earn_gp_safe(user_id, "INFO_GAS_NEARBY_VIEW", idem_key))  # noqa: RUF006 -- fire-and-forget GP 적립
        return cached

    result = await db.execute(
        text("""
            WITH nearby AS (
                SELECT
                    gs.station_id, gs.brand, gs.name, gs.phone,
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
                LIMIT 100
            ),
            wait_summary AS (
                SELECT
                    station_id,
                    AVG(wait_minutes)::INT AS wait_minutes,
                    COUNT(*) AS wait_confidence,
                    MAX(reported_at) AS wait_reported_at
                FROM gas_station_wait_report
                WHERE reported_at > NOW() - INTERVAL '30 minutes'
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
    response = {"stations": stations}

    await cache_set(cache_key, response, ttl=600)

    today = datetime.now(UTC).date().isoformat()
    idem_key = f"gas-view-{user_id}-{today}"
    asyncio.create_task(_earn_gp_safe(user_id, "INFO_GAS_NEARBY_VIEW", idem_key))  # noqa: RUF006 -- fire-and-forget GP 적립

    return response


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

    # Abuse guard: one report per station per 30 minutes per user (혼잡도는 빨리 변하므로 30분 후 갱신 허용)
    recent = await db.scalar(
        select(GasStationWaitReport).where(
            GasStationWaitReport.station_id == body.station_id,
            GasStationWaitReport.reporter_user_id == user_id,
            GasStationWaitReport.reported_at > datetime.now(UTC) - timedelta(minutes=30),
        )
    )
    if recent:
        raise HTTPException(429, "Already reported within 30 minutes")

    expires_at = datetime.now(UTC) + timedelta(minutes=30)
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

    # 제보가 nearby 응답에 즉시 반영되도록 캐시 무효화 (제보 위치를 알 수 없어 nearby 전체 삭제)
    await cache_invalidate("nearby:v1:*")

    return {"wait_id": report.wait_id, "rp_earned": 5}


@router.post("/report", status_code=201)
async def report_new_station(
    body: GasStationReportCreate,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    """신규 주유소 제보. gas_station 에 직접 쓰지 않고 대기큐(PENDING)에 적재 →
    admin 수동 검증(confirm) 시에만 gas_station 으로 upsert."""
    brand, brand_norm = _derive_brand(body.name)
    submission = GasStationSubmission(
        name=body.name.strip(),
        lat=body.lat,
        lng=body.lng,
        phone=body.phone,
        brand=brand,
        brand_normalized=brand_norm,
        note=body.note,
        reporter_user_id=user_id,
        status="PENDING",
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return {"submission_id": submission.submission_id, "status": submission.status}


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

    return await upsert_fuel_price(
        db,
        brand=body.brand,
        fuel_type=body.fuel_type,
        price_vnd=body.price_vnd,
        effective_time=body.effective_time,
        region=body.region,
        source_label=body.source_label,
    )


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
