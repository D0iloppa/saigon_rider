"""SGR-310 Phase 1 후속 — 기존 marketplace_listings의 ward_id 역매핑

ward_import.py 로 wards 테이블 적재 후 실행.
좌표(latitude/longitude)가 있는 매물을 가장 가까운 ward(haversine)에 매핑.

Usage:
    DATABASE_URL=postgresql://saigon:pw@localhost:5435/saigon_rider \\
    python -m scripts.assign_wards [--dry-run]
"""

import math
import os
import sys

import psycopg2

DRY_RUN = "--dry-run" in sys.argv


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def main() -> None:
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 전체 ward 목록 로드
        cur.execute("SELECT id, center_lat, center_lng FROM wards WHERE is_active AND center_lat IS NOT NULL")
        wards = cur.fetchall()
        if not wards:
            print("ERROR: wards 테이블이 비어있습니다. ward_import.py 먼저 실행하세요.")
            sys.exit(1)
        print(f"[ward pool] {len(wards)}개 로드")

        # 좌표 있고 ward_id 없는 매물
        cur.execute("""
            SELECT id, latitude, longitude
            FROM marketplace_listings
            WHERE ward_id IS NULL
              AND latitude IS NOT NULL AND longitude IS NOT NULL
        """)
        listings = cur.fetchall()
        print(f"[매물] ward_id 미설정 {len(listings)}개")

        if DRY_RUN:
            print("[dry-run] 실제 UPDATE 건너뜀.")
            return

        updated = 0
        for listing_id, lat, lng in listings:
            lat_f, lng_f = float(lat), float(lng)
            best_id = min(wards, key=lambda w: haversine_m(lat_f, lng_f, w[1], w[2]))[0]
            cur.execute("UPDATE marketplace_listings SET ward_id = %s WHERE id = %s", (best_id, listing_id))
            updated += 1

        conn.commit()
        print(f"[완료] {updated}개 매물 ward_id 역매핑 완료")

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
