"""260928 실기기 피드백 — 거래 이력에 완료건뿐 아니라 진행중(ACCEPTED)건도 노출.

이 파일이 고정하는 계약:
 1) GET /market/trades 는 ACCEPTED + COMPLETED 약속만 조회 대상으로 삼는다
    (CANCELLED/DECLINED/PROPOSED 등은 쿼리에 포함되지 않는다).
 2) 응답 항목의 `stage` 는 완료면 COMPLETED, 그 외(ACCEPTED)면 IN_PROGRESS.
 3) 진행중 건은 `completed_at` 이 None (완료 시각이 아직 없음).
 4) 본인이 아닌 user_id 조회는 403.
"""

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import market


def _appt(*, status, listing_id, conversation_id, updated_at):
    return SimpleNamespace(
        id=uuid.uuid4(),
        listing_id=listing_id,
        conversation_id=conversation_id,
        status=status,
        updated_at=updated_at,
    )


def _conv(conv_id, p1, p2):
    return SimpleNamespace(id=conv_id, participant_1=p1, participant_2=p2)


def _listing(listing_id, seller_id):
    return SimpleNamespace(
        id=listing_id,
        seller_id=seller_id,
        title="혼다 웨이브",
        agreed_price_vnd=None,
        price_vnd=5_000_000,
        images=[],
    )


class GetTradesTest(unittest.IsolatedAsyncioTestCase):
    async def test_forbidden_for_other_user(self):
        with self.assertRaises(HTTPException) as ctx:
            await market.get_trades(user_id=uuid.uuid4(), db=AsyncMock(), session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_query_excludes_cancelled_and_includes_accepted_completed(self):
        user_id = uuid.uuid4()
        db = AsyncMock()
        main_result = MagicMock()
        main_result.all = MagicMock(return_value=[])
        db.execute = AsyncMock(return_value=main_result)

        await market.get_trades(user_id=user_id, db=db, session_uid=user_id)

        stmt = db.execute.call_args[0][0]
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        self.assertIn("ACCEPTED", compiled)
        self.assertIn("COMPLETED", compiled)
        self.assertNotIn("CANCELLED", compiled)
        self.assertNotIn("DECLINED", compiled)
        self.assertNotIn("PROPOSED", compiled)

    async def test_completed_and_in_progress_rows_map_to_expected_stage(self):
        user_id = uuid.uuid4()
        seller_id = uuid.uuid4()  # counterpart in both rows (user_id is buyer)
        now = market.datetime.now(market.UTC)

        completed_listing_id = uuid.uuid4()
        completed_conv_id = uuid.uuid4()
        completed_appt = _appt(
            status="COMPLETED", listing_id=completed_listing_id, conversation_id=completed_conv_id, updated_at=now
        )
        completed_conv = _conv(completed_conv_id, seller_id, user_id)
        completed_listing = _listing(completed_listing_id, seller_id)

        accepted_listing_id = uuid.uuid4()
        accepted_conv_id = uuid.uuid4()
        accepted_appt = _appt(
            status="ACCEPTED", listing_id=accepted_listing_id, conversation_id=accepted_conv_id, updated_at=now
        )
        accepted_conv = _conv(accepted_conv_id, seller_id, user_id)
        accepted_listing = _listing(accepted_listing_id, seller_id)

        db = AsyncMock()
        main_result = MagicMock()
        main_result.all = MagicMock(return_value=[(completed_appt, completed_conv), (accepted_appt, accepted_conv)])

        no_review = MagicMock()
        no_review.scalars.return_value.first.return_value = None

        db.execute = AsyncMock(side_effect=[main_result, no_review, no_review])
        db.get = AsyncMock(side_effect=[completed_listing, None, accepted_listing, None])

        with patch.object(market, "resolve_avatar_url", return_value=None):
            out = await market.get_trades(user_id=user_id, db=db, session_uid=user_id)

        self.assertEqual(len(out), 2)
        completed_item, accepted_item = out
        self.assertEqual(completed_item.stage, "COMPLETED")
        self.assertEqual(completed_item.completed_at, now)
        self.assertEqual(accepted_item.stage, "IN_PROGRESS")
        self.assertIsNone(accepted_item.completed_at)


if __name__ == "__main__":
    unittest.main()
