#!/usr/bin/env python3
"""공개 랜딩 자산(saigon-rider.com)에 내부 전용 문자열이 노출되는 것을 차단한다.

배경: P1-13 (ai-docs/260803_prelaunch_ux_audit.md) — 공개 랜딩 스크린샷/소스에
dev 전용 업체명(`[DEV]`), 탈퇴 사용자 익명화 닉네임(`del_<hex16>`, backend/app/
routers/users.py:305-310), 원본 UUID 가 노출된 사례가 있었다. 이 훅은 그 세
패턴만 좁게 검사한다(범용 시크릿 스캐너가 아니다).

대상: landing/apps/client/public/**, landing/apps/client/src/** (텍스트 파일).
바이너리(png/jpg/webp 등)도 임베디드 메타데이터 문자열 노출 여부만 얕게 검사한다
(픽셀 자체의 내용은 코드로 판별 불가 — 재캡처 체크리스트로 별도 관리).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DEV_TAG = re.compile(r"\[DEV\]")
WITHDRAWN_NICK = re.compile(r"\bdel_[0-9a-f]{16}\b")
UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE
)

TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".svg", ".json", ".md", ".txt"}

# 랜딩 코드 자체가 정당하게 UUID 형식을 다루는 경우(예: 라우트 파라미터 타입 주석,
# 정규식 리터럴 자체)까지 걸리지 않도록, 훅 스크립트 자신은 스캔 대상에서 제외한다.
SELF = Path(__file__).resolve()


def scan_text(path: Path) -> list[str]:
    hits: list[str] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return hits
    for n, line in enumerate(text.splitlines(), 1):
        if DEV_TAG.search(line):
            hits.append(f"{path}:{n} [DEV] 태그 노출")
        if WITHDRAWN_NICK.search(line):
            hits.append(f"{path}:{n} 탈퇴 익명화 닉네임(del_*) 노출")
        for m in UUID_RE.finditer(line):
            hits.append(f"{path}:{n} 원본 UUID 노출 ({m.group(0)})")
    return hits


def scan_binary(path: Path) -> list[str]:
    """이미지 등 바이너리에 임베디드된 텍스트 메타데이터만 얕게 검사."""
    hits: list[str] = []
    try:
        raw = path.read_bytes()
    except OSError:
        return hits
    text = raw.decode("ascii", errors="ignore")
    if DEV_TAG.search(text):
        hits.append(f"{path}: [DEV] 태그가 바이너리 메타데이터에 노출")
    if WITHDRAWN_NICK.search(text):
        hits.append(f"{path}: 탈퇴 익명화 닉네임(del_*)이 바이너리 메타데이터에 노출")
    return hits


def iter_targets(roots: list[Path]) -> list[Path]:
    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        files.extend(p for p in root.rglob("*") if p.is_file())
    return files


def main(argv: list[str]) -> int:
    base = Path(__file__).resolve().parent.parent
    roots = [
        base / "landing" / "apps" / "client" / "public",
        base / "landing" / "apps" / "client" / "src",
    ]
    # pre-commit 이 변경 파일 목록을 넘기면 그것만, 아니면 전체 스캔.
    if argv:
        targets = [Path(a) for a in argv if Path(a).is_file()]
        targets = [
            p for p in targets
            if any(str(p.resolve()).startswith(str(r)) for r in roots)
        ]
    else:
        targets = iter_targets(roots)

    hits: list[str] = []
    for path in targets:
        if path.resolve() == SELF:
            continue
        if path.suffix.lower() in TEXT_SUFFIXES:
            hits += scan_text(path)
        else:
            hits += scan_binary(path)

    if hits:
        sys.stderr.write(f"공개 랜딩 자산 검사 — 위반 {len(hits)}건:\n")
        for h in hits:
            sys.stderr.write(f"  {h}\n")
        return 1

    print("공개 랜딩 자산 검사 — 위반 0건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
