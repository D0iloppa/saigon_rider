import unittest
import uuid
from unittest.mock import AsyncMock, patch

from app.routers.auth import DeviceMapRequest, register_device_map, unregister_device_map


class DeviceMapPrincipalTest(unittest.IsolatedAsyncioTestCase):
    async def test_register_device_map_uses_session_principal(self):
        principal = uuid.uuid4()
        with patch(
            "app.routers.auth.engine_client.upsert_device_map", new=AsyncMock(return_value={"ok": True})
        ) as upsert:
            await register_device_map(DeviceMapRequest(device_uuid="device-a"), principal)

        upsert.assert_awaited_once_with("device-a", str(principal), None)

    async def test_unregister_device_map_uses_session_principal(self):
        principal = uuid.uuid4()
        with patch(
            "app.routers.auth.engine_client.delete_device_map", new=AsyncMock(return_value={"removed": True})
        ) as delete:
            response = await unregister_device_map("device-a", principal)

        self.assertEqual(response, {"removed": True})
        delete.assert_awaited_once_with("device-a", str(principal))
