import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app


class CouponLaunchGateTests(unittest.TestCase):
    def test_direct_coupon_routes_are_not_exposed_or_forwarded_to_engine(self):
        with (
            patch("app.engine_client.engine_client.list_catalog", new_callable=AsyncMock) as list_catalog,
            patch("app.engine_client.engine_client.create_redemption", new_callable=AsyncMock) as redeem,
            patch("app.engine_client.engine_client.list_redemptions", new_callable=AsyncMock) as list_mine,
        ):
            client = TestClient(app)
            responses = [
                client.get("/api/coupons"),
                client.post(
                    "/api/coupons/redeem",
                    json={"catalog_id": 1, "idempotency_key": "launch-gate-test"},
                ),
                client.get("/api/coupons/mine"),
            ]

        self.assertTrue(all(response.status_code == 404 for response in responses))
        list_catalog.assert_not_awaited()
        redeem.assert_not_awaited()
        list_mine.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
