"""code-review high 지적 #11 — 빈/공백 금칙어 행 하나가 모든 매물 등록을 막는 문제 고정.

`any(kw in text for kw in keywords)` 는 `kw == ""` 일 때 항상 True 다. banned_keywords 테이블에
공백/빈 문자열 행이 하나만 있어도 모든 매물 create/update 가 400 banned_keyword 로 막혔다.
`banned_keywords()` 가 빈/공백 키워드를 필터링해 이를 방지한다.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from app.services import banned_keywords as banned_keywords_module
from app.services.banned_keywords import banned_keywords


def _make_db(rows: list[str]) -> AsyncMock:
    db = AsyncMock()
    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=rows)))
    db.execute = AsyncMock(return_value=result)
    return db


class BannedKeywordsEmptyRowTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        banned_keywords_module._banned_keywords_cache = (0.0, [])

    async def test_blank_row_is_filtered_out_so_normal_listing_is_not_blocked(self):
        db = _make_db(["", "   ", "실제금칙어"])
        keywords = await banned_keywords(db)
        self.assertNotIn("", keywords)
        # 정상 매물 텍스트에 빈 문자열만 있었다면 무해한 텍스트도 "매칭"됐을 것 — 이제는 아니다.
        self.assertFalse(any(kw in "평범한 매물 설명입니다" for kw in keywords))
        self.assertIn("실제금칙어", keywords)

    async def test_all_blank_rows_yield_empty_keyword_list(self):
        banned_keywords_module._banned_keywords_cache = (0.0, [])
        db = _make_db(["", "  "])
        keywords = await banned_keywords(db)
        self.assertEqual(keywords, [])


if __name__ == "__main__":
    unittest.main()
