"""임시 표기(category=etc, subtype=used_moto) → 정식 업종 코드(category=used_moto) 이관.

배경
  타깃 명단 CSV에는 중고 오토바이 매장이 정식 업종 코드가 없던 시점에
  category=etc + subtype=used_moto 로 임시 표기돼 있었다. DB 에 정식
  used_moto 업종 코드가 추가되므로(별도 워커 담당), 이 CSV 표기도 맞춘다.

하는 일
  subtype == "used_moto" 인 행의 category 를 etc → used_moto 로 변경.
  그 외 행(다른 subtype 값, 다른 category 값)은 전혀 건드리지 않는다.
  subtype 컬럼 자체는 다른 값(예: used_parts)에도 쓰이므로 그대로 둔다.

Usage:
    python3 scripts/migrate_used_moto_category.py
"""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path("/mnt/c/DEV/saigon_rider")
SRC = ROOT / "ai-docs/research/260810_field_agent_targets_clean.csv"
OUT = ROOT / "ai-docs/research/260810_field_agent_targets_clean_migrated.csv"


def main() -> None:
    with SRC.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    changed = 0
    for row in rows:
        if row["subtype"] == "used_moto":
            assert row["category"] == "etc", f"unexpected category {row['category']!r} on used_moto row: {row}"
            row["category"] = "used_moto"
            changed += 1

    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"rows: {len(rows)}, migrated (etc->used_moto): {changed}")
    print(f"written: {OUT}")


if __name__ == "__main__":
    main()
