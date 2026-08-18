"""타깃 명단 → 일자 × 작업자 × 업체 × 등록품목 배정표 생성.

대표 지시("이날에는 이지역 이업체 이물건 등록 시켜라") 대응 산출물.

배정 원칙
  1. 매물이 나오는 업종(SHOPPING)이 희소 자원이므로 이것부터 배치한다.
     하루 방문 32곳 = SHOPPING 16 + 그 외 16 (단가 rev.2 §7).
  2. 런칭 존은 SHOPPING 밀도 상위 동부터 필요량을 채울 때까지 누적 선정한다.
  3. 동 순회 순서는 중심좌표 최근접 체인(NN)으로 잡아 작업자가 인접 구역을 이어서 돈다.
  4. 작업자 1명은 체인의 연속 구간을 8일에 걸쳐 소화한다 — 매일 멀리 튀지 않게.
  5. 그 외 업종은 그날 SHOPPING 무게중심에서 가까운 순으로 채운다.

Usage:
    python3 scripts/build_assignment_sheet.py
"""

from __future__ import annotations

import csv
import html
import math
import re
import sys
from datetime import date
from pathlib import Path

_a = dict(zip((x.lstrip("-") for x in sys.argv[1::2]), sys.argv[2::2]))

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ai-docs/research/260810_field_agent_targets_by_ward.csv"
WARD_SQL = ROOT / "database/init/159_wards_seed.sql"
OUT_HTML = ROOT / "ai-docs/research/260810_field_agent_assignment.html"
OUT_CSV = ROOT / "ai-docs/research/260810_field_agent_assignment.csv"
MAPS = ROOT / "ai-docs/research/assets"

# 매물 가능 판정은 listing_capable 컬럼 (중고 오토바이는 etc/used_moto 로 담긴다 — D-17)
def is_listing(r: dict) -> bool:
    return r.get("listing_capable") == "Y"
LABEL = {
    "repair": "정비/수리", "wash": "세차", "tire": "타이어", "fuel": "주유",
    "parts": "용품", "gear": "헬멧·보호구", "accessory": "튜닝·액세서리",
    "cafe": "카페", "food": "음식", "convenience": "편의점",
    "parking": "주차장", "laundry": "세탁", "phone_repair": "폰수리",
    "towing": "견인", "etc": "기타",
}
# 등록 품목 세트 — 방문 전에 실물을 알 수 없으므로 업종별 표준안을 주고 현장에서 치환한다
ITEM_SET = {
    "parts": ("미러 · 머플러 · 브레이크패드 · 체인 중 2점", 2),
    "gear": ("헬멧 2종 (풀페이스 / 하프)", 2),
    "accessory": ("핸들바 · LED · 데칼 · 시트커버 중 2점", 2),
}
SUBTYPE_ITEM = {                       # 서브타입이 있으면 카테고리보다 우선
    "used_moto": ("중고 오토바이 2대 (연식·주행거리 확인)", 2),
    "used_parts": ("중고 부품 2점", 2),
}
SUBTYPE_LABEL = {"used_moto": "중고 오토바이", "used_parts": "중고 용품"}
NO_ITEM = ("가입만", 0)

def item_for(r: dict) -> tuple[str, int]:
    return SUBTYPE_ITEM.get(r.get("subtype") or "") or ITEM_SET.get(r["category"], NO_ITEM)


def label_for(r: dict) -> str:
    return SUBTYPE_LABEL.get(r.get("subtype") or "") or LABEL.get(r["category"], r["category"])


WORKERS = ["작업자 A", "작업자 B", "작업자 C", "작업자 D"]
MAIN_DAYS = [date(2026, 8, d) for d in (18, 19, 20, 21, 24, 25, 26, 27)]
PILOT_DAY = date(2026, 8, 17)
# 하루 방문 32곳의 구성 — 매물 가능 업종을 몇 곳 넣느냐가 곧 매물 산출량이다.
# 2026-08-11 명단 재확보(매물가능 1,240곳)로 원안(매물 12건/일)이 가능해져 24/8 로 되돌렸다.
SHOP_PER_DAY = int(_a.get("shopPerDay", 24))
OTHER_PER_DAY = 32 - SHOP_PER_DAY
LISTINGS_PER_DAY = int(_a.get("listingsPerDay", 12))

# 감독자도 현장 작업을 겸한다(대표 확인, 2026-08-11). 순회·검수에 절반을 쓴다고 보고
# 가동률 50% — 하루 16방문(매물 업종 12 + 그 외 4) → 가입 4곳 · 매물 6건.
SUP_VISITS = int(_a.get("supVisits", 16))
SUP_SHOP = SUP_VISITS * SHOP_PER_DAY // 32
SUP_LISTINGS = LISTINGS_PER_DAY * SUP_VISITS // 32
WD = "월화수목금토일"
PIN = {"작업자 A": "#D32F2F", "작업자 B": "#1976D2", "작업자 C": "#388E3C",
       "작업자 D": "#7B1FA2"}


def pin_for(worker: str) -> str:
    if worker.startswith("감독자"):
        return "#F57C00"
    if worker.startswith("파일럿"):
        return "#00838F"
    return PIN.get(worker, "#555")


def haversine(a_lat, a_lng, b_lat, b_lng) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def load_ward_centers() -> dict[str, tuple[float, float]]:
    sql = WARD_SQL.read_text(encoding="utf-8")
    pat = r"\('HCMC_[A-Z_]+',\s*'HCMC',\s*'([^']*)',\s*'[^']*',\s*([\d.]+),\s*([\d.]+)"
    return {m[1]: (float(m[2]), float(m[3])) for m in re.finditer(pat, sql)}


def nn_chain(names: list[str], centers: dict[str, tuple[float, float]], start: str) -> list[str]:
    """중심좌표 최근접 체인 — 인접한 동끼리 이어지도록 순회 순서를 만든다."""
    left, chain, cur = set(names), [start], start
    left.discard(start)
    while left:
        cy, cx = centers[cur]
        cur = min(left, key=lambda w: haversine(cy, cx, *centers[w]))
        left.discard(cur)
        chain.append(cur)
    return chain


def main() -> None:
    rows = [r for r in csv.DictReader(SRC.open(encoding="utf-8"))
            if not r["ward"].startswith("구역 외")]
    for r in rows:
        r["lat"], r["lng"] = float(r["latitude"]), float(r["longitude"])

    centers = load_ward_centers()
    shop_all = [r for r in rows if is_listing(r)]
    other_all = [r for r in rows if not is_listing(r)]

    slots = len(WORKERS) * len(MAIN_DAYS) + 1          # 작업자 32 + 파일럿 1
    # 런칭 존은 작업자분 + 감독자분을 합쳐 선정한다
    need_shop = slots * SHOP_PER_DAY + len(MAIN_DAYS) * SUP_SHOP

    # ── 런칭 존 선정 — SHOPPING 밀도 상위 동부터 필요량까지 누적
    per_ward: dict[str, list[dict]] = {}
    for r in shop_all:
        per_ward.setdefault(r["ward"], []).append(r)
    ranked = sorted(per_ward.items(), key=lambda kv: -len(kv[1]))
    zone, cum = [], 0
    for ward, items in ranked:
        zone.append(ward)
        cum += len(items)
        if cum >= need_shop:
            break

    chain = nn_chain(zone, centers, ranked[0][0])

    # ── 체인 순서로 SHOPPING 을 슬롯에 채운다
    pool: list[dict] = []
    for ward in chain:
        pool.extend(sorted(per_ward[ward], key=lambda r: (r["category"], r["name"])))
    buckets = [pool[i * SHOP_PER_DAY:(i + 1) * SHOP_PER_DAY] for i in range(slots)]
    sup_pool = pool[slots * SHOP_PER_DAY:]             # 감독자는 남은 매물 업종에서 뽑는다

    # ── 슬롯 → (날짜, 작업자). 작업자 1명이 체인의 연속 구간을 8일에 걸쳐 소화한다
    plan: list[dict] = []
    plan.append({"date": PILOT_DAY, "worker": "파일럿 (1명)", "shops": buckets[0], "pilot": True})
    for wi, worker in enumerate(WORKERS):
        for di, day in enumerate(MAIN_DAYS):
            plan.append({
                "date": day, "worker": worker,
                "shops": buckets[1 + wi * len(MAIN_DAYS) + di], "pilot": False,
            })

    # ── 그 외 업종은 그날 SHOPPING 무게중심에서 가까운 순으로
    used: set[int] = set()
    for slot in plan:
        pts = slot["shops"]
        if not pts:
            slot["others"] = []
            continue
        cy = sum(p["lat"] for p in pts) / len(pts)
        cx = sum(p["lng"] for p in pts) / len(pts)
        cand = sorted(
            (r for i, r in enumerate(other_all) if i not in used),
            key=lambda r: haversine(cy, cx, r["lat"], r["lng"]),
        )[:OTHER_PER_DAY]
        for r in cand:
            used.add(other_all.index(r))
        slot["others"] = cand
        slot["center"] = (cy, cx)

    # ── 감독자 — 매일 담당 작업자를 정해 그 구역 "인근"에서 작업하며 순회·검수를 겸한다.
    #    작업자 구역의 후보는 이미 소진됐으므로 같은 동이 아니라 무게중심에서 가장 가까운
    #    남은 후보를 잡는다 — 라벨도 "동행"이 아니라 "○조 순회"로 표기한다.
    sup_used: set[int] = set()
    sup_slots: list[dict] = []
    for di, day in enumerate(MAIN_DAYS):
        buddy = WORKERS[di % len(WORKERS)]
        base = next(s2 for s2 in plan if s2["date"] == day and s2["worker"] == buddy)
        cy, cx = base["center"]
        shops = sorted((r for i, r in enumerate(sup_pool) if i not in sup_used),
                       key=lambda r: haversine(cy, cx, r["lat"], r["lng"]))[:SUP_SHOP]
        for r in shops:
            sup_used.add(sup_pool.index(r))
        others = sorted((r for i, r in enumerate(other_all) if i not in used),
                        key=lambda r: haversine(cy, cx, r["lat"], r["lng"]))[:SUP_VISITS - SUP_SHOP]
        for r in others:
            used.add(other_all.index(r))
        sup_slots.append({"date": day, "worker": f"감독자 ({buddy[-1]}조 순회)",
                          "shops": shops, "others": others, "pilot": False, "sup": True})
    plan.extend(sup_slots)
    plan.sort(key=lambda s2: (s2["date"], s2.get("sup", False), s2["worker"]))

    # ── CSV (한 행 = 한 방문)
    cols = ["date", "weekday", "worker", "seq", "ward", "name", "category", "category_ko",
            "address", "phone", "latitude", "longitude", "map_url", "item_set", "target_listings"]
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for slot in plan:
            visits = slot["shops"] + slot["others"]
            for i, r in enumerate(visits, 1):
                item, n = item_for(r)
                w.writerow([
                    slot["date"].isoformat(), WD[slot["date"].weekday()], slot["worker"], i,
                    r["ward"], r["name"], r["category"], label_for(r),
                    r["address"], r.get("phone", ""), r["latitude"], r["longitude"],
                    r["map_url"], item, n,
                ])

    # ── HTML
    e = html.escape
    by_date: dict[date, list[dict]] = {}
    for slot in plan:
        by_date.setdefault(slot["date"], []).append(slot)

    total_visits = sum(len(s["shops"]) + len(s["others"]) for s in plan)
    total_shop = sum(len(s["shops"]) for s in plan)

    day_html = []
    for d in sorted(by_date):
        slots_d = by_date[d]
        head = f"{d.month}/{d.day}({WD[d.weekday()]})"
        tag = " · 파일럿" if slots_d[0]["pilot"] else ""
        # ── 일자 커버 — 핀 지도 + 담당자별 요약 (빈 페이지로 낭비되던 자리)
        cov_rows, tv, ts, tg, tl = [], 0, 0, 0, 0
        for slot in slots_d:
            ws = []
            for r in slot["shops"]:
                if r["ward"] not in ws:
                    ws.append(r["ward"])
            n_all = len(slot["shops"]) + len(slot["others"])
            n_sh = len(slot["shops"])
            lst = SUP_LISTINGS if slot.get("sup") else LISTINGS_PER_DAY
            jn = (SUP_VISITS * 25) // 100 if slot.get("sup") else 8
            tv += n_all; ts += n_sh; tg += jn; tl += lst
            cov_rows.append(
                f'<tr><td class="pin"><i style="background:{pin_for(slot["worker"])}"></i>'
                f'{e(slot["worker"])}</td><td class="wd">{e(" · ".join(ws))}</td>'
                f'<td class="n">{n_all}</td><td class="n sh">{n_sh}</td>'
                f'<td class="n">{jn} / {lst}</td></tr>'
            )
        mp = MAPS / f"map_{d.isoformat()}.png"
        map_html = (f'<div class="cmap"><img src="assets/{mp.name}" alt="{head} 방문 구역">'
                    f'<div class="attr">지도 데이터 ©2026 Google · 핀 색 = 담당자</div></div>'
                    if mp.exists() else '')
        cover = (
            f'<div class="cover">{map_html}<div class="cinfo">'
            f'<div class="ckpi"><b>{len(slots_d)}명</b> 투입 · 방문 <b>{tv}</b>곳'
            f'(매물업종 {ts}) · 목표 가입 <b>{tg}</b>곳 / 매물 <b>{tl}</b>건</div>'
            f'<table class="clg"><thead><tr><th>담당</th><th>구역</th><th class="n">방문</th>'
            f'<th class="n">매물업종</th><th class="n">가입/매물</th></tr></thead>'
            f'<tbody>{"".join(cov_rows)}</tbody></table></div></div>'
        )

        cards = []
        for slot in slots_d:
            wards_seen = []
            for r in slot["shops"]:
                if r["ward"] not in wards_seen:
                    wards_seen.append(r["ward"])
            visits = slot["shops"] + slot["others"]
            tgt = SUP_LISTINGS if slot.get("sup") else LISTINGS_PER_DAY
            gtgt = (SUP_VISITS * 25) // 100 if slot.get("sup") else 8
            trs = []
            for i, r in enumerate(visits, 1):
                item, n = item_for(r)
                sh = " sh" if is_listing(r) else ""
                trs.append(
                    f'<tr class="{sh.strip()}"><td class="n">{i}</td>'
                    f'<td>{e(r["name"])}</td>'
                    f'<td><span class="cat{sh}">{label_for(r)}</span></td>'
                    f'<td class="ad">{e(r["address"])}</td><td class="ph">{e(r.get("phone", ""))}</td>'
                    f'<td class="it">{e(item)}</td>'
                    f'<td><a href="{r["map_url"]}" target="_blank" rel="noopener">지도</a></td></tr>'
                )
            cards.append(
                f'<div class="card"><h3>{e(slot["worker"])}'
                f'<span class="meta">구역 {e(" · ".join(wards_seen))} · '
                f'방문 {len(visits)}곳(매물업종 {len(slot["shops"])}) · '
                f'목표 가입 {gtgt} / 매물 {tgt}</span></h3>'
                f'<table><thead><tr><th>#</th><th>상호</th><th>업종</th><th>주소</th><th>전화</th>'
                f'<th>등록 품목</th><th>지도</th></tr></thead><tbody>{"".join(trs)}</tbody></table></div>'
            )
        day_html.append(f'<section class="day"><h2>{head}{tag}</h2>{cover}{"".join(cards)}</section>')

    doc = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>업체 등록 알바 — 일자별 배정표</title>
<style>
  @page {{ size:A4; margin:12mm 10mm; }}
  :root {{ --ink:#14181f; --mid:#4a5462; --soft:#7b8694; --line:#d8dde4; --sl:#eef1f4;
           --accent:#1a5f9e; --green:#1a7f45; --green-bg:#eef7f1; --head:#f4f6f8; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0 auto; padding:22px 16px 60px; max-width:1080px; background:#fff;
    font-family:"Pretendard","Noto Sans KR","Malgun Gothic",-apple-system,"Segoe UI",sans-serif;
    color:var(--ink); font-size:13px; line-height:1.55; word-break:keep-all; }}
  h1 {{ font-size:21px; margin:0 0 3px; letter-spacing:-.02em; }}
  .sub {{ color:var(--mid); font-size:12.5px; margin-bottom:14px; }}
  .strip {{ display:flex; gap:9px; flex-wrap:wrap; margin-bottom:14px; }}
  .kpi {{ border:1px solid var(--line); border-top:3px solid var(--accent); border-radius:4px; padding:7px 13px; }}
  .kpi .k {{ font-size:10.5px; color:var(--soft); }}
  .kpi .v {{ font-size:17px; font-weight:700; color:var(--accent); letter-spacing:-.02em; }}
  .note {{ background:#f7fafd; border-left:3px solid var(--accent); padding:9px 13px;
           font-size:12px; color:var(--mid); margin-bottom:18px; }}
  .note b {{ color:var(--ink); }}
  h2 {{ font-size:17px; margin:26px 0 9px; padding-bottom:5px; border-bottom:2px solid var(--ink); }}
  .card {{ border:1px solid var(--line); border-radius:4px; padding:8px 12px 10px; margin-bottom:11px; }}
  thead {{ display:table-header-group; }}
  tr {{ break-inside:avoid; page-break-inside:avoid; }}
  .cover {{ display:grid; grid-template-columns:1.18fr 1fr; gap:12px; margin-bottom:13px;
            break-inside:avoid; page-break-inside:avoid; align-items:start; }}
  .cmap img {{ width:100%; display:block; border:1px solid var(--line); border-radius:4px; }}
  .cmap .attr {{ font-size:9.5px; color:var(--soft); margin-top:3px; }}
  .ckpi {{ border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:3px;
           padding:7px 11px; font-size:12px; margin-bottom:8px; }}
  .ckpi b {{ color:var(--accent); }}
  .clg {{ font-size:11.5px; }}
  .clg td.pin {{ white-space:nowrap; font-weight:600; }}
  .clg td.pin i {{ display:inline-block; width:9px; height:9px; border-radius:50%;
                   margin-right:5px; vertical-align:0; }}
  .clg td.wd {{ color:var(--mid); font-size:10.5px; }}
  .clg td.n.sh {{ color:var(--green); font-weight:600; }}
  h3 {{ font-size:13.5px; margin:0 0 6px; display:flex; justify-content:space-between;
        align-items:baseline; gap:12px; flex-wrap:wrap; }}
  h3 .meta {{ font-size:11px; font-weight:500; color:var(--mid); }}
  table {{ width:100%; border-collapse:collapse; font-size:11.5px; }}
  th,td {{ border-bottom:1px solid var(--sl); padding:4px 7px; text-align:left; vertical-align:top; }}
  thead th {{ background:var(--head); font-size:10.5px; color:var(--mid); }}
  td.n {{ text-align:right; color:var(--soft); width:24px; }}
  td.ad {{ color:var(--mid); }}
  td.ph {{ white-space:nowrap; font-variant-numeric:tabular-nums; color:var(--mid); }}
  td.it {{ font-size:11px; }}
  tr.sh td.it {{ color:var(--green); font-weight:600; }}
  tr.sh td:nth-child(2) {{ font-weight:600; }}
  .cat {{ display:inline-block; padding:1px 6px; border-radius:9px; background:#f0f2f5;
          font-size:10.5px; color:var(--mid); white-space:nowrap; }}
  .cat.sh {{ background:var(--green-bg); color:var(--green); font-weight:600; }}
  a {{ color:var(--accent); }}
  section.day {{ page-break-before:always; }}
  section.day:first-of-type {{ page-break-before:auto; }}
  @media print {{ body {{ padding:0; max-width:none; font-size:11px; }} .note,.strip {{ display:none; }} }}
</style></head><body>

<h1>업체 등록 알바 — 일자별 배정표</h1>
<div class="sub">2026-08-11 작성 · 파일럿 8/17 + 본투입 8/18~8/27 · 작업자 4 + 감독자 1</div>

<div class="strip">
  <div class="kpi"><div class="k">총 배정 방문</div><div class="v">{total_visits:,}곳</div></div>
  <div class="kpi"><div class="k">그중 매물 업종</div><div class="v">{total_shop:,}곳</div></div>
  <div class="kpi"><div class="k">일자 × 작업자</div><div class="v">{len(plan)}개 슬롯</div></div>
  <div class="kpi"><div class="k">런칭 존</div><div class="v">{len(zone)}개 동</div></div>
</div>

<div class="note">
  <b>읽는 법</b> — 하루 방문 32곳 중 <b>초록이 매물 업종</b>(용품·헬멧·액세서리)이다.
  전환율 25% 가정이라 32곳을 돌아 가입 8곳이 나오고, 그중 매물 업종 6곳에서 매물 12건이 나온다. 감독자는 하루 16곳(매물 업종 12)을 돌며 그날 지정된 작업자 구역 <b>인근</b>에서 순회·검수를 겸한다.
  <b>등록 품목은 방문 전에 실물을 알 수 없어 업종별 표준안</b>이며, 현장에서 실제 재고로 치환한다.
  구역은 중심좌표 최근접 배정이라 실제 행정경계와 다를 수 있다 — 순서와 지도 링크를 기준으로 돈다.
</div>

{"".join(day_html)}

</body></html>"""
    OUT_HTML.write_text(doc, encoding="utf-8")

    print(f"슬롯 {len(plan)}개 (파일럿 1 + 작업자 {len(WORKERS)}×{len(MAIN_DAYS)} + 감독자 {len(MAIN_DAYS)})")
    print(f"총 방문 {total_visits:,}곳 / 매물 업종 {total_shop:,}곳")
    print(f"런칭 존 {len(zone)}개 동 — SHOPPING 누적 {cum}곳 (필요 {need_shop})")
    print(f"체인 앞 8개 동: {' → '.join(chain[:8])}")
    print(f"\n{OUT_HTML.name}\n{OUT_CSV.name}")


if __name__ == "__main__":
    main()
