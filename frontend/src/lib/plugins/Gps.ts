import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type GpsPermissionStatus = 'granted' | 'denied' | 'prompt';

export interface GpsHeadingEvent {
  /** 진북 기준 방위(도). CLHeading.trueHeading 이 유효하면 그 값, 아니면 magneticHeading 폴백. */
  heading: number;
}

export interface GpsPlugin {
  /** 백그라운드 GPS 트래킹 시작 (iOS LocationTracker / Android LocationForegroundService). */
  start(): Promise<void>;
  /** 백그라운드 GPS 트래킹 정지. */
  stop(): Promise<void>;
  /** 위치 권한 상태 조회 (iOS CLAuthorizationStatus / Android ACCESS_FINE_LOCATION 매핑). */
  checkPermission(): Promise<{ status: GpsPermissionStatus }>;
  /** 위치 권한 요청 후 결과 상태 반환. */
  requestPermission(): Promise<{ status: GpsPermissionStatus }>;
  /** OS 앱 설정 화면 열기 (권한이 denied 로 굳어 재요청이 막힌 경우). */
  openAppSettings(): Promise<void>;
  /**
   * 나침반(heading) 구독 시작 — iOS 전용(CLLocationManager.startUpdatingHeading, W14 2026-08-07).
   * WKWebView 의 DeviceOrientationEvent 가 신뢰할 수 없어(§native.ts watchCompassHeading) 대체한
   * 네이티브 경로. 위치 권한만 있으면 되고 별도 Motion 권한이 필요 없다. 이벤트는 'headingUpdate'.
   */
  startHeading(): Promise<void>;
  /** 나침반 구독 해제. */
  stopHeading(): Promise<void>;
  addListener(
    eventName: 'headingUpdate',
    listenerFunc: (event: GpsHeadingEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const Gps = registerPlugin<GpsPlugin>('Gps');
