#!/usr/bin/env python3
"""
Saigon Rider — 미션 reward_bundle v2 (RPG 경제 재설계)

v1 → v2 핵심 변경:
- 미션은 통화 파밍이 본업. 아이템·박스 직접 지급은 거의 제거.
- Daily/Weekly/Monthly: 아이템 0, 박스 0. 순수 GP + SXP만.
- Season 미션: 마지막 정복자 미션(no>=7)만 시즌 한정 아이템 1개 보장 (= 보스 드랍).
- Anniversary 미션: LEGEND 컬렉션 일부만 직접 보상 (=주년 한정).
- 박스 보상 전면 제거 → 가챠 시스템이 박스 역할 대체.
- 큰 도전 미션 (M-RD-03 1000km 등)은 GC 보너스로 보상 (가챠 1~2회 비용).

결과: 1년 미션 클리어로 받는 아이템 약 10개, 박스 0개.
      나머지는 모두 상점/가챠로 능동 획득.
"""
import csv
import json
import random
import re
from collections import defaultdict
from pathlib import Path

random.seed(123)

OUT_DIR = Path("/home/claude")
CODE_RE = re.compile(r"^([ODWMSA])-([A-Z]+)-(\d+)$")

WINDOW_PREFIX = {
    "O": "onboarding", "D": "calendar_day", "W": "calendar_week",
    "M": "calendar_month", "S": "season", "A": "season",
}

# 시즌 라벨 → 컬렉션
SEASON_LABEL_COLLECTION = {
    "TET": "TET_FESTIVAL",
    "SPRING": "MEKONG_DELTA",
    "RAIN": "MEKONG_DELTA",
    "SUM": "NEON_SAIGON",
    "INDEP": "STREET_CLASSIC",
    "MID": "TET_FESTIVAL",
    "XMAS": "SAIGON_GHOST",
    "DRY": "STREET_CLASSIC",
    "ANNUAL": "LEGEND_OF_SAIGON",
}


def build_mission_catalog():
    """v1과 동일한 240개 미션 카탈로그 생성."""
    catalog = []
    # Onboarding (15)
    catalog += [
        ("O-RD-01", "RIDING"),    ("O-RD-02", "RIDING"),    ("O-RD-03", "RIDING"),
        ("O-MT-01", "MAINT"),     ("O-MT-02", "MAINT"),     ("O-MT-03", "MAINT"),
        ("O-MK-01", "MARKET"),    ("O-MK-02", "MARKET"),
        ("O-CM-01", "COMMUNITY"), ("O-CM-02", "COMMUNITY"), ("O-CM-03", "COMMUNITY"),
        ("O-DL-01", "DELIVERY"),
        ("O-MX-01", "MIXED"),     ("O-MX-02", "MIXED"),     ("O-MX-03", "MIXED"),
    ]
    # Daily (72)
    for i in range(1, 21): catalog.append((f"D-RD-{i:02d}", "RIDING"))
    for i in range(1, 13): catalog.append((f"D-MT-{i:02d}", "MAINT"))
    for i in range(1, 13): catalog.append((f"D-MK-{i:02d}", "MARKET"))
    for i in range(1, 13): catalog.append((f"D-CM-{i:02d}", "COMMUNITY"))
    for i in range(1, 11): catalog.append((f"D-DL-{i:02d}", "DELIVERY"))
    for i in range(1, 7):  catalog.append((f"D-MX-{i:02d}", "MIXED"))
    # Weekly (62)
    for i in range(1, 16): catalog.append((f"W-RD-{i:02d}", "RIDING"))
    for i in range(1, 11): catalog.append((f"W-MT-{i:02d}", "MAINT"))
    for i in range(1, 11): catalog.append((f"W-MK-{i:02d}", "MARKET"))
    for i in range(1, 13): catalog.append((f"W-CM-{i:02d}", "COMMUNITY"))
    for i in range(1, 11): catalog.append((f"W-DL-{i:02d}", "DELIVERY"))
    for i in range(1, 6):  catalog.append((f"W-MX-{i:02d}", "MIXED"))
    # Monthly (32)
    for i in range(1, 9):  catalog.append((f"M-RD-{i:02d}", "RIDING"))
    for i in range(1, 6):  catalog.append((f"M-MT-{i:02d}", "MAINT"))
    for i in range(1, 6):  catalog.append((f"M-MK-{i:02d}", "MARKET"))
    for i in range(1, 6):  catalog.append((f"M-CM-{i:02d}", "COMMUNITY"))
    for i in range(1, 5):  catalog.append((f"M-DL-{i:02d}", "DELIVERY"))
    for i in range(1, 6):  catalog.append((f"M-MX-{i:02d}", "MIXED"))

    # Seasonal (50) + Anniversary (9)
    catalog_with_season = [(c, cat, None) for c, cat in catalog]
    seasons = [("TET", 8), ("SPRING", 6), ("RAIN", 6), ("SUM", 7),
               ("INDEP", 6), ("MID", 6), ("XMAS", 5), ("DRY", 6)]
    for label, n in seasons:
        cats = {"TET":    ["RIDING"]*3+["COMMUNITY","RIDING","COMMUNITY","COMMUNITY","MIXED"],
                "SPRING": ["RIDING","RIDING","MAINT","COMMUNITY","MIXED","RIDING"],
                "RAIN":   ["RIDING","RIDING","MAINT","MAINT","COMMUNITY","MIXED"],
                "SUM":    ["RIDING","RIDING","MAINT","MARKET","COMMUNITY","MIXED","RIDING"],
                "INDEP":  ["RIDING","COMMUNITY","MAINT","MARKET","RIDING","MIXED"],
                "MID":    ["COMMUNITY","RIDING","RIDING","MAINT","MIXED","COMMUNITY"],
                "XMAS":   ["COMMUNITY","RIDING","COMMUNITY","MIXED","RIDING"],
                "DRY":    ["RIDING","MAINT","MARKET","RIDING","COMMUNITY","MIXED"]}[label]
        for i in range(1, n + 1):
            catalog_with_season.append((f"S-{label}-{i:02d}", cats[i-1], label))
    annual = [
        ("A-MX-01", "MIXED",    "ANNUAL"), ("A-MX-02", "MIXED",    "ANNUAL"),
        ("A-MX-03", "RIDING",   "ANNUAL"), ("A-MX-04", "RIDING",   "ANNUAL"),
        ("A-MX-05", "COMMUNITY","ANNUAL"), ("A-MX-06", "MIXED",    "ANNUAL"),
        ("A-MX-07", "RIDING",   "ANNUAL"), ("A-MX-08", "RIDING",   "ANNUAL"),
        ("A-MX-09", "MIXED",    "ANNUAL"),
    ]
    return catalog_with_season + annual


def parse_code(code):
    m = CODE_RE.match(code)
    assert m, f"Invalid code: {code}"
    return m.group(1), m.group(2), int(m.group(3)), WINDOW_PREFIX[m.group(1)]


# ──────────────────────────────────────────────────────────────────────────
# 보상 매트릭스 v2 — 통화 중심
# ──────────────────────────────────────────────────────────────────────────
def reward_for_onboarding(code, cat, no):
    """O-*: GP만. 졸업 미션 (O-MX-03)에 GC 약간."""
    base_gp = {"RIDING": 80, "MAINT": 100, "MARKET": 60, "COMMUNITY": 80,
               "DELIVERY": 150, "MIXED": 120}[cat]
    if code == "O-MX-02":   # 신규 미션 8개+ (메타)
        return {"gp": 800, "gc": 10, "sxp": 0, "items": [], "boxes": []}
    if code == "O-MX-03":   # 졸업 미션
        return {"gp": 1500, "gc": 30, "sxp": 0, "items": [], "boxes": []}
    return {"gp": base_gp + (no - 1) * 50, "gc": 0, "sxp": 0,
            "items": [], "boxes": []}


def reward_for_daily(code, cat, no):
    """D-*: 빈도 높음. GP + SXP만. 아이템·박스 0."""
    base = {"RIDING": (30, 100), "MAINT": (50, 110), "MARKET": (30, 80),
            "COMMUNITY": (30, 80), "DELIVERY": (50, 130), "MIXED": (60, 130)}[cat]
    gp = round(random.randint(*base), -1)
    return {"gp": gp, "gc": 0, "sxp": max(5, gp // 8),
            "items": [], "boxes": []}


def reward_for_weekly(code, cat, no):
    """W-*: GP + SXP. 7일 연속 미션만 GC 보너스."""
    base = {"RIDING": (200, 600), "MAINT": (150, 500), "MARKET": (150, 450),
            "COMMUNITY": (150, 450), "DELIVERY": (200, 600), "MIXED": (300, 700)}[cat]
    gp = round(random.randint(*base), -2)
    bundle = {"gp": gp, "gc": 0, "sxp": max(40, gp // 5),
              "items": [], "boxes": []}
    # 7일 연속 streak 미션 = GC 5 보너스 (가챠 BASIC 1회 분량 + a)
    if code in ("W-RD-04", "W-DL-06"):
        bundle["gp"] = 800
        bundle["gc"] = 5
        bundle["sxp"] = 150
    return bundle


def reward_for_monthly(code, cat, no):
    """M-*: GP + SXP. 대형 도전 미션만 GC 보너스. 아이템 직접 지급 없음."""
    base = {"RIDING": (700, 2500), "MAINT": (500, 1800), "MARKET": (500, 1800),
            "COMMUNITY": (500, 1800), "DELIVERY": (800, 2500),
            "MIXED": (1000, 2500)}[cat]
    gp = round(random.randint(*base), -2)
    bundle = {"gp": gp, "gc": 0, "sxp": max(100, gp // 7),
              "items": [], "boxes": []}
    # 가장 큰 도전 미션 (1000km, 2000건 배달 등) — GC 보너스로 가챠 1~2회 가능
    if code in ("M-RD-03", "M-DL-03", "M-MX-01", "M-MX-03"):
        bundle["gp"] = 3000
        bundle["gc"] = 25
        bundle["sxp"] = 400
    return bundle


def reward_for_season(code, cat, no, label):
    """
    S-*: 시즌 미션. 통화 위주.
    no >= 7 (시즌 정복자 미션)에만 시즌 한정 아이템 1개 보장 = "보스 드랍".
    그 외엔 통화만 + GC는 후반 미션에만.
    """
    if label == "ANNUAL":
        return reward_for_anniversary(code, cat, no)

    season_col = SEASON_LABEL_COLLECTION[label]
    bundle = {"gp": 0, "gc": 0, "sxp": 0, "items": [], "boxes": []}

    if no == 1:
        bundle.update({"gp": 400, "gc": 0,  "sxp": 80})
    elif no == 2:
        bundle.update({"gp": 600, "gc": 0,  "sxp": 100})
    elif no == 3:
        bundle.update({"gp": 1000, "gc": 5, "sxp": 150})
    elif no == 4:
        bundle.update({"gp": 1500, "gc": 10, "sxp": 200})
    elif no == 5:
        bundle.update({"gp": 2000, "gc": 15, "sxp": 250})
    elif no == 6:
        bundle.update({"gp": 2500, "gc": 25, "sxp": 300})
    elif no == 7:  # 정복자 — Legendary 보장
        bundle.update({"gp": 3000, "gc": 40, "sxp": 350,
                       "items": [{"item_code": _pick_item("L", season_col, code),
                                  "on_duplicate": "REFUND_GP"}]})
    elif no >= 8:  # 시즌 마스터 — 시즌 끝물
        bundle.update({"gp": 4000, "gc": 60, "sxp": 400,
                       "items": [{"item_code": _pick_item("L", season_col, code),
                                  "on_duplicate": "REFUND_GP"}]})
    return bundle


def reward_for_anniversary(code, cat, no):
    """A-*: 주년 = Legend 컬렉션 + GC 풍부. 4개 미션에만 아이템 직접."""
    bundle = {"gp": 0, "gc": 0, "sxp": 0, "items": [], "boxes": []}
    if code == "A-MX-01":   # 주년 당일 라이딩
        bundle.update({"gp": 1500, "gc": 50,  "sxp": 250})
    elif code == "A-MX-02": # 365일 가입
        bundle.update({"gp": 3000, "gc": 150, "sxp": 350,
                       "items": [{"item_code": _pick_item("L", "LEGEND_OF_SAIGON", code),
                                  "on_duplicate": "REFUND_GP"}]})
    elif code == "A-MX-03": # 5000km
        bundle.update({"gp": 4000, "gc": 80,  "sxp": 450})
    elif code == "A-MX-04": # 10000km — 진짜 베테랑
        bundle.update({"gp": 6000, "gc": 300, "sxp": 600,
                       "items": [{"item_code": _pick_item("M", "LEGEND_OF_SAIGON", code),
                                  "on_duplicate": "REFUND_GC"}]})
    elif code == "A-MX-05": # 친구 3명
        bundle.update({"gp": 2000, "gc": 100, "sxp": 300})
    elif code == "A-MX-06": # 5개 카테고리
        bundle.update({"gp": 2500, "gc": 70,  "sxp": 350,
                       "items": [{"item_code": _pick_item("L", "LEGEND_OF_SAIGON", code),
                                  "on_duplicate": "REFUND_GP"}]})
    elif code == "A-MX-07":
        bundle.update({"gp": 3000, "gc": 120, "sxp": 400})
    elif code == "A-MX-08":
        bundle.update({"gp": 2500, "gc": 60,  "sxp": 350})
    elif code == "A-MX-09": # 최종 회고
        bundle.update({"gp": 4000, "gc": 200, "sxp": 500,
                       "items": [{"item_code": _pick_item("M", "LEGEND_OF_SAIGON", code),
                                  "on_duplicate": "REFUND_GC"}]})
    return bundle


# ──────────────────────────────────────────────────────────────────────────
# 아이템 픽 (보존)
# ──────────────────────────────────────────────────────────────────────────
_ITEM_POOL = None
_ITEM_PICK_INDEX = defaultdict(int)

def _load_item_pool():
    global _ITEM_POOL
    if _ITEM_POOL is not None:
        return _ITEM_POOL
    pool = defaultdict(list)
    with open(OUT_DIR / "item_definition.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pool[(row["collection_code"], row["rarity"])].append(row["item_code"])
    for key in pool:
        random.shuffle(pool[key])
    _ITEM_POOL = pool
    return pool


def _pick_item(rarity, collection, mission_code):
    pool = _load_item_pool()
    candidates = pool.get((collection, rarity))
    if not candidates:
        for col in ["NEON_SAIGON", "MEKONG_DELTA", "DELIVERY_HUSTLE",
                    "TET_FESTIVAL", "SAIGON_GHOST", "LEGEND_OF_SAIGON",
                    "STREET_CLASSIC"]:
            if col != collection:
                alt = pool.get((col, rarity))
                if alt:
                    candidates = alt
                    collection = col
                    break
    if not candidates:
        rarity_chain = {"M": "L", "L": "E", "E": "R", "R": "C", "C": "R"}
        alt = pool.get((collection, rarity_chain[rarity]))
        if alt:
            candidates = alt
    assert candidates
    idx = _ITEM_PICK_INDEX[(collection, rarity)] % len(candidates)
    _ITEM_PICK_INDEX[(collection, rarity)] += 1
    return candidates[idx]


def build_reward_bundle(code, cat, season_label):
    prefix, mid, no, window = parse_code(code)
    if prefix == "O": return reward_for_onboarding(code, cat, no)
    if prefix == "D": return reward_for_daily(code, cat, no)
    if prefix == "W": return reward_for_weekly(code, cat, no)
    if prefix == "M": return reward_for_monthly(code, cat, no)
    if prefix == "S": return reward_for_season(code, cat, no, season_label)
    if prefix == "A": return reward_for_anniversary(code, cat, no)
    raise ValueError(prefix)


def write_sql(rows, path):
    lines = ["-- ─────────────────────────────────────────────────────────"]
    lines.append("-- Saigon Rider — Mission Reward Bundle v2 (RPG 경제)")
    lines.append("-- 자동 생성: build_mission_reward_bundle_v2.py")
    lines.append("-- 핵심: 미션은 통화 파밍, 아이템은 상점/가챠로 획득")
    lines.append(f"-- 미션 수: {len(rows)}, 아이템 직접 지급 미션은 시즌 정복자 + 주년 일부만")
    lines.append("-- ─────────────────────────────────────────────────────────\n")
    lines.append("BEGIN;\n")
    for r in rows:
        b = json.dumps(r["reward_bundle"], ensure_ascii=False).replace("'", "''")
        lines.append(
            f"UPDATE mission_definition SET reward_bundle = '{b}'::jsonb "
            f"WHERE mission_code = '{r['mission_code']}';"
        )
    lines.append("\nCOMMIT;")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_csv(rows, path):
    cols = ["mission_code", "window_type", "category", "season_label",
            "gp", "gc", "sxp", "n_items", "n_boxes", "first_item"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            b = r["reward_bundle"]
            w.writerow({
                "mission_code": r["mission_code"], "window_type": r["window_type"],
                "category": r["category"], "season_label": r.get("season_label") or "",
                "gp": b.get("gp", 0), "gc": b.get("gc", 0), "sxp": b.get("sxp", 0),
                "n_items": len(b.get("items", [])),
                "n_boxes": sum(x["count"] for x in b.get("boxes", [])),
                "first_item": b["items"][0]["item_code"] if b.get("items") else "",
            })


def main():
    _load_item_pool()
    catalog = build_mission_catalog()
    rows = []
    for code, cat, season_label in catalog:
        rows.append({
            "mission_code": code,
            "window_type": parse_code(code)[3],
            "category": cat, "season_label": season_label,
            "reward_bundle": build_reward_bundle(code, cat, season_label),
        })
    assert len(rows) == 240

    write_sql(rows, OUT_DIR / "sre-mission-reward-bundle.sql")
    write_csv(rows, OUT_DIR / "mission_reward_bundle.csv")

    print(f"✅ 미션 {len(rows)}개 reward_bundle v2 재생성 완료\n")
    by_win = defaultdict(lambda: {"count": 0, "gp": 0, "gc": 0, "sxp": 0,
                                   "items": 0, "boxes": 0, "missions_with_item": 0})
    for r in rows:
        b = r["reward_bundle"]
        w = r["window_type"]
        d = by_win[w]
        d["count"] += 1
        d["gp"] += b.get("gp", 0)
        d["gc"] += b.get("gc", 0)
        d["sxp"] += b.get("sxp", 0)
        d["items"] += len(b.get("items", []))
        d["boxes"] += sum(x["count"] for x in b.get("boxes", []))
        if b.get("items"):
            d["missions_with_item"] += 1

    print(f"  {'Window':<18} {'N':>4} {'GP합':>8} {'GC합':>6} {'SXP합':>8} {'아이템':>6} {'박스':>5} {'아이템지급미션':>14}")
    for w in ["onboarding", "calendar_day", "calendar_week", "calendar_month", "season"]:
        d = by_win[w]
        print(f"  {w:<18} {d['count']:>4} {d['gp']:>8} {d['gc']:>6} {d['sxp']:>8} {d['items']:>6} {d['boxes']:>5} {d['missions_with_item']:>14}")
    tot = {k: sum(d[k] for d in by_win.values()) for k in ("gp","gc","sxp","items","boxes","missions_with_item")}
    print(f"\n  총 GP: {tot['gp']:,} | GC: {tot['gc']:,} | SXP: {tot['sxp']:,}")
    print(f"  총 아이템: {tot['items']} (아이템 지급 미션: {tot['missions_with_item']}개) | 박스: {tot['boxes']}")
    print(f"\n  v1 대비: 아이템 52→{tot['items']} ({100*tot['items']//52}%), "
          f"박스 72→{tot['boxes']} (0%)")


if __name__ == "__main__":
    main()
