"""Versioned service-area contract backed by the map's supported Ward geometry."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

GEOMETRY_VERSION = "service-area.v1"
_CONTAINER_PATH = Path("/service-area/saigon-depth1.json")
_REPO_PATH = Path(__file__).resolve().parents[3] / "frontend/src/components/maps/v2/saigon-depth1.json"


@lru_cache(maxsize=1)
def _geometry() -> dict:
    path = Path(os.environ.get("SERVICE_AREA_GEOMETRY_PATH", _CONTAINER_PATH))
    if not path.exists():
        path = _REPO_PATH
    return json.loads(path.read_text(encoding="utf-8"))


def _on_segment(point: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> bool:
    x, y = point
    ax, ay = a
    bx, by = b
    cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
    return abs(cross) < 1e-7 and min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by)


def _ring_covers(ring: list[tuple[float, float]], point: tuple[float, float]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        if _on_segment(point, ring[j], ring[i]):
            return True
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > point[1]) != (yj > point[1]) and point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def locate_ward_slug(lat: float, lng: float) -> str | None:
    data = _geometry()
    bbox = data["bbox"]
    point = (
        (float(lng) - bbox["W"]) / (bbox["E"] - bbox["W"]) * data["VW"],
        (bbox["N"] - float(lat)) / (bbox["N"] - bbox["S"]) * data["VH"],
    )
    for ward in data["wards"]:
        ring = [tuple(map(float, value.split(","))) for value in ward["p"].split()]
        if _ring_covers(ring, point):
            return ward["slug"]
    return None


def in_service_area(lat: float, lng: float) -> bool:
    return locate_ward_slug(lat, lng) is not None


def geometry_contract() -> dict:
    return {"geometry_version": GEOMETRY_VERSION, **_geometry()}
