import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import redis_cache


class _AsyncKeys:
    def __init__(self, keys):
        self.keys = keys

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self.keys:
            raise StopAsyncIteration
        return self.keys.pop(0)


class GasCacheInvalidationTest(unittest.IsolatedAsyncioTestCase):
    async def test_only_nearby_cache_keys_are_unlinked(self):
        prefix = redis_cache.PREFIX
        keys = [
            f"{prefix}nearby:v1:10.776:106.700:5.0:RON95",
            f"{prefix}nearby:v1:10.780:106.710:2.0:E5",
            f"{prefix}nearby:v1:10.900:106.800:3.0:RON95",
            f"{prefix}nearby:v1:broken:key",
        ]
        client = MagicMock()
        client.scan_iter.return_value = _AsyncKeys(keys)
        client.unlink = AsyncMock(return_value=2)

        with patch.object(redis_cache, "get_client", new=AsyncMock(return_value=client)):
            deleted = await redis_cache.invalidate_gas_nearby_for_station(10.776, 106.700)

        self.assertEqual(deleted, 2)
        unlinked = client.unlink.await_args.args
        self.assertIn(f"{prefix}nearby:v1:10.776:106.700:5.0:RON95", unlinked)
        self.assertIn(f"{prefix}nearby:v1:10.780:106.710:2.0:E5", unlinked)
        self.assertNotIn(f"{prefix}nearby:v1:10.900:106.800:3.0:RON95", unlinked)

    async def test_no_matching_keys_does_not_unlink(self):
        client = MagicMock()
        client.scan_iter.return_value = _AsyncKeys([])
        client.unlink = AsyncMock()

        with patch.object(redis_cache, "get_client", new=AsyncMock(return_value=client)):
            deleted = await redis_cache.invalidate_gas_nearby_for_station(10.776, 106.700)

        self.assertEqual(deleted, 0)
        client.unlink.assert_not_awaited()
