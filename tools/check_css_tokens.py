#!/usr/bin/env python3
"""미정의 CSS 커스텀 프로퍼티(var(--x)) 참조를 차단한다.

왜 있나 — 이 저장소에는 스크린샷 회귀 자동화가 없어서 CSS 깨짐이 사람 눈으로만
잡힌다. 실제로 미정의 토큰 `--text-1` 이 6파일 13곳에서 참조되며 빈 문자열로
해석되고 있었다(2026-08-03 UX 감사 P2-3). 오타 하나가 색을 통째로 날려도
아무도 모른다. 전면적인 시각 회귀 대신, 정적으로 잡을 수 있는 이 한 가지만
좁게 막는다.

판정: frontend/src 의 모든 .css 에서 정의(`--name:`)를 모으고, 사용(`var(--name)`)
중 정의에 없는 것을 위반으로 본다. 폴백이 있는 `var(--name, <fallback>)` 은
의도된 선택적 참조이므로 통과시킨다.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src"

DEF_RE = re.compile(r"(--[A-Za-z0-9_-]+)\s*:")
# 폴백이 없는 참조만 잡는다 — var(--x, ...) 는 정의가 없어도 동작이 정의돼 있다.
USE_RE = re.compile(r"var\(\s*(--[A-Za-z0-9_-]+)\s*\)")

# 런타임(JS)이 setProperty 로 주입하는 토큰 — CSS 에는 정의가 없는 것이 정상이다.
RUNTIME_INJECTED = {
    "--status-bar-height",
    "--keyboard-height",
    "--peek",  # DraggableSheet.tsx:255 — 시트 peek 높이를 style 로 주입
    "--filter-id",  # GlassSurface.tsx:194 — SVG 필터 id 를 style 로 주입
}


def main() -> int:
    css_files = sorted(SRC.rglob("*.css"))
    if not css_files:
        print(f"[css-tokens] 대상 CSS 없음: {SRC}", file=sys.stderr)
        return 0

    defined: set[str] = set(RUNTIME_INJECTED)
    for path in css_files:
        defined.update(DEF_RE.findall(path.read_text(encoding="utf-8", errors="replace")))

    violations: list[tuple[Path, int, str]] = []
    for path in css_files:
        for lineno, line in enumerate(
            path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1
        ):
            for name in USE_RE.findall(line):
                if name not in defined:
                    violations.append((path, lineno, name))

    if not violations:
        print(f"[css-tokens] 위반 0건 (정의 {len(defined)}개 / 파일 {len(css_files)}개)")
        return 0

    print(f"[css-tokens] 미정의 토큰 참조 {len(violations)}건:", file=sys.stderr)
    for path, lineno, name in violations:
        rel = path.relative_to(SRC.parent.parent)
        print(f"  {rel}:{lineno}  var({name})", file=sys.stderr)
    print(
        "\n토큰을 styles/tokens.css 에 정의하거나 실제 토큰으로 바꿔라.\n"
        "의도적으로 선택적 참조라면 var(--name, <fallback>) 형태로 폴백을 명시하면 통과한다.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
