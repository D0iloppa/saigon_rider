import unittest
from unittest.mock import AsyncMock, MagicMock

from app.engine_client import EngineClient


class EngineClientIdempotencyTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = EngineClient()
        await self.client._client.aclose()
        self.client._client = MagicMock()
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json.return_value = {"ok": True}
        self.client._client.post = AsyncMock(return_value=response)

    async def test_credit_rp_forwards_idempotency_key(self):
        await self.client.credit_rp(
            "user-1",
            amount=10,
            idempotency_key="credit-key",
        )

        payload = self.client._client.post.await_args.kwargs["json"]
        self.assertEqual(payload["idempotency_key"], "credit-key")

    async def test_gacha_pull_forwards_idempotency_key(self):
        await self.client.pull_gacha(
            user_uuid="user-1",
            idempotency_key="gacha-key",
            gacha_code="BASIC",
        )

        payload = self.client._client.post.await_args.kwargs["json"]
        self.assertEqual(payload["idempotency_key"], "gacha-key")

    async def test_shop_purchase_forwards_idempotency_key(self):
        await self.client.purchase_shop_item(
            user_uuid="user-1",
            idempotency_key="shop-key",
            item_code="HELMET",
            currency="GP",
        )

        payload = self.client._client.post.await_args.kwargs["json"]
        self.assertEqual(payload["idempotency_key"], "shop-key")
