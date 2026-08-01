"""침수 데이터 3층 모델 ②층 — 날씨 기반 일일 침수 예측 잡.

상습 핫스팟(flood_hotspot_stats) 을 구역별로 묶어 OpenWeather 24h 강수확률(pop)을
조회하고, 임계(THRESHOLD) 이상인 구역의 핫스팟을 "예상 침수 위험"(flood_risk_daily)으로
당일 적재한다. 재실행 시 당일분을 교체(멱등). BFF APScheduler 가 매일 호출.

실제 침수(flood_report)와는 분리 테이블 — 예측을 실신고로 위장하지 않는다.
"""

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import bindparam, text

from ..database import AsyncSessionLocal

log = logging.getLogger(__name__)

_OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"
_THRESHOLD = 0.5  # pop >= 50% → 위험
_HIGH = 0.7  # pop >= 70% → HIGH


async def _max_pop_24h(lat: float, lng: float, api_key: str) -> float | None:
    """다음 24h(3h x 8) 최대 강수확률(pop, 0..1). 제공자 장애 시 None(= 알 수 없음, 0.0=안전 아님)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{_OPENWEATHER_BASE}/forecast",
                params={"lat": lat, "lon": lng, "appid": api_key, "units": "metric", "cnt": 8},
            )
            if r.status_code != 200:
                log.warning("flood-risk: forecast %s for %s,%s", r.status_code, lat, lng)
                return None
            pops = [float(e.get("pop", 0) or 0) for e in r.json().get("list", [])]
            return max(pops) if pops else 0.0
    except Exception as exc:
        log.warning("flood-risk: forecast error %s", exc)
        return None


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

        # 구역별 대표 좌표로 강수확률 조회 — 동시 실행(순차 await 시 느린 구역이 전체 지연).
        rep_by_district: dict[str, dict] = {}
        for h in hotspots:
            rep_by_district.setdefault(h["district_code"], h)
        districts = list(rep_by_district.items())
        pops = await asyncio.gather(*[_max_pop_24h(rep["lat"], rep["lng"], api_key) for _, rep in districts])
        pop_by_district: dict[str, float | None] = {dc: p for (dc, _), p in zip(districts, pops, strict=True)}

        failed_districts = [dc for dc, p in pop_by_district.items() if p is None]
        succeeded_districts = [dc for dc in rep_by_district if dc not in failed_districts]

        now = datetime.now(UTC)
        today = now.date()
        expires_at = now + timedelta(hours=24)

        # 제공자(OpenWeather) 조회가 성공한 구역만 교체(멱등 재계산). 실패한 구역은 건드리지
        # 않고 기존 행을 보존 — fail-open(0.0=안전)으로 위험을 삼키지 않는다. predicted_date 를
        # UTC 기준으로 부분 삭제하면 ICT(05:30/15:00) 두 실행이 다른 UTC 날짜로 적재돼 중복
        # 누적되므로, 구역 단위(district_code) 전체 삭제로 단순화.
        if succeeded_districts:
            await db.execute(
                text("DELETE FROM flood_risk_daily WHERE district_code IN :dcs").bindparams(
                    bindparam("dcs", expanding=True)
                ),
                {"dcs": succeeded_districts},
            )
        if failed_districts:
            # 마지막 성공 snapshot 을 보존하되 is_stale=TRUE 로 표시 — 소비 API 가
            # "데이터 없음"과 "제공자 장애로 알 수 없음"을 구분해 내려줄 수 있게 한다.
            # expires_at 도 함께 이번 실행의 24h 창으로 갱신 — 갱신하지 않으면 원래 성공
            # 시점 기준 24h 뒤 expires_at 필터에서 조용히 빠져나가(fail-open 부활), 장애가
            # 여러 실행에 걸쳐 지속돼도 잡이 도는 동안은 snapshot 이 계속 살아있어야 한다.
            await db.execute(
                text(
                    "UPDATE flood_risk_daily SET is_stale = TRUE, expires_at = :exp WHERE district_code IN :dcs"
                ).bindparams(bindparam("dcs", expanding=True)),
                {"dcs": failed_districts, "exp": expires_at},
            )

        inserted = 0
        for h in hotspots:
            dc = h["district_code"]
            if dc in failed_districts:
                continue  # 이 구역은 조회 실패 — 기존 snapshot 보존, 새로 쓰지 않는다.
            pop = pop_by_district.get(dc) or 0.0
            if pop < _THRESHOLD:
                continue
            level = "HIGH" if pop >= _HIGH else "MEDIUM"
            await db.execute(
                text("""
                    INSERT INTO flood_risk_daily
                      (hotspot_id, district_code, street_name, lat, lng,
                       rain_prob, risk_level, depth_hint, predicted_date, expires_at, is_stale)
                    VALUES
                      (:hid, :dc, :st, :lat, :lng, :rp, :lv, :dh, :d, :exp, FALSE)
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
        risky_districts = sum(1 for p in pop_by_district.values() if p is not None and p >= _THRESHOLD)
        log.info(
            "flood-risk: districts=%d risky=%d inserted=%d failed=%d",
            len(rep_by_district),
            risky_districts,
            inserted,
            len(failed_districts),
        )
        return {
            "status": "degraded" if failed_districts else "ok",
            "districts": len(rep_by_district),
            "risky_districts": risky_districts,
            "inserted": inserted,
            "failed_districts": len(failed_districts),
        }
