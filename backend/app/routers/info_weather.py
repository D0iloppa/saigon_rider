import logging
import os
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import UserFavoriteLocation, WeatherCache

log = logging.getLogger(__name__)

router = APIRouter(prefix="/info/weather", tags=["Info — 날씨"])

_OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"
_RAINVIEWER_META_URL = "https://api.rainviewer.com/public/weather-maps.json"

_TTL_CURRENT = int(os.getenv("WEATHER_CACHE_TTL_CURRENT", "600"))
_TTL_FORECAST_1H = int(os.getenv("WEATHER_CACHE_TTL_FORECAST_1H", "1800"))
_TTL_FORECAST_24H = int(os.getenv("WEATHER_CACHE_TTL_FORECAST_24H", "3600"))

_DEPTH_LABEL = {"ankle": "발목", "knee": "무릎", "thigh": "허벅지", "above": "그 이상"}

# 호치민 District 경계 (간략화 bbox)
_HCM_DISTRICTS: dict[str, dict] = {
    "Q1": {"lat_min": 10.762, "lat_max": 10.790, "lng_min": 10.695, "lng_max": 106.716},
    "Q3": {"lat_min": 10.770, "lat_max": 10.795, "lng_min": 106.672, "lng_max": 106.695},
    "Q4": {"lat_min": 10.748, "lat_max": 10.772, "lng_min": 106.696, "lng_max": 106.722},
    "Q5": {"lat_min": 10.746, "lat_max": 10.768, "lng_min": 106.655, "lng_max": 106.683},
    "Q7": {"lat_min": 10.718, "lat_max": 10.750, "lng_min": 106.697, "lng_max": 106.748},
    "BinhThanh": {"lat_min": 10.793, "lat_max": 10.830, "lng_min": 106.685, "lng_max": 106.725},
    "PhuNhuan": {"lat_min": 10.785, "lat_max": 10.806, "lng_min": 106.663, "lng_max": 106.685},
    "GoVap": {"lat_min": 10.818, "lat_max": 10.865, "lng_min": 106.651, "lng_max": 106.695},
    "ThuDuc": {"lat_min": 10.818, "lat_max": 10.890, "lng_min": 106.715, "lng_max": 106.808},
    "TanBinh": {"lat_min": 10.789, "lat_max": 10.820, "lng_min": 106.629, "lng_max": 106.666},
    "TanPhu": {"lat_min": 10.773, "lat_max": 10.795, "lng_min": 106.616, "lng_max": 106.650},
    "Q6": {"lat_min": 10.742, "lat_max": 10.773, "lng_min": 106.626, "lng_max": 106.663},
    "Q8": {"lat_min": 10.724, "lat_max": 10.754, "lng_min": 106.641, "lng_max": 106.696},
    "BinhChanh": {"lat_min": 10.650, "lat_max": 10.730, "lng_min": 106.560, "lng_max": 106.680},
}


def _grid_code(lat: float, lng: float) -> str:
    """1km 그리드 코드 (캐시 키). 좌표를 0.01도 단위로 스냅."""
    return f"{round(lat, 2)}_{round(lng, 2)}"


def _find_district(lat: float, lng: float) -> str:
    for code, b in _HCM_DISTRICTS.items():
        if b["lat_min"] <= lat <= b["lat_max"] and b["lng_min"] <= lng <= b["lng_max"]:
            return code
    return _grid_code(lat, lng)


def _condition_emoji(condition: str) -> str:
    mapping = {
        "Clear": "☀️",
        "Clouds": "⛅",
        "Rain": "🌧",
        "Drizzle": "🌦",
        "Thunderstorm": "⛈",
        "Snow": "❄️",
        "Mist": "🌫",
        "Fog": "🌫",
        "Haze": "🌁",
    }
    return mapping.get(condition, "🌡")


def _generate_recommendation(rain_prob_1h: int) -> str:
    if rain_prob_1h >= 80:
        return "지금 출발은 비 위험. 30분 후 재확인 추천"
    if rain_prob_1h >= 50:
        return f"1시간 내 비 가능성 {rain_prob_1h}%. 빠른 라이딩 OK"
    return "비 안 옴. 좋은 라이딩 날씨 ✅"


async def _get_api_key() -> str:
    key = os.getenv("OPENWEATHER_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="OPENWEATHER_API_KEY not configured")
    return key


_MOCK_CURRENT = {
    "main": {"temp": 32.0, "humidity": 80, "feels_like": 36.0},
    "wind": {"speed": 3.5},
    "weather": [{"main": "Clouds", "description": "scattered clouds", "id": 802}],
    "rain": {},
}
_MOCK_FORECAST = {
    "list": [
        {
            "dt_txt": f"2026-05-21 {h:02d}:00:00",
            "main": {"temp": 31.0 + (h % 4)},
            "weather": [{"main": "Clear" if h < 14 else "Rain", "id": 800 if h < 14 else 500}],
            "pop": 0.3 if h >= 14 else 0.1,
        }
        for h in range(0, 24, 3)
    ]
}


async def _fetch_openweather_current(lat: float, lng: float, api_key: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{_OPENWEATHER_BASE}/weather",
                params={"lat": lat, "lon": lng, "appid": api_key, "units": "metric"},
            )
            if r.status_code == 200:
                return r.json()
            log.warning("OpenWeather current API returned %s — using mock", r.status_code)
            return _MOCK_CURRENT
    except Exception as exc:
        log.warning("OpenWeather current API error: %s — using mock", exc)
        return _MOCK_CURRENT


async def _fetch_openweather_forecast(lat: float, lng: float, api_key: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{_OPENWEATHER_BASE}/forecast",
                params={"lat": lat, "lon": lng, "appid": api_key, "units": "metric", "cnt": 8},
            )
            if r.status_code == 200:
                return r.json()
            log.warning("OpenWeather forecast API returned %s — using mock", r.status_code)
            return _MOCK_FORECAST
    except Exception as exc:
        log.warning("OpenWeather forecast API error: %s — using mock", exc)
        return _MOCK_FORECAST


async def _get_cached(db: AsyncSession, district_code: str, weather_type: str) -> dict | None:
    now = datetime.now(UTC)
    row = (
        await db.execute(
            select(WeatherCache).where(
                WeatherCache.district_code == district_code,
                WeatherCache.weather_type == weather_type,
                WeatherCache.expires_at > now,
            )
        )
    ).scalar_one_or_none()
    return row.data if row else None


async def _upsert_cache(
    db: AsyncSession,
    district_code: str,
    lat: float,
    lng: float,
    weather_type: str,
    data: dict,
    ttl: int,
) -> None:
    now = datetime.now(UTC)
    stmt = pg_insert(WeatherCache).values(
        district_code=district_code,
        lat=lat,
        lng=lng,
        weather_type=weather_type,
        data=data,
        fetched_at=now,
        expires_at=now + timedelta(seconds=ttl),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["district_code", "weather_type"],
        set_={"data": stmt.excluded.data, "fetched_at": now, "expires_at": stmt.excluded.expires_at},
    )
    await db.execute(stmt)
    await db.commit()


async def _earn_gp_safe(user_id: uuid.UUID, action_code: str, idem_key: str, payload: dict | None = None) -> None:
    try:
        await engine_client.post_event(
            user_uuid=str(user_id),
            action_code=action_code,
            occurred_at=datetime.now(UTC),
            payload=payload or {},
            idem_key=idem_key,
        )
    except Exception as exc:
        log.warning("XP earn failed for %s / %s: %s", action_code, user_id, exc)


# ── Endpoints ────────────────────────────────────────────────────


class WeatherOut(BaseModel):
    location: dict
    current: dict
    forecast: dict
    recommendation: str


@router.get("", response_model=WeatherOut)
async def get_weather(
    lat: float,
    lng: float,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    district = _find_district(lat, lng)
    api_key = await _get_api_key()

    # Current weather
    current_data = await _get_cached(db, district, "current")
    if current_data is None:
        raw = await _fetch_openweather_current(lat, lng, api_key)
        current_data = {
            "temp_c": round(raw["main"]["temp"], 1),
            "feels_like_c": round(raw["main"]["feels_like"], 1),
            "condition": raw["weather"][0]["main"],
            "condition_desc": raw["weather"][0]["description"],
            "emoji": _condition_emoji(raw["weather"][0]["main"]),
            "humidity": raw["main"]["humidity"],
            "wind_kmh": round(raw["wind"]["speed"] * 3.6),
        }
        await _upsert_cache(db, district, lat, lng, "current", current_data, _TTL_CURRENT)

    # Forecast
    forecast_data = await _get_cached(db, district, "forecast_24h")
    if forecast_data is None:
        raw_fc = await _fetch_openweather_forecast(lat, lng, api_key)
        hourly = []
        for item in raw_fc.get("list", [])[:8]:
            pop = int((item.get("pop", 0)) * 100)
            hourly.append(
                {
                    "time": item["dt_txt"][11:16],
                    "temp_c": round(item["main"]["temp"], 1),
                    "condition": item["weather"][0]["main"],
                    "emoji": _condition_emoji(item["weather"][0]["main"]),
                    "rain_prob": pop,
                }
            )
        forecast_data = {"hourly": hourly}
        await _upsert_cache(db, district, lat, lng, "forecast_24h", forecast_data, _TTL_FORECAST_24H)

    rain_prob_1h = forecast_data["hourly"][0]["rain_prob"] if forecast_data["hourly"] else 0

    # XP — 일일 1회
    today = datetime.now(UTC).strftime("%Y%m%d")
    await _earn_gp_safe(user_id, "INFO_WEATHER_VIEW", f"weather-view-{user_id}-{today}")

    return WeatherOut(
        location={"lat": lat, "lng": lng, "district": district},
        current={**current_data, "rain_prob_1h": rain_prob_1h},
        forecast={"next_24h": forecast_data["hourly"]},
        recommendation=_generate_recommendation(rain_prob_1h),
    )


@router.get("/rain-radar")
async def get_rain_radar(lat: float, lng: float, zoom: int = 11):
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(_RAINVIEWER_META_URL)
            r.raise_for_status()
            meta = r.json()
        past = meta.get("radar", {}).get("past", [])
        if not past:
            raise HTTPException(status_code=502, detail="RainViewer data unavailable")
        latest = past[-1]
        ts = latest["time"]
        return {
            "tile_url": f"https://tilecache.rainviewer.com/v2/radar/{ts}/256/{{z}}/{{x}}/{{y}}/2/1_1.png",
            "last_updated": ts,
            "coverage": meta.get("radar", {}).get("coverage"),
        }
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"RainViewer fetch failed: {exc}") from exc


class NotifyRainRequest(BaseModel):
    label: str
    lat: float
    lng: float


@router.post("/notify-rain")
async def register_rain_notify(
    body: NotifyRainRequest,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    existing_count = (
        await db.scalar(
            text("SELECT COUNT(*) FROM user_favorite_location WHERE user_id = :uid"),
            {"uid": str(user_id)},
        )
    ) or 0

    stmt = pg_insert(UserFavoriteLocation).values(
        user_id=user_id,
        label=body.label,
        lat=body.lat,
        lng=body.lng,
        notify_rain=True,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "label"],
        set_={"lat": body.lat, "lng": body.lng, "notify_rain": True},
    )
    await db.execute(stmt)
    await db.commit()

    # XP: 즐겨찾기 등록 (총 3회까지 / 최초 등록만)
    xp_earned = 0
    if existing_count < 3:
        await _earn_gp_safe(user_id, "INFO_FAVORITE_LOCATION", f"fav-loc-{user_id}-{body.label}")
        xp_earned = 10
    # 비 알림 등록 XP (1회)
    await _earn_gp_safe(user_id, "INFO_WEATHER_VIEW", f"rain-notify-{user_id}")

    return {"ok": True, "label": body.label, "xp_earned": xp_earned}
