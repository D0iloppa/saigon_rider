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

  /** 콜드 스타트(앱 종료 상태) 알림 클릭으로 진입 시 버퍼된 navigateTo 를 1회 반환·소거 (없으면 빈 문자열). */
  getPendingNotification(): Promise<{ navigateTo: string }>;

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
