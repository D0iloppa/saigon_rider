"""위치공유(약속 기반/독립) API 폐기 회귀 테스트 (Phase 3, 260829 SoT §6/§8).

`marketplace_location_shares` 8종 엔드포인트는 실시간 위치채널로 대체되어 410 Gone 스텁만
남았다 — 각 라우터 함수를 직접 호출해 HTTPException(410)이 나는지만 확인한다(DB 불필요,
`test_deal_location_sharing*.py` 를 대체).
"""

import unittest
import uuid

from fastapi import HTTPException

from app.routers import market


class LocationShareDeprecatedTest(unittest.IsolatedAsyncioTestCase):
    async def _assert_gone(self, func, *args):
        with self.assertRaises(HTTPException) as ctx:
            await func(*args)
        self.assertEqual(ctx.exception.status_code, 410)
        self.assertEqual(ctx.exception.detail, market._LOCATION_SHARE_GONE_DETAIL)

    async def test_start_location_share_gone(self):
        await self._assert_gone(market.start_location_share, uuid.uuid4())

    async def test_stop_location_share_gone(self):
        await self._assert_gone(market.stop_location_share, uuid.uuid4())

    async def test_ping_location_share_gone(self):
        await self._assert_gone(market.ping_location_share, uuid.uuid4())

    async def test_get_location_share_gone(self):
        await self._assert_gone(market.get_location_share, uuid.uuid4())

    async def test_start_conversation_location_share_gone(self):
        await self._assert_gone(market.start_conversation_location_share, uuid.uuid4())

    async def test_stop_conversation_location_share_gone(self):
        await self._assert_gone(market.stop_conversation_location_share, uuid.uuid4())

    async def test_ping_conversation_location_share_gone(self):
        await self._assert_gone(market.ping_conversation_location_share, uuid.uuid4())

    async def test_get_conversation_location_share_gone(self):
        await self._assert_gone(market.get_conversation_location_share, uuid.uuid4())


if __name__ == "__main__":
    unittest.main()
