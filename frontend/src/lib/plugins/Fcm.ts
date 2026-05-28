import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface FcmTokenEvent {
  token: string;
}

export interface FcmNotificationEvent {
  navigateTo: string;
  payload: Record<string, unknown>;
}

export interface FcmPlugin {
  /** 캐시된 FCM 토큰 즉시 반환 (없으면 빈 문자열). */
  getToken(): Promise<{ token: string }>;

  addListener(
    eventName: 'fcmToken',
    listenerFunc: (event: FcmTokenEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'notificationClick',
    listenerFunc: (event: FcmNotificationEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const Fcm = registerPlugin<FcmPlugin>('Fcm');
