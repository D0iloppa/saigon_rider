"""SGR-310 Phase 0 — HCMC 신 phường 데이터 소싱 → wards 테이블 적재

2025-07-01 행정 통폐합 이후 OSM Overpass API에서
HCMC admin_level=8 (phường/xã) 경계를 가져와 DB에 upsert.

Usage:
    DATABASE_URL=postgresql://saigon:pw@localhost:5435/saigon_rider \\
    python -m scripts.ward_import [--dry-run]

사전 조건:
    - scripts/migrate_wards.sql 이미 실행됨 (wards 테이블 존재)
    - pip install psycopg2-binary requests

검증 기준:
    - HCMC 적재 ward 수가 100개 이상이면 통과 (통폐합 후 168 코뮌급 목표)
    - 구 "Quận 1~12" 이름이 없으면 신 행정체계 반영된 것
"""

import math
import os
import sys
from typing import Any

import psycopg2
import requests

OVERPASS_URL = os.getenv("OSM_OVERPASS_ENDPOINT", "https://overpass-api.de/api/interpreter")
DRY_RUN = "--dry-run" in sys.argv

# HCMC bounding box (신 HCMC: Bình Dương + BRVT 포함)
HCMC_BBOX = "10.3,106.2,11.3,107.2"

# OSM admin_level=8 = phường/xã 수준 (Vietnam)
# admin_level=7 = 구(quận) — 폐지됐으나 OSM에 아직 남아있을 수 있음
OVERPASS_QUERY = f"""
[out:json][timeout:180];
(
  relation[boundary=administrative][admin_level=8][name]({HCMC_BBOX});
);
out center tags;
"""


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def fetch_overpass() -> list[dict[str, Any]]:
    print(f"[Overpass] 쿼리 전송 중… ({OVERPASS_URL})")
    resp = requests.post(OVERPASS_URL, data={"data": OVERPASS_QUERY}, timeout=200)
    resp.raise_for_status()
    elements = resp.json().get("elements", [])
    print(f"[Overpass] {len(elements)}개 relation 수신")
    return elements


def slugify_code(name_vi: str, idx: int) -> str:
    """간이 code 생성 — 베트남어 → ASCII 근사 (정밀 변환은 unidecode 권장)."""
    replacements = {
        "Phường ": "P",
        "Xã ": "X",
        "Thị trấn ": "TT",
        "Đặc khu ": "DK",
        "đ": "d",
        "ð": "d",
        " ": "_",
    }
    code = name_vi
    for k, v in replacements.items():
        code = code.replace(k, v)
    # 남은 non-ASCII 제거
    code = "".join(c if c.isascii() else "" for c in code).upper()
    return f"HCMC_{code}_{idx:03d}" if not code else f"HCMC_{code}"


def elements_to_rows(elements: list[dict]) -> list[dict]:
    rows = []
    for idx, el in enumerate(elements):
        tags = el.get("tags", {})
        name_vi = tags.get("name:vi") or tags.get("name") or ""
        name_en = tags.get("name:en") or name_vi
        if not name_vi:
            continue
        center = el.get("center", {})
        lat = center.get("lat")
        lng = center.get("lon")
        rows.append(
            {
                "code": slugify_code(name_vi, idx),
                "city_code": "HCMC",
                "name_vi": name_vi,
                "name_en": name_en,
                "name_ko": tags.get("name:ko"),
                "center_lat": lat,
                "center_lng": lng,
                "sort_order": idx,
            }
        )
    return rows


def upsert_wards(rows: list[dict], db_url: str) -> None:
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        inserted = 0
        for r in rows:
            cur.execute(
                """
                INSERT INTO wards (code, city_code, name_vi, name_en, name_ko, center_lat, center_lng, sort_order)
                VALUES (%(code)s, %(city_code)s, %(name_vi)s, %(name_en)s, %(name_ko)s,
                        %(center_lat)s, %(center_lng)s, %(sort_order)s)
                ON CONFLICT (code) DO UPDATE SET
                    name_vi    = EXCLUDED.name_vi,
                    name_en    = EXCLUDED.name_en,
                    name_ko    = EXCLUDED.name_ko,
                    center_lat = EXCLUDED.center_lat,
                    center_lng = EXCLUDED.center_lng,
                    sort_order = EXCLUDED.sort_order
                """,
                r,
            )
            inserted += 1
        conn.commit()
        print(f"[DB] {inserted}개 ward upsert 완료")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def validate(rows: list[dict]) -> bool:
    count = len(rows)
    print(f"[검증] 수신 ward 수: {count}")
    if count < 100:
        print(f"[경고] {count}개 — 168 코뮌급 기준 미달. OSM 데이터 아직 통폐합 미반영일 수 있음.")
        print("       대안: HCMGIS OpenData (https://opendata.hcmgis.vn) 에서 수동 소싱 권장.")
        return False
    old_names = [r for r in rows if any(x in r["name_vi"] for x in ["Quận 1,", "Quận 2,", "Quận 3"])]
    if old_names:
        print(f"[경고] 구 행정구역 이름(Quận N) {len(old_names)}개 발견 — 통폐합 미반영 데이터")
    print(f"[검증 통과] {count}개 ward 소싱 성공")
    return True


def main() -> None:
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url and not DRY_RUN:
        print("ERROR: DATABASE_URL not set. --dry-run으로 실행하거나 DATABASE_URL을 지정하세요.", file=sys.stderr)
        sys.exit(1)
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    elements = fetch_overpass()
    rows = elements_to_rows(elements)

    ok = validate(rows)

    if DRY_RUN:
        print("[dry-run] DB 적재 건너뜀. 샘플 3개:")
        for r in rows[:3]:
            print(f"  {r}")
        return

    if not ok:
        ans = input("데이터 품질 경고가 있습니다. 계속 적재하시겠습니까? [y/N] ").strip().lower()
        if ans != "y":
            print("취소됨.")
            sys.exit(0)

    upsert_wards(rows, db_url)
    print("[완료] ward_import 완료. 다음 단계: scripts/assign_wards.py 로 기존 매물 ward_id 역매핑.")


if __name__ == "__main__":
    main()
