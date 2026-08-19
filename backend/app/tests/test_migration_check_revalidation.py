"""`database/init` 재실행 CHECK 제약 재검증 사고(W8) 재발 방지.

2026-08-19 실사고: `bff_migrate` 는 배포마다 wiring(139~ 실행 목록)의 SQL 본문을 전부 재실행한다
(스탬프는 `INSERT ... ON CONFLICT DO NOTHING` 이라 본문은 항상 다시 돈다). 그런데 여러 마이그레이션이
같은 CHECK 제약을 `DROP CONSTRAINT IF EXISTS` 후 무조건 `ADD CONSTRAINT ... CHECK (...)` 로 좁게
재선언하고 있었다 — 최종(가장 나중) 마이그레이션이 넓혀놓은 값까지 담긴 최신 데이터가 있으면, 그
사이에 낀 과거 마이그레이션의 좁은 재선언이 기존 행을 위반해 배포가 막힌다
(`reports_target_type_check` 가 144→198→199 순으로 좁게 재선언되다 REVIEW 신고 데이터에 걸려 실패).

재발 방지 규칙: 같은 CHECK 제약을 두 파일 이상이 "무조건 DROP 후 ADD" 하면, **최종 소유자(가장
나중 파일)를 제외한 나머지는 반드시 `NOT VALID`** 를 붙여야 한다(기존 행 검증을 건너뛰어 재실행
시 실패하지 않게 한다 — 최종 소유자가 검증을 담당). `DO $$ IF NOT EXISTS (... pg_constraint ...) THEN
ADD CONSTRAINT ... END $$;` 로 감싼 "없을 때만 추가" 패턴은 애초에 기존 정의를 덮어쓰지 않으므로
안전하다(예외 대상).

번호를 몰라도 성립하도록 이름(제약명) 기준 동등성으로 고정한다 — 다음에 또 다른 제약이 이 패턴을
타도 같은 테스트가 잡는다.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
INIT_DIR = ROOT / "database" / "init"

_PREFIX_RE = re.compile(r"^(\d+)_")
_DO_BLOCK_RE = re.compile(r"DO\s+\$\$.*?\$\$;", re.S | re.I)
_ADD_CONSTRAINT_RE = re.compile(r"ADD CONSTRAINT (\w+)((?:(?!;)[\s\S])*);")
_DROP_CONSTRAINT_RE = re.compile(r"DROP CONSTRAINT IF EXISTS (\w+)")
_NOT_VALID_RE = re.compile(r"\bNOT\s+VALID\b", re.I)


def _executed_migration_numbers() -> set[str]:
    """bff_migrate 가 실제로 재실행하는(command 의 -f) 마이그레이션 번호 집합."""
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    m = re.search(r"\n  bff_migrate:\n(.*?)(?=\n  [a-z_]+:\n)", compose, re.S)
    assert m is not None, "bff_migrate service block not found in docker-compose.yml"
    return set(re.findall(r'"-f"\s*\n\s*-\s*"/migrations/(\d+)_', m.group(1)))


def _wired_init_files() -> list[Path]:
    executed = _executed_migration_numbers()
    files = [f for f in INIT_DIR.glob("*.sql") if (match := _PREFIX_RE.match(f.name)) and match.group(1) in executed]
    return sorted(files, key=lambda f: int(_PREFIX_RE.match(f.name).group(1)))


def find_unsafe_revalidations() -> list[str]:
    """파일 실행 순서상 최종 소유자가 아닌데 NOT VALID 없이 CHECK 를 무조건 재선언하는 곳을 찾는다."""
    occurrences: dict[str, list[tuple[str, bool, bool]]] = {}

    for f in _wired_init_files():
        text = f.read_text(encoding="utf-8")
        # DO 블록(가드된 "없을 때만 추가")은 무조건 재선언이 아니므로 DROP 탐지에서 제외한다.
        unconditional_drops = set(_DROP_CONSTRAINT_RE.findall(_DO_BLOCK_RE.sub("", text)))

        for m in _ADD_CONSTRAINT_RE.finditer(text):
            name, body = m.group(1), m.group(2)
            if "CHECK" not in body.upper():
                continue  # FK 등 CHECK 이외 제약은 이 룰의 대상이 아니다.
            not_valid = bool(_NOT_VALID_RE.search(body))
            unconditional = name in unconditional_drops
            occurrences.setdefault(name, []).append((f.name, not_valid, unconditional))

    violations = []
    for name, occ in occurrences.items():
        if len(occ) < 2:
            continue  # 단일 소유 제약은 재실행 시 좁아질 일이 없다.
        for fname, not_valid, unconditional in occ[:-1]:  # 마지막 = 최종 소유자, 검사 대상 아님.
            if unconditional and not not_valid:
                violations.append(
                    f"{fname}: '{name}' 은(는) 나중 파일에서 다시 정의되는데(최종 소유자 아님) "
                    "NOT VALID 없이 무조건 DROP+ADD 로 재선언한다 — 재실행 시 최신 데이터를 위반할 수 있다."
                )
    return sorted(violations)


class MigrationCheckRevalidationTest(unittest.TestCase):
    def test_wired_files_are_found(self):
        # 정규식이 compose/디렉터리 구조 변경으로 조용히 0건을 잡으면 아래 검사가 무의미해진다.
        self.assertGreater(len(_wired_init_files()), 30)

    def test_no_unsafe_intermediate_check_revalidation(self):
        self.assertEqual(find_unsafe_revalidations(), [])


if __name__ == "__main__":
    unittest.main()
