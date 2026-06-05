"""mission_code(+rarity) → 25 퀘스트 카드 코드 매핑.

프론트 `frontend/src/components/quest/quest-card-map.ts` 의 서버측 포트.
카드 이미지 파일은 `system/quest-cards/card-{CARD_CODE}.png` (047 시드).
관리자 화면 썸네일이 앱과 동일한 카드를 표시하기 위해 사용한다.
"""

_CATEGORY_MAP = {
    "RD": "RIDING",
    "CM": "COMMUNITY",
    "MT": "MAINT",
    "MK": "MARKET",
    "DL": "DELIVERY",
    "MX": "MIXED",
}

_WINDOW_MAP = {
    "D": "DAILY",
    "W": "WEEKLY",
    "M": "MONTHLY",
}

_SEASON_CARD_MAP = {
    "TET": "TET_SEASON",
    "SPRING": "HUNG_KINGS_SEASON",
    "SUM": "REUNIFICATION_SEASON",
    "RAIN": "RAIN_SEASON",
    "INDEP": "GHOST_SEASON",
    "MID": "MID_AUTUMN_SEASON",
    "DRY": "SAIGON_BDAY_SEASON",
    "XMAS": "NEW_YEAR_SEASON",
    "ANNUAL": "TET_SEASON",
}


def _mythic_card(mission_code: str) -> str:
    code = mission_code.upper()
    if "GHOST" in code or "NIGHT" in code:
        return "SAIGON_GHOST_M"
    if "PHOENIX" in code or "REBIRTH" in code:
        return "IRON_PHOENIX_M"
    if "STORM" in code or "RAIN" in code or "TYPHOON" in code:
        return "STORM_KING_M"
    if "ANCESTOR" in code or "ULTIMATE" in code or "1975" in code:
        return "SAIGON_ANCESTOR_M"
    return "THE_LEGEND_M"


def resolve_quest_card_code(mission_code: str | None, rarity: str | None = None) -> str:
    """mission_code + rarity → cardCode. 프론트 getQuestCard 와 동일 규칙."""
    if rarity == "M":
        return _mythic_card(mission_code or "")
    if not mission_code:
        return "RIDING_DAILY"

    parts = mission_code.split("-")
    window_char = parts[0]
    category_char = parts[1] if len(parts) > 1 else ""

    if window_char == "O":
        return "ONBOARDING"
    if window_char == "S":
        return _SEASON_CARD_MAP.get(category_char, "TET_SEASON")
    if window_char == "A":
        return "MIXED_DAILY"

    category = _CATEGORY_MAP.get(category_char, "MIXED")
    win = _WINDOW_MAP.get(window_char, "DAILY")

    if category_char == "DL":
        return "DELIVERY_DAILY"
    if category_char == "RD":
        return f"RIDING_{win}"
    # CM/MT/MK/MX: DAILY/WEEKLY 전용, MONTHLY는 WEEKLY 폴백
    win2 = "WEEKLY" if win == "MONTHLY" else win
    return f"{category}_{win2}"


def quest_card_file_path(card_code: str) -> str:
    return f"system/quest-cards/card-{card_code}.png"
