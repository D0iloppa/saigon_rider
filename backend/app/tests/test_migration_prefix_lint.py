"""DB-6 migration prefix lint 회귀 테스트.

tools/check_migration_prefixes.py 를 backend 테스트 스위트에서 함께 검증한다(별도 러너 불필요).
"""

import importlib.util
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
_SPEC = importlib.util.spec_from_file_location(
    "check_migration_prefixes", _ROOT / "tools" / "check_migration_prefixes.py"
)
assert _SPEC is not None and _SPEC.loader is not None
lint = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(lint)


class MigrationPrefixLintTests(unittest.TestCase):
    def test_current_tree_passes(self):
        # 실제 database/init 트리는 baseline 로 grandfather 되어 통과해야 한다.
        self.assertEqual(lint.find_new_duplicates(lint.INIT_DIR), [])

    def test_new_duplicate_prefix_is_flagged(self):
        tmp = self._make_tree(["100_a.sql", "101_b.sql", "100_c.sql"])
        self.assertEqual(lint.find_new_duplicates(tmp), ["100_a.sql", "100_c.sql"])

    def test_unique_prefixes_pass(self):
        tmp = self._make_tree(["100_a.sql", "101_b.sql", "102_c.sql"])
        self.assertEqual(lint.find_new_duplicates(tmp), [])

    def test_baselined_duplicates_are_allowed(self):
        tmp = self._make_tree(["002_add_passcode.sql", "002_contents_schema.sql"])
        self.assertEqual(lint.find_new_duplicates(tmp), [])

    def _make_tree(self, names: list[str]) -> Path:
        import tempfile

        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(tmp, ignore_errors=True))
        for name in names:
            (tmp / name).write_text("")
        return tmp


if __name__ == "__main__":
    unittest.main()
