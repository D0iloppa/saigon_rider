/**
 * NativeInterface — Capacitor 플러그인 기반 네이티브 기능 추상화
 *
 * client.ts가 fetch를 래핑하듯, 이 모듈이 Capacitor 플러그인을 래핑한다.
 * 사용처는 Capacitor를 직접 import하지 않고 이 모듈의 typed 메서드를 호출한다.
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface DeviceInfo {
  platform: string;
  osVersion: string;
  appVersion: string;
  model: string;
}

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
}

export type HapticStyle = 'light' | 'medium' | 'heavy';
export type AppStateHandler = (isActive: boolean) => void;
export type DeepLinkHandler = (url: string) => void;
export type LocationUpdateHandler = (pos: GeoPosition) => void;

// ─── NativeInterface ────────────────────────────────────────────────────────

class NativeInterface {
  get platform(): 'ios' | 'android' | 'web' {
    return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  }

  get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  // ── Geolocation (@capacitor/geolocation) ────────────────────────────────

  async getLocation(): Promise<GeoPosition> {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10_000,
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  }

  watchLocation(handler: LocationUpdateHandler): () => void {
    let watchId: string | undefined;

    Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
      if (pos) {
        handler({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      }
      if (err) console.warn('[NativeInterface] watchLocation error:', err);
    }).then((id) => {
      watchId = id;
    });

    return () => {
      if (watchId) Geolocation.clearWatch({ id: watchId });
    };
  }

  // ── Camera (stub — @capacitor/camera 설치 시 활성화) ────────────────────

  async openCamera(): Promise<string> {
    throw new Error('[NativeInterface] openCamera not implemented — install @capacitor/camera');
  }

  // ── Device Info (stub — @capacitor/device 설치 시 활성화) ────────────────

  async getDeviceInfo(): Promise<DeviceInfo> {
    return {
      platform: this.platform,
      osVersion: 'unknown',
      appVersion: 'unknown',
      model: 'unknown',
    };
  }

  // ── Share (Web Share API fallback) ──────────────────────────────────────

  async share(options: ShareOptions): Promise<void> {
    if (navigator.share) {
      await navigator.share(options);
    } else {
      console.warn('[NativeInterface] share not available');
    }
  }

  // ── Haptics (stub — @capacitor/haptics 설치 시 활성화) ──────────────────

  haptic(_style: HapticStyle = 'medium'): void {
    // noop until @capacitor/haptics is installed
  }

  // ── App Lifecycle (stub — @capacitor/app 설치 시 활성화) ─────────────────

  onAppStateChange(_handler: AppStateHandler): () => void {
    return () => {};
  }

  onDeepLink(_handler: DeepLinkHandler): () => void {
    return () => {};
  }
}

// ─── 싱글턴 export ──────────────────────────────────────────────────────────

export const native = new NativeInterface();

