"""업체 후기 생애주기(삭제·사장님 답글·신고) 계약 테스트 — 기존에 business_review 관련
테스트가 전무했다(구현 워커 자기신고). 여기서 고정하는 계약들은 어겨도 500/에러가 안 나고
조용히 틀리는 종류라 회귀 탐지에 특히 중요하다.

CancelReportContractTest(test_support_reports.py) 패턴을 그대로 따른다 — AsyncMock/MagicMock +
SimpleNamespace 로 라우터 함수를 직접 호출(DB 통합 테스트 아님, mock 기반 계약 고정).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers import biz
from app.schemas import BusinessReviewReplyRequest, ReportCreateRequest


def _review(*, user_id, profile_id, owner_reply=None, owner_replied_at=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        profile_id=profile_id,
        user_id=user_id,
        rating=4,
        body="괜찮았어요",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        owner_reply=owner_reply,
        owner_replied_at=owner_replied_at,
    )


def _profile(*, owner_id, profile_id=None):
    return SimpleNamespace(id=profile_id or uuid.uuid4(), user_id=owner_id, status="APPROVED")


def _execute_result(*, scalar_one_or_none=None, first=None):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=scalar_one_or_none)
    result.first = MagicMock(return_value=first)
    return result


class DeleteReviewOwnershipTest(unittest.IsolatedAsyncioTestCase):
    """② 소유권 위반은 404 (403 아님) — 남의 후기가 존재한다는 정보를 흘리지 않는다."""

    async def test_owner_can_delete_own_review(self):
        profile_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        review = _review(user_id=owner_id, profile_id=profile_id)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_execute_result(scalar_one_or_none=review))
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        out = await biz.delete_public_review(profile_id, review.id, db=db, session_uid=owner_id)

        self.assertEqual(out, {"deleted": True})
        db.delete.assert_awaited_once_with(review)

    async def test_deleting_someone_elses_review_is_404_not_403(self):
        profile_id = uuid.uuid4()
        review = _review(user_id=uuid.uuid4(), profile_id=profile_id)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_execute_result(scalar_one_or_none=review))
        db.delete = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await biz.delete_public_review(profile_id, review.id, db=db, session_uid=uuid.uuid4())

        self.assertEqual(ctx.exception.status_code, 404)
        db.delete.assert_not_called()

    async def test_deleting_missing_review_is_404(self):
        profile_id = uuid.uuid4()
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_execute_result(scalar_one_or_none=None))

        with self.assertRaises(HTTPException) as ctx:
            await biz.delete_public_review(profile_id, uuid.uuid4(), db=db, session_uid=uuid.uuid4())

        self.assertEqual(ctx.exception.status_code, 404)


class ReviewReplyOwnerOnlyTest(unittest.IsolatedAsyncioTestCase):
    """④ 답글은 업체 오너만 — 일반 사용자는 답글을 달 수도, 지울 수도 없다.
    ② 오너가 아니면(=남의 업체) 404 로 통일해 존재 여부를 숨긴다."""

    async def test_owner_can_upsert_reply(self):
        profile_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        profile = _profile(owner_id=owner_id, profile_id=profile_id)
        review = _review(user_id=uuid.uuid4(), profile_id=profile_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock(return_value=_execute_result(first=(review, "reviewer_nick")))
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        out = await biz.upsert_review_reply(
            profile_id,
            review.id,
            BusinessReviewReplyRequest(body="감사합니다!"),
            db=db,
            session_uid=owner_id,
        )

        self.assertEqual(review.owner_reply, "감사합니다!")
        self.assertIsNotNone(review.owner_replied_at)
        self.assertEqual(out.owner_reply, "감사합니다!")

    async def test_non_owner_reply_attempt_is_404(self):
        """소유하지 않은 업체에 답글을 시도하면 _get_own_profile 이 404 를 던진다 — 403 아님."""
        profile_id = uuid.uuid4()
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)  # 남의 프로필 or 존재하지 않음

        with self.assertRaises(HTTPException) as ctx:
            await biz.upsert_review_reply(
                profile_id,
                uuid.uuid4(),
                BusinessReviewReplyRequest(body="아무개 답글"),
                db=db,
                session_uid=uuid.uuid4(),
            )

        self.assertEqual(ctx.exception.status_code, 404)

    async def test_empty_reply_body_is_400(self):
        profile_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        profile = _profile(owner_id=owner_id, profile_id=profile_id)
        review = _review(user_id=uuid.uuid4(), profile_id=profile_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock(return_value=_execute_result(first=(review, "nick")))

        with self.assertRaises(HTTPException) as ctx:
            await biz.upsert_review_reply(
                profile_id,
                review.id,
                BusinessReviewReplyRequest(body="   "),
                db=db,
                session_uid=owner_id,
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIsNone(review.owner_reply)

    async def test_owner_can_delete_reply(self):
        profile_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        profile = _profile(owner_id=owner_id, profile_id=profile_id)
        review = _review(
            user_id=uuid.uuid4(),
            profile_id=profile_id,
            owner_reply="기존 답글",
            owner_replied_at=datetime.now(UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock(return_value=_execute_result(scalar_one_or_none=review))
        db.commit = AsyncMock()

        out = await biz.delete_review_reply(profile_id, review.id, db=db, session_uid=owner_id)

        self.assertEqual(out, {"deleted": True})
        self.assertIsNone(review.owner_reply)
        self.assertIsNone(review.owner_replied_at)

    async def test_non_owner_delete_reply_is_404(self):
        profile_id = uuid.uuid4()
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with self.assertRaises(HTTPException) as ctx:
            await biz.delete_review_reply(profile_id, uuid.uuid4(), db=db, session_uid=uuid.uuid4())

        self.assertEqual(ctx.exception.status_code, 404)


class ReviewReportContractTest(unittest.IsolatedAsyncioTestCase):
    """① 신고는 Report 를 PENDING 으로 INSERT 만 한다 — 후기 노출 상태를 바꾸는 어떤 쓰기도
    없어야 한다. 이게 깨지면 업체가 나쁜 리뷰를 신고로 지우는 어뷰징이 생긴다(016 M1, 가장 중요).
    ③ 중복 신고는 409 — 공유 헬퍼 _report_guard.guard_duplicate_report(W3, R-3) 가 기존 신고의
    status 에 따라 report_already_cancelled/report_already_pending 코드를 구분해 응답한다."""

    @staticmethod
    def _db(*, review, dup_status=None):
        db = AsyncMock()

        async def execute(stmt):
            # 첫 execute: 후기 조회 → scalar_one_or_none. 두번째: guard_duplicate_report 의
            # 기존 신고 status 조회 → scalar_one_or_none.
            if execute.calls == 0:
                execute.calls += 1
                return _execute_result(scalar_one_or_none=review)
            return _execute_result(scalar_one_or_none=dup_status)

        execute.calls = 0
        db.execute = AsyncMock(side_effect=execute)
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db

    async def test_report_only_inserts_pending_row_review_stays_untouched(self):
        """신고 라우트가 후기 행 자체를 건드리지 않는지 고정 — db.add 로 넘어간 객체가
        Report(status 기본값 PENDING) 뿐이고, review 객체 필드는 전혀 바뀌지 않아야 한다."""
        reviewer_id = uuid.uuid4()
        reporter_id = uuid.uuid4()
        review = _review(user_id=reviewer_id, profile_id=uuid.uuid4())
        original_body = review.body
        original_owner_reply = review.owner_reply
        db = self._db(review=review, dup_status=None)

        result = await biz.report_review(
            review.profile_id,
            review.id,
            ReportCreateRequest(reason="SPAM"),
            db=db,
            session_uid=reporter_id,
        )

        self.assertEqual(result, {"ok": True})
        db.add.assert_called_once()
        (added,) = db.add.call_args.args
        self.assertEqual(added.target_type, "REVIEW")
        self.assertEqual(added.review_id, review.id)
        self.assertEqual(added.reporter_id, reporter_id)
        self.assertEqual(added.reason, "SPAM")
        # Report 모델의 status 기본값(PENDING)을 신고 라우트가 명시 오버라이드하지 않는지 확인
        self.assertNotIn("status", vars(added))
        # 후기 자체는 전혀 변경되지 않았다 — 신고가 노출을 자동으로 숨기지 않는다
        self.assertEqual(review.body, original_body)
        self.assertEqual(review.owner_reply, original_owner_reply)

    async def test_duplicate_report_is_409(self):
        reviewer_id = uuid.uuid4()
        reporter_id = uuid.uuid4()
        review = _review(user_id=reviewer_id, profile_id=uuid.uuid4())
        db = self._db(review=review, dup_status="PENDING")

        with self.assertRaises(HTTPException) as ctx:
            await biz.report_review(
                review.profile_id,
                review.id,
                ReportCreateRequest(reason="SPAM"),
                db=db,
                session_uid=reporter_id,
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "report_already_pending")
        db.add.assert_not_called()

    async def test_duplicate_report_after_cancelled_is_distinct_code(self):
        reviewer_id = uuid.uuid4()
        reporter_id = uuid.uuid4()
        review = _review(user_id=reviewer_id, profile_id=uuid.uuid4())
        db = self._db(review=review, dup_status="CANCELLED")

        with self.assertRaises(HTTPException) as ctx:
            await biz.report_review(
                review.profile_id,
                review.id,
                ReportCreateRequest(reason="SPAM"),
                db=db,
                session_uid=reporter_id,
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "report_already_cancelled")
        db.add.assert_not_called()

    async def test_missing_review_is_404(self):
        db = self._db(review=None, dup_status=None)

        with self.assertRaises(HTTPException) as ctx:
            await biz.report_review(
                uuid.uuid4(),
                uuid.uuid4(),
                ReportCreateRequest(reason="SPAM"),
                db=db,
                session_uid=uuid.uuid4(),
            )

        self.assertEqual(ctx.exception.status_code, 404)

    async def test_invalid_reason_is_400(self):
        review = _review(user_id=uuid.uuid4(), profile_id=uuid.uuid4())
        db = self._db(review=review, dup_status=None)

        with self.assertRaises(HTTPException) as ctx:
            await biz.report_review(
                review.profile_id,
                review.id,
                ReportCreateRequest(reason="NOT_A_VALID_REASON"),
                db=db,
                session_uid=uuid.uuid4(),
            )

        self.assertEqual(ctx.exception.status_code, 400)
        db.add.assert_not_called()

    async def test_reporting_own_review_is_400(self):
        author_id = uuid.uuid4()
        review = _review(user_id=author_id, profile_id=uuid.uuid4())
        db = self._db(review=review, dup_status=None)

        with self.assertRaises(HTTPException) as ctx:
            await biz.report_review(
                review.profile_id,
                review.id,
                ReportCreateRequest(reason="SPAM"),
                db=db,
                session_uid=author_id,
            )

        self.assertEqual(ctx.exception.status_code, 400)
        db.add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
