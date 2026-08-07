"""자체호스팅 Valhalla 라우팅 엔진 클라이언트 + `RouteOut` 페이로드 변환.

Google Routes API 폴백 체이닝의 1차 경로(`ai-docs/context/routing-engine.md` 참조).
`ROUTING_ENGINE_URL` 이 설정된 경우에만 `routers/info_route.py` 가 이 모듈을 호출한다.

vi/ko 안내 문구 템플릿 출처 및 라이선스:
    Project-OSRM/osrm-text-instructions (github.com/Project-OSRM/osrm-text-instructions)
    languages/translations/vi.json, ko.json
    License: BSD-2-Clause — Copyright (c) 2016, Project OSRM contributors. All rights reserved.
    (재배포 조건 충족: 이 파일에 원 저작권 고지를 유지한다.)
    Valhalla 의 `maneuvers[].type` 은 정수 코드이고 OSRM 의 type+modifier 조합과 체계가
    달라, 원문 그대로 복사가 아니라 문장 구조·어휘를 Valhalla type 별로 재매핑했다.
"""

from __future__ import annotations

import logging
from typing import Literal

import httpx

log = logging.getLogger(__name__)

_ENGINE_TIMEOUT_SEC = 5.0
_COSTING = "motorcycle"  # 실측으로 결정됨 (ai-docs/context/routing-engine.md §3-D)

_engine_client: httpx.AsyncClient | None = None


async def _get_engine_client() -> httpx.AsyncClient:
    global _engine_client
    if _engine_client is None:
        _engine_client = httpx.AsyncClient(timeout=_ENGINE_TIMEOUT_SEC)
    return _engine_client


async def close_engine_client() -> None:
    global _engine_client
    if _engine_client is not None:
        await _engine_client.aclose()
        _engine_client = None


async def fetch_trip(
    engine_url: str, origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float
) -> dict | None:
    """Valhalla `/route` 를 호출해 `trip` 객체를 반환한다.

    폴백 게이트 2조건(타임아웃 / 경로 미발견)에 해당하면 None — 호출부가 Google 로 넘어간다.
    """
    client = await _get_engine_client()
    try:
        response = await client.post(
            f"{engine_url.rstrip('/')}/route",
            json={
                "locations": [
                    {"lat": origin_lat, "lon": origin_lng},
                    {"lat": dest_lat, "lon": dest_lng},
                ],
                "costing": _COSTING,
                "units": "kilometers",
            },
        )
    except httpx.TimeoutException:
        log.warning("routing engine: 타임아웃 초과 — Google 폴백")
        return None
    except httpx.RequestError as exc:
        log.warning("routing engine: 요청 실패(%s) — Google 폴백", exc)
        return None

    if response.status_code != 200:
        log.warning("routing engine: HTTP %s — Google 폴백", response.status_code)
        return None

    trip = response.json().get("trip")
    if not trip or trip.get("status") != 0:
        log.info(
            "routing engine: 경로 미발견(status=%s) — Google 폴백",
            trip.get("status") if trip else None,
        )
        return None
    return trip


# --- polyline precision 6 → 5 변환 ---------------------------------------


def decode_polyline(encoded: str, precision: int) -> list[tuple[float, float]]:
    """표준 폴리라인 알고리즘 디코더 (precision 자리수 가변, Valhalla 는 6)."""
    factor = 10**precision
    coords: list[tuple[float, float]] = []
    index, lat, lng = 0, 0, 0
    length = len(encoded)
    while index < length:
        for is_lat in (True, False):
            shift = result = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else (result >> 1)
            if is_lat:
                lat += delta
            else:
                lng += delta
        coords.append((lat / factor, lng / factor))
    return coords


def _encode_value(value: int) -> str:
    value = ~(value << 1) if value < 0 else (value << 1)
    chunks = []
    while value >= 0x20:
        chunks.append(chr((0x20 | (value & 0x1F)) + 63))
        value >>= 5
    chunks.append(chr(value + 63))
    return "".join(chunks)


def encode_polyline(coords: list[tuple[float, float]], precision: int) -> str:
    """표준 폴리라인 인코더 (precision 5 = 프론트 `polyline.ts` 고정 디코드 자리수)."""
    factor = 10**precision
    output = []
    prev_lat = prev_lng = 0
    for lat, lng in coords:
        lat_i = round(lat * factor)
        lng_i = round(lng * factor)
        output.append(_encode_value(lat_i - prev_lat))
        output.append(_encode_value(lng_i - prev_lng))
        prev_lat, prev_lng = lat_i, lng_i
    return "".join(output)


def merge_and_reencode_shapes(shapes: list[str]) -> str:
    """여러 leg 의 precision6 `shape` 를 이어붙여 precision5 폴리라인으로 재인코딩한다.

    leg 경계 좌표는 다음 leg 의 시작점과 이전 leg 의 끝점이 동일하므로 중복 제거한다.
    """
    all_coords: list[tuple[float, float]] = []
    for shape in shapes:
        coords = decode_polyline(shape, precision=6)
        if all_coords and coords and coords[0] == all_coords[-1]:
            coords = coords[1:]
        all_coords.extend(coords)
    return encode_polyline(all_coords, precision=5)


# --- maneuver type(정수) → 프론트 문자열 매핑 -----------------------------
# ai-docs/context/routing-engine.md §4-B 실측표 + Valhalla 공식 enum(미관측분 포함)

_MANEUVER_STRINGS: dict[int, str] = {
    0: "straight",  # kNone
    1: "straight",  # kStart
    2: "straight",  # kStartRight
    3: "straight",  # kStartLeft (실측: 방위 출발, "Drive northeast." 등)
    4: "straight",  # kDestination — isLast 로 프론트가 별도 처리
    5: "destination-right",  # kDestinationRight
    6: "destination-left",  # kDestinationLeft
    7: "straight",  # kBecomes
    8: "straight",  # kContinue
    9: "turn-slight-right",  # kSlightRight
    10: "turn-right",  # kRight
    11: "turn-sharp-right",  # kSharpRight
    12: "uturn-right",  # kUturnRight (미관측, 공식 enum)
    13: "uturn-left",  # kUturnLeft (미관측, 공식 enum)
    14: "turn-sharp-left",  # kSharpLeft
    15: "turn-left",  # kLeft
    16: "turn-slight-left",  # kSlightLeft
    17: "ramp-straight",  # kRampStraight
    18: "ramp-right",  # kRampRight
    19: "ramp-left",  # kRampLeft
    20: "exit-right",  # kExitRight
    21: "exit-left",  # kExitLeft
    22: "stay-straight",  # kStayStraight
    23: "stay-right",  # kStayRight
    24: "stay-left",  # kStayLeft
    25: "merge",  # kMerge
    26: "roundabout-enter",  # kRoundaboutEnter
    27: "roundabout-exit",  # kRoundaboutExit
    28: "ferry-enter",  # kFerryEnter
    29: "ferry-exit",  # kFerryExit
    30: "straight",  # kTransit (모터사이클 costing 에서는 미출현)
    31: "straight",  # kTransitTransfer
    32: "straight",  # kTransitRemainOn
    33: "straight",  # kTransitConnectionStart
    34: "straight",  # kTransitConnectionTransfer
    35: "straight",  # kTransitConnectionDestination
    36: "straight",  # kPostTransitConnectionDestination
}


def maneuver_string(valhalla_type: int) -> str:
    return _MANEUVER_STRINGS.get(valhalla_type, "straight")


# --- vi/ko 문구 템플릿 (OSRM vi.json/ko.json 문장 구조 참고 재매핑) -------

_TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "turn-left": {
        "vi": {"with": "Quẹo trái vào {street}", "without": "Quẹo trái"},
        "ko": {"with": "좌회전 하시고 {street}로 가세요.", "without": "좌회전 하세요."},
    },
    "turn-right": {
        "vi": {"with": "Quẹo phải vào {street}", "without": "Quẹo phải"},
        "ko": {"with": "우회전 하시고 {street}로 가세요.", "without": "우회전 하세요."},
    },
    "turn-slight-left": {
        "vi": {"with": "Nghiêng về bên trái để chạy tiếp trên {street}", "without": "Nghiêng về bên trái"},
        "ko": {"with": "약간 좌회전 하고 {street}로 가세요.", "without": "약간 좌회전하세요."},
    },
    "turn-slight-right": {
        "vi": {"with": "Nghiêng về bên phải để chạy tiếp trên {street}", "without": "Nghiêng về bên phải"},
        "ko": {"with": "약간 우회전 하고 {street}로 가세요.", "without": "약간 우회전하세요."},
    },
    "turn-sharp-left": {
        "vi": {"with": "Quẹo gắt bên trái để chạy tiếp trên {street}", "without": "Quẹo gắt bên trái"},
        "ko": {"with": "급좌회전 하신 후 {street}로 가세요.", "without": "급좌회전 하세요."},
    },
    "turn-sharp-right": {
        "vi": {"with": "Quẹo gắt bên phải để chạy tiếp trên {street}", "without": "Quẹo gắt bên phải"},
        "ko": {"with": "급우회전 하고 {street}로 가세요.", "without": "급우회전 하세요."},
    },
    "uturn-left": {
        "vi": {"with": "Quẹo ngược lại trên {street}", "without": "Quẹo ngược lại"},
        "ko": {"with": "유턴해서 {street}로 가세요.", "without": "유턴 하세요."},
    },
    "uturn-right": {
        "vi": {"with": "Quẹo ngược lại trên {street}", "without": "Quẹo ngược lại"},
        "ko": {"with": "유턴해서 {street}로 가세요.", "without": "유턴 하세요."},
    },
    "straight": {
        "vi": {"with": "Chạy tiếp trên {street}", "without": "Chạy thẳng"},
        "ko": {"with": "{street} 로 계속 직진해 주세요.", "without": "계속 직진해 주세요."},
    },
    "ramp-left": {
        "vi": {"with": "Đi đường nhánh {street} bên trái", "without": "Đi đường nhánh bên trái"},
        "ko": {"with": "왼쪽의 램프로 진출해서 {street}로 가세요.", "without": "왼쪽의 램프로 진출해 주세요."},
    },
    "ramp-right": {
        "vi": {"with": "Đi đường nhánh {street} bên phải", "without": "Đi đường nhánh bên phải"},
        "ko": {"with": "오른쪽의 램프로 진출해서 {street}로 가세요.", "without": "오른쪽의 램프로 진출해 주세요."},
    },
    "ramp-straight": {
        "vi": {"with": "Đi đường nhánh {street}", "without": "Đi đường nhánh"},
        "ko": {"with": "램프로 진출해서 {street}로 가세요.", "without": "램프로 진출해 주세요."},
    },
    "exit-left": {
        "vi": {"with": "Đi đường nhánh {street} bên trái", "without": "Đi đường nhánh bên trái"},
        "ko": {"with": "왼쪽의 램프로 진출해서 {street}로 가세요.", "without": "왼쪽의 램프로 진출해 주세요."},
    },
    "exit-right": {
        "vi": {"with": "Đi đường nhánh {street} bên phải", "without": "Đi đường nhánh bên phải"},
        "ko": {"with": "오른쪽의 램프로 진출해서 {street}로 가세요.", "without": "오른쪽의 램프로 진출해 주세요."},
    },
    "stay-left": {
        "vi": {"with": "Giữ bên trái vào {street}", "without": "Nghiêng về bên trái ở ngã ba"},
        "ko": {"with": "좌회전 해서 {street}로 가세요.", "without": "갈림길에서 좌회전 하세요."},
    },
    "stay-right": {
        "vi": {"with": "Giữ bên phải vào {street}", "without": "Nghiêng về bên phải ở ngã ba"},
        "ko": {"with": "우회전 해서 {street}로 가세요.", "without": "갈림길에서 우회전 하세요."},
    },
    "stay-straight": {
        "vi": {"with": "Chạy tiếp trên {street}", "without": "Chạy thẳng"},
        "ko": {"with": "{street}로 계속 가세요.", "without": "직진해주세요."},
    },
    "merge": {
        "vi": {"with": "Nhập vào {street}", "without": "Nhập đường"},
        "ko": {"with": "{street}로 합류하세요.", "without": "합류"},
    },
    "roundabout-enter": {
        "vi": {"with": "Đi vào vòng xuyến và ra tại {street}", "without": "Đi vào vòng xuyến"},
        "ko": {"with": "로터리로 진입해서 {street} 나가세요.", "without": "로터리로 진입하세요."},
    },
    "roundabout-exit": {
        "vi": {"with": "Ra bùng binh vào {street}", "without": "Ra bùng binh"},
        "ko": {"with": "로타리에서 진출해서 {street}로 가세요.", "without": "로타리에서 진출하세요."},
    },
    "ferry-enter": {
        "vi": {"with": "Lên phà {street}", "without": "Lên phà"},
        "ko": {"with": "페리를 타시오 {street}", "without": "페리를 타시오"},
    },
    "ferry-exit": {
        # OSRM 에 ferry-exit 전용 문구가 없어 "계속 직진" 계열로 근사 처리 (§ 모듈 docstring 참조)
        "vi": {"with": "Chạy tiếp trên {street}", "without": "Chạy thẳng"},
        "ko": {"with": "{street} 로 계속 직진해 주세요.", "without": "계속 직진해 주세요."},
    },
    "destination-left": {
        "vi": {"with": "Đến {street} ở bên trái", "without": "Đến nơi ở bên trái"},
        "ko": {"with": "좌측에 {street}에 도착하였습니다.", "without": "좌측에 도착하였습니다."},
    },
    "destination-right": {
        "vi": {"with": "Đến {street} ở bên phải", "without": "Đến nơi ở bên phải"},
        "ko": {"with": "우측에 {street}에 도착하였습니다.", "without": "우측에 도착하였습니다."},
    },
}


def render_instruction(bucket: str, street: str | None, lang: Literal["vi", "ko"]) -> str:
    templates = _TEMPLATES.get(bucket, _TEMPLATES["straight"])[lang]
    if street:
        return templates["with"].format(street=street)
    return templates["without"]


# --- RouteOut 페이로드 조립 -------------------------------------------------


def _format_distance_m(distance_m: int | None) -> str | None:
    if distance_m is None:
        return None
    if distance_m < 1000:
        return f"{distance_m} m"
    return f"{distance_m / 1000:.1f} km"


def _format_duration_s(duration_s: int | None) -> str | None:
    if duration_s is None:
        return None
    minutes = max(1, round(duration_s / 60))
    if minutes < 60:
        return f"{minutes} min"
    hours, remainder = divmod(minutes, 60)
    return f"{hours} h {remainder} min" if remainder else f"{hours} h"


def _join_street_names(names: list[str] | None) -> str | None:
    if not names:
        return None
    return "/".join(names)


def build_route_out_payload(trip: dict, lang: Literal["vi", "ko", "en"]) -> dict | None:
    """Valhalla `trip` 객체를 `RouteOut` 필드와 동일한 dict 로 변환한다.

    legs 가 없으면(방어적) None — 호출부가 Google 로 폴백한다.
    """
    legs = trip.get("legs") or []
    if not legs:
        return None

    polyline = merge_and_reencode_shapes([leg.get("shape", "") for leg in legs])

    summary = trip.get("summary") or {}
    distance_m = round(summary["length"] * 1000) if summary.get("length") is not None else None
    duration_s = round(summary["time"]) if summary.get("time") is not None else None

    steps = []
    for leg in legs:
        for maneuver in leg.get("maneuvers", []):
            bucket = maneuver_string(maneuver.get("type", 0))
            street = _join_street_names(maneuver.get("street_names"))
            step_distance_m = round(maneuver["length"] * 1000) if maneuver.get("length") is not None else 0
            instruction = maneuver.get("instruction", "") if lang == "en" else render_instruction(bucket, street, lang)
            steps.append(
                {
                    "instruction": instruction,
                    "distance_text": _format_distance_m(step_distance_m) or "",
                    "maneuver": bucket,
                }
            )

    return {
        "configured": True,
        "distance_m": distance_m,
        "duration_s": duration_s,
        "distance_text": _format_distance_m(distance_m),
        "duration_text": _format_duration_s(duration_s),
        "polyline": polyline,
        "steps": steps,
    }
