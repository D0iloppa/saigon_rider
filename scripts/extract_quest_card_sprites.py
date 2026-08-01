"""
3개의 HTML 파일에서 SVG sprite 추출.

지시서 §1.1의 card-wrap 정규식은 실제 HTML 구조와 맞지 않아
(card-wrap 내부 닫는 div가 1개뿐) label/svg 쌍을 직접 매칭하는 방식으로 변경.

출력: frontend/public/assets/quest-cards/{rider,season,mythic}-sprite.svg
각 SVG는 <symbol id="card-CODE"> 으로 묶임.
"""
from __future__ import annotations
from pathlib import Path
import re
import sys
from typing import List, Tuple, Dict

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
OUT = ROOT / 'frontend/public/assets/quest-cards'

LABEL_RE = re.compile(r'<div class="card-label">(.*?)</div>', re.DOTALL)
SVG_RE = re.compile(r'<svg class="card"[^>]*>.*?</svg>', re.DOTALL)
CODE_RE = re.compile(r'\b([A-Z][A-Z0-9_]{2,})\b')
# y="23" 카테고리/윈도우 라벨 제거 (i18n은 React 오버레이로 처리)
Y23_TEXT_RE = re.compile(r'<text\s+[^>]*y="23"[^>]*>[^<]*</text>\s*', re.DOTALL)


def extract_sprite(html_path: Path, out_path: Path) -> List[str]:
    html = html_path.read_text(encoding='utf-8')

    labels = LABEL_RE.findall(html)
    svgs = SVG_RE.findall(html)

    if len(labels) != len(svgs):
        print(f"  ⚠ label({len(labels)}) != svg({len(svgs)}) — {html_path.name}", file=sys.stderr)

    cards: List[Tuple[str, str]] = []
    for label, svg in zip(labels, svgs):
        plain = re.sub(r'<[^>]+>', ' ', label)
        m = CODE_RE.search(plain)
        if not m:
            print(f"  ⚠ 코드 추출 실패: {plain[:60]}", file=sys.stderr)
            continue
        code = m.group(1)

        symbol = re.sub(
            r'<svg class="card"([^>]*)>',
            lambda mt: f'<symbol id="card-{code}"{mt.group(1)}>',
            svg,
            count=1,
        )
        symbol = symbol.replace('</svg>', '</symbol>')
        symbol = Y23_TEXT_RE.sub('', symbol)
        cards.append((code, symbol))
        print(f"  추출: card-{code}")

    sprite = (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">\n'
        + '\n'.join(s for _, s in cards)
        + '\n</svg>\n'
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(sprite, encoding='utf-8')
    print(f"✓ {out_path.relative_to(ROOT)} ({len(cards)} 카드)")
    return [c for c, _ in cards]


def main() -> int:
    sets = [
        ('rider', 12),
        ('season', 8),
        ('mythic', 5),
    ]
    all_codes: Dict[str, List[str]] = {}
    failed = False
    for name, expected in sets:
        print(f"\n=== {name.upper()} ===")
        codes = extract_sprite(
            DOCS / f'saigon-quest-cards-{name}.html',
            OUT / f'{name}-sprite.svg',
        )
        all_codes[name] = codes
        if len(codes) != expected:
            print(f"  ✗ 카드 수 불일치: 기대 {expected}, 실제 {len(codes)}", file=sys.stderr)
            failed = True

    total = sum(len(v) for v in all_codes.values())
    print(f"\n총 {total} 카드")
    for name, codes in all_codes.items():
        print(f"  {name.upper()}: {codes}")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
