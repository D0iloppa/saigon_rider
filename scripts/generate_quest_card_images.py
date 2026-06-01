"""
25개 퀘스트 카드 이미지를 Google Gemini 2.5 Flash Image (Nano Banana) 로 생성한다.
톤 일관성을 위해 첫 생성 카드를 reference 로 후속 카드에 함께 넘긴다.

사용법:
    export $(grep -v '^#' .env | xargs)

    # 단건 생성 (테스트용)
    python3 scripts/generate_quest_card_images.py --only RIDING_DAILY

    # 전체 25개 일괄 생성 (기존 파일 덮어쓰기)
    python3 scripts/generate_quest_card_images.py --force

    # reference 사용 안 함 (각 카드 독립 생성)
    python3 scripts/generate_quest_card_images.py --no-reference

출력:
- contents/system/quest-cards/card-{CODE}.png
- contents/system/quest-cards/_usage.json   (카드별 토큰 사용량 누적 로그)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "contents" / "system" / "quest-cards"
USAGE_LOG = OUTPUT_DIR / "_usage.json"

# 톤 일관성을 위해 첫 성공 카드를 reference 로 후속에 전달
TONE_ANCHOR = "RIDING_DAILY"

STYLE_GUIDE = (
    "Visual style: neon glow holographic illustration with cyberpunk Saigon theme, "
    "dark background, vibrant accent colors per card mood, RPG game card art, "
    "wide horizontal composition. No text, no watermarks, no logos, no UI elements."
)

PROMPTS: dict[str, str] = {
    # ── RIDER (12) ────────────────────────────────────────────────────
    "RIDING_DAILY": (
        "A lone motorbike rider in black cyberpunk gear speeding through a Saigon city street at night, "
        "skyscraper silhouettes, glowing orange-pink holographic neon sky, neon glow trails along the bike."
    ),
    "RIDING_WEEKLY": (
        "A motorbike rider speeding along a futuristic glowing cyan map route grid, holographic GPS "
        "navigation path with orange waypoint markers, weekly journey theme, cyberpunk Saigon backdrop."
    ),
    "RIDING_MONTHLY": (
        "A futuristic golden holographic trophy cup floating in the air, glowing golden neon particles, "
        "a motorbike rider silhouette in the distance, gold and amber accent colors, monthly achievement vibe."
    ),
    "COMMUNITY_DAILY": (
        "A small group of motorbike riders meeting at a glowing neon cafe corner in cyberpunk Saigon at "
        "twilight, holographic chat bubbles floating, warm pink and cyan neon accents, friendly community vibe."
    ),
    "COMMUNITY_WEEKLY": (
        "A large convoy of cyberpunk motorbike riders cruising together along a neon-lit elevated highway "
        "over Saigon, holographic friendship rings glowing between bikes, magenta and purple accents."
    ),
    "MAINT_DAILY": (
        "A close-up of a futuristic motorbike being tuned in a neon-lit cyberpunk garage at night, "
        "holographic wrench and gear icons floating, cyan and electric blue sparks, mechanic theme."
    ),
    "MAINT_WEEKLY": (
        "A full motorbike overhaul scene in a high-tech cyberpunk Saigon workshop, exploded view of "
        "glowing holographic parts, deep blue and steel accents, weekly maintenance vibe."
    ),
    "MARKET_DAILY": (
        "A bustling cyberpunk Saigon night market stall with glowing neon signs and holographic price "
        "tags, a rider browsing motorbike accessories, warm amber and red neon accents."
    ),
    "MARKET_WEEKLY": (
        "A panoramic cyberpunk Saigon market plaza with rows of glowing neon shops and floating "
        "holographic merchandise displays, magenta and gold accents, weekly trading vibe."
    ),
    "MIXED_DAILY": (
        "A montage composition of multiple cyberpunk Saigon activities — a motorbike rider, a glowing "
        "wrench, a holographic coin, a chat bubble — arranged dynamically with neon trails, "
        "mixed daily quest vibe, rainbow neon accents on dark background."
    ),
    "DELIVERY_DAILY": (
        "A cyberpunk motorbike courier with a glowing holographic delivery box on the back, rushing "
        "through neon-lit Saigon alleys at night, holographic destination arrows ahead, orange and "
        "yellow neon accents, urgency vibe."
    ),
    "ONBOARDING": (
        "A bright welcoming scene with a new cyberpunk motorbike rider arriving at the glowing neon "
        "gates of Saigon, holographic tutorial markers floating, friendly cyan and white accents, "
        "first-time rider vibe."
    ),
    # ── SEASON (8) ────────────────────────────────────────────────────
    "TET_SEASON": (
        "A festive cyberpunk Saigon Lunar New Year (Tết) scene, glowing red and gold holographic "
        "Vietnamese lanterns floating, peach blossom and apricot flower motifs, a motorbike rider "
        "passing under a holographic dragon, deep crimson and gold accents."
    ),
    "HUNG_KINGS_SEASON": (
        "A solemn ancestral monument with holographic Hùng Kings legacy symbols glowing over a "
        "cyberpunk Saigon skyline at dawn, bronze and earthy gold accents, Vietnamese tradition meets "
        "futuristic neon, reverent atmosphere."
    ),
    "REUNIFICATION_SEASON": (
        "A grand cyberpunk Saigon celebration of April 30th Reunification Day, holographic Vietnamese "
        "flag colors (red and gold) flowing across the sky, fireworks over neon skyline, victorious "
        "atmosphere with crimson and gold accents."
    ),
    "GHOST_SEASON": (
        "An eerie cyberpunk Saigon scene during the Ghost Month, ghostly translucent figures and "
        "spectral lanterns floating along a neon-lit alley, holographic incense smoke, dark violet "
        "and pale green accents, mysterious atmosphere."
    ),
    "MID_AUTUMN_SEASON": (
        "A cyberpunk Saigon Mid-Autumn Festival scene, holographic lion dance and giant glowing moon "
        "over the city, neon mooncake patterns floating, warm orange and gold accents, festive "
        "family vibe."
    ),
    "RAIN_SEASON": (
        "A motorbike rider speeding through heavy monsoon rain on a Saigon city street at night, "
        "wet asphalt reflecting glowing cyan and silver neon lights, holographic rain droplets, "
        "stormy cyberpunk atmosphere, deep blue and slate gray accents."
    ),
    "NEW_YEAR_SEASON": (
        "A futuristic fireworks display over a cyberpunk Saigon skyline at midnight new year, "
        "holographic countdown numbers floating in the sky, glowing gold, silver and electric blue "
        "particle bursts, neon-lit clock tower silhouette, celebratory dark background."
    ),
    "SAIGON_BDAY_SEASON": (
        "A festive holographic birthday cake floating over a glowing cyberpunk Saigon cityscape, "
        "neon pink and magenta candles, golden confetti particles, Vietnamese lotus motifs as "
        "decorative outlines, dark background with warm sunset accents."
    ),
    # ── MYTHIC (5) ────────────────────────────────────────────────────
    "THE_LEGEND_M": (
        "A legendary armored motorbike rider in glowing red and gold cyberpunk armor on a futuristic "
        "Saigon highway at dusk, holographic dragon spirit coiling around the bike, intense god-rays, "
        "epic mythic card art, dark crimson and obsidian background with golden particles."
    ),
    "SAIGON_GHOST_M": (
        "A ghostly translucent motorbike rider phasing through a foggy cyberpunk Saigon alley at "
        "midnight, ethereal violet and emerald spectral mist, holographic skull motif, eerie neon "
        "lanterns flickering, dark haunting atmosphere."
    ),
    "IRON_PHOENIX_M": (
        "An iron phoenix rising in flames behind a motorbike rider on a burning futuristic Saigon "
        "skyline, glowing orange-red molten metal feathers, holographic rebirth symbols, intense "
        "fiery sparks, dark scorched background with deep crimson and amber accents."
    ),
    "STORM_KING_M": (
        "A crowned cyberpunk motorbike rider commanding lightning storms over a turbulent Saigon "
        "cityscape, holographic thunder bolts radiating from a glowing crown, electric blue and "
        "white plasma arcs, dramatic stormcloud background."
    ),
    "SAIGON_ANCESTOR_M": (
        "An ancestral spirit emperor astride an ethereal mythic motorbike floating above ancient "
        "cyberpunk Saigon, holographic Vietnamese dynasty calligraphy and golden dragon scales, "
        "ultimate-tier divine aura with prismatic radiant glow, deep indigo and royal gold background."
    ),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--only", help="콤마로 구분된 cardCode 화이트리스트")
    p.add_argument("--force", action="store_true", help="이미 존재하는 파일도 덮어쓴다")
    p.add_argument(
        "--model",
        default="gemini-2.5-flash-image",
        help="Gemini 이미지 모델명 (기본: gemini-2.5-flash-image)",
    )
    p.add_argument(
        "--no-reference",
        action="store_true",
        help="reference 이미지 없이 텍스트 프롬프트만으로 생성",
    )
    return p.parse_args()


def extract_image_bytes(resp) -> bytes | None:
    for cand in getattr(resp, "candidates", None) or []:
        content = getattr(cand, "content", None)
        if content is None:
            continue
        for part in getattr(content, "parts", None) or []:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                return inline.data
    return None


def extract_usage(resp) -> dict:
    """response.usage_metadata 에서 토큰 사용량 추출. 키 표준화."""
    meta = getattr(resp, "usage_metadata", None)
    if meta is None:
        return {}
    keys = [
        "prompt_token_count",
        "candidates_token_count",
        "total_token_count",
        "cached_content_token_count",
    ]
    out: dict = {}
    for k in keys:
        v = getattr(meta, k, None)
        if v is not None:
            out[k] = v
    return out


def load_usage_log() -> dict:
    if USAGE_LOG.exists():
        try:
            return json.loads(USAGE_LOG.read_text())
        except Exception:
            return {}
    return {}


def save_usage_log(log: dict) -> None:
    USAGE_LOG.write_text(json.dumps(log, indent=2, ensure_ascii=False))


def main() -> int:
    args = parse_args()

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_API_KEY 환경변수 미설정. .env 로드 후 실행하세요.", file=sys.stderr)
        return 1

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("ERROR: google-genai 패키지 필요. `pip install google-genai`", file=sys.stderr)
        return 1

    client = genai.Client(api_key=api_key)

    if args.only:
        whitelist = {c.strip() for c in args.only.split(",") if c.strip()}
        unknown = whitelist - PROMPTS.keys()
        if unknown:
            print(f"ERROR: 알 수 없는 cardCode: {sorted(unknown)}", file=sys.stderr)
            return 1
        ordered_targets = [(k, PROMPTS[k]) for k in PROMPTS if k in whitelist]
    else:
        # TONE_ANCHOR 를 가장 먼저 처리 → reference 로 사용
        anchor_first = [k for k in [TONE_ANCHOR] if k in PROMPTS]
        rest = [k for k in PROMPTS if k != TONE_ANCHOR]
        ordered_targets = [(k, PROMPTS[k]) for k in anchor_first + rest]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    usage_log = load_usage_log()

    success: list[str] = []
    skipped: list[str] = []
    failed: list[tuple[str, str]] = []

    for code, prompt in ordered_targets:
        out_path = OUTPUT_DIR / f"card-{code}.png"
        if out_path.exists() and not args.force:
            print(f"[skip] {code}")
            skipped.append(code)
            continue

        print(f"[gen ] {code}", flush=True)
        try:
            full_prompt = f"{prompt}\n\n{STYLE_GUIDE}"
            contents: list = [full_prompt]

            # TONE_ANCHOR 가 이미 생성돼 있으면 reference 로 함께 전송
            if not args.no_reference and code != TONE_ANCHOR:
                anchor_path = OUTPUT_DIR / f"card-{TONE_ANCHOR}.png"
                if anchor_path.exists():
                    contents.append(
                        types.Part.from_bytes(
                            data=anchor_path.read_bytes(),
                            mime_type="image/png",
                        )
                    )

            t0 = time.time()
            resp = client.models.generate_content(model=args.model, contents=contents)
            dt = time.time() - t0

            img_bytes = extract_image_bytes(resp)
            if not img_bytes:
                raise RuntimeError("응답에 이미지 part 없음")
            out_path.write_bytes(img_bytes)

            usage = extract_usage(resp)
            usage_log[code] = {
                "model": args.model,
                "bytes": len(img_bytes),
                "elapsed_sec": round(dt, 2),
                **usage,
            }
            save_usage_log(usage_log)

            tot = usage.get("total_token_count", "?")
            inp = usage.get("prompt_token_count", "?")
            out_tk = usage.get("candidates_token_count", "?")
            print(
                f"  OK {len(img_bytes):>10,}B  {dt:5.1f}s  "
                f"tokens in={inp} out={out_tk} total={tot}"
            )
            success.append(code)
        except Exception as e:
            print(f"  FAIL: {e}", file=sys.stderr)
            failed.append((code, str(e)))

    # 누적 통계
    total_in = sum(v.get("prompt_token_count", 0) or 0 for v in usage_log.values())
    total_out = sum(v.get("candidates_token_count", 0) or 0 for v in usage_log.values())
    total_all = sum(v.get("total_token_count", 0) or 0 for v in usage_log.values())

    print("\n=== 요약 ===")
    print(f"성공: {len(success)} — {success}")
    print(f"스킵: {len(skipped)} — {skipped}")
    print(f"실패: {len(failed)} — {[c for c, _ in failed]}")
    print(f"\n누적 토큰: in={total_in:,}  out={total_out:,}  total={total_all:,}")
    print(f"사용량 로그: {USAGE_LOG.relative_to(REPO_ROOT)}")

    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
