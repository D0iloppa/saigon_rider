import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from app.models import SreUser
from app.routers.device_map import (
    DeviceMapDeleteRequest, DeviceMapRequest, PushNotifyRequest,
    delete_device_map, notify_user, upsert_device_map,
)
from app.services.fcm_push import PushResult, RetryablePushError



class DeviceMapDeleteTest(unittest.IsolatedAsyncioTestCase):
    async def test_delete_device_map_removes_matching_owner(self):
        mock_db = AsyncMock()
        result = MagicMock(rowcount=1)
        mock_db.execute.return_value = result

        with patch("app.routers.device_map.invalidate_device_cache") as invalidate:
            response = await delete_device_map(
                DeviceMapDeleteRequest(device_uuid="device-a", external_user_uuid="user-a"),
                mock_db,
            )

        self.assertTrue(response.removed)
        mock_db.commit.assert_awaited_once()
        invalidate.assert_called_once_with("device-a")

    async def test_delete_device_map_does_not_remove_other_owner(self):
        mock_db = AsyncMock()
        result = MagicMock(rowcount=0)
        mock_db.execute.return_value = result

        with patch("app.routers.device_map.invalidate_device_cache") as invalidate:
            response = await delete_device_map(
                DeviceMapDeleteRequest(device_uuid="device-a", external_user_uuid="user-b"),
                mock_db,
            )

        self.assertFalse(response.removed)
        mock_db.commit.assert_not_awaited()
        invalidate.assert_not_called()


class DeviceMapUpsertTest(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _result(*, scalar=None, scalars=None):
        result = MagicMock()
        result.scalar_one_or_none.return_value = scalar
        result.scalars.return_value.all.return_value = scalars or []
        return result

    async def test_same_device_and_token_transfer_to_new_user(self):
        mock_db = AsyncMock()
        user = SreUser(user_id=2, external_user_uuid="user-b")
        mock_db.execute.side_effect = [
            self._result(scalar=user),
            self._result(scalars=["device-a"]),
            MagicMock(),
            self._result(scalar=1),
            MagicMock(),
            self._result(scalar=None),
            MagicMock(),
        ]

        with patch("app.routers.device_map.invalidate_device_cache") as invalidate:
            with patch("app.services.fcm_push.reset_badge", new=AsyncMock()):
                response = await upsert_device_map(
                    DeviceMapRequest(device_uuid="device-a", external_user_uuid="user-b", fcm_token="token-a"),
                    mock_db,
                )

        self.assertEqual(response.user_id, 2)
        mock_db.commit.assert_awaited_once()
        self.assertIn("UPDATE device_user_map", str(mock_db.execute.await_args_list[2].args[0]))
        invalidate.assert_called_once_with("device-a")

    async def test_token_transfer_clears_old_owner_and_invalidates_old_device(self):
        mock_db = AsyncMock()
        user = SreUser(user_id=2, external_user_uuid="user-b")
        mock_db.execute.side_effect = [
            self._result(scalar=user), self._result(scalars=["device-a"]), MagicMock(),
            self._result(scalar=None), self._result(scalar=None), MagicMock(),
        ]
        with patch("app.routers.device_map.invalidate_device_cache") as invalidate:
            with patch("app.services.fcm_push.reset_badge", new=AsyncMock()):
                await upsert_device_map(
                    DeviceMapRequest(device_uuid="device-b", external_user_uuid="user-b", fcm_token="token-a"),
                    mock_db,
                )
        self.assertEqual({call.args[0] for call in invalidate.call_args_list}, {"device-a", "device-b"})
        self.assertIn("UPDATE device_user_map", str(mock_db.execute.await_args_list[2].args[0]))


class PushNotifyTest(unittest.IsolatedAsyncioTestCase):
    async def test_retryable_provider_failure_returns_503_without_deleting_token(self):
        mock_db = AsyncMock()
        row = MagicMock(user_id=1, fcm_token="token-a")
        query_result = MagicMock()
        query_result.first.return_value = row
        mock_db.execute.return_value = query_result
        with patch("app.services.fcm_push.send_push", new=AsyncMock(side_effect=RetryablePushError("401"))):
            with self.assertRaises(HTTPException) as raised:
                await notify_user(PushNotifyRequest(
                    external_user_uuid="user-a", title="t", body="b"
                ), mock_db)
        self.assertEqual(raised.exception.status_code, 503)
        mock_db.commit.assert_not_awaited()

    async def test_invalid_token_is_cleared_and_acknowledged(self):
        mock_db = AsyncMock()
        row = MagicMock(user_id=1, fcm_token="token-a")
        query_result = MagicMock()
        query_result.first.return_value = row
        mock_db.execute.return_value = query_result
        result = PushResult(failed=1)
        result.invalid_tokens.append("token-a")
        with patch("app.services.fcm_push.send_push", new=AsyncMock(return_value=result)):
            response = await notify_user(PushNotifyRequest(
                external_user_uuid="user-a", title="t", body="b"
            ), mock_db)
        self.assertEqual((response.sent, response.failed), (0, 1))
        mock_db.commit.assert_awaited_once()
