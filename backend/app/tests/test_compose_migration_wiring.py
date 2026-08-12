"""`bff_migrate` 배선 불변식 — mount · 실행 · 스탬프는 항상 같은 집합이어야 한다.

2026-08-12 실사고: init/179 를 `volumes:` 에만 추가하고 `command:` 의 `-f` 쌍을 빠뜨렸다.
파일은 컨테이너에 보이지만 실행되지 않아, 배포 시 컬럼이 생기지 않는다. 모델이 그 컬럼을
매핑하고 있으면 **신규 기능만이 아니라 해당 테이블을 읽는 기존 기능 전부**가
`column ... does not exist` 로 죽는다(약속 카드·제안·수락·완료 전부).

마이그레이션별 개별 테스트(`test_reports_content_detach` 의 167 검사 등)로는 다음 번호에서
같은 함정이 반복되므로, 번호를 몰라도 성립하는 집합 동등성으로 고정한다.
"""

import re
import unittest
from pathlib import Path


def _bff_migrate_block() -> str:
    root = Path(__file__).resolve().parents[3]
    compose = (root / "docker-compose.yml").read_text(encoding="utf-8")
    m = re.search(r"\n  bff_migrate:\n(.*?)(?=\n  [a-z_]+:\n)", compose, re.S)
    assert m is not None, "bff_migrate service block not found in docker-compose.yml"
    return m.group(1)


class ComposeMigrationWiringTest(unittest.TestCase):
    def setUp(self):
        blk = _bff_migrate_block()
        self.mounted = set(re.findall(r"/migrations/(\d+)_[\w.]+\.sql:ro", blk))
        self.executed = set(re.findall(r'"-f"\s*\n\s*-\s*"/migrations/(\d+)_', blk))
        self.stamped = set(re.findall(r"VALUES \((\d+)\)", blk))

    def test_block_is_parsed(self):
        # 정규식이 compose 포맷 변경으로 조용히 0건을 잡으면 아래 동등성 검사가 무의미해진다.
        self.assertGreater(len(self.mounted), 30)

    def test_every_mounted_migration_is_executed(self):
        self.assertEqual(
            sorted(self.mounted - self.executed, key=int),
            [],
            "compose 에 mount 만 하고 command 의 -f 를 빠뜨린 마이그레이션 — 배포 시 실행되지 않는다",
        )

    def test_every_executed_migration_is_mounted(self):
        self.assertEqual(
            sorted(self.executed - self.mounted, key=int),
            [],
            "command 는 실행하는데 volumes 에 없는 마이그레이션 — 컨테이너에서 파일을 못 찾는다",
        )

    def test_every_executed_migration_is_stamped(self):
        self.assertEqual(
            sorted(self.executed - self.stamped, key=int),
            [],
            "실행하지만 schema_migrations 에 기록하지 않는 마이그레이션 — 적용 이력이 남지 않는다",
        )


if __name__ == "__main__":
    unittest.main()
