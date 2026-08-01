"""P2: search_norm.norm() 단위 테스트 — 260801 설계문서 §5 P2 명시된 케이스 그대로.

수정 전 FAIL 실증: 이 모듈(`app.services.search_norm`) 자체가 이 세션 이전에는 존재하지 않아
`ModuleNotFoundError` 로 전부 실패했다(신규 파일이라 구조적으로 통과 불가).
"""

import unittest

from app.services.search_norm import norm


class NormTest(unittest.TestCase):
    def test_vietnamese_diacritics_stripped(self):
        self.assertEqual(norm("Xe đạp"), "xe dap")

    def test_korean_untouched(self):
        self.assertEqual(norm("자전거"), "자전거")

    def test_multiple_spaces_collapsed_and_diacritics_stripped(self):
        self.assertEqual(norm("Bình  Thạnh"), "binh thanh")

    def test_none_returns_empty_string(self):
        self.assertEqual(norm(None), "")

    def test_uppercase_d_stroke(self):
        self.assertEqual(norm("Đà Nẵng"), "da nang")


if __name__ == "__main__":
    unittest.main()
