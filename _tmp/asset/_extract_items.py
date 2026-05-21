"""8개 카탈로그 HTML에서 아이템 정보를 추출해 (id, name, slot, collection, grade, sprite) 튜플 리스트 출력.

용도:
- alembic 015 마이그레이션 INSERT 절 생성
- _tmp/sre-upgrade/sre-item-seed.sql 재생성
- frontend/src/lib/items/metadata.ts ITEMS 배열 재생성
- dev-test/item-catalog/index.html 카탈로그 갱신
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).parent

CATALOGS = [
    ("saigon-rider-bikes-catalog.html",   "saigon-rider-bikes-v5.svg",   "js"),
    ("saigon-rider-custom-catalog.html",  "saigon-rider-custom-v5.svg",  "js"),
    ("saigon-rider-effects-catalog.html", "saigon-rider-effects-v5.svg", "js"),
    ("saigon-rider-gear-catalog.html",    "saigon-rider-gear-v5.svg",    "js"),
    ("saigon-rider-parts-catalog.html",   "saigon-rider-parts-v5.svg",   "html"),
    ("saigon-rider-parts2-catalog.html",  "saigon-rider-parts2-v5.svg",  "js"),
    ("saigon-rider-profile-catalog.html", "saigon-rider-profile-v5.svg", "js"),
    ("saigon-rider-social-catalog.html",  "saigon-rider-social-v5.svg",  "social"),
]

# social 카탈로그용 — 단일 라인 카드:
# <div class="item-card" data-slot="EMOTE" data-rarity="C"> ... <use href="#item-CODE"/> ... <div class="item-name">NAME</div>
SOCIAL_CARD_RE = re.compile(
    r'<div class="item-card"\s+data-slot="([A-Z_]+)"\s+data-rarity="([CRELM])"[^>]*>'
    r'.*?<use href="#item-([A-Z_0-9]+)"\s*/>'
    r'.*?<div class="item-name">([^<]+)</div>',
    re.S,
)


def parse_social(text: str) -> list[dict]:
    out = []
    for m in SOCIAL_CARD_RE.finditer(text):
        slot, grade, item_id, name = m.group(1), m.group(2), m.group(3), m.group(4).strip()
        out.append({
            "id": item_id,
            "name": name,
            "slot": slot or _slot_from_id(item_id),
            "collection": _collection_from_id(item_id),
            "grade": grade or _grade_from_id(item_id),
        })
    return out

# JS 카탈로그용 — const ITEMS=[ {id:'...', name:'...', ...} ];
# 각 객체에서 id, name, slot|type, collection, grade 추출
JS_OBJ_RE = re.compile(r"\{([^{}]+)\}")
JS_KV_RE  = re.compile(r"(\w+)\s*:\s*'([^']*)'")

# HTML 카탈로그용 — <use href="...#item-XXX"/> + <div class="card-name">NAME</div>
# 또한 <div class="section-header" data-section="SLOT"> 로 슬롯 결정
HTML_CARD_RE = re.compile(
    r'<div class="card[^"]*"[^>]*>\s*'
    r'<div class="card-preview">.*?'
    r'<use href="[^"]*#item-([A-Z_0-9]+)"\s*/>.*?'
    r'</div>\s*'
    r'<div class="card-meta">\s*'
    r'<div class="card-name">([^<]+)</div>',
    re.S,
)
HTML_SECTION_RE = re.compile(r'<div class="section-header"[^>]*data-section="([A-Z_]+)"')


def parse_js(text: str) -> list[dict]:
    """const ITEMS=[ ... ] 블록 안의 객체들을 파싱."""
    m = re.search(r"const ITEMS\s*=\s*\[(.*?)\];", text, re.S)
    if not m:
        return []
    body = m.group(1)
    out = []
    for obj_match in JS_OBJ_RE.finditer(body):
        kv = dict(JS_KV_RE.findall(obj_match.group(1)))
        if "id" not in kv:
            continue
        out.append({
            "id":         kv["id"],
            "name":       kv.get("name", ""),
            # bikes uses "type" + "collection"; effects/custom/profile/parts2/social use "slot" + "collection"
            "slot":       kv.get("slot") or _slot_from_id(kv["id"]),
            # collection은 항상 ID에서 파생(정규화) — JS의 display 필드(타이틀케이스)는 무시
            "collection": _collection_from_id(kv["id"]),
            "grade":      kv.get("grade") or _grade_from_id(kv["id"]),
        })
    return out


def parse_html(text: str) -> list[dict]:
    """<div class="card ..."> 블록들을 파싱. 슬롯은 가장 가까운 직전 section-header에서 가져옴."""
    out = []
    # 카드들을 순차 스캔하되, 각 카드 위치 직전의 section-header를 추적
    cursor = 0
    current_slot = ""
    for sec in HTML_SECTION_RE.finditer(text):
        section_start = sec.start()
        # 직전 섹션의 카드들을 처리
        for card in HTML_CARD_RE.finditer(text, cursor, section_start):
            item_id, name = card.group(1), card.group(2).strip()
            out.append({
                "id": item_id,
                "name": name,
                "slot": current_slot or _slot_from_id(item_id),
                "collection": _collection_from_id(item_id),
                "grade": _grade_from_id(item_id),
            })
        current_slot = sec.group(1)
        cursor = sec.end()
    # 마지막 섹션 이후 잔여 카드
    for card in HTML_CARD_RE.finditer(text, cursor):
        item_id, name = card.group(1), card.group(2).strip()
        out.append({
            "id": item_id,
            "name": name,
            "slot": current_slot or _slot_from_id(item_id),
            "collection": _collection_from_id(item_id),
            "grade": _grade_from_id(item_id),
        })
    return out


COLLECTIONS = {
    "STREET_CLASSIC", "NEON_SAIGON", "MEKONG_DELTA", "DELIVERY_HUSTLE",
    "TET_FESTIVAL", "SAIGON_GHOST", "LEGEND_OF_SAIGON",
    # custom catalog uses some title-style IDs that don't match a collection — we'll skip
    "GHOST_SAIGON", "CIRCUIT_RIDER",  # social catalog stragglers
}

# Title items in profile catalog use semantic IDs like TITLE_STREET_ROOKIE_C_01 — collection is unclear
# Map known title prefixes to collections by inspection
TITLE_COLLECTION_MAP = {
    "TITLE_STREET_ROOKIE":    "STREET_CLASSIC",
    "TITLE_CITY_WANDERER":    "STREET_CLASSIC",
    "TITLE_HUSTLE_KING":      "DELIVERY_HUSTLE",
    "TITLE_DELTA_RIDER":      "MEKONG_DELTA",
    "TITLE_NEON_RACER":       "NEON_SAIGON",
    "TITLE_NEON_SOVEREIGN":   "NEON_SAIGON",
    "TITLE_TET_CHAMPION":     "TET_FESTIVAL",
    "TITLE_GOLDEN_DRAGON":    "TET_FESTIVAL",
    "TITLE_GHOST_RIDER":      "SAIGON_GHOST",
    "TITLE_PHANTOM_ACE":      "SAIGON_GHOST",
    "TITLE_LEGEND_OF_SAIGON": "LEGEND_OF_SAIGON",
}


SLOT_PREFIXES = [
    "MOTORCYCLE_BODY", "SEAT", "STICKER", "RANK_CARD",
    "HANDLEBAR", "TAIL_LIGHT", "ENGINE_COVER",
    "HEADLIGHT", "MIRROR", "NUMBER",
    "GLOVES", "BOOTS", "EYEWEAR", "NAMEPLATE",
    "FRAME", "BACKDROP", "TITLE",
    "TRAIL", "HORN", "START_ANIM",
    "EMOTE", "BANNER", "PET",
]


def _slot_from_id(item_id: str) -> str:
    for prefix in SLOT_PREFIXES:
        if item_id.startswith(prefix + "_"):
            return prefix
    return ""


def _grade_from_id(item_id: str) -> str:
    # Trailing _G_NN where G ∈ {C,R,E,L,M}
    m = re.search(r"_([CRELM])_\d+$", item_id)
    return m.group(1) if m else ""


# 7종 정규 컬렉션 외 비표준 코드 → 정규 코드 매핑 (소스 에셋 명명 불일치 흡수)
CANONICAL_COLLECTION = {
    "GHOST_SAIGON":  "SAIGON_GHOST",   # EMOTE/BANNER/PET 에 GHOST_SAIGON 표기
    "CIRCUIT_RIDER": "NEON_SAIGON",    # CIRCUIT BOARD / CYBER DOG — 사이버·네온 테마
}


def _collection_from_id(item_id: str) -> str:
    # ID is SLOT_COLLECTION_G_NN  (with COLLECTION being multi-word like STREET_CLASSIC)
    slot = _slot_from_id(item_id)
    if not slot:
        return ""
    rest = item_id[len(slot) + 1:]  # strip "SLOT_"
    # Strip trailing _G_NN
    rest = re.sub(r"_[CRELM]_\d+$", "", rest)
    # Title special map
    if slot == "TITLE":
        key = f"TITLE_{rest}"
        rest = TITLE_COLLECTION_MAP.get(key, rest)
    return CANONICAL_COLLECTION.get(rest, rest)


def main() -> None:
    all_items = []
    for filename, sprite, kind in CATALOGS:
        path = HERE / filename
        text = path.read_text(encoding="utf-8")
        if kind == "js":
            items = parse_js(text)
        elif kind == "social":
            items = parse_social(text)
        else:
            items = parse_html(text)
        for it in items:
            it["sprite"] = sprite
            it["catalog"] = filename
        print(f"# {filename}: {len(items)} items", flush=True)
        all_items.extend(items)
    print(f"# TOTAL: {len(all_items)} items", flush=True)

    out_path = HERE / "_extracted_items.json"
    out_path.write_text(json.dumps(all_items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"# written to {out_path}", flush=True)


if __name__ == "__main__":
    main()
