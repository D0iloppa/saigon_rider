"""gas_station + repair_shop 의 district_code 를 좌표 기반으로 채운다.

Usage:
    DATABASE_URL=postgresql://saigon:pw@localhost:5435/saigon_rider \
    python -m scripts.assign_districts

더 정확한 매핑이 필요하면 PostGIS + 행정구역 폴리곤 + ST_Contains 사용 권장.
"""

import os
import sys

import psycopg2

# 호치민 행정구 바운딩 박스 (WGS-84, 근사값)
HCM_DISTRICTS: dict[str, dict] = {
    "Q1": {"lat": (10.762, 10.785), "lng": (106.695, 106.712)},
    "Q2": {"lat": (10.770, 10.830), "lng": (106.730, 106.790)},
    "Q3": {"lat": (10.770, 10.795), "lng": (106.675, 106.695)},
    "Q4": {"lat": (10.755, 10.770), "lng": (106.700, 106.712)},
    "Q5": {"lat": (10.750, 10.770), "lng": (106.655, 106.685)},
    "Q6": {"lat": (10.730, 10.758), "lng": (106.628, 106.656)},
    "Q7": {"lat": (10.718, 10.752), "lng": (106.698, 106.745)},
    "Q8": {"lat": (10.735, 10.760), "lng": (106.630, 106.660)},
    "Q9": {"lat": (10.830, 10.890), "lng": (106.770, 106.870)},
    "Q10": {"lat": (10.770, 10.790), "lng": (106.658, 106.680)},
    "Q11": {"lat": (10.754, 10.774), "lng": (106.640, 106.663)},
    "Q12": {"lat": (10.860, 10.905), "lng": (106.620, 106.680)},
    "BinhThanh": {"lat": (10.795, 10.825), "lng": (106.685, 106.720)},
    "BinhTan": {"lat": (10.734, 10.768), "lng": (106.590, 106.638)},
    "GoVap": {"lat": (10.820, 10.865), "lng": (106.655, 106.700)},
    "PhuNhuan": {"lat": (10.785, 10.808), "lng": (106.660, 106.685)},
    "TanBinh": {"lat": (10.785, 10.823), "lng": (106.620, 106.660)},
    "TanPhu": {"lat": (10.758, 10.800), "lng": (106.610, 106.645)},
    "ThuDuc": {"lat": (10.820, 10.885), "lng": (106.720, 106.805)},
}


def find_district(lat: float, lng: float) -> str:
    for code, bounds in HCM_DISTRICTS.items():
        if bounds["lat"][0] <= lat <= bounds["lat"][1] and bounds["lng"][0] <= lng <= bounds["lng"][1]:
            return code
    return "OTHER"


def assign_table(cur, table: str, id_col: str) -> int:
    cur.execute(f"SELECT {id_col}, lat, lng FROM {table} WHERE district_code IS NULL")
    rows = cur.fetchall()
    updated = 0
    for row in rows:
        rid, lat, lng = row
        district = find_district(float(lat), float(lng))
        cur.execute(
            f"UPDATE {table} SET district_code = %s WHERE {id_col} = %s",
            (district, rid),
        )
        updated += 1
    return updated


def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        n_gas = assign_table(cur, "gas_station", "station_id")
        print(f"[gas_station]  {n_gas} rows updated")

        n_repair = assign_table(cur, "repair_shop", "shop_id")
        print(f"[repair_shop]  {n_repair} rows updated")

        conn.commit()
        print("[OK] District assignment committed.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
