"""Fail when production database init can execute development-only seed data."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INIT_DIR = ROOT / "database" / "init"
DEV_MARKERS = (
    "[DEV]",
    "loremflickr.com",
    "example.com",
    "+84-ADV-",
    "+84-DEV-",
)
DEV_BLOCK_RE = re.compile(
    r"DO\s+\$dev_seed\$\s*"
    r"BEGIN\s*"
    r"IF\s+current_setting\('app\.seed_profile',\s*true\)\s+"
    r"IN\s*\('development',\s*'dev',\s*'local',\s*'test'\)\s+THEN\b"
    r".*?"
    r"END\s+IF;\s*"
    r"END\s*"
    r"\$dev_seed\$;",
    re.IGNORECASE | re.DOTALL,
)


def _without_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    return re.sub(r"--[^\r\n]*", "", sql)


def _unguarded_markers(path: Path) -> list[str]:
    executable_sql = _without_comments(path.read_text(encoding="utf-8"))
    unguarded_sql = DEV_BLOCK_RE.sub("", executable_sql)
    return [marker for marker in DEV_MARKERS if marker.lower() in unguarded_sql.lower()]


def main() -> int:
    errors: list[str] = []

    for path in sorted(INIT_DIR.glob("*.sql")):
        markers = _unguarded_markers(path)
        if markers:
            errors.append(
                f"{path.relative_to(ROOT)}: unguarded development marker(s): "
                + ", ".join(markers)
            )

    base_compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    expected_base = (
        'command: ["postgres", "-c", "app.seed_profile=${APP_ENV:-production}"]'
    )
    if expected_base not in base_compose:
        errors.append(
            "docker-compose.yml: database seed profile must default to production"
        )

    prod_compose = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    expected_prod = 'command: ["postgres", "-c", "app.seed_profile=production"]'
    if expected_prod not in prod_compose:
        errors.append(
            "docker-compose.prod.yml: production seed profile must be hard-coded"
        )

    if errors:
        print("Production seed safety check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Production seed safety check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
