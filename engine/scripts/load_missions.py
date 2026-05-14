#!/usr/bin/env python3
"""미션 데이터 로더 (idempotent — ON CONFLICT DO NOTHING).

Usage:
    # 컨테이너 내부 (기본 경로: /app/data/sre-mission-seed.sql):
    docker compose run --rm engine python scripts/load_missions.py

    # SQL 파일 경로 직접 지정:
    docker compose run --rm engine python scripts/load_missions.py /path/to/seed.sql
"""
import asyncio
import os
import sys
from pathlib import Path

_HERE = Path(__file__).parent
_DEFAULT_PATHS = [
    _HERE.parent / "data" / "sre-mission-seed.sql",
]


def _resolve_sql_path() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    for p in _DEFAULT_PATHS:
        if p.exists():
            return p
    raise FileNotFoundError(
        f"sre-mission-seed.sql not found. "
        f"Checked: {_DEFAULT_PATHS}. "
        f"Pass the path as an argument."
    )


async def main() -> None:
    import asyncpg

    db_url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    path = _resolve_sql_path()

    raw_sql = path.read_text(encoding="utf-8").strip()

    # Strip trailing semicolon to append ON CONFLICT clause
    if raw_sql.endswith(";"):
        raw_sql = raw_sql[:-1]
    sql = raw_sql + "\nON CONFLICT (mission_code) DO NOTHING;"

    conn = await asyncpg.connect(db_url)
    try:
        before = await conn.fetchval("SELECT COUNT(*) FROM mission_definition")
        await conn.execute(sql)
        after = await conn.fetchval("SELECT COUNT(*) FROM mission_definition")
        inserted = after - before
        print(f"OK: {inserted} missions inserted, {after} total in mission_definition")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
