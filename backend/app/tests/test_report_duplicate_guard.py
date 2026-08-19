"""R-3(260819 W3) — 재신고 차단 안내: 취소된 신고 vs 진행/종결 중인 신고를 서로 다른
전용 에러 코드로 구분한다. 재신고 불가 정책 자체(부분 유니크 인덱스)는 그대로 유지 — 이
헬퍼는 그 정책 위반을 감지했을 때 "왜" 막혔는지만 구분해서 알려준다(017 §12-B 결정③ 유지).

LISTING/USER/DM/POST/COMMENT 5개 target_type 생성 경로(market.py/dm.py/feed.py/users.py)가
공유하는 `guard_duplicate_report` 헬퍼를 직접 단위 테스트한다.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers._report_guard import guard_duplicate_report


def _db(existing_status: str | None):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=existing_status)))
    return db


class DuplicateReportGuardTest(unittest.IsolatedAsyncioTestCase):
    async def test_no_existing_report_passes_silently(self):
        db = _db(None)
        await guard_duplicate_report(db)  # 예외 없이 통과해야 한다

    async def test_cancelled_report_gets_dedicated_code(self):
        db = _db("CANCELLED")
        with self.assertRaises(HTTPException) as ctx:
            await guard_duplicate_report(db)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "report_already_cancelled")

    async def test_pending_report_gets_different_code_from_cancelled(self):
        db = _db("PENDING")
        with self.assertRaises(HTTPException) as ctx:
            await guard_duplicate_report(db)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "report_already_pending")

    async def test_resolved_report_reuses_pending_code_not_cancelled(self):
        """이미 종결(RESOLVED/REJECTED)된 신고도 '취소'가 아니므로 cancelled 코드로 새면 안 된다."""
        db = _db("RESOLVED")
        with self.assertRaises(HTTPException) as ctx:
            await guard_duplicate_report(db)
        self.assertEqual(ctx.exception.detail["code"], "report_already_pending")

    async def test_cancelled_and_pending_messages_are_distinct(self):
        cancelled_db = _db("CANCELLED")
        pending_db = _db("PENDING")
        with self.assertRaises(HTTPException) as cancelled_ctx:
            await guard_duplicate_report(cancelled_db)
        with self.assertRaises(HTTPException) as pending_ctx:
            await guard_duplicate_report(pending_db)
        self.assertNotEqual(cancelled_ctx.exception.detail["message"], pending_ctx.exception.detail["message"])


if __name__ == "__main__":
    unittest.main()
