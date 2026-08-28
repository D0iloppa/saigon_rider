import { api, USE_MOCK } from './client';

export interface NotificationDto {
  id: number;
  user_id: string;
  type: string; // 'SOCIAL' | 'KEYWORD' | ...
  title: string;
  body: string | null;
  link: string | null; // LinkRouter 규약 (예: 'dm&id=<convId>', 'market&id=<listingId>')
  is_read: boolean;
  created_at: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  unread_count: number;
  has_more: boolean;
}

export interface NotificationCursor {
  created_at: string;
  id: number;
}

export async function fetchNotifications(
  userId: string,
  limit = 20,
  cursor?: NotificationCursor,
): Promise<NotificationListDto> {
  if (USE_MOCK) {
    return { items: [], unread_count: 0, has_more: false };
  }
  const cursorParams = cursor
    ? `&cursor_created_at=${encodeURIComponent(cursor.created_at)}&cursor_id=${cursor.id}`
    : '';
  return api.realFetch<NotificationListDto>(
    `/notifications?user_id=${userId}&limit=${limit}${cursorParams}`,
  );
}

export async function markNotificationRead(id: number): Promise<void> {
  if (USE_MOCK) return;
  await api.realFetch(`/notifications/${id}/read`, { method: 'PUT' });
}

export async function deleteNotification(id: number): Promise<void> {
  if (USE_MOCK) return;
  await api.realFetch(`/notifications/${id}`, { method: 'DELETE' });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (USE_MOCK) return;
  await api.realFetch(`/notifications/read-all?user_id=${userId}`, { method: 'PUT' });
}

export interface NotificationSettingsDto {
  user_id: string;
  quest_recommend: boolean;
  quest_expire: boolean;
  event: boolean;
  ride_result: boolean;
  social: boolean;
  keyword_alert: boolean;
  chat: boolean;
  updated_at: string;
}

export type NotificationSettingsFields = Pick<
  NotificationSettingsDto,
  'quest_recommend' | 'quest_expire' | 'event' | 'ride_result' | 'social' | 'keyword_alert' | 'chat'
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
      keyword_alert: true,
      chat: true,
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
