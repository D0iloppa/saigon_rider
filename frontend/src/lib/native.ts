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
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
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
  /** m/s (기기 제공 시). 속도계용. */
  speed?: number | null;
  /** 진행 방위(도, 0=북). 마커 회전용. */
  heading?: number | null;
}

/** 위치 권한 UI 상태 (커스텀 Gps 플러그인 권한 API 결과) */
export type LocationPermissionState = 'granted' | 'denied' | 'prompt';

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

  /** getLocation 전에 호출 — 네이티브에서 위치 권한을 확인하고 필요 시 요청. */
  async ensureLocationPermission(): Promise<void> {
    if (!this.isNative) return;
    const st = await this.checkLocationPermission().catch((): LocationPermissionState => 'prompt');
    if (st !== 'granted') await this.requestLocationPermission().catch(() => undefined);
  }

  async getLocation(): Promise<GeoPosition> {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10_000,
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
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
          speed: pos.coords.speed,
          heading: pos.coords.heading,
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

  async checkLocationPermission(): Promise<LocationPermissionState> {
    const { status } = await Gps.checkPermission();
    return normalizeLocationPermission(status);
  }

  async requestLocationPermission(): Promise<LocationPermissionState> {
    const { status } = await Gps.requestPermission();
    return normalizeLocationPermission(status);
  }

  async openAppSettings(): Promise<void> {
    await Gps.openAppSettings();
  }

  /**
   * 외부 URL 열기 (구글맵 길안내 등). 웹/네이티브 모두 새 컨텍스트로 열어
   * 인앱 웹뷰가 아닌 시스템 핸들러(설치된 앱)가 처리하도록 위임.
   * 네이티브 외부-앱 직링크 보강이 필요하면 이 메서드만 교체(@capacitor/browser 등).
   */
  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
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

  async getFCMToken(): Promise<string> {
    if (!this.isNative) return '';
    if (this.platform === 'android') {
      const { token } = await Device.getFcmToken();
      return token;
    }
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

  /** 콜드 스타트로 진입했을 때 버퍼된 알림 navigateTo 를 1회 가져온다 (없으면 null). */
  async getPendingNotification(): Promise<string | null> {
    if (!this.isNative) return null;
    const { navigateTo } = await Fcm.getPendingNotification();
    return navigateTo || null;
  }

  // ── Share (Web Share API only) ──────────────────────────────────────────

  async share(options: ShareOptions): Promise<void> {
    // eslint-disable-next-line no-restricted-globals -- native.ts IS the bridge layer
    if (navigator.share) {
      // eslint-disable-next-line no-restricted-globals
      await navigator.share(options);
    } else {
      console.warn('[NativeInterface] share not available');
    }
  }

  // ── Clipboard (Clipboard API only) ──────────────────────────────────────

  async copyToClipboard(text: string): Promise<void> {
    // eslint-disable-next-line no-restricted-globals -- native.ts IS the bridge layer
    await navigator.clipboard?.writeText(text);
  }

  // ── Data export (web blob download; native has no file-save plugin yet) ──

  /**
   * 텍스트를 파일로 저장한다.
   * 웹: Blob + anchor 다운로드. 네이티브(Capacitor WebView): anchor 다운로드가
   * 실제 파일 저장으로 동작하지 않으므로 share()로 폴백(파일첨부 미지원 — 텍스트 공유).
   * 네이티브 파일저장 플러그인(@capacitor/filesystem 등) 도입 시 이 메서드만 교체.
   */
  async saveTextFile(filename: string, text: string, mimeType: string): Promise<void> {
    if (this.isNative) {
      await this.share({ title: filename, text });
      return;
    }
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 이미지(data URL)를 파일로 저장한다. saveTextFile 과 동일 전략.
   * 웹: anchor 다운로드. 네이티브(Capacitor WebView): anchor 가 실제 저장으로
   * 동작하지 않아 share()로 폴백(텍스트만 — 이미지 첨부 미지원).
   * 네이티브 갤러리 저장 플러그인(@capacitor/filesystem 등) 도입 시 이 메서드만 교체.
   */
  async saveImageFile(filename: string, dataUrl: string): Promise<void> {
    if (this.isNative) {
      await this.share({ title: filename, text: dataUrl });
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  // ── OAuth (@capacitor/browser redirect flow) ────────────────────────────

  /**
   * Google 로그인 — BFF 서버사이드 redirect flow.
   * @capacitor/browser 로 인앱 브라우저를 열고 딥링크 콜백을 기다린다.
   * 반환된 {userId, sessionToken}은 BFF가 이미 발급한 세션이므로 apiOAuthLogin 불필요.
   */
  async signInWith(
    provider: 'google' | 'apple' | 'facebook' | 'zalo',
  ): Promise<{ userId: string; sessionToken: string; isNew: boolean }> {
    if (provider !== 'google' && provider !== 'apple' && provider !== 'zalo') {
      throw new Error(`[NativeInterface] signInWith: ${provider} not yet supported`);
    }

    const startUrl = `https://saigon.doil.me/api/bff/auth/oauth/${provider}/start`;

    return new Promise((resolve, reject) => {
      const CALLBACK_SCHEME = 'com.saigonrider.user://oauth/callback';
      let listenerHandle: PluginListenerHandle | null = null;

      const cleanup = () => {
        listenerHandle?.remove();
        listenerHandle = null;
      };

      CapApp.addListener('appUrlOpen', (event) => {
        if (!event.url.startsWith(CALLBACK_SCHEME)) return;
        cleanup();
        try {
          const url = new URL(event.url);
          const err = url.searchParams.get('error');
          if (err) { reject(new Error(err)); return; }
          resolve({
            userId: url.searchParams.get('userId') ?? '',
            sessionToken: url.searchParams.get('sessionToken') ?? '',
            isNew: url.searchParams.get('isNew') === '1',
          });
        } catch (e) {
          reject(e);
        }
      }).then((handle) => {
        listenerHandle = handle;
        return Browser.open({ url: startUrl });
      }).catch((err) => {
        cleanup();
        reject(err);
      });
    });
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

function normalizeLocationPermission(state: string): LocationPermissionState {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt'; // 'prompt' | 'prompt-with-rationale'
}

// ─── 싱글턴 export ──────────────────────────────────────────────────────────

export const native = new NativeInterface();
