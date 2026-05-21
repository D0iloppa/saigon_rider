"""_extracted_items.json + _curated_names.json 을 병합해 산출물 생성.

출력:
  _items_final.json      — 최종 병합 데이터(이름·가격·플래그 포함)
  out/migration_items.sql— item_definition INSERT VALUES (display_name = item_code)
  out/metadata_items.ts  — frontend ITEMS 배열 본문
  out/i18n_items.json    — { item_code: real_name } (en/ko/vi 공통 주입용)

규칙(태스크 §등급별 가격/플래그):
  C: gp=300,  gc=NULL, visible=TRUE,  lock=FALSE, season=NULL
  R: gp=2000, gc=NULL, visible=TRUE,  lock=FALSE, season=NULL
  E: gp=10000,gc=NULL, visible=TRUE,  lock=FALSE, season=NULL
  L: gp=35000,gc=200,  visible=FALSE, lock=(TET_FESTIVAL→TRUE), season=(TET_FESTIVAL→'TET_S1')
  M: gp=NULL, gc=500,  visible=FALSE, lock=FALSE, season=NULL

asset_uri = sprite://{sprite-filename}#item-{ITEM_CODE}
display_name(DB) = item_code  (실제 이름은 i18n items.{code} 로 관리)
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

GRADE_RULES = {
    # grade: (gp, gc, visible, lock, season)
    "C": (300,   None, True,  False, None),
    "R": (2000,  None, True,  False, None),
    "E": (10000, None, True,  False, None),
    "L": (35000, 200,  False, False, None),   # TET_FESTIVAL 특례는 아래에서 덮어씀
    "M": (None,  500,  False, False, None),
}


def sql_val(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main() -> None:
    items = json.loads((HERE / "_extracted_items.json").read_text(encoding="utf-8"))
    curated = json.loads((HERE / "_curated_names.json").read_text(encoding="utf-8"))

    final = []
    missing = []
    for it in items:
        code = it["id"]
        name = it["name"].strip() or curated.get(code, "")
        if not name:
            missing.append(code)
        grade = it["grade"]
        gp, gc, visible, lock, season = GRADE_RULES[grade]
        # L 등급 + TET_FESTIVAL 특례
        if grade == "L" and it["collection"] == "TET_FESTIVAL":
            lock, season = True, "TET_S1"
        final.append({
            "item_code": code,
            "name": name,                       # i18n 값 (실제 이름)
            "slot": it["slot"],
            "rarity": grade,
            "collection": it["collection"],
            "shop_price_gp": gp,
            "shop_price_gc": gc,
            "is_shop_visible": visible,
            "season_lock": lock,
            "required_season_code": season,
            "sprite": it["sprite"],
            "asset_uri": f"sprite://{it['sprite']}#item-{code}",
        })

    if missing:
        raise SystemExit(f"이름 누락 {len(missing)}건: {missing[:10]}")

    (HERE / "_items_final.json").write_text(
        json.dumps(final, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── migration / seed INSERT VALUES (display_name = item_code) ──
    rows = []
    for f in final:
        rows.append(
            "(" + ",".join([
                sql_val(f["item_code"]),
                sql_val(f["item_code"]),          # display_name = item_code
                sql_val(f["slot"]),
                sql_val(f["rarity"]),
                sql_val(f["collection"]),
                sql_val(f["shop_price_gp"]),
                sql_val(f["shop_price_gc"]),
                sql_val(f["is_shop_visible"]),
                sql_val(f["season_lock"]),
                sql_val(f["required_season_code"]),
                sql_val(f["asset_uri"]),
            ]) + ")"
        )
    (OUT / "migration_items.sql").write_text(",\n".join(rows) + "\n", encoding="utf-8")

    # ── metadata.ts ITEMS 배열 본문 ──
    ts_lines = []
    for i, f in enumerate(final, 1):
        ts_lines.append(
            f"  {{ num: {i}, itemCode: {json.dumps(f['item_code'])}, "
            f"slot: {json.dumps(f['slot'])}, collection: {json.dumps(f['collection'])}, "
            f"rarity: {json.dumps(f['rarity'])}, sprite: {json.dumps(f['sprite'])} }},"
        )
    (OUT / "metadata_items.ts").write_text("\n".join(ts_lines) + "\n", encoding="utf-8")

    # ── i18n items map (code -> real name) ──
    i18n = {f["item_code"]: f["name"] for f in final}
    (OUT / "i18n_items.json").write_text(
        json.dumps(i18n, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 요약
    sprites = sorted({f["sprite"] for f in final})
    print(f"items: {len(final)}")
    print(f"sprites ({len(sprites)}): {sprites}")
    print("outputs: out/migration_items.sql, out/metadata_items.ts, out/i18n_items.json, _items_final.json")


if __name__ == "__main__":
    main()
