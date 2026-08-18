"""수집 원본 → 현장 투입 가능한 타깃 명단으로 정제.

하는 일
  1. 매물 가능 업종은 2차 스윕본(평점·전화·영업상태 포함)으로 교체, 그 외 업종은 1차본 유지
  2. 좌표 기준 중복 제거 (매물 가능 행 우선)
  3. 주소에 섞인 지도 아이콘 글리프(사설영역 문자) 제거
  4. 제외 — 영구폐업 · 자동차 업체 · 제조/도매/법인(소매점 아님)
  5. 후순위 표시 — 임시휴업 · 리뷰 없음 · 체인(동일 상호 3곳 이상)

Usage:
    python3 scripts/clean_targets.py [2차스윕CSV]
"""

from __future__ import annotations

import csv
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
V2 = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/targets_listing_v2.csv")
V1 = ROOT / "ai-docs/research/260810_field_agent_targets.csv"
OUT = ROOT / "ai-docs/research/260810_field_agent_targets_clean.csv"
REPORT = ROOT / "ai-docs/research/260810_field_agent_targets_excluded.csv"

LISTING_CATS = {"parts", "gear", "accessory"}     # 1차본 기준 매물 가능 업종

# 자동차 업체 — 오토바이 서비스가 아니다. NFKC 정규화(수학 볼드체 → ASCII) 후 판정
CAR = re.compile(r"ô\s*tô|ôtô|auto|xe hơi|xe hoi|4 bánh|\bcar\b", re.I)
# 소매 점포가 아닌 것 — 제조·도매·법인·창고
NON_RETAIL = re.compile(r"công ty|\bcty\b|xưởng|nhà máy|sản xuất|giá sỉ|bán sỉ|\bkho\b", re.I)


def norm(s: str) -> str:
    """수학 볼드체 등 호환문자를 ASCII 로 접어 필터가 먹게 한다."""
    return unicodedata.normalize("NFKC", s)


def strip_glyphs(s: str) -> str:
    """지도 카드 아이콘(사설영역 PUA)·치환문자 제거 후 앞쪽 구분자 정리."""
    out = "".join(c for c in s if unicodedata.category(c) not in ("Co", "Cn") and ord(c) != 0xFFFD)
    return re.sub(r"^[\s·•\-]+", "", out).strip()


def read(p: Path) -> list[dict]:
    return list(csv.DictReader(p.open(encoding="utf-8"))) if p.exists() else []


def main() -> None:
    v2, v1 = read(V2), read(V1)
    if not v2:
        sys.exit(f"2차 스윕본이 없다: {V2}")

    merged: dict[tuple, dict] = {}

    def put(r: dict, listing: bool, prefer: bool) -> None:
        key = (round(float(r["latitude"]), 5), round(float(r["longitude"]), 5))
        if key in merged and not prefer:
            return
        merged[key] = {
            "name": norm(r["name"]).strip(),
            "category": r["category"],
            "subtype": r.get("subtype", ""),
            "listing_capable": "Y" if listing else "N",
            "address": strip_glyphs(r["address"]),
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "phone": r.get("phone", ""),
            "rating": r.get("rating", ""),
            "reviews": r.get("reviews", ""),
            "no_review": r.get("no_review", ""),
            "status": r.get("status", ""),
        }

    for r in v1:                                   # 1차본 — 매물 불가 업종만 채택
        if r["category"] not in LISTING_CATS:
            put(r, listing=False, prefer=False)
    for r in v2:                                   # 2차본 — 매물 가능 업종, 항상 우선
        put(r, listing=True, prefer=True)

    rows = list(merged.values())

    # 체인 판정 — 같은 상호가 3곳 이상
    chain = {n for n, c in Counter(r["name"].lower() for r in rows).items() if c >= 3}

    kept, dropped = [], []
    for r in rows:
        n = r["name"]
        reason = ""
        if r["status"] == "PERM_CLOSED":
            reason = "영구폐업"
        elif CAR.search(n):
            reason = "자동차 업체"
        elif NON_RETAIL.search(n):
            reason = "제조/도매/법인"
        if reason:
            r["excluded_reason"] = reason
            dropped.append(r)
            continue

        flags = []
        if r["status"] == "TEMP_CLOSED":
            flags.append("임시휴업")
        if r["no_review"] == "Y":
            flags.append("리뷰없음")
        if n.lower() in chain:
            flags.append("체인")
        r["flags"] = " · ".join(flags)
        kept.append(r)

    cols = ["name", "category", "subtype", "listing_capable", "address", "latitude", "longitude",
            "phone", "rating", "reviews", "status", "flags"]
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(kept, key=lambda r: (r["listing_capable"] != "Y", r["category"], r["name"])))
    with REPORT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols + ["excluded_reason"], extrasaction="ignore")
        w.writeheader()
        w.writerows(dropped)

    lc = [r for r in kept if r["listing_capable"] == "Y"]
    clean_lc = [r for r in lc if not r["flags"]]
    print(f"병합 {len(rows):,}곳 → 유지 {len(kept):,} / 제외 {len(dropped)}")
    print(f"  제외 사유: {dict(Counter(r['excluded_reason'] for r in dropped))}")
    print(f"\n매물 가능 {len(lc)}곳 (그중 후순위 표시 없는 순수 {len(clean_lc)}곳)")
    print(f"  서브타입: {dict(Counter(r['subtype'] for r in lc if r['subtype']))}")
    print(f"  후순위 표시: {dict(Counter(f for r in lc for f in r['flags'].split(' · ') if f))}")
    print(f"  전화 보유 {sum(1 for r in lc if r['phone'])} / 평점 보유 {sum(1 for r in lc if r['rating'])}")
    need = 528
    print(f"\n공급 검증 — 필요 {need}곳")
    for label, pool in (("전체 매물가능", len(lc)), ("후순위 제외", len(clean_lc))):
        d = pool - need
        print(f"  {label:<12}{pool:>5}곳 → {'여유 ' + str(d) if d >= 0 else '부족 ' + str(-d)}곳"
              f" ({d / need * 100:+.0f}%)")
    print(f"\n{OUT.name} / {REPORT.name}")


if __name__ == "__main__":
    main()
