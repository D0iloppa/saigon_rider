import { api, USE_MOCK } from './client';

export interface NotificationSettingsDto {
  user_id: string;
  quest_recommend: boolean;
  quest_expire: boolean;
  event: boolean;
  ride_result: boolean;
  social: boolean;
  updated_at: string;
}

export type NotificationSettingsFields = Pick<
  NotificationSettingsDto,
  'quest_recommend' | 'quest_expire' | 'event' | 'ride_result' | 'social'
>;

export async function fetchNotificationSettings(userId: string): Promise<NotificationSettingsDto> {
  if (USE_MOCK) {
    return {
      user_id: userId,
      quest_recommend: true,
      quest_expire: true,
      event: true,
      ride_result: true,
      social: true,
      updated_at: new Date().toISOString(),
    };
  }
  return api.realFetch<NotificationSettingsDto>(`/notifications/settings?user_id=${userId}`);
}

export async function updateNotificationSettings(
  userId: string,
  fields: NotificationSettingsFields,
): Promise<NotificationSettingsDto> {
  if (USE_MOCK) {
    return { user_id: userId, ...fields, updated_at: new Date().toISOString() };
  }
  return api.realFetch<NotificationSettingsDto>('/notifications/settings', {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId, ...fields }),
  });
}
