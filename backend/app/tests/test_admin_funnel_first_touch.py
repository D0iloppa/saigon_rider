"""비회원 first-touch 유입경로 조회 API 회귀 테스트 (줍고 이식 P4).

router 함수를 직접 호출하고 db.execute 를 목킹한다 — 이 파일의 다른 admin_api 테스트들과 마찬가지로
실제 DB 연결 없이 SQL 실행 결과만 스텁으로 대체한다.
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from app.routers.admin_api import funnel


def _db_with_rows(rows):
    result = MagicMock()
    result.all.return_value = rows
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


class FirstTouchTest(unittest.IsolatedAsyncioTestCase):
    async def test_empty_rows_is_cold_status(self):
        db = _db_with_rows([])

        out = await funnel.get_first_touch(days=90, _session=None, db=db)

        self.assertEqual(out.status.state, "cold")
        self.assertEqual(out.rows, [])

    async def test_rows_compute_conversion_rate_and_direct_none_fallback(self):
        rows = [
            ("(direct)", "(none)", 10, 4),
            ("facebook", "cpc", 5, 0),
        ]
        db = _db_with_rows(rows)

        out = await funnel.get_first_touch(days=90, _session=None, db=db)

        self.assertEqual(out.status.state, "live")
        self.assertEqual(len(out.rows), 2)

        direct_row = out.rows[0]
        self.assertEqual(direct_row.utm_source, "(direct)")
        self.assertEqual(direct_row.utm_medium, "(none)")
        self.assertEqual(direct_row.anon_count, 10)
        self.assertEqual(direct_row.linked_count, 4)
        self.assertAlmostEqual(direct_row.conversion_rate, 0.4)

        fb_row = out.rows[1]
        self.assertEqual(fb_row.anon_count, 5)
        self.assertEqual(fb_row.linked_count, 0)
        self.assertEqual(fb_row.conversion_rate, 0.0)

    async def test_days_clamped_to_1_365(self):
        for requested, expected_days in ((0, 1), (1000, 365)):
            db = _db_with_rows([])
            before = datetime.now(funnel._VN_TZ) - timedelta(days=expected_days)
            await funnel.get_first_touch(days=requested, _session=None, db=db)
            after = datetime.now(funnel._VN_TZ) - timedelta(days=expected_days)

            _stmt, params = db.execute.await_args.args
            since = params["since"]
            self.assertTrue(before <= since <= after, f"days={requested} -> since not clamped to {expected_days}d")


if __name__ == "__main__":
    unittest.main()
