import html
import logging
import os
import re
import uuid

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..deps import verify_user_session

log = logging.getLogger(__name__)

router = APIRouter(prefix="/info/route", tags=["Info — 경로"])

_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"

# 레거시 Directions API 는 two_wheeler 모드를 지원하지 않는다(driving 으로 근사).
# 추후 오토바이 전용 경로가 필수가 되면 Routes API(computeRoutes, TWO_WHEELER) 로 교체.
_TRAVEL_MODE = "driving"

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _get_api_key() -> str:
    return os.getenv("GOOGLE_MAPS_API_KEY", "").strip()


def _strip_html(text: str) -> str:
    """Directions 의 html_instructions → 평문. <div> 사이는 공백으로."""
    spaced = text.replace("</div>", " ").replace("<div", " <div")
    return html.unescape(_HTML_TAG_RE.sub("", spaced)).strip()


class RouteStep(BaseModel):
    instruction: str
    distance_text: str
    maneuver: str | None = None


class RouteOut(BaseModel):
    # 키 미설정 시 configured=false 만 반환 → 프론트는 기존 폴백(준비 중 안내) 유지.
    configured: bool
    distance_m: int | None = None
    duration_s: int | None = None
    distance_text: str | None = None
    duration_text: str | None = None
    polyline: str | None = None  # Google encoded polyline (overview)
    steps: list[RouteStep] = []


async def _fetch_directions(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float, api_key: str
) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                _DIRECTIONS_URL,
                params={
                    "origin": f"{origin_lat},{origin_lng}",
                    "destination": f"{dest_lat},{dest_lng}",
                    "mode": _TRAVEL_MODE,
                    "language": "ko",
                    "key": api_key,
                },
            )
        if r.status_code != 200:
            log.warning("Directions API HTTP %s", r.status_code)
            return None
        data = r.json()
        if data.get("status") != "OK" or not data.get("routes"):
            log.warning("Directions API status=%s", data.get("status"))
            return None
        return data
    except Exception as exc:
        log.warning("Directions API error: %s", exc)
        return None


@router.get("", response_model=RouteOut)
async def get_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    _user_id: uuid.UUID = Depends(verify_user_session),
):
    """주유소/정비소 카드 [경로] → 출발지(현재 위치)→목적지 경로 미리보기.

    GOOGLE_MAPS_API_KEY 가 .env 에 설정되면 즉시 활성화된다(코드 변경 불필요).
    키가 없거나 Google 호출이 실패하면 configured=false 로 graceful 폴백한다.
    """
    api_key = _get_api_key()
    if not api_key:
        return RouteOut(configured=False)

    data = await _fetch_directions(origin_lat, origin_lng, dest_lat, dest_lng, api_key)
    if data is None:
        return RouteOut(configured=False)

    leg = data["routes"][0]["legs"][0]
    steps = [
        RouteStep(
            instruction=_strip_html(s.get("html_instructions", "")),
            distance_text=s.get("distance", {}).get("text", ""),
            maneuver=s.get("maneuver"),
        )
        for s in leg.get("steps", [])
    ]
    return RouteOut(
        configured=True,
        distance_m=leg.get("distance", {}).get("value"),
        duration_s=leg.get("duration", {}).get("value"),
        distance_text=leg.get("distance", {}).get("text"),
        duration_text=leg.get("duration", {}).get("text"),
        polyline=data["routes"][0].get("overview_polyline", {}).get("points"),
        steps=steps,
    )
