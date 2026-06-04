"""침수 데이터 3층 모델 ②층 — 날씨 기반 일일 침수 예측 잡.

상습 핫스팟(flood_hotspot_stats) 을 구역별로 묶어 OpenWeather 24h 강수확률(pop)을
조회하고, 임계(THRESHOLD) 이상인 구역의 핫스팟을 "예상 침수 위험"(flood_risk_daily)으로
당일 적재한다. 재실행 시 당일분을 교체(멱등). BFF APScheduler 가 매일 호출.

실제 침수(flood_report)와는 분리 테이블 — 예측을 실신고로 위장하지 않는다.
"""

import logging
import os
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import text

from ..database import AsyncSessionLocal

log = logging.getLogger(__name__)

_OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"
_THRESHOLD = 0.5  # pop >= 50% → 위험
_HIGH = 0.7  # pop >= 70% → HIGH


async def _max_pop_24h(lat: float, lng: float, api_key: str) -> float:
    """다음 24h(3h x 8) 최대 강수확률(pop, 0..1)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{_OPENWEATHER_BASE}/forecast",
                params={"lat": lat, "lon": lng, "appid": api_key, "units": "metric", "cnt": 8},
            )
            if r.status_code != 200:
                log.warning("flood-risk: forecast %s for %s,%s", r.status_code, lat, lng)
                return 0.0
            pops = [float(e.get("pop", 0) or 0) for e in r.json().get("list", [])]
            return max(pops) if pops else 0.0
    except Exception as exc:
        log.warning("flood-risk: forecast error %s", exc)
        return 0.0


async def run_flood_risk_prediction() -> dict:
    api_key = os.getenv("OPENWEATHER_API_KEY", "")
    async with AsyncSessionLocal() as db:
        if not api_key:
            return {"status": "skipped", "reason": "OPENWEATHER_API_KEY not set"}

        hotspots = (
            (
                await db.execute(
                    text("""
                    SELECT hotspot_id, district_code, street_name,
                           CAST(centroid_lat AS FLOAT) AS lat,
                           CAST(centroid_lng AS FLOAT) AS lng,
                           avg_depth_level
                    FROM flood_hotspot_stats
                    WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL
                """)
                )
            )
            .mappings()
            .all()
        )

        # 구역별 대표 좌표로 강수확률 1회씩만 조회 (호출 절약).
        rep_by_district: dict[str, dict] = {}
        for h in hotspots:
            rep_by_district.setdefault(h["district_code"], h)
        pop_by_district: dict[str, float] = {}
        for dc, rep in rep_by_district.items():
            pop_by_district[dc] = await _max_pop_24h(rep["lat"], rep["lng"], api_key)

        now = datetime.now(UTC)
        today = now.date()
        expires_at = now + timedelta(hours=24)

        await db.execute(text("DELETE FROM flood_risk_daily WHERE predicted_date = :d"), {"d": today})

        inserted = 0
        for h in hotspots:
            pop = pop_by_district.get(h["district_code"], 0.0)
            if pop < _THRESHOLD:
                continue
            level = "HIGH" if pop >= _HIGH else "MEDIUM"
            await db.execute(
                text("""
                    INSERT INTO flood_risk_daily
                      (hotspot_id, district_code, street_name, lat, lng,
                       rain_prob, risk_level, depth_hint, predicted_date, expires_at)
                    VALUES
                      (:hid, :dc, :st, :lat, :lng, :rp, :lv, :dh, :d, :exp)
                """),
                {
                    "hid": h["hotspot_id"],
                    "dc": h["district_code"],
                    "st": h["street_name"],
                    "lat": h["lat"],
                    "lng": h["lng"],
                    "rp": round(pop * 100),
                    "lv": level,
                    "dh": h["avg_depth_level"],
                    "d": today,
                    "exp": expires_at,
                },
            )
            inserted += 1

        await db.commit()
        risky_districts = sum(1 for p in pop_by_district.values() if p >= _THRESHOLD)
        log.info("flood-risk: districts=%d risky=%d inserted=%d", len(rep_by_district), risky_districts, inserted)
        return {
            "status": "ok",
            "districts": len(rep_by_district),
            "risky_districts": risky_districts,
            "inserted": inserted,
        }
