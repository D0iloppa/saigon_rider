"""gas_station + repair_shop 의 district_code 를 좌표 기반으로 채운다.

Usage:
    DATABASE_URL=postgresql://saigon:pw@localhost:5435/saigon_rider \
    python -m scripts.assign_districts

PostGIS ST_Covers + districts.boundary 폴리곤으로 정확한 매핑.
"""

import os
import sys

import psycopg2


def assign_table(cur, table: str, id_col: str) -> int:
    cur.execute(f"""
        UPDATE {table} t
        SET district_code = d.code
        FROM districts d
        WHERE t.district_code IS NULL
          AND d.boundary IS NOT NULL
          AND ST_Covers(
                d.boundary,
                ST_SetSRID(ST_MakePoint(t.lng::double precision, t.lat::double precision), 4326)::geography
              )
    """)
    return cur.rowcount


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
