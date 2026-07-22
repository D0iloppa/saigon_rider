import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app import readiness


class ReadinessTest(unittest.IsolatedAsyncioTestCase):
    @patch("app.readiness.expected_migration_head", return_value="sre058")
    @patch("app.readiness.get_redis", new_callable=AsyncMock)
    @patch("app.readiness.AsyncSessionLocal")
    async def test_stale_migration_is_not_ready(self, session_factory, get_redis, _head):
        db = AsyncMock()
        session_factory.return_value.__aenter__.return_value = db
        result = MagicMock()
        result.scalar_one_or_none.return_value = "sre057"
        db.execute.return_value = result

        with self.assertRaises(RuntimeError):
            await readiness.check_readiness()
        get_redis.assert_not_awaited()

    @patch("app.readiness.expected_migration_head", return_value="sre058")
    @patch("app.readiness.get_redis", new_callable=AsyncMock)
    @patch("app.readiness.AsyncSessionLocal")
    async def test_current_migration_and_redis_ready(self, session_factory, get_redis, _head):
        db = AsyncMock()
        session_factory.return_value.__aenter__.return_value = db
        result = MagicMock()
        result.scalar_one_or_none.return_value = "sre058"
        db.execute.return_value = result
        redis = AsyncMock()
        redis.ping.return_value = True
        get_redis.return_value = redis

        checks = await readiness.check_readiness()
        self.assertEqual(checks["migration"], "sre058")
