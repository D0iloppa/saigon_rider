"""소비자→업체 신고(report_business)·후기 신고(report_review) 중복 판정 코드 계약 (T5, W3 R-3 미러).

_report_guard.guard_duplicate_report 공유 헬퍼가 기존 신고 status 에 따라
report_already_cancelled / report_already_pending 을 구분해 응답하는지, BIZ·REVIEW 두
target_type 모두 동일 기준으로 동작하는지, 두 코드가 실제로 서로 다른지를 고정한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers import biz
from app.schemas import ReportCreateRequest


def _execute_result(*, scalar_one_or_none=None):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=scalar_one_or_none)
    return result


def _review(*, user_id, profile_id):
    return SimpleNamespace(
        id=uuid.uuid4(),
        profile_id=profile_id,
        user_id=user_id,
        rating=4,
        body="괜찮았어요",
        created_at=datetime.now(UTC),
        owner_reply=None,
        owner_replied_at=None,
    )


class BizReportGuardTest(unittest.IsolatedAsyncioTestCase):
    """report_business(BIZ) — guard_duplicate_report 적용 후 코드 분기."""

    @staticmethod
    def _db(*, profile, dup_status):
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock(return_value=_execute_result(scalar_one_or_none=dup_status))
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db

    async def test_pending_duplicate_returns_pending_code(self):
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4())
        db = self._db(profile=profile, dup_status="PENDING")

        with self.assertRaises(HTTPException) as ctx:
            await biz.report_business(profile.id, ReportCreateRequest(reason="OTHER"), db=db, session_uid=uuid.uuid4())

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "report_already_pending")
        db.add.assert_not_called()

    async def test_cancelled_duplicate_returns_cancelled_code(self):
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4())
        db = self._db(profile=profile, dup_status="CANCELLED")

        with self.assertRaises(HTTPException) as ctx:
            await biz.report_business(profile.id, ReportCreateRequest(reason="OTHER"), db=db, session_uid=uuid.uuid4())

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "report_already_cancelled")

    async def test_no_prior_report_succeeds(self):
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4())
        db = self._db(profile=profile, dup_status=None)

        out = await biz.report_business(
            profile.id, ReportCreateRequest(reason="OTHER"), db=db, session_uid=uuid.uuid4()
        )

        self.assertEqual(out, {"ok": True})
        db.add.assert_called_once()


class ReviewReportGuardCodeTest(unittest.IsolatedAsyncioTestCase):
    """report_review(REVIEW) 도 동일한 코드 체계를 쓰는지 — BIZ 와 코드가 서로 다르지 않고
    (같은 헬퍼) 두 상태(PENDING/CANCELLED) 끼리는 서로 다른지 확인."""

    @staticmethod
    def _db(*, review, dup_status):
        db = AsyncMock()
        calls = {"n": 0}

        async def execute(_stmt):
            if calls["n"] == 0:
                calls["n"] += 1
                return _execute_result(scalar_one_or_none=review)
            return _execute_result(scalar_one_or_none=dup_status)

        db.execute = AsyncMock(side_effect=execute)
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db

    async def test_review_pending_vs_cancelled_codes_differ(self):
        reporter_id = uuid.uuid4()
        review = _review(user_id=uuid.uuid4(), profile_id=uuid.uuid4())
        pending_db = self._db(review=review, dup_status="PENDING")
        cancelled_db = self._db(review=review, dup_status="CANCELLED")

        with self.assertRaises(HTTPException) as pending_ctx:
            await biz.report_review(
                review.profile_id,
                review.id,
                ReportCreateRequest(reason="SPAM"),
                db=pending_db,
                session_uid=reporter_id,
            )
        with self.assertRaises(HTTPException) as cancelled_ctx:
            await biz.report_review(
                review.profile_id,
                review.id,
                ReportCreateRequest(reason="SPAM"),
                db=cancelled_db,
                session_uid=reporter_id,
            )

        self.assertNotEqual(pending_ctx.exception.detail["code"], cancelled_ctx.exception.detail["code"])
        self.assertEqual(pending_ctx.exception.detail["code"], "report_already_pending")
        self.assertEqual(cancelled_ctx.exception.detail["code"], "report_already_cancelled")


if __name__ == "__main__":
    unittest.main()
