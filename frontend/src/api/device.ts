import { api } from './client';
import type { Session } from '@/lib/session';

export async function apiRegisterDeviceMap(deviceUuid: string, fcmToken?: string) {
  return api.realFetch('/auth/device-map', {
    method: 'POST',
    body: JSON.stringify({ device_uuid: deviceUuid, ...(fcmToken ? { fcm_token: fcmToken } : {}) }),
  }, 'bff', { silent: true });
}

export async function apiUnregisterDeviceMap(deviceUuid: string, session: Session) {
  return api.realFetch(`/auth/device-map/${encodeURIComponent(deviceUuid)}`, {
    method: 'DELETE',
    headers: {
      'X-User-Id': session.userId,
      'X-Session-Token': session.sessionToken,
    },
  }, 'bff', { silent: true });
}
