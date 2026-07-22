import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers.internal import (
    GrantGoldRequest,
    QuestCardCompletedRequest,
    grant_gold,
    quest_card_completed,
)


def _result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


class QuestRewardCallbackTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.uq_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        self.quest_id = uuid.uuid4()
        self.body = QuestCardCompletedRequest(
            user_quest_id=str(self.uq_id),
            external_quest_id=str(self.quest_id),
            card_id=10,
            card_type="DISTANCE",
        )
        self.uq = SimpleNamespace(
            id=self.uq_id,
            user_id=self.user_id,
            quest_id=self.quest_id,
            status="ACCEPTED",
            reward_grant_status="PENDING",
            reward_idempotency_key=None,
            reward_last_error=None,
            completed_at=None,
        )
        self.quest = SimpleNamespace(
            id=self.quest_id,
            reward_exp=100,
            reward_gold=20,
            period="DAILY",
            card_type="DISTANCE",
        )
        self.user = SimpleNamespace(id=self.user_id, gold=0)
        self.db = AsyncMock()
        self.db.execute.return_value = _result(self.uq)
        self.db.get.side_effect = lambda model, key: self.quest if key == self.quest_id else self.user

    @patch("app.routers.internal.apply_quest_reward_multiplier", new_callable=AsyncMock, return_value=(100, 20))
    @patch("app.routers.internal.gain_exp", new_callable=AsyncMock)
    @patch("app.routers.internal.engine_client.credit_rp", new_callable=AsyncMock)
    async def test_rp_failure_is_not_acknowledged_and_is_retryable(self, credit_rp, _gain_exp, _multiplier):
        credit_rp.side_effect = TimeoutError("engine timeout")

        with self.assertRaises(HTTPException) as raised:
            await quest_card_completed(self.body, self.db)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(self.uq.reward_grant_status, "FAILED")
        self.assertEqual(self.user.gold, 0)
        self.db.commit.assert_awaited_once()

    @patch("app.routers.internal.apply_quest_reward_multiplier", new_callable=AsyncMock, return_value=(100, 20))
    @patch("app.routers.internal.gain_exp", new_callable=AsyncMock)
    @patch("app.routers.internal.engine_client.credit_rp", new_callable=AsyncMock)
    async def test_retry_uses_same_rp_key_after_bff_commit_failure(self, credit_rp, _gain_exp, _multiplier):
        self.db.commit.side_effect = [RuntimeError("commit failed"), None]
        with self.assertRaises(HTTPException) as raised:
            await quest_card_completed(self.body, self.db)
        self.assertEqual(raised.exception.status_code, 503)

        first_key = credit_rp.await_args.kwargs["idempotency_key"]
        self.uq.status = "ACCEPTED"
        self.uq.reward_grant_status = "PENDING"
        self.uq.reward_idempotency_key = f"quest-reward-{self.uq_id}"
        await quest_card_completed(self.body, self.db)

        self.assertEqual(credit_rp.await_args_list[1].kwargs["idempotency_key"], first_key)

    @patch("app.routers.internal.engine_client.credit_rp", new_callable=AsyncMock)
    async def test_succeeded_callback_is_acknowledged_without_regrant(self, credit_rp):
        self.uq.reward_grant_status = "SUCCEEDED"
        response = await quest_card_completed(self.body, self.db)
        self.assertEqual(response.detail, "already_completed")
        credit_rp.assert_not_awaited()

    @patch("app.routers.internal.apply_quest_reward_multiplier", new_callable=AsyncMock)
    @patch("app.routers.internal.gain_exp", new_callable=AsyncMock)
    @patch("app.routers.internal.engine_client.credit_rp", new_callable=AsyncMock)
    async def test_terminal_user_quest_states_never_grant_rewards(self, credit_rp, gain_exp, multiplier):
        for status in ("FAILED", "ABANDONED", "EXPIRED"):
            with self.subTest(status=status):
                self.uq.status = status
                with self.assertRaises(HTTPException) as raised:
                    await quest_card_completed(self.body, self.db)
                self.assertEqual(raised.exception.status_code, 409)

        self.assertEqual(self.user.gold, 0)
        credit_rp.assert_not_awaited()
        gain_exp.assert_not_awaited()
        multiplier.assert_not_awaited()

    @patch("app.routers.internal.apply_quest_reward_multiplier", new_callable=AsyncMock)
    @patch("app.routers.internal.gain_exp", new_callable=AsyncMock)
    @patch("app.routers.internal.engine_client.credit_rp", new_callable=AsyncMock)
    async def test_quest_context_mismatch_never_grants_rewards(self, credit_rp, gain_exp, multiplier):
        self.body.external_quest_id = str(uuid.uuid4())

        with self.assertRaises(HTTPException) as raised:
            await quest_card_completed(self.body, self.db)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(self.user.gold, 0)
        credit_rp.assert_not_awaited()
        gain_exp.assert_not_awaited()
        multiplier.assert_not_awaited()


class InternalGrantIdempotencyTest(unittest.IsolatedAsyncioTestCase):
    async def test_replayed_policy_grant_changes_balance_once(self):
        user_id = uuid.uuid4()
        user = SimpleNamespace(gold=0)
        db = AsyncMock()
        db.get.return_value = user
        db.execute.side_effect = [MagicMock(rowcount=1), MagicMock(rowcount=0)]
        request = GrantGoldRequest(user_uuid=str(user_id), amount=10, idempotency_key="policy-1:action:2")

        await grant_gold(request, db)
        replay = await grant_gold(request, db)

        self.assertEqual(user.gold, 10)
        self.assertEqual(replay.detail, "already_granted")
