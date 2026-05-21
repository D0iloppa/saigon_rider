import { api } from './client';

export async function apiRegisterDeviceMap(deviceUuid: string, userId: string) {
  return api.realFetch('/auth/device-map', {
    method: 'POST',
    body: JSON.stringify({ device_uuid: deviceUuid, user_id: userId }),
  });
}
