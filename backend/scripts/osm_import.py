"""OSM Overpass → gas_station + repair_shop 일회성 import

Usage:
    DATABASE_URL=postgresql://saigon:pw@localhost:5435/saigon_rider \
    python -m scripts.osm_import
"""

import os
import sys

import psycopg2
import requests

OVERPASS_URL = os.getenv("OSM_OVERPASS_ENDPOINT", "https://overpass-api.de/api/interpreter")

_GAS_QUERY = """
[out:json][timeout:120];
area["name:en"="Ho Chi Minh City"]->.hcm;
(
  node["amenity"="fuel"](area.hcm);
  way["amenity"="fuel"](area.hcm);
);
out center;
"""

_REPAIR_QUERY = """
[out:json][timeout:120];
area["name:en"="Ho Chi Minh City"]->.hcm;
(
  node["shop"="motorcycle_repair"](area.hcm);
  node["shop"="motorcycle"](area.hcm);
  way["shop"="motorcycle_repair"](area.hcm);
  way["shop"="motorcycle"](area.hcm);
);
out center;
"""


def _fetch_osm(query: str, label: str) -> list[dict]:
    print(f"[OSM] Fetching {label}...", flush=True)
    resp = requests.post(OVERPASS_URL, data={"data": query}, timeout=180)
    resp.raise_for_status()
    elements = resp.json().get("elements", [])
    print(f"[OSM]   → {len(elements)} raw elements", flush=True)

    items = []
    for el in elements:
        if el["type"] == "node":
            lat, lng = el["lat"], el["lon"]
        elif el["type"] == "way" and "center" in el:
            lat, lng = el["center"]["lat"], el["center"]["lon"]
        else:
            continue

        tags = el.get("tags", {})
        items.append(
            {
                "osm_id": f"{el['type']}/{el['id']}",
                "name": tags.get("name") or tags.get("brand") or "Unknown",
                "brand": tags.get("brand"),
                "lat": lat,
                "lng": lng,
                "street_name": tags.get("addr:street"),
                "opening_hours": tags.get("opening_hours"),
                "phone": tags.get("phone") or tags.get("contact:phone"),
            }
        )
    return items


def _import_gas(cur, items: list[dict]) -> None:
    for item in items:
        cur.execute(
            """
            INSERT INTO gas_station (osm_id, brand, name, lat, lng, street_name, opening_hours)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (osm_id) DO UPDATE SET
                name  = EXCLUDED.name,
                brand = EXCLUDED.brand
            """,
            (
                item["osm_id"],
                item["brand"],
                item["name"],
                item["lat"],
                item["lng"],
                item["street_name"],
                item["opening_hours"],
            ),
        )
    print(f"[DB]  ✓ {len(items)} gas stations upserted", flush=True)


def _import_repair(cur, items: list[dict]) -> None:
    for item in items:
        cur.execute(
            """
            INSERT INTO repair_shop (
                osm_id, name, lat, lng, street_name, phone, opening_hours,
                is_verified, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, 'ACTIVE')
            ON CONFLICT (osm_id) DO UPDATE SET name = EXCLUDED.name
            """,
            (
                item["osm_id"],
                item["name"],
                item["lat"],
                item["lng"],
                item["street_name"],
                item["phone"],
                item["opening_hours"],
            ),
        )
    print(f"[DB]  ✓ {len(items)} repair shops upserted", flush=True)


def _seed_fuel_prices(cur) -> None:
    cur.execute(
        """
        INSERT INTO fuel_price_official (fuel_type, price_vnd, effective_from)
        VALUES ('RON95', 25420, CURRENT_DATE),
               ('RON92', 24300, CURRENT_DATE),
               ('DO',    22100, CURRENT_DATE)
        ON CONFLICT DO NOTHING
        """
    )
    print("[DB]  ✓ fuel prices seeded (RON95/RON92/DO)", flush=True)


def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    # asyncpg URL → psycopg2 URL
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        gas_items = _fetch_osm(_GAS_QUERY, "gas stations")
        _import_gas(cur, gas_items)

        repair_items = _fetch_osm(_REPAIR_QUERY, "repair shops")
        _import_repair(cur, repair_items)

        _seed_fuel_prices(cur)

        conn.commit()
        print("[OK] All imports committed.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
