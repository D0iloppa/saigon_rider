import { registerPlugin } from '@capacitor/core';

export interface GpsPlugin {
  /** 백그라운드 GPS 트래킹 시작 (iOS LocationTracker / Android LocationForegroundService). */
  start(): Promise<void>;
  /** 백그라운드 GPS 트래킹 정지. */
  stop(): Promise<void>;
}

export const Gps = registerPlugin<GpsPlugin>('Gps');
