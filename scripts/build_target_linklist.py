"""타깃 명단 CSV → 지역(동)별 링크리스트 HTML + 지도링크 포함 CSV 생성.

동 배정은 wards 중심좌표 최근접(보로노이 근사)이다 — wards 테이블에 폴리곤이 없어
실제 행정경계와는 다를 수 있다. 3km 를 넘으면 '구역 외'로 뺀다.

Usage:
    python3 scripts/build_target_linklist.py
"""

from __future__ import annotations

import csv
import html
import math
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ai-docs/research/260810_field_agent_targets_clean.csv"
OUT_HTML = ROOT / "ai-docs/research/260810_field_agent_linklist.html"
OUT_CSV = ROOT / "ai-docs/research/260810_field_agent_targets_by_ward.csv"
WARD_SQL = ROOT / "database/init/159_wards_seed.sql"

# 매물 가능 판정은 카테고리가 아니라 listing_capable 컬럼이다 —
# 중고 오토바이는 business_category 에 판매점 코드가 없어 etc/used_moto 로 담기기 때문(D-17)
def is_listing(r: dict) -> bool:
    return r.get("listing_capable") == "Y"


SUBTYPE_LABEL = {"used_moto": "중고 오토바이", "used_parts": "중고 용품"}
LABEL = {
    "repair": "정비/수리", "wash": "세차", "tire": "타이어", "fuel": "주유",
    "parts": "용품", "gear": "헬멧·보호구", "accessory": "튜닝·액세서리",
    "cafe": "카페", "food": "음식", "convenience": "편의점",
    "parking": "주차장", "laundry": "세탁", "phone_repair": "폰수리",
    "towing": "견인", "etc": "기타",
}
OUT_OF_ZONE = "구역 외 (3km 초과)"


def load_wards() -> list[tuple[str, float, float]]:
    sql = WARD_SQL.read_text(encoding="utf-8")
    pat = r"\('HCMC_[A-Z_]+',\s*'HCMC',\s*'([^']*)',\s*'[^']*',\s*([\d.]+),\s*([\d.]+)"
    return [(m[1], float(m[2]), float(m[3])) for m in re.finditer(pat, sql)]


def haversine(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def main() -> None:
    wards = load_wards()
    rows = list(csv.DictReader(SRC.open(encoding="utf-8")))

    by_ward: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        lat, lng = float(r["latitude"]), float(r["longitude"])
        name, w_lat, w_lng = min(wards, key=lambda w: haversine(lat, lng, w[1], w[2]))
        dist = haversine(lat, lng, w_lat, w_lng)
        r["ward"] = name if dist <= 3000 else OUT_OF_ZONE
        r["dist_m"] = round(dist)
        r["map_url"] = f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
        by_ward[r["ward"]].append(r)

    # 지도링크·동 컬럼을 붙인 CSV
    cols = ["ward", "name", "category", "subtype", "listing_capable", "address",
            "latitude", "longitude", "phone", "rating", "flags", "map_url", "dist_m"]
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in sorted(rows, key=lambda x: (x["ward"], x["category"], x["name"])):
            w.writerow(r)

    # 매물 가능 업종 많은 동 순 (구역 외는 항상 마지막)
    def sort_key(item: tuple[str, list[dict]]) -> tuple:
        ward, items = item
        shop = sum(1 for r in items if is_listing(r))
        return (ward == OUT_OF_ZONE, -shop, -len(items))

    ordered = sorted(by_ward.items(), key=sort_key)
    total = len(rows)
    total_shop = sum(1 for r in rows if is_listing(r))

    e = html.escape
    idx_rows = []
    for i, (ward, items) in enumerate(ordered):
        shop = sum(1 for r in items if is_listing(r))
        cls = ' class="oz"' if ward == OUT_OF_ZONE else ""
        idx_rows.append(
            f'<tr{cls}><td><a href="#w{i}">{e(ward)}</a></td>'
            f'<td class="n">{len(items)}</td><td class="n sh">{shop}</td></tr>'
        )

    sections = []
    for i, (ward, items) in enumerate(ordered):
        shop = sum(1 for r in items if is_listing(r))
        items.sort(key=lambda r: (not is_listing(r), r["category"], r["name"]))
        trs = []
        for r in items:
            sh = " sh-row" if is_listing(r) else ""
            trs.append(
                f'<tr class="r{sh}" data-q="{e((r["name"] + " " + r["address"]).lower())}">'
                f'<td>{e(r["name"])}</td>'
                f'<td><span class="cat{sh}">{SUBTYPE_LABEL.get(r["subtype"]) or LABEL.get(r["category"], r["category"])}</span></td>'
                f'<td>{e(r["address"])}</td><td class="ph">{e(r["phone"])}</td>'
                f'<td><a href="{r["map_url"]}" target="_blank" rel="noopener">지도</a></td></tr>'
            )
        sections.append(
            f'<section id="w{i}"><h2>{e(ward)}'
            f'<span class="cnt">{len(items)}곳 · <b>매물가능 {shop}</b></span></h2>'
            f'<table><thead><tr><th>상호</th><th>업종</th><th>주소</th><th>전화</th><th>지도</th></tr></thead>'
            f'<tbody>{"".join(trs)}</tbody></table></section>'
        )

    doc = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>업체 등록 알바 — 지역별 타깃 링크리스트</title>
<style>
  :root {{ --ink:#14181f; --mid:#4a5462; --soft:#7b8694; --line:#d8dde4; --soft-line:#eef1f4;
           --accent:#1a5f9e; --green:#1a7f45; --green-bg:#eef7f1; --head:#f4f6f8; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; padding:22px 18px 60px; max-width:1000px; margin-inline:auto; background:#fff;
    font-family:"Pretendard","Noto Sans KR","Malgun Gothic",-apple-system,"Segoe UI",sans-serif;
    color:var(--ink); font-size:14px; line-height:1.6; word-break:keep-all; }}
  h1 {{ font-size:22px; margin:0 0 4px; letter-spacing:-.02em; }}
  .sub {{ color:var(--mid); font-size:13px; margin-bottom:16px; }}
  .strip {{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px; }}
  .kpi {{ border:1px solid var(--line); border-top:3px solid var(--accent); border-radius:4px;
          padding:8px 14px; min-width:150px; }}
  .kpi .k {{ font-size:11px; color:var(--soft); }}
  .kpi .v {{ font-size:19px; font-weight:700; color:var(--accent); letter-spacing:-.02em; }}
  .note {{ background:#f7fafd; border-left:3px solid var(--accent); padding:9px 14px; font-size:12.5px;
           color:var(--mid); margin-bottom:18px; }}
  #q {{ width:100%; padding:10px 13px; font-size:15px; border:1px solid var(--line); border-radius:5px;
        margin-bottom:16px; font-family:inherit; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; margin-bottom:8px; }}
  th,td {{ border-bottom:1px solid var(--soft-line); padding:6px 9px; text-align:left; vertical-align:top; }}
  thead th {{ background:var(--head); font-size:11.5px; color:var(--mid); position:sticky; top:0;
              border-bottom:1px solid var(--line); }}
  td.ph {{ font-variant-numeric:tabular-nums; color:var(--mid); white-space:nowrap; font-size:12px; }}
  td.n {{ text-align:right; font-variant-numeric:tabular-nums; }}
  td.n.sh {{ color:var(--green); font-weight:700; }}
  h2 {{ font-size:16px; margin:30px 0 8px; padding-bottom:5px; border-bottom:2px solid var(--ink);
        display:flex; justify-content:space-between; align-items:baseline; }}
  h2 .cnt {{ font-size:12px; font-weight:500; color:var(--mid); }}
  h2 .cnt b {{ color:var(--green); }}
  .cat {{ display:inline-block; padding:1px 7px; border-radius:9px; background:#f0f2f5;
          font-size:11.5px; color:var(--mid); white-space:nowrap; }}
  .cat.sh-row {{ background:var(--green-bg); color:var(--green); font-weight:600; }}
  tr.sh-row td:first-child {{ font-weight:600; }}
  a {{ color:var(--accent); }}
  .idx tr.oz td, .idx tr.oz a {{ color:var(--soft); }}
  section {{ scroll-margin-top:12px; }}
  .hide {{ display:none; }}
  @media (max-width:640px) {{ body {{ padding:14px 10px 50px; }} table {{ font-size:12px; }} }}
</style></head><body>

<h1>업체 등록 알바 — 지역별 타깃 링크리스트</h1>
<div class="sub">2026-08-10 수집 · 내부 영업용 · 미가입 후보 명단(서비스 DB 미반영)</div>

<div class="strip">
  <div class="kpi"><div class="k">전체 후보</div><div class="v">{total:,}곳</div></div>
  <div class="kpi"><div class="k">매물 가능 (용품·헬멧·액세서리)</div><div class="v">{total_shop:,}곳</div></div>
  <div class="kpi"><div class="k">구역 수</div><div class="v">{len(ordered)}개</div></div>
</div>

<div class="note">
  동 배정은 <b>중심좌표 최근접</b>이다 — <code>wards</code> 테이블에 폴리곤이 없어 실제 행정경계와 다를 수 있다.
  중심에서 3km 를 넘으면 <b>구역 외</b>로 뺐다. 초록 표시가 <b>매물이 나오는 업종</b>이며,
  배정표는 하루 방문 32곳 중 이 업종이 16곳이 되도록 짜야 한다.
</div>

<input id="q" type="search" placeholder="상호 · 주소 검색 (예: Chợ Lớn, mũ bảo hiểm, Nguyễn)" autocomplete="off">

<h2>구역 색인<span class="cnt">매물 가능 업종 많은 순</span></h2>
<table class="idx"><thead><tr><th>구역</th><th class="n">전체</th><th class="n">매물가능</th></tr></thead>
<tbody>{"".join(idx_rows)}</tbody></table>

{"".join(sections)}

<script>
  const q = document.getElementById('q');
  const rows = [...document.querySelectorAll('tr.r')];
  q.addEventListener('input', () => {{
    const v = q.value.trim().toLowerCase();
    rows.forEach((r) => r.classList.toggle('hide', v && !r.dataset.q.includes(v)));
    document.querySelectorAll('section').forEach((s) => {{
      const any = [...s.querySelectorAll('tr.r')].some((r) => !r.classList.contains('hide'));
      s.classList.toggle('hide', !any);
    }});
  }});
</script>
</body></html>"""

    OUT_HTML.write_text(doc, encoding="utf-8")
    print(f"{OUT_HTML.name}  — {total:,}곳 / {len(ordered)}개 구역")
    print(f"{OUT_CSV.name}  — 지도링크·동 컬럼 포함")
    print("\n구역별 상위 12")
    for ward, items in ordered[:12]:
        shop = sum(1 for r in items if is_listing(r))
        print(f"  {ward:<20}{len(items):>5}곳  (매물가능 {shop})")


if __name__ == "__main__":
    main()
