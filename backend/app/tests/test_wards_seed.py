"""N-1 회귀 테스트 — wards 테이블을 채우는 INSERT 가 database/init/ 에 전무해 신규 배포 시
_ward_map(biz.py) 이 빈 dict 가 되고 ward chip 이 영구 미표시되던 결함.
159_wards_seed.sql 이 존재하고, 멱등(ON CONFLICT DO NOTHING)하며, 최소 37개 ward 를 담고
있는지 정적으로 확인한다(DB 접속 없이 — CI/신규 볼륨에서도 검증 가능).
"""

import re
import unittest
from pathlib import Path

_SQL_PATH = Path(__file__).resolve().parents[3] / "database" / "init" / "159_wards_seed.sql"


class WardsSeedFileTest(unittest.TestCase):
    def test_seed_file_exists(self):
        self.assertTrue(_SQL_PATH.exists(), f"{_SQL_PATH} not found — N-1 wards seed missing")

    def test_seed_is_idempotent(self):
        sql = _SQL_PATH.read_text(encoding="utf-8")
        self.assertIn("INSERT INTO wards", sql)
        self.assertIn("ON CONFLICT (code) DO NOTHING", sql)

    def test_seed_has_hcmc_ward_rows(self):
        sql = _SQL_PATH.read_text(encoding="utf-8")
        rows = re.findall(r"\('HCMC_[A-Z0-9_]+',", sql)
        self.assertGreaterEqual(len(rows), 37)


if __name__ == "__main__":
    unittest.main()
