"""Fail when a NEW duplicate ``database/init`` migration prefix is introduced (DB-6).

``database/init/*.sql`` 는 파일명 사전순으로 순차 적용된다. 같은 숫자 prefix 를 가진 파일이 둘 이상이면
적용 순서가 파일명 뒷부분에 의존하게 되어 "prefix = 순서" 전제가 깨진다. 현재 트리에는 과거에 유입된
중복 prefix 가 남아 있으므로(아래 baseline), 그것들은 grandfather 하고 **새로운 중복 도입만** 막는다.

새 마이그레이션이 기존 파일과 prefix 가 겹치면 실패한다 — 다음 사용 가능한 번호로 재부여하면 된다.
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INIT_DIR = ROOT / "database" / "init"
_PREFIX_RE = re.compile(r"^(\d+)_")

# 이미 트리에 존재하는 중복 prefix 파일 집합 — 이 조합만 허용(grandfather).
# 새 파일이 이 목록 밖에서 기존 prefix 와 겹치면 실패한다. 새 중복을 절대 여기에 추가하지 말 것.
BASELINE_DUP_FILES = frozenset(
    {
        "002_add_passcode.sql",
        "002_contents_schema.sql",
        "042_fuel_price_v2.sql",
        "042_ward_mapping.sql",
        "092_marketplace_category_tree.sql",
        "092_translation_cache.sql",
        "093_marketplace_reports_blocks.sql",
        "093_translate_config.sql",
        "138_flood_confirmation_policy.sql",
        "138_legacy_district_boundaries.sql",
    }
)


def find_new_duplicates(init_dir: Path) -> list[str]:
    """baseline 밖에서 prefix 가 겹치는 파일명 목록(정렬)을 반환한다."""
    by_prefix: dict[str, list[str]] = defaultdict(list)
    for path in sorted(init_dir.glob("*.sql")):
        match = _PREFIX_RE.match(path.name)
        if match:
            by_prefix[match.group(1)].append(path.name)

    violations: list[str] = []
    for names in by_prefix.values():
        if len(names) < 2:
            continue
        violations.extend(name for name in names if name not in BASELINE_DUP_FILES)
    return sorted(violations)


def main() -> int:
    violations = find_new_duplicates(INIT_DIR)
    if violations:
        print("Migration prefix check failed — duplicate init prefix(es):", file=sys.stderr)
        for name in violations:
            print(f"- database/init/{name} (renumber to the next free prefix)", file=sys.stderr)
        return 1
    print("Migration prefix check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
