import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.routers.feed import _public_coordinates


class FeedLocationPrivacyTest(unittest.IsolatedAsyncioTestCase):
    async def test_location_off_is_publicly_null(self):
        post = SimpleNamespace(latitude=None, longitude=None, ward_id=None, ward=None)

        latitude, longitude = await _public_coordinates(post, AsyncMock())

        self.assertIsNone(latitude)
        self.assertIsNone(longitude)

    async def test_public_coordinates_are_ward_centroid_not_raw_coordinates(self):
        post = SimpleNamespace(
            latitude=Decimal("10.771234"),
            longitude=Decimal("106.691234"),
            ward_id=7,
            ward=SimpleNamespace(center_lat=10.77, center_lng=106.69),
        )

        latitude, longitude = await _public_coordinates(post, AsyncMock())

        self.assertEqual(latitude, Decimal("10.77"))
        self.assertEqual(longitude, Decimal("106.69"))
        self.assertNotEqual(latitude, post.latitude)
        self.assertNotEqual(longitude, post.longitude)

    async def test_legacy_row_resolves_nearest_ward_before_publication(self):
        post = SimpleNamespace(
            latitude=Decimal("10.771234"),
            longitude=Decimal("106.691234"),
            ward_id=None,
            ward=None,
        )
        nearest = SimpleNamespace(center_lat=10.77, center_lng=106.69)

        with patch("app.routers.feed._nearest_ward", new=AsyncMock(return_value=nearest)) as resolve:
            latitude, longitude = await _public_coordinates(post, AsyncMock())

        resolve.assert_awaited_once()
        self.assertEqual((latitude, longitude), (Decimal("10.77"), Decimal("106.69")))

    async def test_legacy_row_without_resolvable_ward_is_publicly_null(self):
        post = SimpleNamespace(
            latitude=Decimal("10.771234"),
            longitude=Decimal("106.691234"),
            ward_id=None,
            ward=None,
        )

        with patch("app.routers.feed._nearest_ward", new=AsyncMock(return_value=None)):
            latitude, longitude = await _public_coordinates(post, AsyncMock())

        self.assertIsNone(latitude)
        self.assertIsNone(longitude)
