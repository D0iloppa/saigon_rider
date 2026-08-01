import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.enums import RewardActionTypeEnum
from app.services.policy_engine import _dispatch_action


class PolicyRewardSagaTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = AsyncMock()
        self.user = SimpleNamespace(user_id=7, external_user_uuid="user-1", total_exp_granted=0)
        self.action = SimpleNamespace(
            id=9,
            action_type=RewardActionTypeEnum.GRANT_GOLD,
            value=10,
            ref_id=None,
        )

    async def test_bff_failure_leaves_action_uncommitted_for_retry(self):
        claimed = MagicMock(rowcount=1)
        self.db.execute.return_value = claimed
        with patch("app.bff_client.bff_client.grant_gold", new=AsyncMock(side_effect=TimeoutError)):
            with self.assertRaises(TimeoutError):
                await _dispatch_action(self.db, self.user, self.action, 3, "policy-key:action:9")

    async def test_replayed_action_is_not_dispatched_twice(self):
        replayed = MagicMock(rowcount=0)
        self.db.execute.return_value = replayed
        with patch("app.bff_client.bff_client.grant_gold", new=AsyncMock()) as grant:
            await _dispatch_action(self.db, self.user, self.action, 3, "policy-key:action:9")
        grant.assert_not_awaited()
