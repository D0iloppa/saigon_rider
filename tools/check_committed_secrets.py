#!/usr/bin/env python3
"""커밋 파일에 OAuth/번역 시크릿 실값이 들어가는 것을 차단한다.

배경: 2026-07-31 에 `database/init/104_oauth_zalo_config.sql` 의 **주석 줄**에
Zalo app secret 실값이 커밋돼 있던 것이 출시감사에서 발견됐다. `INSERT` 문은
`CHANGE_ME` 였고 주석만 실값이었기 때문에 눈에 띄지 않았다.

이 훅은 그 사고 패턴만 좁게 막는다(범용 엔트로피 스캐너가 아니다 — 오탐이 늘면
아무도 안 본다):
  1) `database/init/*.sql` 중 app_config 를 다루는 줄의 `value='...'` — 주석 포함
  2) `.env.example` 의 시크릿성 키에 값이 채워진 경우

시크릿의 SoT 는 DB `app_config` 다(ADR `시크릿 위치`). 실값은 파일에 두지 않는다.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# 값이 아니라 자리표시자임을 나타내는 토큰
PLACEHOLDER = re.compile(
    r"change_me|runtime_only|your[_-]|placeholder|example|todo|xxx|\.\.\.|^<.*>$",
    re.IGNORECASE,
)
# app_config 계열 SQL 에서 값이 실릴 수 있는 자리
SQL_VALUE = re.compile(r"value\s*=\s*'([^']*)'", re.IGNORECASE)
# .env.example 에서 값이 비어 있어야 하는 키
ENV_SECRET_KEY = re.compile(r"^([A-Z0-9_]*(SECRET|PASSWORD|PASS_HASH|API_KEY|TOKEN|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*(.*)$")
# 값이 있어도 무해한 .env.example 키(공개 식별자·URL·프로바이더명 등)
ENV_ALLOW = {"TRANSLATE_PROVIDER", "SMS_PROVIDER"}

MIN_LEN = 8


def _looks_real(value: str) -> bool:
    v = value.strip()
    return len(v) >= MIN_LEN and not PLACEHOLDER.search(v)


def check_sql(path: Path) -> list[str]:
    hits: list[str] = []
    for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        # app_config 를 다루는 파일/줄만 대상 — 일반 시드 SQL 의 긴 텍스트는 무시
        if "app_config" not in line and "app_config" not in path.name and "oauth" not in path.name:
            continue
        for m in SQL_VALUE.finditer(line):
            if _looks_real(m.group(1)):
                kind = "주석" if line.lstrip().startswith("--") else "SQL"
                hits.append(f"{path}:{n} [{kind}] value='...' 실값 의심 (길이 {len(m.group(1))})")
    return hits


def check_env_example(path: Path) -> list[str]:
    hits: list[str] = []
    for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if line.lstrip().startswith("#"):
            continue
        m = ENV_SECRET_KEY.match(line.strip())
        if not m:
            continue
        key, value = m.group(1), m.group(3)
        if key in ENV_ALLOW:
            continue
        if _looks_real(value):
            hits.append(f"{path}:{n} {key} 에 값이 채워져 있다 (길이 {len(value.strip())}) — .env.example 은 빈 값이어야 한다")
    return hits


def main(argv: list[str]) -> int:
    hits: list[str] = []
    for arg in argv:
        path = Path(arg)
        if not path.is_file():
            continue
        if path.suffix == ".sql" and "database/init" in path.as_posix():
            hits += check_sql(path)
        elif path.name == ".env.example":
            hits += check_env_example(path)

    if hits:
        sys.stderr.write("커밋 차단 — 시크릿 실값으로 보이는 값이 있다:\n")
        for h in hits:
            sys.stderr.write(f"  {h}\n")
        sys.stderr.write(
            "\n시크릿의 SoT 는 DB app_config 다. 파일에는 CHANGE_ME 같은 자리표시자만 두고,\n"
            "실값은 psql 로 주입하라:\n"
            "  UPDATE app_config SET value='<실값>', updated_at=now()\n"
            "   WHERE group_name='<oauth|translate>' AND key='<키>';\n"
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
