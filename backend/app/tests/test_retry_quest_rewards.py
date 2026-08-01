import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.jobs.retry_quest_rewards import retry_quest_reward


def _result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


class RetryQuestRewardTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.uq_id = uuid.uuid4()
        self.quest_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        self.uq = SimpleNamespace(
            id=self.uq_id,
            quest_id=self.quest_id,
            user_id=self.user_id,
            status="ACCEPTED",
            reward_grant_status="FAILED",
            reward_idempotency_key=f"quest-reward-{self.uq_id}",
            reward_last_error="engine timeout",
        )
        self.quest = SimpleNamespace(id=self.quest_id)
        self.user = SimpleNamespace(id=self.user_id)
        self.db = AsyncMock()
        self.db.execute.return_value = _result(self.uq)
        self.db.get.side_effect = lambda model, key: self.quest if key == self.quest_id else self.user

    @patch("app.jobs.retry_quest_rewards.grant_quest_completion_reward", new_callable=AsyncMock)
    async def test_failed_reward_is_retried_with_locked_quest(self, grant_reward):
        retried = await retry_quest_reward(self.db, self.uq_id)

        self.assertTrue(retried)
        grant_reward.assert_awaited_once_with(self.db, self.uq, self.quest, self.user)

    @patch("app.jobs.retry_quest_rewards.grant_quest_completion_reward", new_callable=AsyncMock)
    async def test_succeeded_reward_is_not_retried(self, grant_reward):
        self.uq.reward_grant_status = "SUCCEEDED"

        retried = await retry_quest_reward(self.db, self.uq_id)

        self.assertFalse(retried)
        grant_reward.assert_not_awaited()

    @patch("app.jobs.retry_quest_rewards.grant_quest_completion_reward", new_callable=AsyncMock)
    async def test_missing_quest_stays_failed_for_operator_visibility(self, grant_reward):
        self.db.get.side_effect = lambda model, key: None if key == self.quest_id else self.user

        retried = await retry_quest_reward(self.db, self.uq_id)

        self.assertFalse(retried)
        self.assertEqual(self.uq.reward_grant_status, "FAILED")
        self.assertEqual(self.uq.reward_last_error, "quest/user not found")
        self.db.commit.assert_awaited_once()
        grant_reward.assert_not_awaited()
