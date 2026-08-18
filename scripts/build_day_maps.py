"""배정표 CSV → 일자별 핀 지도 PNG (Google Static Maps).

각 일자의 커버 페이지에 넣을 지도다. 작업자별로 핀 색을 달리해서
그날 5명이 각각 어느 구역에 흩어지는지 한눈에 보이게 한다.

키는 .env 의 GOOGLE_MAPS_API_KEY 를 읽는다(출력에 노출하지 않는다).
좌표만 바뀌지 않으면 다시 받을 필요가 없으므로 배정표 빌드와 분리해 둔다.

Usage:
    python3 scripts/build_day_maps.py            # 없는 것만 생성
    python3 scripts/build_day_maps.py --force    # 전부 재생성
"""

from __future__ import annotations

import csv
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ai-docs/research/260810_field_agent_assignment.csv"
OUT_DIR = ROOT / "ai-docs/research/assets"
ENV = ROOT / ".env"

# 작업자별 핀 색 — HTML 범례와 같은 값을 쓴다
COLORS = {
    "작업자 A": "0xD32F2F", "작업자 B": "0x1976D2",
    "작업자 C": "0x388E3C", "작업자 D": "0x7B1FA2",
}
SUP_COLOR = "0xF57C00"
PILOT_COLOR = "0x00838F"
FORCE = "--force" in sys.argv


def color_for(worker: str) -> str:
    if worker.startswith("감독자"):
        return SUP_COLOR
    if worker.startswith("파일럿"):
        return PILOT_COLOR
    return COLORS.get(worker, "0x555555")


def api_key() -> str:
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith("GOOGLE_MAPS_API_KEY="):
            return line.split("=", 1)[1].strip().strip("'\"")
    sys.exit(".env 에 GOOGLE_MAPS_API_KEY 가 없다")


def main() -> None:
    key = api_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(SRC.open(encoding="utf-8")))

    by_day: dict[str, dict[str, list[tuple[str, str]]]] = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by_day[r["date"]][r["worker"]].append(
            (f'{float(r["latitude"]):.5f}', f'{float(r["longitude"]):.5f}')
        )

    for day in sorted(by_day):
        out = OUT_DIR / f"map_{day}.png"
        if out.exists() and not FORCE:
            print(f"{out.name} — 있음, 건너뜀")
            continue
        parts = [
            "size=640x420", "scale=2", "maptype=roadmap",
            "style=feature:poi%7Cvisibility:simplified",
        ]
        for worker, pts in sorted(by_day[day].items()):
            chain = "%7C".join(f"{la},{ln}" for la, ln in pts)
            parts.append(f"markers=size:tiny%7Ccolor:{color_for(worker)}%7C{chain}")
        url = "https://maps.googleapis.com/maps/api/staticmap?" + "&".join(parts) + f"&key={key}"
        if len(url) > 8000:
            print(f"{day} — URL {len(url)}자, 8000 초과 위험")
        req = urllib.request.Request(url, headers={"User-Agent": "saigon-rider-assignment/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if not data.startswith(b"\x89PNG"):
            sys.exit(f"{day} — PNG 아님: {data[:120]!r}")
        out.write_bytes(data)
        n = sum(len(v) for v in by_day[day].values())
        print(f"{out.name} — 핀 {n}개 / {len(data) // 1024}KB / URL {len(url)}자")


if __name__ == "__main__":
    main()
