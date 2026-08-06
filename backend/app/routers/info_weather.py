import asyncio
import logging
import os
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta, timezone

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
from ..services.coordinates import Latitude, Longitude
from ..services.redis_cache import get_client
from .map._geo import find_district_by_point

log = logging.getLogger(__name__)

router = APIRouter(prefix="/info/weather", tags=["Info — 날씨"])

_OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"
_RAINVIEWER_META_URL = "https://api.rainviewer.com/public/weather-maps.json"
# 시간단위 강수확률 보조 소스 (키 불요). OpenWeather 2.5 /forecast 는 3시간 스텝이라 그 첫
# 버킷 pop 을 "1시간 내 확률"로 쓰면 최대 3시간 뒤 값이 표시된다 — 호치민 우기의 국지 소나기
# 에서 이 오차가 "비 오는데 0%"로 드러났다(2026-08-03 대표 지적: 20:15 실제 강수 중 앱 0%,
# 같은 시각 OpenWeather 12h 전 구간 0% / open-meteo 향후 1h 37%).
# OpenWeather 3시간 pop 은 폴백으로 유지한다 — 보조 소스 실패가 화면 실패로 번지지 않게.
_OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast"

# 베트남 현지시각(ICT, UTC+7). 예보 시각 라벨은 이 기준으로 내려보낸다 — OpenWeather 의
# dt_txt 는 UTC 벽시계라 그대로 넘기면 화면에 UTC 시각이 찍힌다(대표 지적 2026-08-06).
ICT = timezone(timedelta(hours=7))

_TTL_CURRENT = int(os.getenv("WEATHER_CACHE_TTL_CURRENT", "600"))
_TTL_FORECAST_1H = int(os.getenv("WEATHER_CACHE_TTL_FORECAST_1H", "1800"))
_TTL_FORECAST_24H = int(os.getenv("WEATHER_CACHE_TTL_FORECAST_24H", "3600"))
_SINGLEFLIGHT_LOCK_TTL = 15
_SINGLEFLIGHT_WAIT_SECONDS = 12.0
_FAILURE_MARKER_TTL = 5
_local_weather_locks: dict[str, asyncio.Lock] = {}
_local_weather_failures: dict[str, float] = {}


def _grid_code(lat: float, lng: float) -> str:
    """1km 그리드 코드 (캐시 키). 좌표를 0.01도 단위로 스냅."""
    return f"{round(lat, 2)}_{round(lng, 2)}"


def _with_provenance(
    data: dict,
    *,
    fetched_at: datetime,
    stale: bool,
    error: str | None,
) -> dict:
    return {
        **data,
        "_source": "OPENWEATHER",
        "_observed_at": data.get("_observed_at"),
        "_fetched_at": fetched_at.isoformat(),
        "_stale": stale,
        "_error": error,
    }


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


def _recommendation_code(rain_prob_1h: int) -> str:
    """라이딩 추천 코드. 문구는 프론트가 i18n 으로 번역(rain_prob_1h 는 current 에 동봉).

    임계값(80/50 → 70/30)은 강수확률 소스가 OpenWeather 3시간 버킷에서 open-meteo 시간단위로
    바뀐 것에 맞춘 재조정이다. 3시간 창의 50% 와 1시간 창의 50% 는 전혀 다른 사건이고,
    호치민 우기의 국지 소나기는 1시간 30% 만으로도 라이더에게 실질 위험이다 — 실제로
    26% 구간이 "강수 없음"으로 표시되던 것이 2026-08-03 사고의 잔여 표면이었다.
    """
    if rain_prob_1h >= 70:
        return "RAIN_HIGH"
    if rain_prob_1h >= 30:
        return "RAIN_MED"
    return "CLEAR"


async def _get_api_key() -> str:
    key = os.getenv("OPENWEATHER_API_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Weather service not configured")
    return key


async def _fetch_openweather_current(lat: float, lng: float, api_key: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{_OPENWEATHER_BASE}/weather",
                params={"lat": lat, "lon": lng, "appid": api_key, "units": "metric"},
            )
    except httpx.RequestError as exc:
        log.warning("OpenWeather current API request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Weather data unavailable") from exc
    if r.status_code != 200:
        log.warning("OpenWeather current API returned %s", r.status_code)
        raise HTTPException(status_code=502, detail="Weather data unavailable")
    return r.json()


async def _fetch_openweather_forecast(lat: float, lng: float, api_key: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{_OPENWEATHER_BASE}/forecast",
                params={"lat": lat, "lon": lng, "appid": api_key, "units": "metric", "cnt": 8},
            )
    except httpx.RequestError as exc:
        log.warning("OpenWeather forecast API request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Weather forecast unavailable") from exc
    if r.status_code != 200:
        log.warning("OpenWeather forecast API returned %s", r.status_code)
        raise HTTPException(status_code=502, detail="Weather forecast unavailable")
    return r.json()


async def _fetch_openmeteo_rain_prob_1h(lat: float, lng: float) -> int | None:
    """향후 1시간 강수확률(%). 보조 소스이므로 실패 시 예외를 올리지 않고 None 을 돌려준다."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                _OPENMETEO_URL,
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "hourly": "precipitation_probability",
                    "forecast_hours": 2,
                    "timezone": "UTC",
                },
            )
        if r.status_code != 200:
            log.warning("open-meteo returned %s", r.status_code)
            return None
        probs = r.json().get("hourly", {}).get("precipitation_probability") or []
    except (httpx.RequestError, ValueError) as exc:
        log.warning("open-meteo request failed: %s", exc)
        return None
    # 첫 두 시간 중 최대값 — 정시 경계 직전에 다음 시간 확률이 더 실효적이라 보수적으로 택한다.
    values = [int(p) for p in probs[:2] if p is not None]
    return max(values) if values else None


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
    return _with_provenance(row.data, fetched_at=row.fetched_at, stale=False, error=None) if row else None


async def _get_stale_cached(db: AsyncSession, cache_key: str, weather_type: str) -> dict | None:
    row = (
        await db.execute(
            select(WeatherCache)
            .where(
                WeatherCache.district_code == cache_key,
                WeatherCache.weather_type == weather_type,
            )
            .order_by(WeatherCache.fetched_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    return _with_provenance(
        row.data,
        fetched_at=row.fetched_at,
        stale=True,
        error="UPSTREAM_UNAVAILABLE",
    )


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


async def _release_weather_lock(client, key: str, token: str) -> None:
    try:
        await client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            key,
            token,
        )
    except Exception as exc:
        log.warning("Weather single-flight lock release failed: %s", exc)


async def _cached_or_singleflight(
    db: AsyncSession,
    *,
    district: str,
    lat: float,
    lng: float,
    weather_type: str,
    ttl: int,
    producer: Callable[[], Awaitable[dict]],
) -> dict:
    cached = await _get_cached(db, district, weather_type)
    if cached is not None:
        return cached

    local_key = f"{district}:{weather_type}"
    local_lock = _local_weather_locks.setdefault(local_key, asyncio.Lock())
    async with local_lock:
        cached = await _get_cached(db, district, weather_type)
        if cached is not None:
            return cached
        if _local_weather_failures.get(local_key, 0) > asyncio.get_running_loop().time():
            raise HTTPException(status_code=502, detail="Weather data unavailable")

        redis_client = None
        redis_key = f"saigon:weather:singleflight:{local_key}"
        failure_key = f"saigon:weather:failure:{local_key}"
        token = uuid.uuid4().hex
        acquired = True
        try:
            redis_client = await get_client()
            if await redis_client.get(failure_key):
                raise HTTPException(status_code=502, detail="Weather data unavailable")
            acquired = bool(await redis_client.set(redis_key, token, nx=True, ex=_SINGLEFLIGHT_LOCK_TTL))
        except HTTPException:
            raise
        except Exception as exc:
            log.warning("Weather single-flight Redis unavailable; using local lock: %s", exc)

        if not acquired:
            deadline = asyncio.get_running_loop().time() + _SINGLEFLIGHT_WAIT_SECONDS
            while asyncio.get_running_loop().time() < deadline:
                await asyncio.sleep(0.1)
                cached = await _get_cached(db, district, weather_type)
                if cached is not None:
                    return cached
            raise HTTPException(status_code=503, detail="Weather refresh in progress")

        try:
            produced = await producer()
            data = _with_provenance(
                produced,
                fetched_at=datetime.now(UTC),
                stale=False,
                error=None,
            )
            await _upsert_cache(db, district, lat, lng, weather_type, data, ttl)
            _local_weather_failures.pop(local_key, None)
            return data
        except Exception:
            _local_weather_failures[local_key] = asyncio.get_running_loop().time() + _FAILURE_MARKER_TTL
            if redis_client is not None:
                try:
                    await redis_client.set(failure_key, "1", ex=_FAILURE_MARKER_TTL)
                except Exception as exc:
                    log.warning("Weather failure marker write failed: %s", exc)
            raise
        finally:
            if redis_client is not None:
                await _release_weather_lock(redis_client, redis_key, token)


async def _earn_gp_safe(user_id: uuid.UUID, action_code: str, idem_key: str, payload: dict | None = None) -> bool:
    """부가 보상 적립 — 실패해도 본 요청은 성공시키되 로그를 남긴다 (suppress 침묵 소실 금지)."""
    return await engine_client.post_event_safe(
        user_uuid=str(user_id),
        action_code=action_code,
        occurred_at=datetime.now(UTC),
        payload=payload or {},
        idem_key=idem_key,
    )


# ── Endpoints ────────────────────────────────────────────────────


class WeatherOut(BaseModel):
    location: dict
    current: dict
    forecast: dict
    recommendation_code: str  # CLEAR | RAIN_MED | RAIN_HIGH — 프론트 i18n 번역
    source: str
    observed_at: str | None
    fetched_at: str
    stale: bool
    error: str | None


@router.get("", response_model=WeatherOut)
async def get_weather(
    lat: Latitude,
    lng: Longitude,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    district = await find_district_by_point(db, lat, lng) or _grid_code(lat, lng)
    # OpenWeather는 좌표 질의이므로 행정구 전체가 아닌 실제 0.01° grid가 cache identity다.
    cache_key = _grid_code(lat, lng)
    api_key = await _get_api_key()

    async def produce_current() -> dict:
        raw = await _fetch_openweather_current(lat, lng, api_key)
        return {
            "temp_c": round(raw["main"]["temp"], 1),
            "feels_like_c": round(raw["main"]["feels_like"], 1),
            "condition": raw["weather"][0]["main"],
            "condition_desc": raw["weather"][0]["description"],
            "emoji": _condition_emoji(raw["weather"][0]["main"]),
            "humidity": raw["main"]["humidity"],
            "wind_kmh": round(raw["wind"]["speed"] * 3.6),
            "_observed_at": datetime.fromtimestamp(raw["dt"], UTC).isoformat() if raw.get("dt") else None,
        }

    try:
        current_data = await _cached_or_singleflight(
            db,
            district=cache_key,
            lat=lat,
            lng=lng,
            weather_type="current",
            ttl=_TTL_CURRENT,
            producer=produce_current,
        )
    except HTTPException:
        current_data = await _get_stale_cached(db, cache_key, "current")
        if current_data is None:
            raise

    async def produce_forecast() -> dict:
        raw_fc = await _fetch_openweather_forecast(lat, lng, api_key)
        hourly = []
        for item in raw_fc.get("list", [])[:8]:
            pop = int((item.get("pop", 0)) * 100)
            hourly.append(
                {
                    # dt(unix) → ICT "HH:MM". dt_txt[11:16] 는 UTC 문자열이라 쓰지 않는다.
                    "time": datetime.fromtimestamp(item["dt"], ICT).strftime("%H:%M"),
                    "temp_c": round(item["main"]["temp"], 1),
                    "condition": item["weather"][0]["main"],
                    "emoji": _condition_emoji(item["weather"][0]["main"]),
                    "rain_prob": pop,
                }
            )
        observed_at = raw_fc.get("list", [{}])[0].get("dt") if raw_fc.get("list") else None
        return {
            "hourly": hourly,
            "_observed_at": datetime.fromtimestamp(observed_at, UTC).isoformat() if observed_at else None,
        }

    try:
        forecast_data = await _cached_or_singleflight(
            db,
            district=cache_key,
            lat=lat,
            lng=lng,
            weather_type="forecast_24h",
            ttl=_TTL_FORECAST_24H,
            producer=produce_forecast,
        )
    except HTTPException:
        forecast_data = await _get_stale_cached(db, cache_key, "forecast_24h")
        if forecast_data is None:
            raise

    # 강수확률 — 1순위: open-meteo 시간단위(진짜 1시간). 실패 시 OpenWeather 3시간 버킷으로 폴백하고,
    # 창(window) 길이를 함께 내려 프론트가 "1시간/3시간"을 정직하게 라벨링하게 한다.
    async def produce_rain_prob() -> dict:
        prob = await _fetch_openmeteo_rain_prob_1h(lat, lng)
        if prob is None:
            raise HTTPException(status_code=502, detail="Rain probability unavailable")
        return {"rain_prob": prob, "window_h": 1}

    try:
        rain_prob_data = await _cached_or_singleflight(
            db,
            district=cache_key,
            lat=lat,
            lng=lng,
            weather_type="rain_prob_1h",
            ttl=_TTL_FORECAST_1H,
            producer=produce_rain_prob,
        )
        rain_prob_1h = int(rain_prob_data["rain_prob"])
        rain_prob_window_h = 1
    except HTTPException:
        rain_prob_1h = forecast_data["hourly"][0]["rain_prob"] if forecast_data["hourly"] else 0
        rain_prob_window_h = 3

    # XP — 일일 1회
    today = datetime.now(UTC).strftime("%Y%m%d")
    await _earn_gp_safe(user_id, "INFO_WEATHER_VIEW", f"weather-view-{user_id}-{today}")

    stale = bool(current_data["_stale"] or forecast_data["_stale"])
    fetched_at = min(current_data["_fetched_at"], forecast_data["_fetched_at"])
    error = "UPSTREAM_UNAVAILABLE" if stale else None
    current_public = {k: v for k, v in current_data.items() if not k.startswith("_")}
    forecast_public = {k: v for k, v in forecast_data.items() if not k.startswith("_")}
    return WeatherOut(
        location={"lat": lat, "lng": lng, "district": district},
        current={**current_public, "rain_prob_1h": rain_prob_1h, "rain_prob_window_h": rain_prob_window_h},
        forecast={"next_24h": forecast_public["hourly"]},
        recommendation_code="UNCERTAIN" if stale else _recommendation_code(rain_prob_1h),
        source="OPENWEATHER",
        observed_at=current_data.get("_observed_at"),
        fetched_at=fetched_at,
        stale=stale,
        error=error,
    )


@router.get("/rain-radar")
async def get_rain_radar(lat: Latitude, lng: Longitude, zoom: int = 11):
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
        # 타일 경로는 메타의 해시 path(`/v2/radar/5dd0a0746884`)여야 한다 — 과거엔 여기에
        # timestamp 를 넣어 모든 타일이 "Zoom Level Not Supported" 플레이스홀더로 돌아왔고,
        # 그래서 이 엔드포인트는 소비처 없이 사장돼 있었다(2026-08-03 발견).
        host = meta.get("host") or "https://tilecache.rainviewer.com"
        path = latest.get("path")
        if not path:
            raise HTTPException(status_code=502, detail="RainViewer data unavailable")
        return {
            "tile_url": f"{host}{path}/256/{{z}}/{{x}}/{{y}}/2/1_1.png",
            "last_updated": ts,
            "coverage": meta.get("radar", {}).get("coverage"),
            # 무키(free) 티어는 z<=7 만 실제 타일을 준다(그 위는 플레이스홀더). API 키가 있으면
            # 더 확대할 수 있어 값을 분기한다 — 프론트는 이 값으로 모자이크 줌을 정한다.
            "max_zoom": 10 if os.getenv("RAINVIEWER_API_KEY") else 7,
        }
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"RainViewer fetch failed: {exc}") from exc


class NotifyRainRequest(BaseModel):
    label: str
    lat: Latitude
    lng: Longitude


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
