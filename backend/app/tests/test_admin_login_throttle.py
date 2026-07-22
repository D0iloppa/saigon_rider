import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.services import admin_login_throttle as throttle


def _redis_with_pipeline(count: int):
    pipeline = MagicMock()
    pipeline.execute = AsyncMock(return_value=[count, True])
    client = MagicMock()
    client.pipeline.return_value = pipeline
    client.incr = AsyncMock(return_value=1)
    client.expire = AsyncMock()
    client.set = AsyncMock()
    client.delete = AsyncMock()
    client.ttl = AsyncMock(return_value=-2)
    return client, pipeline


class ClientIpTests(unittest.TestCase):
    def test_takes_last_forwarded_hop(self):
        request = MagicMock()
        request.headers = {"x-forwarded-for": "1.1.1.1, 2.2.2.2, 10.0.0.5"}
        # 마지막 홉(nginx 관측 remote_addr)이 위조 불가한 실제 IP
        self.assertEqual(throttle.client_ip(request), "10.0.0.5")

    def test_falls_back_to_socket_peer(self):
        request = MagicMock()
        request.headers = {}
        request.client.host = "203.0.113.9"
        self.assertEqual(throttle.client_ip(request), "203.0.113.9")


class RegisterFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_below_threshold_does_not_lock(self):
        client, _ = _redis_with_pipeline(count=throttle.MAX_FAILURES - 1)
        with patch.object(throttle, "get_client", AsyncMock(return_value=client)):
            await throttle.register_failure("root", "10.0.0.5")
        client.set.assert_not_called()

    async def test_threshold_sets_escalating_lockout_per_axis(self):
        client, _ = _redis_with_pipeline(count=throttle.MAX_FAILURES)
        with patch.object(throttle, "get_client", AsyncMock(return_value=client)):
            await throttle.register_failure("root", "10.0.0.5")
        # username 축 + ip 축 두 곳에 lockout
        self.assertEqual(client.set.await_count, 2)
        first_lock_key = client.set.await_args_list[0].args[0]
        self.assertIn("saigon:admin:login:lock:", first_lock_key)
        # level 1 → 첫 단계 lockout 길이
        self.assertEqual(client.set.await_args_list[0].kwargs["ex"], throttle.LOCKOUT_STEPS_SEC[0])

    async def test_redis_outage_is_fail_open(self):
        with patch.object(throttle, "get_client", AsyncMock(side_effect=ConnectionError("down"))):
            await throttle.register_failure("root", "10.0.0.5")  # 예외 없이 통과


class AssertNotLockedTests(unittest.IsolatedAsyncioTestCase):
    async def test_raises_429_with_retry_after_when_locked(self):
        client = MagicMock()
        client.ttl = AsyncMock(return_value=42)
        with (
            patch.object(throttle, "get_client", AsyncMock(return_value=client)),
            self.assertRaises(HTTPException) as raised,
        ):
            await throttle.assert_not_locked("root", "10.0.0.5")
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.headers["Retry-After"], "42")

    async def test_passes_when_no_lock(self):
        client = MagicMock()
        client.ttl = AsyncMock(return_value=-2)
        with patch.object(throttle, "get_client", AsyncMock(return_value=client)):
            await throttle.assert_not_locked("root", "10.0.0.5")

    async def test_redis_outage_is_fail_open(self):
        with patch.object(throttle, "get_client", AsyncMock(side_effect=ConnectionError("down"))):
            await throttle.assert_not_locked("root", "10.0.0.5")  # 예외 없이 통과


class ClearFailuresTests(unittest.IsolatedAsyncioTestCase):
    async def test_deletes_all_axis_keys(self):
        client = MagicMock()
        client.delete = AsyncMock()
        with patch.object(throttle, "get_client", AsyncMock(return_value=client)):
            await throttle.clear_failures("root", "10.0.0.5")
        # user 축 3키 + ip 축 3키
        self.assertEqual(len(client.delete.await_args.args), 6)


if __name__ == "__main__":
    unittest.main()
