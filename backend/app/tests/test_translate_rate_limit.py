import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import translate


class TranslateRateLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_counter_and_initial_expiry_are_atomic(self):
        user_id = uuid.uuid4()
        key = f"saigon:translate:rate:{user_id}"
        pipeline = MagicMock()
        pipeline.execute = AsyncMock(return_value=[1, True])
        client = MagicMock()
        client.pipeline.return_value = pipeline

        with patch.object(translate, "get_client", AsyncMock(return_value=client)):
            await translate._enforce_rate_limit(user_id)

        client.pipeline.assert_called_once_with(transaction=True)
        pipeline.incr.assert_called_once_with(key)
        pipeline.expire.assert_called_once_with(key, translate._RATE_WINDOW_SEC, nx=True)
        pipeline.execute.assert_awaited_once()

    async def test_redis_outage_blocks_paid_provider_path(self):
        with (
            patch.object(translate, "get_client", AsyncMock(side_effect=ConnectionError("redis down"))),
            self.assertRaises(HTTPException) as raised,
        ):
            await translate._enforce_rate_limit(uuid.uuid4())

        self.assertEqual(raised.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
