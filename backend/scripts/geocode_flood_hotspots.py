"""침수 핫스팟 후보 JSON -> 지오코딩·검증 -> 마이그레이션 SQL 생성 (결정적 파이프라인).

배경: database/init/037_flood_hotspot_seed.sql 에 30건 시드가 있다. 별도 리서치 워커가
생성한 침수 지점 후보 JSON(candidate)을 입력으로 받아, 좌표를 Nominatim 으로 지오코딩하고
게이트로 검증한 뒤, 037 과 같은 스타일의 멱등 INSERT SQL 을 생성한다.

게이트 설계 (감독 검토 후 확정, 전역 시드 + 한계 기록 방식):
- G1: HCMC bbox (보조 수단 — 예: 11.018,106.689 은 bbox 안이지만 실제로는 다른 지역).
- G2 (구 폴리곤 게이트) 는 탈락 사유가 아니라 **기록용 플래그**로 강등했다 —
  saigon-depth1.json 은 37개 ward, 중심부 bbox만 커버해 기존 30건 시드조차 11건만
  폴리곤 안(19건은 밖)이라 폴리곤 밖이 예외가 아니라 다수였다. 폴리곤 밖 지점도 시드에
  포함하고 (`in_ward_polygon: false`) 리포트에 안/밖 건수를 집계한다 — 지도 배지만
  안 뜰 뿐 리스트/통계에는 반영되고, 지도 지오메트리가 넓어지면 자동으로 표시된다.
- G2' (신규, 주 정확도 방어선): Nominatim 응답에 `addressdetails=1` 을 붙여, 주소 성분에
  호치민시(Hồ Chí Minh / Ho Chi Minh, 성조 유무 모두)가 나타나지 않으면 탈락
  (`g2p_outside_hcmc_address`) — Điện Biên Phủ 같은 동명이지 거리를 잡아낸다.
  `district_vi` 불일치는 2025 년 행정구역 개편으로 OSM 이 구 명칭을 쓸 수 있어 탈락시키지
  않고 `district_mismatch` 플래그만 남긴다.
- G3: 기존 30건과 (district_code, street_name) 중복 탈락.
- G4: 이미 채택된 점과 150m 이내 근접 중복 탈락 (100m/300m 였다면의 민감도도 리포트).
- G5: 필드 유효성 (depth_level/flood_count/district_code).

지오코딩 전략 4단계 (1~3 이 모두 실패했을 때만 4를 시도):
1. 구조화 질의 (street/county/city/country)
2. landmark_hint 자유질의
3. district_vi 포함 자유질의
4. **district_vi 를 뺀** 자유질의 — 번호 구(Quận N) 라벨이 2025 행정구역 개편 후 OSM 주소와
   안 맞아 1~3 이 통째로 실패하는 사례(curl 로 실증: "Quận 1" 을 질의에 넣으면 빈 응답,
   빼면 5건 정상 응답)를 복구한다. district_vi 를 빼는 대신 거리명 동명이인 오배치를
   막기 위해 참조좌표 근접성 검사(구별 기존 30건 시드 + 이번 실행에서 전략 1~3 으로 이미
   채택된 점들의 centroid, 8km 이내만 채택)를 추가로 건다 — 참조점이 없는 구는 검사를
   생략하고 `district_unverified` 플래그만 남긴다.

사용법:
    python3 backend/scripts/geocode_flood_hotspots.py --input <candidates.json> --dry-run
    python3 backend/scripts/geocode_flood_hotspots.py --input <candidates.json> --limit 5

DB 에 직접 쓰지 않는다 — SQL 파일만 생성한다. 표준 라이브러리만 사용(외부 패키지 설치 금지).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRATCHPAD = Path("/tmp/claude-1000/-mnt-c-DEV-saigon-rider/2828f3c8-33f2-4065-a747-c331567c40c0/scratchpad")
CACHE_PATH = SCRATCHPAD / "nominatim_cache.json"
REJECTS_PATH = SCRATCHPAD / "flood_rejects.json"
OUTPUT_SQL_PATH = REPO_ROOT / "database/init/157_flood_hotspot_seed_expand.sql"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "saigon-rider-flood-seed/1.0 (dev seed script)"
RATE_LIMIT_SECONDS = 1.1
MAX_RETRIES = 2  # 총 3회 시도

# G1: HCMC bbox
BBOX_LAT = (10.3, 11.2)
BBOX_LNG = (106.3, 107.1)

# G4: 같은 street_name(같은 district_code, NFC+strip 정규화) 이고 이 거리 이내면 근접중복 탈락.
# (감독 발견 오류 수정: 150m 로 street_name 무관 전역 비교하면 인접 평행 도로/서로 다른 거리를
#  중복으로 오판한다. Ký Con ↔ Nguyễn Thái Bình, 112m, 실제로는 다른 거리 — 원래 목적은
#  같은 거리의 여러 구간(landmark_hint 로 구분된 "đoạn từ X đến Y")이 중복 등록되는 것 방지.)
SAME_STREET_MIN_DISTANCE_M = 300.0

# G5: 허용 값
ALLOWED_DEPTH_LEVELS = {"ankle", "knee", "thigh"}
ALLOWED_DISTRICTS = {
    # 037 시드 12개 구 + HCMC 나머지 공식 행정구(합병 전 24개 군·현 기준). 실제 후보 JSON 이
    # 20개 구에 분포(THU_DUC/QUAN_1/TAN_BINH/BINH_THANH 등)해 037 기준 12개만으로는
    # Quận 3/6/10/11, Tân Phú, Bình Chánh, Hóc Môn, Nhà Bè 가 전부 오탈락했다 — 발견 후 확장.
    "BINH_TAN",
    "BINH_THANH",
    "GO_VAP",
    "PHU_NHUAN",
    "QUAN_1",
    "QUAN_3",
    "QUAN_4",
    "QUAN_5",
    "QUAN_6",
    "QUAN_7",
    "QUAN_8",
    "QUAN_10",
    "QUAN_11",
    "QUAN_12",
    "TAN_BINH",
    "TAN_PHU",
    "THU_DUC",
    "BINH_CHANH",
    "HOC_MON",
    "NHA_BE",
    "CU_CHI",
    "CAN_GIO",
}
FLOOD_COUNT_RANGE = (3, 15)

# G3: 기존 037 시드 30건 (district_code, street_name) — 이 조합과 겹치면 탈락
EXISTING_HOTSPOTS: set[tuple[str, str]] = {
    ("BINH_TAN", "Hồ Học Lãm"),
    ("BINH_TAN", "Kinh Dương Vương"),
    ("BINH_TAN", "Mã Lò"),
    ("BINH_TAN", "Phan Anh"),
    ("BINH_TAN", "Tỉnh lộ 10"),
    ("BINH_THANH", "Bùi Đình Túy"),
    ("BINH_THANH", "Đinh Bộ Lĩnh"),
    ("BINH_THANH", "Nguyễn Hữu Cảnh"),
    ("BINH_THANH", "Ung Văn Khiêm"),
    ("GO_VAP", "Cây Trâm"),
    ("GO_VAP", "Lê Đức Thọ"),
    ("GO_VAP", "Phan Huy Ích"),
    ("PHU_NHUAN", "Phan Xích Long"),
    ("QUAN_1", "Calmette"),
    ("QUAN_12", "Nguyễn Văn Quá"),
    ("QUAN_4", "Bến Vân Đồn"),
    ("QUAN_5", "Nguyễn Văn Cừ"),
    ("QUAN_7", "Huỳnh Tấn Phát"),
    ("QUAN_7", "Lê Văn Lương"),
    ("QUAN_7", "Trần Xuân Soạn"),
    ("QUAN_8", "An Dương Vương"),
    ("QUAN_8", "Phạm Thế Hiển"),
    ("TAN_BINH", "Hoàng Hoa Thám"),
    ("THU_DUC", "Đỗ Xuân Hợp"),
    ("THU_DUC", "Lương Định Của"),
    ("THU_DUC", "Quốc Hương"),
    ("THU_DUC", "Quốc lộ 13"),
    ("THU_DUC", "Tô Ngọc Vân"),
    ("THU_DUC", "Trần Não"),
    ("THU_DUC", "Võ Văn Ngân"),
}

PREFERRED_CLASSES = {"highway"}
FALLBACK_CLASSES = {"amenity", "shop", "tourism", "building"}

# 전략 4 참조좌표 계산용 — 기존 30건 시드 좌표 (감독 제공 상수). district_code 별 centroid 의
# 초기값으로 쓰고, 실행 중 전략 1~3 으로 채택된 점을 추가로 누적한다 (전략4 채택점은 제외 —
# 근사치가 근사치를 검증하는 자기참조 드리프트 방지).
REFERENCE_SEED_POINTS: dict[str, list[tuple[float, float]]] = {
    "BINH_TAN": [
        (10.7380, 106.6170),
        (10.7450, 106.6160),
        (10.7690, 106.6000),
        (10.7720, 106.6060),
        (10.7560, 106.5860),
    ],
    "BINH_THANH": [(10.8010, 106.6960), (10.8040, 106.7040), (10.7923, 106.7170), (10.8020, 106.7130)],
    "GO_VAP": [(10.8330, 106.6560), (10.8440, 106.6540), (10.8450, 106.6320)],
    "PHU_NHUAN": [(10.8000, 106.6870)],
    "QUAN_1": [(10.7660, 106.6960)],
    "QUAN_12": [(10.8550, 106.6270)],
    "QUAN_4": [(10.7590, 106.6980)],
    "QUAN_5": [(10.7590, 106.6820)],
    "QUAN_7": [(10.7300, 106.7250), (10.7280, 106.7050), (10.7480, 106.7180)],
    "QUAN_8": [(10.7370, 106.6590), (10.7420, 106.6650)],
    "TAN_BINH": [(10.8000, 106.6470)],
    "THU_DUC": [
        (10.8020, 106.7580),
        (10.7950, 106.7480),
        (10.7990, 106.7370),
        (10.8250, 106.7130),
        (10.8480, 106.7500),
        (10.7930, 106.7290),
        (10.8500, 106.7650),
    ],
}

# G2q: 전략4 후보와 참조좌표 간 최대 허용 거리 (km)
STRATEGY4_MAX_REF_DISTANCE_KM = 8.0


def _load_service_area_module() -> ModuleType:
    """backend/app/services/service_area.py 를 직접 로드해 locate_ward_slug() 를 재사용한다.

    이 모듈은 표준 라이브러리(json/os/pathlib)만 쓰는 순수 함수라 앱 전체를 부트스트랩하지
    않고도 import 가능하다. G2(ward 폴리곤 내부 판정)의 좌표계 변환 + ray-casting 로직을
    그대로 재사용하기 위함 — bbox/VW/VH 변환 공식을 이 스크립트에서 다시 베끼면 drift 위험이
    있으므로 원본을 import 한다.
    """
    path = REPO_ROOT / "backend/app/services/service_area.py"
    spec = importlib.util.spec_from_file_location("service_area_standalone", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_key(district_code: str, street_name: str) -> tuple[str, str]:
    return (district_code.strip(), unicodedata.normalize("NFC", street_name.strip()))


def strip_diacritics(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


def _address_haystack(item: dict) -> str:
    parts = [item.get("display_name", "")]
    address = item.get("address") or {}
    parts.extend(str(v) for v in address.values())
    return strip_diacritics(" ".join(parts)).lower()


def is_hcmc_address(item: dict) -> bool:
    """G2': 주소 성분에 호치민시가 나타나는지 (성조 유무 무관하게 매칭)."""
    return "ho chi minh" in _address_haystack(item)


def district_appears(item: dict, district_vi: str) -> bool:
    """district_vi 가 주소 성분에 나타나는지 — 불일치는 탈락 아닌 플래그(district_mismatch)."""
    if not district_vi:
        return False
    return strip_diacritics(district_vi).lower() in _address_haystack(item)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class Cache:
    def __init__(self, path: Path):
        self.path = path
        if path.exists():
            self.data: dict[str, list[dict]] = json.loads(path.read_text(encoding="utf-8"))
        else:
            self.data = {}

    def get(self, key: str) -> list[dict] | None:
        return self.data.get(key)

    def set(self, key: str, value: list[dict]) -> None:
        self.data[key] = value
        self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=1), encoding="utf-8")


class NetworkFailure(Exception):
    pass


def nominatim_request(params: dict[str, str], cache: Cache) -> list[dict]:
    """Nominatim 검색. 캐시 히트 시 요청/sleep 없음. 실패 시 최대 MAX_RETRIES 재시도."""
    key = json.dumps(params, sort_keys=True, ensure_ascii=False)
    cached = cache.get(key)
    if cached is not None:
        return cached

    query = dict(params)
    query["format"] = "jsonv2"
    query["limit"] = "5"
    query["addressdetails"] = "1"
    url = f"{NOMINATIM_URL}?{urllib.parse.urlencode(query)}"

    last_error: Exception | None = None
    for _attempt in range(MAX_RETRIES + 1):
        time.sleep(RATE_LIMIT_SECONDS)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            cache.set(key, body)
            return body
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            continue
    raise NetworkFailure(str(last_error))


def ordered_candidates(results: list[dict]) -> list[tuple[dict, bool]]:
    """highway/way 우선(warn=False) 뒤에 amenity/shop/tourism/building(warn=True) 순으로 정렬."""
    preferred_ids = set()
    preferred = []
    for item in results:
        if item.get("class") in PREFERRED_CLASSES or item.get("osm_type") == "way":
            preferred.append((item, False))
            preferred_ids.add(id(item))
    fallback = [
        (item, True) for item in results if item.get("class") in FALLBACK_CLASSES and id(item) not in preferred_ids
    ]
    return preferred + fallback


def pick_candidate(results: list[dict]) -> tuple[dict, bool] | None:
    """highway/way 우선, 없으면 amenity/shop/tourism/building(warn=True). 둘 다 없으면 None."""
    ordered = ordered_candidates(results)
    return ordered[0] if ordered else None


def geocode(candidate: dict, cache: Cache) -> dict | None:
    """전략 1~3 (district_vi 포함). 성공 시 dict(lat,lng,warn,strategy,item) 반환, 실패 시 None.

    네트워크 실패는 NetworkFailure. item 은 원본 Nominatim 응답(주소 성분 포함) — G2'
    주소 검증에 쓰인다. strategy 는 1|2|3 (숫자).
    """
    street = candidate["street_name"]
    district_vi = candidate["district_vi"]
    landmark = candidate.get("landmark_hint")

    attempts: list[tuple[int, dict]] = [
        (
            1,
            {
                "street": street,
                "county": district_vi,
                "city": "Ho Chi Minh City",
                "country": "Vietnam",
            },
        )
    ]
    if landmark:
        attempts.append((2, {"q": f"{street}, {landmark}, {district_vi}, Ho Chi Minh City, Vietnam"}))
    attempts.append((3, {"q": f"{street}, {district_vi}, Ho Chi Minh City, Vietnam"}))

    network_failures = 0
    for strategy, params in attempts:
        try:
            results = nominatim_request(params, cache)
        except NetworkFailure:
            network_failures += 1
            continue
        if not results:
            continue
        picked = pick_candidate(results)
        if picked is None:
            continue
        item, warn = picked
        return {
            "lat": float(item["lat"]),
            "lng": float(item["lon"]),
            "warn": warn,
            "strategy": strategy,
            "item": item,
        }

    if network_failures == len(attempts):
        raise NetworkFailure("all geocode strategies failed (network)")
    return None


def geocode_strategy4(
    candidate: dict, cache: Cache, ref_point: tuple[float, float] | None
) -> tuple[dict | None, float | None]:
    """전략 4: district_vi 를 뺀 자유질의 + 참조좌표 근접성 검사(8km).

    반환: (result_dict_or_None, nearest_far_km). result 가 None 이고 ref_point 가 있었으면
    nearest_far_km 에 (탈락 사유 보고용) 가장 가까웠던 후보와의 거리를 담는다.
    """
    street = candidate["street_name"]
    results = nominatim_request({"q": f"{street}, Ho Chi Minh City, Vietnam"}, cache)
    ordered = ordered_candidates(results)
    if not ordered:
        return None, None

    if ref_point is None:
        item, warn = ordered[0]
        return {
            "lat": float(item["lat"]),
            "lng": float(item["lon"]),
            "warn": warn,
            "item": item,
            "district_unverified": True,
            "ref_distance_km": None,
        }, None

    # 8km 이내 후보 중 최근접 선택 (highway/way 우선순위는 8km 이내 후보 사이에서만 적용) —
    # "첫 8km 이내" 가 아니라 "8km 이내 중 최소거리": 첫 매치를 쓰면 OSM importance 순서상
    # 더 높은 랭크의 동명이인 거리(다른 구)가 정답보다 먼저 선택될 수 있다(감독 발견 사례:
    # QUAN_1/Nguyễn Thái Bình 이 Tân Bình 지역으로 갔던 문제).
    ref_lat, ref_lng = ref_point
    preferred_within: list[tuple[float, dict, bool]] = []
    fallback_within: list[tuple[float, dict, bool]] = []
    nearest_far_km: float | None = None
    for item, warn in ordered:
        lat, lng = float(item["lat"]), float(item["lon"])
        dist_km = haversine_m(lat, lng, ref_lat, ref_lng) / 1000.0
        if dist_km <= STRATEGY4_MAX_REF_DISTANCE_KM:
            (fallback_within if warn else preferred_within).append((dist_km, item, warn))
        elif nearest_far_km is None or dist_km < nearest_far_km:
            nearest_far_km = dist_km

    pool = preferred_within if preferred_within else fallback_within
    if not pool:
        return None, nearest_far_km
    dist_km, item, warn = min(pool, key=lambda t: t[0])
    return {
        "lat": float(item["lat"]),
        "lng": float(item["lon"]),
        "warn": warn,
        "item": item,
        "district_unverified": False,
        "ref_distance_km": dist_km,
    }, None


def validate_g5(candidate: dict) -> str | None:
    """필드 유효성. 문제 있으면 사유 문자열, 없으면 None."""
    if candidate.get("district_code") not in ALLOWED_DISTRICTS:
        return f"g5_invalid_district:{candidate.get('district_code')}"
    if candidate.get("avg_depth_level") not in ALLOWED_DEPTH_LEVELS:
        return f"g5_invalid_depth_level:{candidate.get('avg_depth_level')}"
    count = candidate.get("flood_count_30d")
    if not isinstance(count, int) or not (FLOOD_COUNT_RANGE[0] <= count <= FLOOD_COUNT_RANGE[1]):
        return f"g5_invalid_flood_count:{count}"
    if not candidate.get("street_name") or not candidate.get("district_vi"):
        return "g5_missing_required_field"
    return None


def apply_g4(rows: list[dict], same_street_threshold_m: float) -> tuple[list[dict], list[tuple[dict, str]]]:
    """G4: 완전 동일 좌표는 항상 탈락(g4_identical_coords, street_name 무관 — 진짜 중복).
    같은 street_name(같은 district_code) 이고 same_street_threshold_m 이내면 탈락
    (g4_same_street_too_close — 같은 거리의 여러 구간 중복 등록 방지). street_name 이 다르면
    거리가 아무리 가까워도 탈락시키지 않는다(서로 다른 도로).
    순서대로 훑으며 이미 채택된 점들과 비교. (kept, [(row, reason), ...]) 반환.
    """
    kept: list[dict] = []
    dropped: list[tuple[dict, str]] = []
    for row in rows:
        row_key = normalize_key(row["district_code"], row["street_name"])
        reason: str | None = None
        for k in kept:
            if row["lat"] == k["lat"] and row["lng"] == k["lng"]:
                reason = "g4_identical_coords"
                break
        if reason is None:
            for k in kept:
                if normalize_key(k["district_code"], k["street_name"]) != row_key:
                    continue
                if haversine_m(row["lat"], row["lng"], k["lat"], k["lng"]) < same_street_threshold_m:
                    reason = "g4_same_street_too_close"
                    break
        if reason:
            dropped.append((row, reason))
        else:
            kept.append(row)
    return kept, dropped


def process(candidates: list[dict], locate_ward_slug, cache: Cache) -> tuple[list[dict], list[dict], dict[str, int]]:
    """반환: (accepted, rejected, g4_sensitivity{threshold_m: dropped_count})."""
    pre_g4: list[dict] = []
    rejected: list[dict] = []
    # district_code 별 참조좌표 누적 — 기존 30건 시드로 시작, 전략 1~3 채택점만 추가(전략4 제외).
    district_points: dict[str, list[tuple[float, float]]] = {k: list(v) for k, v in REFERENCE_SEED_POINTS.items()}

    for candidate in candidates:
        district_code = candidate.get("district_code", "")
        street_name = candidate.get("street_name", "")

        # G5 (필드 유효성) — 지오코딩 전에 저렴하게 먼저 거른다
        g5_reason = validate_g5(candidate)
        if g5_reason:
            rejected.append({**candidate, "reject_reason": g5_reason})
            continue

        # G3 (기존 30건 중복)
        key = normalize_key(district_code, street_name)
        if key in EXISTING_HOTSPOTS:
            rejected.append({**candidate, "reject_reason": "g3_duplicate_existing"})
            continue

        # 지오코딩 — 전략 1~3
        try:
            geo = geocode(candidate, cache)
        except NetworkFailure as exc:
            rejected.append({**candidate, "reject_reason": f"rejected_network:{exc}"})
            continue

        district_unverified = False
        if geo is None:
            # 전략 1~3 모두 실패 — 전략 4 (district_vi 제외 + 참조좌표 근접성 검사)
            points = district_points.get(district_code, [])
            ref_point = None
            if points:
                ref_point = (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))
            try:
                s4_result, nearest_far_km = geocode_strategy4(candidate, cache, ref_point)
            except NetworkFailure as exc:
                rejected.append({**candidate, "reject_reason": f"rejected_network:{exc}"})
                continue
            if s4_result is None:
                if ref_point is not None and nearest_far_km is not None:
                    rejected.append(
                        {
                            **candidate,
                            "reject_reason": "g2q_far_from_district_reference",
                            "nearest_ref_distance_km": round(nearest_far_km, 2),
                        }
                    )
                else:
                    rejected.append({**candidate, "reject_reason": "geocode_failed"})
                continue
            geo = {**s4_result, "strategy": 4}
            district_unverified = geo["district_unverified"]

        lat, lng, warn, strategy, item = geo["lat"], geo["lng"], geo["warn"], geo["strategy"], geo["item"]
        ref_distance_km = geo.get("ref_distance_km")

        # G1 (HCMC bbox) — 보조 수단, 여전히 탈락 조건
        if not (BBOX_LAT[0] <= lat <= BBOX_LAT[1] and BBOX_LNG[0] <= lng <= BBOX_LNG[1]):
            rejected.append({**candidate, "reject_reason": "g1_outside_bbox", "geocoded": [lat, lng]})
            continue

        # G2' (주소 성분에 호치민시 존재) — 신규 주 정확도 방어선, 탈락 조건
        if not is_hcmc_address(item):
            rejected.append(
                {
                    **candidate,
                    "reject_reason": "g2p_outside_hcmc_address",
                    "geocoded": [lat, lng],
                    "display_name": item.get("display_name"),
                }
            )
            continue

        district_mismatch = not district_appears(item, candidate.get("district_vi", ""))

        # G2 (ward 폴리곤 내부) — 탈락 아님, 기록용 플래그만
        slug = locate_ward_slug(lat, lng)

        pre_g4.append(
            {
                "district_code": district_code,
                "street_name": street_name,
                "lat": round(lat, 7),
                "lng": round(lng, 7),
                "flood_count_30d": candidate["flood_count_30d"],
                "avg_depth_level": candidate["avg_depth_level"],
                "ward_slug": slug,
                "in_ward_polygon": slug is not None,
                "district_mismatch": district_mismatch,
                "geocode_strategy": strategy,
                "warn": warn,
                "district_unverified": district_unverified,
                "ref_distance_km": ref_distance_km,
            }
        )

        # 전략 1~3 으로 채택된 점만 이후 후보들의 참조좌표에 반영 (전략4 는 근사치라 제외)
        if strategy != 4:
            district_points.setdefault(district_code, []).append((lat, lng))

    # G4 (같은 street_name + 근접 중복) — 실제 게이트는 300m. 150m/500m 는 민감도 참고용.
    accepted, dropped = apply_g4(pre_g4, SAME_STREET_MIN_DISTANCE_M)
    _, dropped_150 = apply_g4(pre_g4, 150.0)
    _, dropped_300 = apply_g4(pre_g4, 300.0)
    _, dropped_500 = apply_g4(pre_g4, 500.0)
    g4_sensitivity = {150: len(dropped_150), 300: len(dropped_300), 500: len(dropped_500)}

    for row, reason in dropped:
        rejected.append(
            {
                "district_code": row["district_code"],
                "street_name": row["street_name"],
                "reject_reason": reason,
                "geocoded": [row["lat"], row["lng"]],
            }
        )

    return accepted, rejected, g4_sensitivity


def days_ago_for(flood_count_30d: int) -> int:
    """flood_count_30d 가 클수록 최근 — 결정적 계산 (037 의 대략적 경향을 재현)."""
    return max(1, min(20, 21 - flood_count_30d))


def build_sql(accepted: list[dict]) -> str:
    in_poly = [row for row in accepted if row["in_ward_polygon"]]
    out_poly = [row for row in accepted if not row["in_ward_polygon"]]

    header = f"""-- =====================================================
-- 157: 침수 핫스팟 확장 시드 ({len(accepted)}건)
-- =====================================================
-- 출처: 호치민시 건설국/기술인프라관리센터 발표 목록 재게재 자료 + Thanh Niên 조석침수 목록
--       + Tuổi Trẻ 보도 종합 (리서치 워커 산출 후보 JSON, source_url 개별 보유).
-- 생성일: 2026-07-31
-- 생성 방법: python3 backend/scripts/geocode_flood_hotspots.py --input <candidates.json>
--           (Nominatim 지오코딩 + G1/G2'/G3/G4/G5 게이트 검증, 감독 리뷰 후 확정)
-- 멱등성: 037과 동일 패턴 — 이 배치의 첫 행 (district_code, street_name) 존재 여부로 가드
--         (flood_hotspot_stats 에 UNIQUE 제약 없음)
--
-- 폴리곤 커버리지: 이 시드의 {len(out_poly)}건은 saigon-depth1.json(37 ward, 중심부 bbox)
--   밖이라 현재 침수지도에 ward 배지가 표시되지 않는다. 리스트·통계에는 반영되며,
--   지도 지오메트리 확장 시 자동으로 표시된다. (폴리곤 안 {len(in_poly)}건 / 밖 {len(out_poly)}건)
-- 좌표 신뢰도: 행 끝 `-- s4` 는 전략4(district_vi 제외 자유질의 + 참조좌표 8km 검증)로
--   지오코딩된 건, `-- s4 unverified` 는 그 중 구 참조좌표가 없어 근접성 검증 자체를 못 한
--   건(신뢰도 최저) — 표시 없는 행은 전략 1~3(구조화/랜드마크/자유질의, district_vi 포함).

DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM flood_hotspot_stats
  WHERE district_code = '{accepted[0]["district_code"]}' AND street_name = '{accepted[0]["street_name"]}'
) THEN

INSERT INTO flood_hotspot_stats
  (district_code, street_name, centroid_lat, centroid_lng,
   flood_count_30d, last_flood_at, avg_depth_level, updated_at)
VALUES
"""

    def render(row: dict) -> tuple[str, str]:
        """(값 텍스트, 행 끝 표시 주석) — 표시 주석은 콤마/세미콜론 뒤에 붙여야 SQL 이 깨지지 않는다."""
        street_escaped = row["street_name"].replace("'", "''")
        days = days_ago_for(row["flood_count_30d"])
        marker = ""
        if row["geocode_strategy"] == 4:
            marker = "  -- s4 unverified" if row.get("district_unverified") else "  -- s4"
        text = (
            f"  ('{row['district_code']}', '{street_escaped}', {row['lat']:.7f}, {row['lng']:.7f}, "
            f"{row['flood_count_30d']}, NOW() - INTERVAL '{days} days', '{row['avg_depth_level']}', NOW())"
        )
        return text, marker

    # sections: ("comment", text) 또는 ("value", text, marker)
    sections: list[tuple] = []
    if in_poly:
        sections.append(("comment", "  -- ===== 폴리곤 안 (지도 배지 표시됨) ====="))
        sections.extend(("value", *render(row)) for row in in_poly)
    if out_poly:
        sections.append(("comment", "  -- ===== 폴리곤 밖 (지도 배지 미표시 — 리스트/통계만 반영) ====="))
        sections.extend(("value", *render(row)) for row in out_poly)

    # 주석 줄은 콤마 없이, 값 줄만 콤마(또는 마지막은 세미콜론) + 표시주석 순으로 연결
    lines = []
    values_seen = 0
    total_values = len(in_poly) + len(out_poly)
    for entry in sections:
        if entry[0] == "comment":
            lines.append(entry[1])
        else:
            _, text, marker = entry
            values_seen += 1
            suffix = "," if values_seen < total_values else ";"
            lines.append(text + suffix + marker)
    body = "\n".join(lines) + "\n"
    footer = "\nEND IF;\nEND $$;\n"
    return header + body + footer


def print_report(accepted: list[dict], rejected: list[dict], g4_sensitivity: dict[str, int]) -> None:
    print(f"채택 {len(accepted)} / 탈락 {len(rejected)}")
    reasons: dict[str, int] = {}
    for row in rejected:
        reason = row["reject_reason"].split(":")[0]
        reasons[reason] = reasons.get(reason, 0) + 1
    if reasons:
        print("탈락 사유별 집계:")
        for reason, count in sorted(reasons.items(), key=lambda kv: -kv[1]):
            print(f"  {reason}: {count}")

    in_poly = sum(1 for row in accepted if row["in_ward_polygon"])
    out_poly = len(accepted) - in_poly
    print(f"채택 {len(accepted)}건 중 폴리곤 안 {in_poly}건 / 밖 {out_poly}건 (ward 배지 표시 여부)")

    mismatches = [row for row in accepted if row.get("district_mismatch")]
    if mismatches:
        print(f"district_mismatch(구 명칭 불일치, 탈락 아님) {len(mismatches)}건")

    unverified = [row for row in accepted if row.get("district_unverified")]
    if unverified:
        print(f"district_unverified(전략4, 참조좌표 없어 근접성 미검증) {len(unverified)}건")

    strategy_counts: dict[int, int] = {}
    for row in accepted:
        s = row["geocode_strategy"]
        strategy_counts[s] = strategy_counts.get(s, 0) + 1
    print("전략별 채택 건수 — " + ", ".join(f"전략{s}: {strategy_counts.get(s, 0)}건" for s in (1, 2, 3, 4)))

    print(
        f"G4(같은 street_name 한정) 근접중복 민감도 — 150m: 탈락 {g4_sensitivity[150]}건, "
        f"300m(적용값): 탈락 {g4_sensitivity[300]}건, 500m: 탈락 {g4_sensitivity[500]}건"
    )

    strategy4_with_ref = sorted(
        (row for row in accepted if row["geocode_strategy"] == 4 and row.get("ref_distance_km") is not None),
        key=lambda row: -row["ref_distance_km"],
    )
    if strategy4_with_ref:
        print("전략4 채택 건 중 참조점 거리 상위 5건 (감독 검수용):")
        for row in strategy4_with_ref[:5]:
            print(f"  {row['district_code']} / {row['street_name']} — {row['ref_distance_km']:.2f}km")

    warns = [row for row in accepted if row.get("warn")]
    if warns:
        print(f"경고(amenity/shop 등 폴백, class 미검증) {len(warns)}건:")
        for row in warns:
            print(f"  {row['district_code']} / {row['street_name']} (strategy={row['geocode_strategy']})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="침수 지점 후보 JSON 경로")
    parser.add_argument("--dry-run", action="store_true", help="SQL 파일 쓰지 않고 리포트만 출력")
    parser.add_argument("--limit", type=int, default=None, help="앞 N건만 처리 (테스트용)")
    args = parser.parse_args()

    input_path = Path(args.input)
    candidates = json.loads(input_path.read_text(encoding="utf-8"))
    if args.limit is not None:
        candidates = candidates[: args.limit]

    service_area = _load_service_area_module()
    cache = Cache(CACHE_PATH)

    accepted, rejected, g4_sensitivity = process(candidates, service_area.locate_ward_slug, cache)

    print_report(accepted, rejected, g4_sensitivity)

    REJECTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    REJECTS_PATH.write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"탈락 목록 덤프: {REJECTS_PATH}")

    if not accepted:
        print("채택된 행이 없어 SQL 을 생성하지 않는다.")
        return 0

    if args.dry_run:
        print("--dry-run: SQL 파일을 쓰지 않음.")
        return 0

    sql = build_sql(accepted)
    OUTPUT_SQL_PATH.write_text(sql, encoding="utf-8")
    print(f"SQL 생성 완료: {OUTPUT_SQL_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
