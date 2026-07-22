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
import { WebAuth } from './plugins/WebAuth';
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
import { KeyboardBridge } from './plugins/KeyboardBridge';

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

export interface KeyboardChangeEvent {
  /** 키보드가 웹뷰를 덮는(또는 밀어낸) 높이(px). 내려갈 땐 0. */
  height: number;
  /** 키보드가 떠 있는지. */
  visible: boolean;
}
export type KeyboardChangeHandler = (event: KeyboardChangeEvent) => void;

// 작은 뷰포트 변화(주소창 등)를 키보드로 오인하지 않기 위한 임계값 (계측 폴백용)
const KEYBOARD_THRESHOLD = 120;

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
    try {
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
    } catch (e) {
      // iOS 빌드는 @capacitor/geolocation 을 vendoring 하지 않음(Podfile: GpsPlugin 이 직접 CoreLocation).
      // WKWebView/브라우저의 navigator.geolocation 으로 폴백.
      // eslint-disable-next-line no-restricted-globals -- native.ts IS the bridge layer
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        return await new Promise<GeoPosition>((resolve, reject) => {
          // eslint-disable-next-line no-restricted-globals -- native.ts IS the bridge layer
          navigator.geolocation.getCurrentPosition(
            (p) =>
              resolve({
                lat: p.coords.latitude,
                lng: p.coords.longitude,
                accuracy: p.coords.accuracy,
                speed: p.coords.speed,
                heading: p.coords.heading,
              }),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 10_000 },
          );
        });
      }
      throw e;
    }
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

  // ── Keyboard ────────────────────────────────────────────────────────────

  /**
   * iOS 키보드 input accessory bar(^ v Done 줄) 표시 여부. iOS 전용 — 그 외 no-op.
   * 화면별 제어를 위해 MessageComposer 가 마운트/언마운트 시 호출한다.
   */
  async setAccessoryBarVisible(visible: boolean): Promise<void> {
    if (this.platform !== 'ios') return;
    // 플러그인 미탑재(구 빌드) 시 not-implemented 로 reject → 무시.
    await KeyboardBridge.setAccessoryBarVisible({ visible }).catch(() => {});
  }

  /**
   * 네이티브 컨테이너/웹뷰 배경색 지정("#RRGGBB"). 키보드로 웹뷰가 리사이즈될 때 웹 콘텐츠가
   * 아직 못 그린 영역이 검게 보이는 것을 막는다. 테마의 --bg 를 넘긴다. iOS 전용.
   */
  async setBackgroundColor(color: string): Promise<void> {
    if (this.platform !== 'ios') return;
    await KeyboardBridge.setBackgroundColor({ color }).catch(() => {});
  }

  /**
   * 키보드 표시/높이 변화 구독. 구독 해제 함수를 반환한다.
   *
   * iOS 네이티브: 키보드는 순수 오버레이(웹뷰 리사이즈 없음)라 innerHeight 계측이
   * 무의미 — KeyboardBridge 의 keyboardWillShow/Hide 이벤트가 유일한 소스.
   * 웹/Android: 기존 계측 방식 유지 (baseline innerHeight delta + visualViewport
   * inset 의 max). Android 는 adjustPan + IME 패딩 현행 유지 — 회귀 금지.
   */
  /** iOS 키보드 브리지 fan-out — 소비자가 여럿이어도(화면당 시트/컴포저 다수) 브리지 리스너는 1회만 등록 */
  private kbHandlers = new Set<KeyboardChangeHandler>();
  private kbBridgeStarted = false;

  onKeyboardChange(handler: KeyboardChangeHandler): () => void {
    if (this.platform === 'ios') {
      // 브리지 리스너는 최초 구독 시 1회 등록하고 앱 수명 동안 유지 — 이후 구독자는
      // 핸들러 집합에만 추가/제거된다 (해제/재등록 경합 없음, Capacitor 핸들 누적 방지).
      this.kbHandlers.add(handler);
      if (!this.kbBridgeStarted) {
        this.kbBridgeStarted = true;
        const emit = (e: KeyboardChangeEvent) => this.kbHandlers.forEach((h) => h(e));
        // 플러그인 미탑재(구 빌드) 시 reject → 무시 (이벤트가 안 올 뿐).
        KeyboardBridge.addListener('keyboardWillShow', (e) =>
          emit({ height: e.height, visible: true }),
        ).catch(() => {});
        KeyboardBridge.addListener('keyboardWillHide', () =>
          emit({ height: 0, visible: false }),
        ).catch(() => {});
      }
      return () => {
        this.kbHandlers.delete(handler);
      };
    }

    // 웹/Android 계측 폴백
    let baseline = window.innerHeight;
    const measure = () => {
      baseline = Math.max(baseline, window.innerHeight);
      const vv = window.visualViewport;
      // offsetTop(브라우저 키보드 팬)은 빼지 않는다 — 빼면 팬 시 0 이 되어 악순환.
      const vpInset = vv ? Math.max(0, Math.round(window.innerHeight - vv.height)) : 0;
      const resizeDelta = Math.max(0, baseline - window.innerHeight);
      const kb = Math.max(vpInset, resizeDelta);
      handler({ height: kb, visible: kb > KEYBOARD_THRESHOLD });
    };
    const vv = window.visualViewport;
    window.addEventListener('resize', measure);
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
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

  // ── OAuth (ASWebAuthenticationSession redirect flow) ─────────────────────

  /**
   * 3사(Google/Apple/Zalo) 로그인 — BFF 서버사이드 redirect flow.
   * 커스텀 WebAuth 플러그인(ASWebAuthenticationSession)으로 인증 URL을 열고 커스텀 스킴 콜백을 직접 받는다.
   * 반환된 단회용 code는 BFF /auth/oauth/exchange에서 세션으로 교환한다.
   */
  async signInWith(
    provider: 'google' | 'apple' | 'facebook' | 'zalo',
  ): Promise<{ code: string }> {
    if (provider !== 'google' && provider !== 'apple' && provider !== 'zalo') {
      throw new Error(`[NativeInterface] signInWith: ${provider} not yet supported`);
    }

    const startUrl = `https://saigon.doil.me/api/bff/auth/oauth/${provider}/start`;
    const { callbackUrl } = await WebAuth.authenticate({
      url: startUrl,
      callbackScheme: 'com.saigonrider.user',
    });

    const url = new URL(callbackUrl);
    const err = url.searchParams.get('error');
    if (err) throw new Error(err);
    const code = url.searchParams.get('code');
    if (!code) throw new Error('invalid_oauth_response');
    return { code };
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
