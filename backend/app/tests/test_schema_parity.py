"""database/init 스키마 파리티 회귀 테스트.

배경: fresh 볼륨(database/init 전건 실행)으로 재현한 스키마와 라이브 dev DB 가
어긋나 있었다(users.deleted_at 컬럼 생성 SQL 이 database/init 어디에도 없는데
코드 10곳이 참조 — 라이브에는 과거 수동 추가로 존재해 CI/fresh-init 검증을
전부 통과해온 결함). fresh-init 이 ERROR 없이 끝나는 것과 스키마가 코드가
기대하는 형태와 일치하는 것은 다른 문제다.

이 테스트는 완전한 스키마 diff 대신, 코드가 실제로 참조하는 핵심 컬럼이
database/init/*.sql 안에 최소 한 번은 정의(ADD COLUMN/CREATE TABLE 등)되는지
정적으로 검증한다. DB 접속 불필요(CI 에서도 동작).
"""

import re
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
_INIT_DIR = _ROOT / "database" / "init"

# (table, column) — 코드가 참조하지만 과거 라이브에서만 수동 추가돼 있었던 적 있는 핵심 컬럼들.
# 새 항목 추가 시: grep -rn "<column>" database/init/*.sql 으로 정의 파일이 있는지 먼저 확인.
_CRITICAL_COLUMNS: list[tuple[str, str]] = [
    ("users", "deleted_at"),
    ("badges", "policy_id"),
]


def _all_init_sql() -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in sorted(_INIT_DIR.glob("*.sql")))


class SchemaParityTests(unittest.TestCase):
    def test_critical_columns_defined_in_init(self):
        sql = _all_init_sql()
        missing = []
        for table, column in _CRITICAL_COLUMNS:
            # ALTER TABLE <table> ... ADD COLUMN [IF NOT EXISTS] <column>
            # 또는 CREATE TABLE <table> ( ... <column> ... ) 내 컬럼 정의 어느 쪼이든 인정.
            add_pattern = re.compile(
                rf"ALTER\s+TABLE\s+{re.escape(table)}\s+ADD\s+COLUMN(\s+IF\s+NOT\s+EXISTS)?\s+{re.escape(column)}\b",
                re.IGNORECASE,
            )
            if not add_pattern.search(sql):
                missing.append(f"{table}.{column}")
        self.assertEqual(
            missing,
            [],
            f"database/init/*.sql 에 정의가 없는 핵심 컬럼: {missing} "
            "(코드가 참조하지만 fresh-init 으로 재현되지 않는 스키마 드리프트)",
        )


if __name__ == "__main__":
    unittest.main()
