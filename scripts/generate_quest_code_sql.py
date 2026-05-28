"""
scripts/quest_code_proposal.csv 를 읽어 backfill UPDATE SQL 생성.

출력: database/init/045_quest_mission_code_backfill.sql
"""
from __future__ import annotations
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / 'scripts/quest_code_proposal.csv'
OUT_SQL = ROOT / 'database/init/045_quest_mission_code_backfill.sql'


def main() -> None:
    with CSV_PATH.open(encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    lines = [
        '-- ===========================================================',
        '-- 045_quest_mission_code_backfill.sql',
        f'-- {len(rows)} quests에 mission_code / rarity 백필.',
        '-- 생성: scripts/generate_quest_code_sql.py (quest_code_proposal.csv 기반)',
        '-- ===========================================================',
        '',
        'BEGIN;',
        '',
    ]
    for r in rows:
        qid = r['id']
        code = r['mission_code'].replace("'", "''")
        rarity = r['rarity']
        lines.append(
            f"UPDATE quests SET mission_code = '{code}', rarity = '{rarity}' "
            f"WHERE id = '{qid}';"
        )
    lines += [
        '',
        '-- 검증',
        "DO $$",
        "DECLARE missing INT;",
        "BEGIN",
        "  SELECT COUNT(*) INTO missing FROM quests",
        "  WHERE mission_code IS NULL",
        "    AND NOT (COALESCE(title_ko,'') LIKE '%[DBG]%'",
        "          OR COALESCE(title_en,'') LIKE '%[DBG]%');",
        "  IF missing > 0 THEN",
        "    RAISE EXCEPTION '% non-DBG quests have NULL mission_code', missing;",
        "  END IF;",
        "END $$;",
        '',
        'COMMIT;',
        '',
    ]
    OUT_SQL.write_text('\n'.join(lines), encoding='utf-8')
    print(f"✓ {OUT_SQL.relative_to(ROOT)} ({len(rows)} UPDATE)")


if __name__ == '__main__':
    main()
