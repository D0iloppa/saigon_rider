import contextlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_service_key, verify_user_session
from ..engine_client import engine_client
from ..models import FloodConfirmation, FloodReport
from ..utils import find_district_by_point

router = APIRouter(prefix="/info/flood", tags=["Info — 침수"])

_DEPTH_LEVELS = ("ankle", "knee", "thigh", "above")
_DAILY_REPORT_LIMIT = 5
_DEDUP_RADIUS_M = 100
_DEDUP_MINUTES = 30


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


# ── Lazy expiry ─────────────────────────────────────────────────────────────


async def _expire_stale(db: AsyncSession) -> None:
    """만료 기준을 지난 활성 신고를 EXPIRED로 전환. ST_DWithin 없는 순수 SQL."""
    await db.execute(
        text("""
            UPDATE flood_report
               SET status = 'EXPIRED'
             WHERE status = 'ACTIVE'
               AND expires_at < NOW()
               AND NOT EXISTS (
                   SELECT 1
                     FROM flood_confirmation
                    WHERE report_id = flood_report.report_id
                      AND confirmation_type = 'still_flooded'
                      AND confirmed_at > NOW() - INTERVAL '2 hours'
               )
        """)
    )
    await db.commit()


# ── District lookup ─────────────────────────────────────────────────────────


# ── Schemas ─────────────────────────────────────────────────────────────────


class FloodReportCreate(BaseModel):
    lat: float = Field(..., ge=10.5, le=11.2)
    lng: float = Field(..., ge=106.4, le=107.0)
    depth_level: Literal["ankle", "knee", "thigh", "above"]
    street_name: str | None = None
    photo_url: str | None = None


class FloodConfirmCreate(BaseModel):
    confirmation_type: Literal["still_flooded", "resolved", "false"]


# ── Abuse guards ─────────────────────────────────────────────────────────────


async def _check_abuse(db: AsyncSession, user_id: uuid.UUID, lat: float, lng: float) -> None:
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    today_count = await db.scalar(
        select(func.count(FloodReport.report_id)).where(
            FloodReport.reporter_user_id == user_id,
            FloodReport.reported_at >= today_start,
        )
    )
    if (today_count or 0) >= _DAILY_REPORT_LIMIT:
        raise HTTPException(429, "Daily report limit reached (5)")

    nearby_start = datetime.now(UTC) - timedelta(minutes=_DEDUP_MINUTES)
    nearby_count = await db.scalar(
        select(func.count(FloodReport.report_id)).where(
            FloodReport.reporter_user_id == user_id,
            FloodReport.reported_at >= nearby_start,
            text("ST_DWithin(geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)").bindparams(
                lat=lat, lng=lng, radius=_DEDUP_RADIUS_M
            ),
        )
    )
    if (nearby_count or 0) > 0:
        raise HTTPException(429, "Same location within 30 minutes")


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/active")
async def get_active_floods(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    await _expire_stale(db)

    result = await db.execute(
        text("""
            SELECT
                fr.report_id,
                fr.lat,
                fr.lng,
                fr.district_code,
                fr.street_name,
                fr.depth_level,
                fr.photo_url,
                fr.reported_at,
                fr.confidence_score,
                fr.status,
                fr.expires_at,
                EXTRACT(EPOCH FROM (NOW() - fr.reported_at)) / 60 AS minutes_ago,
                ST_Distance(
                    fr.geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                ) / 1000.0 AS distance_km
            FROM flood_report fr
            WHERE fr.status = 'ACTIVE'
              AND fr.expires_at > NOW()
              AND ST_DWithin(
                    fr.geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius_m
                  )
            ORDER BY fr.confidence_score DESC, fr.reported_at DESC
            LIMIT 50
        """),
        {"lat": lat, "lng": lng, "radius_m": radius_km * 1000},
    )

    floods = []
    for row in result:
        r = dict(row._mapping)
        mins = int(r.pop("minutes_ago", 0))
        r["time_ago"] = f"{mins}분 전" if mins < 60 else f"{mins // 60}시간 전"
        r["lat"] = float(r["lat"])
        r["lng"] = float(r["lng"])
        r["distance_km"] = round(float(r["distance_km"]), 2)
        floods.append(r)

    return {"floods": floods}


@router.post("/report", status_code=201)
async def report_flood(
    body: FloodReportCreate,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    await _check_abuse(db, user_id, body.lat, body.lng)

    district = await find_district_by_point(db, body.lat, body.lng) or f"{round(body.lat, 2)}_{round(body.lng, 2)}"
    expires_at = datetime.now(UTC) + timedelta(hours=6)

    report = FloodReport(
        reporter_user_id=user_id,
        lat=body.lat,
        lng=body.lng,
        district_code=district,
        street_name=body.street_name,
        depth_level=body.depth_level,
        photo_url=body.photo_url,
        expires_at=expires_at,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    idem_base = f"flood-report-{user_id}-{report.report_id}"
    await _earn_gp_safe(user_id, "INFO_FLOOD_REPORT", idem_base, {"report_id": report.report_id})

    xp_earned = 30
    if body.photo_url:
        await _earn_gp_safe(user_id, "INFO_FLOOD_PHOTO", f"{idem_base}-photo")
        xp_earned += 10

    return {
        "report_id": report.report_id,
        "xp_earned": xp_earned,
        "expires_at": report.expires_at.isoformat(),
        "district_code": district,
    }


@router.post("/confirm/{report_id}")
async def confirm_flood(
    report_id: int,
    body: FloodConfirmCreate,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    report = await db.get(FloodReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if report.reporter_user_id == user_id:
        raise HTTPException(400, "Cannot confirm your own report")
    if report.status != "ACTIVE":
        raise HTTPException(400, "Report is no longer active")

    existing = await db.scalar(
        select(FloodConfirmation).where(
            FloodConfirmation.report_id == report_id,
            FloodConfirmation.user_id == user_id,
        )
    )
    if existing:
        raise HTTPException(409, "Already confirmed")

    confirmation = FloodConfirmation(
        report_id=report_id,
        user_id=user_id,
        confirmation_type=body.confirmation_type,
    )
    db.add(confirmation)

    now = datetime.now(UTC)
    if body.confirmation_type == "still_flooded":
        report.confidence_score = (report.confidence_score or 1) + 1
        report.expires_at = now + timedelta(hours=2)
    elif body.confirmation_type == "resolved":
        report.status = "RESOLVED"
        report.resolved_at = now

    await db.commit()

    xp_earned = 0
    if body.confirmation_type in ("still_flooded", "resolved"):
        idem_key = f"flood-confirm-{user_id}-{report_id}"
        await _earn_gp_safe(user_id, "INFO_FLOOD_CONFIRM", idem_key)
        xp_earned = 10

    return {"confirmed": True, "xp_earned": xp_earned}


def _trust_level(score: int | None) -> str:
    s = score or 0
    if s >= 3:
        return "VERIFIED"
    if s >= 1:
        return "CONFIRMED"
    return "PENDING"


@router.get("/map-data")
async def get_map_data(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    await _expire_stale(db)

    reports_result = await db.execute(
        text("""
            SELECT
                fr.report_id,
                fr.lat,
                fr.lng,
                fr.district_code,
                fr.street_name,
                fr.depth_level,
                fr.photo_url,
                fr.reported_at,
                fr.confidence_score,
                fr.status,
                fr.expires_at,
                EXTRACT(EPOCH FROM (NOW() - fr.reported_at)) / 60 AS minutes_ago,
                ST_Distance(
                    fr.geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                ) / 1000.0 AS distance_km
            FROM flood_report fr
            WHERE fr.status = 'ACTIVE'
              AND fr.expires_at > NOW()
              AND ST_DWithin(
                    fr.geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius_m
                  )
            ORDER BY fr.confidence_score DESC, fr.reported_at DESC
            LIMIT 50
        """),
        {"lat": lat, "lng": lng, "radius_m": radius_km * 1000},
    )

    reports = []
    for row in reports_result:
        r = dict(row._mapping)
        mins = int(r.pop("minutes_ago", 0))
        r["time_ago"] = f"{mins}분 전" if mins < 60 else f"{mins // 60}시간 전"
        r["minutes_ago"] = mins
        r["lat"] = float(r["lat"])
        r["lng"] = float(r["lng"])
        r["distance_km"] = round(float(r["distance_km"]), 2)
        r["trust_level"] = _trust_level(r.get("confidence_score"))
        reports.append(r)

    hotspots_result = await db.execute(
        text("""
            SELECT
                hotspot_id,
                district_code,
                street_name,
                centroid_lat,
                centroid_lng,
                flood_count_30d,
                last_flood_at,
                avg_depth_level,
                updated_at
            FROM flood_hotspot_stats
            ORDER BY flood_count_30d DESC
            LIMIT 50
        """)
    )
    hotspots = []
    for row in hotspots_result:
        h = dict(row._mapping)
        if h.get("centroid_lat") is not None:
            h["centroid_lat"] = float(h["centroid_lat"])
        if h.get("centroid_lng") is not None:
            h["centroid_lng"] = float(h["centroid_lng"])
        hotspots.append(h)

    # ② 날씨 기반 예측 위험 (당일, 만료 전) — 실제 제보와 분리.
    risks_result = await db.execute(
        text("""
            SELECT risk_id, hotspot_id, district_code, street_name,
                   CAST(lat AS FLOAT) AS lat, CAST(lng AS FLOAT) AS lng,
                   rain_prob, risk_level, depth_hint, predicted_date
            FROM flood_risk_daily
            WHERE expires_at > NOW()
              AND ST_DWithin(
                    geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius_m
                  )
            ORDER BY rain_prob DESC
            LIMIT 50
        """),
        {"lat": lat, "lng": lng, "radius_m": radius_km * 1000},
    )
    risks = [dict(row._mapping) for row in risks_result]

    return {
        "hotspots": hotspots,
        "reports": reports,
        "risks": risks,
        "fetched_at": datetime.now(UTC).isoformat(),
    }


@router.post("/admin/predict-risk", dependencies=[Depends(verify_service_key)])
async def admin_predict_risk():
    """운영자/스케줄러 수동 트리거: 날씨 기반 일일 침수 예측 1회 실행.

    평소엔 BFF APScheduler 가 매일(05:30/15:00 ICT) 자동 실행. X-Service-Key 필요.
    """
    from ..jobs.predict_flood_risk import run_flood_risk_prediction

    return await run_flood_risk_prediction()


@router.get("/hotspots")
async def get_hotspots(
    district_code: str | None = None,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    query = text("""
        SELECT
            hotspot_id,
            district_code,
            street_name,
            centroid_lat,
            centroid_lng,
            flood_count_30d,
            last_flood_at,
            avg_depth_level,
            updated_at
        FROM flood_hotspot_stats
        WHERE (:district IS NULL OR district_code = :district)
        ORDER BY flood_count_30d DESC
        LIMIT 20
    """)
    result = await db.execute(query, {"district": district_code})
    hotspots = [dict(r._mapping) for r in result]
    return {"hotspots": hotspots}
