import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.jobs import refresh_repair_stats


class _ConnectionContext:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class RepairStatsRefreshJobTest(unittest.IsolatedAsyncioTestCase):
    async def test_refresh_uses_autocommit_connection(self):
        autocommit = MagicMock(execute=AsyncMock())
        connection = MagicMock()
        connection.execution_options = AsyncMock(return_value=autocommit)

        fake_engine = MagicMock()
        fake_engine.connect.return_value = _ConnectionContext(connection)

        with patch.object(refresh_repair_stats, "engine", fake_engine):
            result = await refresh_repair_stats.refresh_repair_shop_stats()

        self.assertTrue(result)
        connection.execution_options.assert_awaited_once_with(isolation_level="AUTOCOMMIT")
        autocommit.execute.assert_awaited_once()

    async def test_refresh_failure_is_logged(self):
        connection = MagicMock()
        connection.execution_options = AsyncMock(side_effect=RuntimeError("db unavailable"))
        fake_engine = MagicMock()
        fake_engine.connect.return_value = _ConnectionContext(connection)

        with (
            patch.object(refresh_repair_stats, "engine", fake_engine),
            patch.object(refresh_repair_stats.log, "exception") as log_exception,
        ):
            result = await refresh_repair_stats.refresh_repair_shop_stats()

        self.assertFalse(result)
        log_exception.assert_called_once()
