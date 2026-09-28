import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services.walkie_module import DmMembership


class WalkieBlockPolicyTests(unittest.IsolatedAsyncioTestCase):
    def _membership(self, conv, block_row):
        db = MagicMock()
        db.get = AsyncMock(return_value=conv)
        block_result = MagicMock()
        block_result.first.return_value = block_row
        db.execute = AsyncMock(return_value=block_result)

        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=db)
        context.__aexit__ = AsyncMock(return_value=False)
        factory = MagicMock(return_value=context)
        return DmMembership(factory), db

    async def test_blocked_direct_pair_cannot_send_new_voice(self):
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = SimpleNamespace(
            id=conv_id,
            conversation_type="direct",
            participant_1=me,
            participant_2=other,
        )
        membership, db = self._membership(conv, (me,))

        self.assertFalse(await membership.can_speak(str(conv_id), str(me)))
        db.execute.assert_awaited_once()

    async def test_blocked_direct_pair_can_still_read_existing_voice_history(self):
        me, other, conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conv = SimpleNamespace(
            id=conv_id,
            conversation_type="direct",
            participant_1=me,
            participant_2=other,
        )
        membership, db = self._membership(conv, (me,))

        self.assertTrue(await membership.can_listen(str(conv_id), str(me)))
        db.execute.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
