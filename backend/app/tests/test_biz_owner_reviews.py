"""GET /biz/reviews (오너 전용 후기 목록, W2 T2/T3) 계약 테스트 — AsyncMock/MagicMock +
SimpleNamespace 로 라우터 함수를 직접 호출한다(test_business_review_lifecycle.py 패턴 미러).

고정하는 계약:
- 오너십 검증 실패(남의 프로필) 는 404.
- 숨김(hidden_at not None) 후기도 목록에 포함되지만 body 는 None, hidden=True.
- is_reported_by_me 는 세션 사용자(오너) 본인의 REVIEW 신고 존재 여부만 반영.
- unanswered_only=True 는 owner_reply IS NULL 인 건만 반환하되, unanswered_count 는 필터와
  무관하게 항상 전체 미답변 건수.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException

from app.routers import biz


def _review(*, profile_id, rating=4, body="괜찮았어요", owner_reply=None, hidden_at=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        profile_id=profile_id,
        rating=rating,
        body=body,
        created_at=datetime.now(UTC),
        owner_reply=owner_reply,
        owner_replied_at=datetime.now(UTC) if owner_reply else None,
        hidden_at=hidden_at,
    )


def _profile(*, owner_id, profile_id=None):
    return SimpleNamespace(id=profile_id or uuid.uuid4(), user_id=owner_id, status="APPROVED")


class _Result:
    """db.execute() 가 반환하는 Result 스텁 — scalar_one/.all()/.scalars().all() 만 지원."""

    def __init__(self, *, scalar_one=None, all_rows=None, scalars_all=None):
        self._scalar_one = scalar_one
        self._all_rows = all_rows or []
        self._scalars_all = scalars_all

    def scalar_one(self):
        return self._scalar_one

    def all(self):
        return self._all_rows

    def scalars(self):
        return SimpleNamespace(all=lambda: self._scalars_all or [])


def _make_db(*, profile, total, unanswered_count, rows, reported_ids, avg_rating=None):
    """호출 순서: (1) total count (2) unanswered count (3) avg_rating (4) rows select
    (5) reported_ids select(review_ids 가 있을 때만). 순서를 고정된 큐로 흉내낸다."""
    queue = [
        _Result(scalar_one=total),
        _Result(scalar_one=unanswered_count),
        _Result(scalar_one=avg_rating),
        _Result(all_rows=rows),
    ]
    if rows:
        queue.append(_Result(scalars_all=list(reported_ids)))

    db = AsyncMock()
    db.get = AsyncMock(return_value=profile)

    async def execute(_stmt):
        return queue.pop(0)

    db.execute = AsyncMock(side_effect=execute)
    return db


class OwnerReviewListOwnershipTest(unittest.IsolatedAsyncioTestCase):
    async def test_non_owner_is_404(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        with self.assertRaises(HTTPException) as ctx:
            await biz.get_owner_reviews(
                uuid.uuid4(), limit=20, offset=0, unanswered_only=False, db=db, session_uid=uuid.uuid4()
            )
        self.assertEqual(ctx.exception.status_code, 404)


class OwnerReviewListContractTest(unittest.IsolatedAsyncioTestCase):
    async def test_hidden_review_included_with_blinded_body(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id=owner_id)
        visible = _review(profile_id=profile.id, body="정상 후기")
        hidden = _review(profile_id=profile.id, body="민감한 원문", hidden_at=datetime.now(UTC))
        rows = [(visible, "닉네임1"), (hidden, "닉네임2")]
        db = _make_db(profile=profile, total=2, unanswered_count=2, rows=rows, reported_ids=[])

        out = await biz.get_owner_reviews(
            profile.id, limit=20, offset=0, unanswered_only=False, db=db, session_uid=owner_id
        )

        self.assertEqual(out.total, 2)
        hidden_out = next(r for r in out.reviews if r.id == hidden.id)
        self.assertTrue(hidden_out.hidden)
        self.assertIsNone(hidden_out.body)
        visible_out = next(r for r in out.reviews if r.id == visible.id)
        self.assertFalse(visible_out.hidden)
        self.assertEqual(visible_out.body, "정상 후기")
        # hidden_reason 은 오너 응답 스키마에 필드 자체가 없다 (익명성 보호)
        self.assertNotIn("hidden_reason", out.reviews[0].model_dump())

    async def test_is_reported_by_me_only_for_own_report(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id=owner_id)
        r1 = _review(profile_id=profile.id)
        r2 = _review(profile_id=profile.id)
        rows = [(r1, "n1"), (r2, "n2")]
        db = _make_db(profile=profile, total=2, unanswered_count=2, rows=rows, reported_ids=[r1.id])

        out = await biz.get_owner_reviews(
            profile.id, limit=20, offset=0, unanswered_only=False, db=db, session_uid=owner_id
        )

        by_id = {r.id: r for r in out.reviews}
        self.assertTrue(by_id[r1.id].is_reported_by_me)
        self.assertFalse(by_id[r2.id].is_reported_by_me)

    async def test_unanswered_only_filters_but_count_stays_total(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id=owner_id)
        unanswered = _review(profile_id=profile.id, owner_reply=None)
        rows = [(unanswered, "n1")]
        # unanswered_only=True 여도 unanswered_count 쿼리는 필터 없이 전체 미답변 건수를 센다.
        db = _make_db(profile=profile, total=1, unanswered_count=3, rows=rows, reported_ids=[])

        out = await biz.get_owner_reviews(
            profile.id, limit=20, offset=0, unanswered_only=True, db=db, session_uid=owner_id
        )

        self.assertEqual(len(out.reviews), 1)
        self.assertEqual(out.unanswered_count, 3)
        self.assertEqual(out.total, 1)

    async def test_empty_rows_skips_reported_ids_query(self):
        owner_id = uuid.uuid4()
        profile = _profile(owner_id=owner_id)
        db = _make_db(profile=profile, total=0, unanswered_count=0, rows=[], reported_ids=[])

        out = await biz.get_owner_reviews(
            profile.id, limit=20, offset=0, unanswered_only=False, db=db, session_uid=owner_id
        )

        self.assertEqual(out.reviews, [])
        self.assertEqual(out.total, 0)
        self.assertFalse(out.has_more)


if __name__ == "__main__":
    unittest.main()
