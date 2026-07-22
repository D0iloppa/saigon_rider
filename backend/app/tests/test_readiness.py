import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app import readiness


class ReadinessTest(unittest.IsolatedAsyncioTestCase):
    @patch("app.readiness.engine_client.check_readiness", new_callable=AsyncMock)
    @patch("app.readiness.get_client", new_callable=AsyncMock)
    @patch("app.readiness.AsyncSessionLocal")
    async def test_missing_required_schema_is_not_ready(self, session_factory, get_client, engine_ready):
        db = AsyncMock()
        session_factory.return_value.__aenter__.return_value = db
        result = MagicMock()
        result.one.return_value = (True, True, True, True, False, False)
        db.execute.return_value = result

        with self.assertRaises(RuntimeError):
            await readiness.check_readiness()
        get_client.assert_not_awaited()
        engine_ready.assert_not_awaited()

    @patch("app.readiness.engine_client.check_readiness", new_callable=AsyncMock)
    @patch("app.readiness.get_client", new_callable=AsyncMock)
    @patch("app.readiness.AsyncSessionLocal")
    async def test_database_redis_and_engine_ready(self, session_factory, get_client, engine_ready):
        db = AsyncMock()
        session_factory.return_value.__aenter__.return_value = db
        result = MagicMock()
        result.one.return_value = (True, True, True, True, True, True)
        db.execute.return_value = result
        redis = AsyncMock()
        redis.ping.return_value = True
        get_client.return_value = redis

        checks = await readiness.check_readiness()
        self.assertEqual(checks["schema"], "ready")
        self.assertEqual(checks["engine"], "ready")
        engine_ready.assert_awaited_once()

    @patch("app.readiness.engine_client.check_readiness", new_callable=AsyncMock, side_effect=RuntimeError("offline"))
    @patch("app.readiness.get_client", new_callable=AsyncMock)
    @patch("app.readiness.AsyncSessionLocal")
    async def test_engine_failure_is_not_ready(self, session_factory, get_client, _engine_ready):
        db = AsyncMock()
        session_factory.return_value.__aenter__.return_value = db
        result = MagicMock()
        result.one.return_value = (True, True, True, True, True, True)
        db.execute.return_value = result
        redis = AsyncMock()
        redis.ping.return_value = True
        get_client.return_value = redis

        with self.assertRaises(RuntimeError):
            await readiness.check_readiness()
