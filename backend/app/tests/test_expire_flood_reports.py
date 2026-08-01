import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.jobs import expire_flood_reports


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FloodExpiryJobTest(unittest.IsolatedAsyncioTestCase):
    async def test_expiry_update_runs_in_batch(self):
        session = MagicMock(execute=AsyncMock(), commit=AsyncMock())

        with patch.object(
            expire_flood_reports,
            "AsyncSessionLocal",
            return_value=_SessionContext(session),
        ):
            result = await expire_flood_reports.expire_stale_flood_reports()

        self.assertTrue(result)
        sql = str(session.execute.await_args.args[0])
        self.assertIn("UPDATE flood_report", sql)
        self.assertIn("still_flooded", sql)
        self.assertIn("COUNT(DISTINCT user_id) >= 2", sql)
        session.commit.assert_awaited_once()

    async def test_expiry_failure_is_logged(self):
        session = MagicMock(execute=AsyncMock(side_effect=RuntimeError("db unavailable")), commit=AsyncMock())

        with (
            patch.object(expire_flood_reports, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(expire_flood_reports.log, "exception") as log_exception,
        ):
            result = await expire_flood_reports.expire_stale_flood_reports()

        self.assertFalse(result)
        log_exception.assert_called_once()
        session.commit.assert_not_awaited()
