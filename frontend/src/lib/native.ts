/**
 * NativeInterface — Capacitor 플러그인 기반 네이티브 기능 추상화
 *
 * client.ts가 fetch를 래핑하듯, 이 모듈이 Capacitor 플러그인을 래핑한다.
 * 사용처는 Capacitor를 직접 import하지 않고 이 모듈의 typed 메서드를 호출한다.
 *
 * 2026-05-27 cutover: raw WKScriptMessageHandler / @JavascriptInterface 브리지 제거.
 * 모든 네이티브 호출은 커스텀 Capacitor Plugin (Device/Gps/IAP/Ad/Camera/ImageViewer/Fcm) 경유.
 */

import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

import { Device } from './plugins/Device';
import { Gps } from './plugins/Gps';
import { IAP, type IAPResult } from './plugins/IAP';
import { Ad } from './plugins/Ad';
import { Camera } from './plugins/Camera';
import {
  ImageViewer,
  type ImageViewerRect,
  type ImageViewerShowOptions,
} from './plugins/ImageViewer';
import { Fcm, type FcmNotificationEvent } from './plugins/Fcm';

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
export type IAPResultHandler = (event: { productId: string; result: IAPResult }) => void;
export type AdCompletedHandler = () => void;
export type CameraPermissionHandler = (granted: boolean) => void;
export type FcmTokenHandler = (token: string) => void;
export type FcmNotificationHandler = (event: FcmNotificationEvent) => void;

// ─── NativeInterface ────────────────────────────────────────────────────────

class NativeInterface {
  get platform(): 'ios' | 'android' | 'web' {
    return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  }

  get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  // ── Device ──────────────────────────────────────────────────────────────

  async getDeviceUUID(): Promise<string> {
    if (!this.isNative) {
      console.warn('[device-uuid] not native — skip');
      return '';
    }
    const { uuid } = await Device.getDeviceUUID();
    return uuid;
  }

  // ── Background GPS ──────────────────────────────────────────────────────

  async startGPS(): Promise<void> {
    if (!this.isNative) return;
    await Gps.start();
  }

  async stopGPS(): Promise<void> {
    if (!this.isNative) return;
    await Gps.stop();
  }

  // ── Foreground Geolocation (@capacitor/geolocation) ─────────────────────

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

  // ── In-App Purchase (iOS only) ──────────────────────────────────────────

  async purchase(command: string): Promise<void> {
    if (!this.isNative) return;
    await IAP.purchase({ command });
  }

  async onPurchaseResult(handler: IAPResultHandler): Promise<() => void> {
    if (!this.isNative) return () => {};
    const sub: PluginListenerHandle = await IAP.addListener('iapResult', handler);
    return () => sub.remove();
  }

  // ── Interstitial Ad (iOS only) ──────────────────────────────────────────

  async showAd(): Promise<void> {
    if (!this.isNative) return;
    await Ad.showAd();
  }

  async onAdCompleted(handler: AdCompletedHandler): Promise<() => void> {
    if (!this.isNative) return () => {};
    const sub: PluginListenerHandle = await Ad.addListener('adCompleted', handler);
    return () => sub.remove();
  }

  // ── Camera permission ───────────────────────────────────────────────────

  async requestCameraPermission(): Promise<void> {
    if (!this.isNative) return;
    await Camera.requestPermission();
  }

  async requestCameraPermissionAlert(): Promise<void> {
    if (!this.isNative) return;
    await Camera.requestPermissionAlert();
  }

  async onCameraPermission(handler: CameraPermissionHandler): Promise<() => void> {
    if (!this.isNative) return () => {};
    const sub: PluginListenerHandle = await Camera.addListener(
      'cameraPermission',
      (event) => handler(event.granted),
    );
    return () => sub.remove();
  }

  // ── Image Viewer (iOS only) ─────────────────────────────────────────────

  async openImageViewer(images: string[], startIndex = 0): Promise<void> {
    if (!this.isNative) return;
    await ImageViewer.open({ images, startIndex });
  }

  async showImageViewer(
    images: string[],
    startIndex = 0,
    rect?: ImageViewerRect,
    noImagePopup?: number,
  ): Promise<void> {
    if (!this.isNative) return;
    const opts: ImageViewerShowOptions = { images, startIndex };
    if (rect) opts.rect = rect;
    if (typeof noImagePopup === 'number') opts.noImagePopup = noImagePopup;
    await ImageViewer.show(opts);
  }

  async closeImageViewer(): Promise<void> {
    if (!this.isNative) return;
    await ImageViewer.close();
  }

  // ── FCM ─────────────────────────────────────────────────────────────────

  async getFcmToken(): Promise<string> {
    if (!this.isNative) return '';
    const { token } = await Fcm.getToken();
    return token;
  }

  async onFcmToken(handler: FcmTokenHandler): Promise<() => void> {
    if (!this.isNative) return () => {};
    const sub: PluginListenerHandle = await Fcm.addListener('fcmToken', (e) =>
      handler(e.token),
    );
    return () => sub.remove();
  }

  async onNotificationClick(handler: FcmNotificationHandler): Promise<() => void> {
    if (!this.isNative) return () => {};
    const sub: PluginListenerHandle = await Fcm.addListener(
      'notificationClick',
      handler,
    );
    return () => sub.remove();
  }

  // ── Share (Web Share API only) ──────────────────────────────────────────

  async share(options: ShareOptions): Promise<void> {
    if (navigator.share) {
      await navigator.share(options);
    } else {
      console.warn('[NativeInterface] share not available');
    }
  }

  // ── Stubs (no native counterpart yet — install Capacitor plugin to enable) ─

  async openCamera(): Promise<string> {
    throw new Error('[NativeInterface] openCamera not implemented — install @capacitor/camera');
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return {
      platform: this.platform,
      osVersion: 'unknown',
      appVersion: 'unknown',
      model: 'unknown',
    };
  }

  haptic(_style: HapticStyle = 'medium'): void {
    // noop until @capacitor/haptics is installed
  }

  onAppStateChange(_handler: AppStateHandler): () => void {
    return () => {};
  }

  onDeepLink(_handler: DeepLinkHandler): () => void {
    return () => {};
  }
}

// ─── 싱글턴 export ──────────────────────────────────────────────────────────

export const native = new NativeInterface();
