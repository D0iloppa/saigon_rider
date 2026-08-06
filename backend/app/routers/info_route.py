import logging
import os
import uuid
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import verify_user_session
from ..services.coordinates import Latitude, Longitude
from ..services.redis_cache import get_client

# DEV_DONGTAN_PIN: 한국 실기기 카메라연출 검증용 DRIVE 모드 허용 게이트 재사용 (auth.py 화이트리스트).
# 실기기 검증 완료 후 제거 대상 (2026-08-07).
from .auth import _DEV_MODE

log = logging.getLogger(__name__)

router = APIRouter(prefix="/info/route", tags=["Info — 경로"])

_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_FIELD_MASK = ",".join(
    [
        "routes.distanceMeters",
        "routes.duration",
        "routes.polyline.encodedPolyline",
        "routes.legs.steps.distanceMeters",
        "routes.legs.steps.navigationInstruction.instructions",
        "routes.legs.steps.navigationInstruction.maneuver",
    ]
)
_CACHE_TTL_SEC = 60
_RATE_LIMIT = 10
_RATE_WINDOW_SEC = 60

_routes_client: httpx.AsyncClient | None = None


def _get_api_key() -> str:
    return os.getenv("GOOGLE_MAPS_API_KEY", "").strip()


async def _get_http_client() -> httpx.AsyncClient:
    global _routes_client
    if _routes_client is None:
        _routes_client = httpx.AsyncClient(timeout=10.0)
    return _routes_client


async def close_route_client() -> None:
    global _routes_client
    if _routes_client is not None:
        await _routes_client.aclose()
        _routes_client = None


def _duration_seconds(value: str | None) -> int | None:
    if not value or not value.endswith("s"):
        return None
    try:
        return round(float(value[:-1]))
    except ValueError:
        return None


def _format_distance(distance_m: int | None) -> str | None:
    if distance_m is None:
        return None
    if distance_m < 1000:
        return f"{distance_m} m"
    return f"{distance_m / 1000:.1f} km"


def _format_duration(duration_s: int | None) -> str | None:
    if duration_s is None:
        return None
    minutes = max(1, round(duration_s / 60))
    if minutes < 60:
        return f"{minutes} min"
    hours, remainder = divmod(minutes, 60)
    return f"{hours} h {remainder} min" if remainder else f"{hours} h"


class RouteStep(BaseModel):
    instruction: str
    distance_text: str
    maneuver: str | None = None


class RouteOut(BaseModel):
    configured: bool
    route_mode: Literal["two_wheeler"] = "two_wheeler"
    distance_m: int | None = None
    duration_s: int | None = None
    distance_text: str | None = None
    duration_text: str | None = None
    polyline: str | None = None
    steps: list[RouteStep] = Field(default_factory=list)


def _cache_key(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float, lang: str, mode: str = "TWO_WHEELER"
) -> str:
    # DEV_DONGTAN_PIN: mode 를 키에 포함 — 없으면 TWO_WHEELER/DRIVE 응답이 서로의 캐시를 오염시킨다.
    # 실기기 검증 완료 후 제거 대상 (2026-08-07).
    return f"saigon:route:v2:{lang}:{mode}:{origin_lat:.3f}:{origin_lng:.3f}:{dest_lat:.5f}:{dest_lng:.5f}"


async def _enforce_rate_limit(user_id: uuid.UUID) -> None:
    try:
        client = await get_client()
        key = f"saigon:route:rate:{user_id}"
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, _RATE_WINDOW_SEC)
        if count > _RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Route request limit exceeded")
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Route rate limit unavailable; allowing request: %s", exc)


async def _get_cached_route(key: str) -> RouteOut | None:
    try:
        client = await get_client()
        raw = await client.get(key)
        return RouteOut.model_validate_json(raw) if raw else None
    except Exception as exc:
        log.warning("Route cache read failed: %s", exc)
        return None


async def _set_cached_route(key: str, route: RouteOut) -> None:
    try:
        client = await get_client()
        await client.set(key, route.model_dump_json(), ex=_CACHE_TTL_SEC)
    except Exception as exc:
        log.warning("Route cache write failed: %s", exc)


async def _fetch_directions(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    api_key: str,
    lang: str,
    mode: str = "TWO_WHEELER",  # DEV_DONGTAN_PIN: dev 전용 DRIVE 보험 — 실기기 검증 후 제거 (2026-08-07)
) -> dict | None:
    client = await _get_http_client()
    try:
        response = await client.post(
            _ROUTES_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": _FIELD_MASK,
            },
            json={
                "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}},
                "destination": {"location": {"latLng": {"latitude": dest_lat, "longitude": dest_lng}}},
                "travelMode": mode,
                "languageCode": lang,
                "units": "METRIC",
            },
        )
    except httpx.RequestError as exc:
        log.warning("Routes API request failed: %s", exc)
        return None
    if response.status_code != 200:
        log.warning("Routes API HTTP %s", response.status_code)
        return None
    data = response.json()
    return data if data.get("routes") else None


def _to_route_out(data: dict) -> RouteOut:
    route = data["routes"][0]
    leg = (route.get("legs") or [{}])[0]
    distance_m = route.get("distanceMeters")
    duration_s = _duration_seconds(route.get("duration"))
    steps = []
    for step in leg.get("steps", []):
        navigation = step.get("navigationInstruction", {})
        step_distance = step.get("distanceMeters")
        steps.append(
            RouteStep(
                instruction=navigation.get("instructions", ""),
                distance_text=_format_distance(step_distance) or "",
                maneuver=navigation.get("maneuver"),
            )
        )
    return RouteOut(
        configured=True,
        distance_m=distance_m,
        duration_s=duration_s,
        distance_text=_format_distance(distance_m),
        duration_text=_format_duration(duration_s),
        polyline=route.get("polyline", {}).get("encodedPolyline"),
        steps=steps,
    )


@router.get("", response_model=RouteOut)
async def get_route(
    origin_lat: Latitude,
    origin_lng: Longitude,
    dest_lat: Latitude,
    dest_lng: Longitude,
    user_id: uuid.UUID = Depends(verify_user_session),
    lang: Literal["ko", "en", "vi"] = "vi",
    # DEV_DONGTAN_PIN: 한국 실기기 카메라연출 검증용 DRIVE 모드 보험 — TWO_WHEELER 가 한국 좌표를
    # 지원하지 않을 가능성 대비. dev(_DEV_MODE) 아니면 무시하고 항상 TWO_WHEELER(fail-closed).
    # 실기기 검증 완료 후 이 파라미터를 제거할 것 (2026-08-07).
    travel_mode: Literal["TWO_WHEELER", "DRIVE"] | None = None,
):
    """현재 위치에서 목적지까지 오토바이 경로 미리보기를 반환한다."""
    api_key = _get_api_key()
    if not api_key:
        return RouteOut(configured=False)

    mode = travel_mode if (travel_mode == "DRIVE" and _DEV_MODE) else "TWO_WHEELER"

    key = _cache_key(origin_lat, origin_lng, dest_lat, dest_lng, lang, mode)
    cached = await _get_cached_route(key)
    if cached is not None:
        return cached

    await _enforce_rate_limit(user_id)
    data = await _fetch_directions(origin_lat, origin_lng, dest_lat, dest_lng, api_key, lang, mode)
    if data is None:
        return RouteOut(configured=False)

    result = _to_route_out(data)
    await _set_cached_route(key, result)
    return result
