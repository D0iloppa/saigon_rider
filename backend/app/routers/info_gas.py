import contextlib
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import GasStation, GasStationWaitReport

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
                SELECT price_vnd FROM fuel_price_official
                WHERE fuel_type = :fuel_type
                  AND effective_from <= CURRENT_DATE
                  AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
                ORDER BY effective_from DESC LIMIT 1
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
