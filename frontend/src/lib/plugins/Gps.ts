import { registerPlugin } from '@capacitor/core';

export type GpsPermissionStatus = 'granted' | 'denied' | 'prompt';

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
}

export const Gps = registerPlugin<GpsPlugin>('Gps');
