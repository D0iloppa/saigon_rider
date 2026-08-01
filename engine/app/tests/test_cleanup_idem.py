import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.jobs.cleanup_idem import run


class _SessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class CleanupIdempotencyTest(unittest.IsolatedAsyncioTestCase):
    @patch("app.jobs.cleanup_idem.AsyncSessionLocal")
    async def test_monetary_operation_keys_are_not_deleted(self, session_factory):
        db = AsyncMock()
        db.execute.return_value = MagicMock(rowcount=3)
        session_factory.return_value = _SessionContext(db)

        await run()

        statement = str(db.execute.await_args.args[0])
        self.assertIn("idempotency_key.resource_type NOT IN", statement)
        db.commit.assert_awaited_once()
