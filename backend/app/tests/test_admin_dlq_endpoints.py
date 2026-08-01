"""F-21: DLQ 조회 경로 테스트 (격리는 이미 구현돼 있었으나 조회가 없었다).

Engine DLQ 는 반드시 engine_client 경유(Engine DB/Redis 직접 접근 금지, CLAUDE.md 핵심 제약) —
noti_worker DLQ 는 BFF 자신의 Redis stream 이라 직접 조회.
"""

import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.routers.admin_api import stream as stream_router


class EngineDlqEndpointTest(unittest.IsolatedAsyncioTestCase):
    async def test_delegates_to_engine_client_not_direct_redis(self):
        with patch(
            "app.routers.admin_api.stream.engine_client.admin_stream_dlq_messages",
            AsyncMock(return_value=[{"id": "1-0", "type": "push_failed"}]),
        ) as mock_call:
            result = await stream_router.get_engine_dlq(count=10, _session=None)
        mock_call.assert_awaited_once_with(count=10)
        self.assertEqual(result, [{"id": "1-0", "type": "push_failed"}])

    async def test_engine_unreachable_propagates_as_502(self):
        # 실패 표현 규약(ADR): 조회 실패를 빈 배열로 위장하지 않는다 — items.py 의
        # admin_get_items 관례와 동일하게 502 로 전파해 "DLQ 가 실제로 비어 있음"과 구분한다.
        with (
            patch(
                "app.routers.admin_api.stream.engine_client.admin_stream_dlq_messages",
                AsyncMock(side_effect=Exception("boom")),
            ),
            self.assertRaises(HTTPException) as ctx,
        ):
            await stream_router.get_engine_dlq(count=10, _session=None)
        self.assertEqual(ctx.exception.status_code, 502)


class NotiDlqEndpointTest(unittest.IsolatedAsyncioTestCase):
    async def test_reads_noti_dlq_stream_directly(self):
        fake_redis = AsyncMock()
        fake_redis.xrevrange = AsyncMock(return_value=[("2-0", {"type": "push_failed"})])
        with patch("app.routers.admin_api.stream.get_client", AsyncMock(return_value=fake_redis)):
            result = await stream_router.get_noti_dlq(count=10, _session=None)
        fake_redis.xrevrange.assert_awaited_once_with("noti:events:dlq", count=10)
        self.assertEqual(result, [{"id": "2-0", "type": "push_failed"}])


class EngineClientDlqMethodTest(unittest.IsolatedAsyncioTestCase):
    async def test_calls_engine_dlq_route_with_count_param(self):
        from unittest.mock import MagicMock

        from app.engine_client import EngineClient

        client = EngineClient()
        await client._client.aclose()
        client._client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = [{"id": "x"}]
        client._client.get = AsyncMock(return_value=mock_resp)

        result = await client.admin_stream_dlq_messages(count=25)

        client._client.get.assert_awaited_once_with("/v1/admin/stream/dlq-messages", params={"count": 25})
        self.assertEqual(result, [{"id": "x"}])


if __name__ == "__main__":
    unittest.main()
