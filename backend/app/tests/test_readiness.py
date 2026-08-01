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
        result.one.return_value = (True, True, True, True, False, False) + (True,) * 9
        db.execute.return_value = result

        with self.assertRaises(RuntimeError):
            await readiness.check_readiness()
        get_client.assert_not_awaited()
        engine_ready.assert_not_awaited()

    @patch("app.readiness.engine_client.check_readiness", new_callable=AsyncMock)
    @patch("app.readiness.get_client", new_callable=AsyncMock)
    @patch("app.readiness.AsyncSessionLocal")
    async def test_missing_ads_biz_admin_schema_is_not_ready(self, session_factory, get_client, engine_ready):
        # 147~158 (관리자 role·광고 티어·사업자 검증·팔로우·광고 계측·가격표·침수 stale)
        # 스키마 누락 시에도 기존 6개 체크만으로는 readiness 가 통과해버리는 회귀 방지.
        db = AsyncMock()
        session_factory.return_value.__aenter__.return_value = db
        result = MagicMock()
        result.one.return_value = (True, True, True, True, True, True) + (False,) * 9
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
        result.one.return_value = (True, True, True, True, True, True) + (True,) * 9
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
        result.one.return_value = (True, True, True, True, True, True) + (True,) * 9
        db.execute.return_value = result
        redis = AsyncMock()
        redis.ping.return_value = True
        get_client.return_value = redis

        with self.assertRaises(RuntimeError):
            await readiness.check_readiness()
