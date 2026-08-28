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
import { Browser } from '@capacitor/browser';

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
import {
  LiveActivity,
  type LiveActivityKind,
  type LiveActivityStartOptions,
  type LiveActivityUpdateOptions,
  type LiveActivityEndOptions,
} from './plugins/liveActivity';
import {
  WalkieTalkie,
  type PendingRecording,
  type WalkieChannelStatus,
  type WalkieTalkieRecordingResult,
  type WalkieTalkieRecordingStateEvent,
  type WalkieTalkieStartOptions,
} from './plugins/walkieTalkie';
import { getStoredAcqRef } from './acquisition';

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
/** 진북 기준 나침반 방위(도, 0=북, 시계방향). 자력계 소스 — GPS 와 무관, 정지 상태에서도 나온다. */
export type CompassHeadingHandler = (heading: number) => void;
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

// ── WalkieTalkie (A-6) ───────────────────────────────────────────────────
// 설계서(`ai-docs/task/active/260827_walkie_talkie_task.md` §4-2/§4-3) 의
// WalkieTalkieChannel 추상 인터페이스. raw 플러그인(`./plugins/walkieTalkie.ts`,
// A-4/A-5)과 시그니처가 다른 부분(checkPermission/requestPermission 반환 형태)은
// 아래 createWalkieTalkieChannel() 어댑터가 흡수한다.

export type WalkieTalkieCapability = {
  /** 이 플랫폼에서 워키토키 사용 가능 여부 (웹=false). */
  available: boolean;
  /** 인앱 녹음 (Phase A). */
  record: boolean;
  /** 웹뷰 내 플로팅 버블 (Phase A). */
  floatingButton: boolean;
  /** 앱 미실행/백그라운드 녹음 (Android only — Phase B). */
  backgroundService: boolean;
  /** OS 전역 오버레이 버블 (B-2, Android 구현됨. iOS 는 플랫폼 정책상 영구 false). */
  overlayBubble: boolean;
  /** 홈스크린 위젯 (B-2, Android 구현됨). */
  homeWidget: boolean;
  /** iOS Live Activity / 다이나믹아일랜드 (Phase B, 미구현). */
  liveActivity: boolean;
  /** 플랫폼별 최대 녹음 길이(초). */
  maxDurationSec: number;
};

export type WalkieTalkiePermissionKind = 'mic' | 'overlay' | 'notification';

export interface WalkieTalkieChannel {
  getCapability(): Promise<WalkieTalkieCapability>;

  checkPermission(): Promise<{ mic: 'granted' | 'denied' | 'prompt'; overlay?: boolean }>;
  requestPermission(kind: WalkieTalkiePermissionKind): Promise<boolean>;
  /** 권한이 denied 로 굳어 재요청이 막힌 경우 OS 설정 화면으로 유도 (Phase A 완료기준 2). */
  openAppSettings(): Promise<void>;

  startRecording(opts?: WalkieTalkieStartOptions): Promise<void>;
  stopRecording(): Promise<WalkieTalkieRecordingResult>;
  cancelRecording(): Promise<void>;
  /**
   * 녹음 결과 파일을 Blob 으로 읽는다. 플랫폼별로 경로가 다르다 —
   * iOS 는 네이티브가 base64 로 넘겨주고(원격 https 페이지에서 `capacitor://` 파일을 fetch 하면
   * WebKit 이 혼합 콘텐츠로 차단해 "Load failed"), Android 는 로컬 서버가 https 로 서빙하므로
   * 기존 convertFileSrc + fetch 를 그대로 쓴다.
   */
  readRecordingBlob(result: WalkieTalkieRecordingResult): Promise<Blob>;
  /** 앱 미실행 중 녹음된 항목(Android 헤드리스). 앱이 뜰 때 비워서 전송해야 한다. */
  getPendingRecordings(): Promise<PendingRecording[]>;
  clearPendingRecording(id: string): Promise<void>;

  addListener(
    event: 'recordingState',
    cb: (s: WalkieTalkieRecordingStateEvent) => void,
  ): Promise<{ remove: () => void }>;

  // Phase B — capability 가 false 면 호출부에서 노출 자체를 안 함. 아직 네이티브 구현이
  // 없으므로 여기선 조용히 no-op 처리한다(throw 금지 — capability 로 사전 차단하는 게 원칙).
  showOverlayBubble(opts: { channelId: string }): Promise<void>;
  hideOverlayBubble(): Promise<void>;
  /** Android 홈화면 위젯 고정 요청 — 네이티브 위젯 구현은 후속 티켓 범위(iOS/웹 no-op). */
  pinToHomeScreen(): Promise<void>;
  /** Android 채널 바로가기 위젯 갱신용 — 활성 채널이 바뀔 때마다 호출(iOS/웹 no-op). */
  syncActiveChannel(opts: { channelId: string; channelName: string }): Promise<void>;
  startBackgroundChannel(opts: { channelId: string }): Promise<void>;
  stopBackgroundChannel(): Promise<void>;
  updateLiveActivity(opts: { state: 'recording' | 'sending' | 'idle' }): Promise<void>;

  /**
   * 채널 참여 상태 위젯 — Android: FGS ongoing 알림 / iOS: ActivityKit Live Activity.
   * 상태 표시(채널명·참석수·발화중) 전용, 탭 시 해당 채널로 딥링크. 웹은 no-op.
   * 구 설치본(메서드 없는 플러그인)에서는 reject 되므로 호출부는 .catch(() => {}) 계약.
   */
  startChannelStatus(opts: WalkieChannelStatus): Promise<void>;
  updateChannelStatus(opts: WalkieChannelStatus): Promise<void>;
  endChannelStatus(): Promise<void>;
}

function createWalkieTalkieChannel(): WalkieTalkieChannel {
  return {
    async getCapability() {
      const isNative = Capacitor.isNativePlatform();
      // 대표 지시(2026-08-27): 기본 기능(버블 열기/채널 선택)은 웹에서도 노출한다.
      // record 만 네이티브 전용 — `WalkieTalkie` 커스텀 플러그인(./plugins/walkieTalkie.ts)에
      // web 구현이 없어(순수 registerPlugin 래퍼) 웹에서는 진짜 녹음이 불가능하다.
      const isAndroid = isNative && Capacitor.getPlatform() === 'android';
      // 프론트는 원격 서빙이라 `WalkieTalkie` 플러그인이 등록되지 않은 설치본과도 조합된다
      // (iOS 는 packageClassList 누락으로 실제로 그랬다 — 등록 전 빌드에서는 checkPermission
      // 부터 reject 되어 아무 반응 없이 실패한다). 있는 척하지 말고 record 를 내린다.
      const canRecord = isNative && Capacitor.isPluginAvailable('WalkieTalkie');
      return {
        available: true,
        record: canRecord,
        floatingButton: true,
        // Android: A-4/A-5 에서 이미 FGS 로 구현됨. iOS: D-2 확정 — Phase B 전까지 보수적으로 false.
        backgroundService: isAndroid,
        overlayBubble: isAndroid, // B-2: SYSTEM_ALERT_WINDOW 오버레이 버블 구현됨(Android only, iOS 영구 false)
        homeWidget: isAndroid, // B-2: AppWidget 구현됨(iOS 는 후속 B-3 인터랙티브 위젯 범위)
        liveActivity: false, // Phase B 미구현 (B-3, iOS)
        maxDurationSec: canRecord ? 60 : 0, // D-4 확정 (record=false 면 사용되지 않음)
      };
    },

    async checkPermission() {
      if (!Capacitor.isNativePlatform()) return { mic: 'denied' };
      const { mic, overlay } = await WalkieTalkie.checkPermission();
      return { mic, overlay };
    },

    async requestPermission(kind) {
      if (!Capacitor.isNativePlatform()) return false;
      if (kind === 'notification') {
        console.warn(`[walkieTalkie] requestPermission('${kind}') not supported yet (Phase B)`);
        return false;
      }
      // 'overlay' 는 다이얼로그가 아니라 설정화면 유도라 granted 는 항상 false 로 온다 —
      // 호출부가 재개 시 getCapability()/checkPermission() 으로 재확인해야 한다(B-2).
      const { granted } = await WalkieTalkie.requestPermission({ kind });
      return granted;
    },

    async openAppSettings() {
      if (!Capacitor.isNativePlatform()) return;
      await WalkieTalkie.openAppSettings();
    },

    async startRecording(opts) {
      if (!Capacitor.isNativePlatform()) {
        console.warn('[walkieTalkie] startRecording not available on web');
        return;
      }
      await WalkieTalkie.startRecording(opts);
    },

    async stopRecording() {
      if (!Capacitor.isNativePlatform()) {
        throw new Error('[walkieTalkie] stopRecording not available on web');
      }
      return await WalkieTalkie.stopRecording();
    },

    async readRecordingBlob(result) {
      // iOS: 네이티브가 base64 로 직접 넘긴다. 원격 https 페이지에서 convertFileSrc 가 주는
      // capacitor:// 파일을 fetch 하면 WebKit 이 비보안 스킴(혼합 콘텐츠)으로 차단해
      // "Load failed" 로 죽는다 — 아이폰에서만 음성 전송이 실패하던 원인.
      if (Capacitor.getPlatform() === 'ios') {
        try {
          const { dataBase64 } = await WalkieTalkie.readRecording({ filePath: result.filePath });
          const bin = atob(dataBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          return new Blob([bytes], { type: result.mimeType });
        } catch (err) {
          // readRecording 이 없는 구 설치본(프론트는 원격 서빙이라 조합될 수 있다) — 새 메서드에
          // 하드 의존하지 않도록 기존 경로로 떨어뜨리되, 실패 사유는 반드시 구분되게 남긴다.
          // (그냥 폴백만 하면 구 빌드도 새 빌드와 똑같이 "Load failed" 로 보여 앱을 다시 빌드해야
          //  한다는 사실이 드러나지 않는다.)
          const reason = err instanceof Error ? err.message : String(err);
          console.warn('[walkieTalkie] readRecording unavailable, falling back to fetch', err);
          try {
            return await fetch(Capacitor.convertFileSrc(result.filePath)).then((r) => r.blob());
          } catch {
            throw new Error(`앱 재빌드 필요 — readRecording 없음 (${reason.slice(0, 60)})`);
          }
        }
      }
      // Android/웹: 로컬 서버가 https 로 서빙하므로 기존 경로가 정상 동작한다.
      const raw = await fetch(Capacitor.convertFileSrc(result.filePath)).then((r) => r.blob());
      // **타입은 네이티브가 보고한 값으로 덮어쓴다.** fetch 로 받은 Blob 의 type 은 로컬서버가
      // 확장자로 추정한 값인데, Android MimeTypeMap 은 .m4a 를 audio/mpeg 로 매핑한다 —
      // 그대로 업로드하면 서버가 415(unsupported_media: audio/mpeg)로 거절한다.
      // 녹음 포맷을 아는 쪽은 녹음한 네이티브다.
      return raw.type === result.mimeType ? raw : new Blob([raw], { type: result.mimeType });
    },

    async getPendingRecordings() {
      // 이 메서드가 없는 설치본(구 APK·iOS)도 있으므로 조용히 빈 배열로 떨어뜨린다.
      if (!Capacitor.isNativePlatform()) return [];
      try {
        const { items } = await WalkieTalkie.getPendingRecordings();
        return items ?? [];
      } catch {
        return [];
      }
    },

    async clearPendingRecording(id: string) {
      if (!Capacitor.isNativePlatform()) return;
      // 실패를 삼키지 않는다 — 호출부(WalkieTalkieFloatingButton)가 clear 실패와 성공을
      // 구분해야 "전송 성공했지만 clear 만 실패"한 항목을 재전송하지 않을 수 있다.
      await WalkieTalkie.clearPendingRecording({ id });
    },

    async cancelRecording() {
      if (!Capacitor.isNativePlatform()) return;
      await WalkieTalkie.cancelRecording();
    },

    async addListener(event, cb) {
      if (!Capacitor.isNativePlatform()) return { remove: () => {} };
      return await WalkieTalkie.addListener(event, cb);
    },

    // B-2(Android) — capability.overlayBubble=false(iOS/웹)면 호출부에서 노출 자체를 안 하는 게
    // 원칙이라 여기선 방어적으로만 no-op 처리한다.
    async showOverlayBubble(opts) {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
        console.warn('[walkieTalkie] showOverlayBubble not available on this platform');
        return;
      }
      await WalkieTalkie.showOverlayBubble(opts);
    },
    async hideOverlayBubble() {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
      await WalkieTalkie.hideOverlayBubble();
    },
    async pinToHomeScreen() {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
        console.warn('[walkieTalkie] pinToHomeScreen not available on this platform');
        return;
      }
      await WalkieTalkie.pinToHomeScreen();
    },
    async syncActiveChannel(opts) {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
      await WalkieTalkie.syncActiveChannel(opts);
    },
    async startChannelStatus(opts) {
      if (!Capacitor.isNativePlatform()) return;
      await WalkieTalkie.startChannelStatus(opts);
    },
    async updateChannelStatus(opts) {
      if (!Capacitor.isNativePlatform()) return;
      await WalkieTalkie.updateChannelStatus(opts);
    },
    async endChannelStatus() {
      if (!Capacitor.isNativePlatform()) return;
      await WalkieTalkie.endChannelStatus();
    },
    async startBackgroundChannel() {
      console.warn('[walkieTalkie] startBackgroundChannel not implemented (Phase B)');
    },
    async stopBackgroundChannel() {
      console.warn('[walkieTalkie] stopBackgroundChannel not implemented (Phase B)');
    },
    async updateLiveActivity() {
      console.warn('[walkieTalkie] updateLiveActivity not implemented (Phase B)');
    },
  };
}

// ── LiveActivity ─────────────────────────────────────────────────────────
// iOS 잠금화면/다이나믹아일랜드 Live Activity, Android ongoing 알림. 설계 SoT:
// `ai-docs/task/active/260829_live_activity_task.md`. 화면 코드는 이 채널만 호출한다.
// 웹·구설치본(플러그인 없음)은 전부 no-op — 잠금화면 카드는 부가 표면이라 실패가 화면 기능을 막으면 안 된다.

export interface LiveActivityChannel {
  getCapability(): Promise<{ available: boolean }>;
  start(opts: LiveActivityStartOptions): Promise<void>;
  update(opts: LiveActivityUpdateOptions): Promise<void>;
  end(opts: LiveActivityEndOptions): Promise<void>;
  /** Activity 푸시토큰 스트림(iOS). 웹/Android/구설치본은 아무 이벤트도 오지 않는 no-op 핸들. */
  onPushToken(cb: (e: { kind: LiveActivityKind; subjectId: string; token: string }) => void): Promise<{ remove: () => void }>;
}

function createLiveActivityChannel(): LiveActivityChannel {
  const ready = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LiveActivity');
  return {
    async getCapability() {
      if (!ready()) return { available: false };
      return await LiveActivity.getCapability().catch(() => ({ available: false }));
    },
    async start(opts) {
      if (!ready()) return;
      await LiveActivity.start(opts).catch((err) => console.warn('[liveActivity] start failed', err));
    },
    async update(opts) {
      if (!ready()) return;
      await LiveActivity.update(opts).catch((err) => console.warn('[liveActivity] update failed', err));
    },
    async end(opts) {
      if (!ready()) return;
      await LiveActivity.end(opts).catch((err) => console.warn('[liveActivity] end failed', err));
    },
    async onPushToken(cb) {
      if (!ready()) return { remove: () => {} };
      try {
        const h = await LiveActivity.addListener('pushToken', cb);
        return { remove: () => { void h.remove(); } };
      } catch {
        return { remove: () => {} };
      }
    },
  };
}

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

  // ── WalkieTalkie (A-6) ───────────────────────────────────────────────────
  readonly walkieTalkie: WalkieTalkieChannel = createWalkieTalkieChannel();

  // ── LiveActivity (경로안내·거래 잠금화면 카드) ──────────────────────────
  readonly liveActivity: LiveActivityChannel = createLiveActivityChannel();

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
    const override = readDevGpsOverride();
    if (override) return override;
    if (isGeolocationPluginAvailable()) {
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
    // Android·iOS 빌드 모두 @capacitor/geolocation 을 vendoring 하지 않음(GpsPlugin 이
    // Android 는 LocationForegroundService, iOS 는 CoreLocation 을 직접 사용 — settings.gradle/
    // Podfile 양쪽에 문서화된 결정) → isGeolocationPluginAvailable() 이 native 에서 false 를
    // 반환하므로 Capacitor 를 아예 호출하지 않고 처음부터 WebView/브라우저의
    // navigator.geolocation 을 쓴다(그게 실질 본 구현이다).
    // eslint-disable-next-line no-restricted-globals -- native.ts IS the bridge layer
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('geolocation_unavailable');
    }
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

  watchLocation(handler: LocationUpdateHandler): () => void {
    // dev 좌표 오버라이드가 걸려 있으면 실측 대신 오버라이드를 구독한다 — `/dev/gps` 하네스가
    // 좌표를 바꿀 때마다 storage 이벤트가 이 문서(iframe)로 날아와 "이동"이 재현된다.
    // (storage 는 값을 바꾼 문서에는 발화하지 않고 같은 출처의 다른 문서에서만 발화한다.)
    if (readDevGpsOverride()) {
      const emit = () => {
        const pos = readDevGpsOverride();
        if (pos) handler(pos);
      };
      emit();
      const onStorage = (e: StorageEvent) => { if (e.key === DEV_GPS_KEY) emit(); };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }

    let loggedSource = false;
    const logSource = (source: 'capacitor' | 'navigator') => {
      if (loggedSource) return;
      loggedSource = true;
      console.warn(`[native] watchLocation source: ${source}`);
    };

    // getLocation() 과 동일한 판정 — 플러그인이 등록돼 있지 않으면(현재 native 양 플랫폼)
    // Capacitor 를 아예 시도하지 않고 navigator.geolocation 으로 바로 구독한다. 등록 여부를
    // 미리 알기 때문에 "호출 → 응답 없음 → 타임아웃 후 전환" 구조(예전의 침묵 실패 대응)가
    // 더 이상 필요 없다 — 플러그인 배제가 풀리면 이 판정이 자동으로 Capacitor 를 다시 고른다.
    if (!isGeolocationPluginAvailable()) {
      // eslint-disable-next-line no-restricted-globals -- native.ts IS the bridge layer
      if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {};
      logSource('navigator');
      // eslint-disable-next-line no-restricted-globals
      const navigatorWatchId = navigator.geolocation.watchPosition(
        (p) =>
          handler({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
            speed: p.coords.speed,
            heading: p.coords.heading,
          }),
        (err) => console.warn('[NativeInterface] watchLocation error:', err),
        { enableHighAccuracy: true },
      );
      return () => {
        // eslint-disable-next-line no-restricted-globals -- native.ts IS the bridge layer
        navigator.geolocation.clearWatch(navigatorWatchId);
      };
    }

    let stopped = false;
    let capacitorWatchId: string | undefined;
    logSource('capacitor');
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
      if (stopped) {
        Geolocation.clearWatch({ id }).catch(() => {});
        return;
      }
      capacitorWatchId = id;
    });

    return () => {
      stopped = true;
      if (capacitorWatchId) {
        Geolocation.clearWatch({ id: capacitorWatchId }).catch(() => {});
        capacitorWatchId = undefined;
      }
    };
  }

  async checkLocationPermission(): Promise<LocationPermissionState> {
    // dev 좌표 오버라이드가 걸려 있으면 권한을 물을 이유가 없다 — 프리프롬프트도 건너뛴다.
    if (readDevGpsOverride()) return 'granted';
    // 웹(브라우저·개발 서버)에는 커스텀 Gps 플러그인 구현이 없어 호출이 거부된다 —
    // @capacitor/geolocation 의 웹 구현(navigator.permissions)으로 판정한다. 이 값이
    // 'prompt' 인지로 위치 프리프롬프트 노출 여부가 갈리므로(useLocationStore), 웹에서
    // 항상 'prompt' 로 떨어지면 이미 권한을 준 사용자에게도 프리프롬프트가 뜬다.
    if (!this.isNative) {
      const { location } = await Geolocation.checkPermissions();
      return normalizeLocationPermission(location);
    }
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

  // ── Compass heading (magnetometer, DeviceOrientation) ───────────────────
  //
  // GPS course(pos.heading)와 별개의 진짜 나침반 소스다(대표 지시 2026-08-07: "모바일 헤딩 기능은
  // GPS 좌표와 무관해야 한다" — GPS course는 이동해야만 값이 나오고 정지 시 null이라 정지 상태·
  // GPS 실패/서비스지역 밖에서 사실상 무용했다).
  //
  // Android/웹은 표준 웹 API(DeviceOrientationEvent)로 충분하다 — Android Chrome(WebView 포함,
  // Chromium 기반)의 deviceorientationabsolute 는 신뢰할 수 있게 동작한다(W14 조사, 2026-08-07:
  // WebView 개발자 문서·Chromium 소스 확인 — Android WebView 는 데스크톱 Chrome 과 동일 구현).
  //
  // iOS 는 W14(2026-08-07) 조사로 웹 API 경로가 실기기에서 무너지는 게 확인돼 네이티브로
  // 대체했다 — 자세한 근거는 아래 requestCompassPermission/watchCompassHeading 주석.
  // 이 교체는 GpsPlugin(iOS, `LocationTracker.startHeadingUpdates`)만 새로 추가했고, 이 두
  // 메서드의 **인터페이스(시그니처)는 그대로**라 호출부(SaigonMapV5.tsx)는 무변경이다.

  /**
   * iOS 는 네이티브 CLLocationManager 헤딩(GpsPlugin.startHeading, W14)을 쓴다 — 위치 권한
   * 재사용, 별도 동의 없음. 그래서 "권한 팝업"은 원래도 안 뜨는 게 정상이다(대표가 실기기에서
   * 확인한 "팝업이 안 떴다"는 관찰과 일치 — 이 경로에는 팝업 자체가 없다).
   *   근거(WebFetch/WebSearch, 2026-08-07): iOS 15+ WKWebView 는 앱이 WKUIDelegate 의
   *   `requestDeviceOrientationAndMotionPermissionFor` 를 구현해야만 DeviceOrientationEvent 를
   *   전달한다. 이 저장소가 vendoring 한 Capacitor 프레임워크 소스
   *   (`native/ios/Vendor/Capacitor/.../WebViewDelegationHandler.swift`) 는 이미 그 콜백을
   *   `decisionHandler(.grant)` 로 **자동 승인**하도록 구현돼 있다 — 그래서 웹 API 경로에서도
   *   OS 팝업이 안 뜬 것은 맞지만, WKWebView 자체가 실기기에서 deviceorientation 이벤트를
   *   안정적으로 전달하지 못하는 별도의 오랜 신뢰성 문제가 있다(Apple 개발자 포럼 다수 보고,
   *   home-assistant #4257 등) — NSMotionUsageDescription 유무와 무관하다(CoreMotion 권한이
   *   아니라 WebKit 자체의 이벤트 디스패치 문제). 그래서 대표 승인으로 CLLocationManager
   *   기반 네이티브 헤딩으로 전환했다(CoreMotion 미사용 — Motion 권한 불필요).
   * Android/웹: DeviceOrientationEvent.requestPermission() 이 있는 플랫폼(iOS Safari 등)에서만
   * 실제로 동의를 구한다. 없는 플랫폼(Android/데스크톱)은 권한 개념 자체가 없으므로 항상 true —
   * "허용됨"과 "권한 불필요"를 같은 true 로 합쳐 반환한다는 뜻이다. 호출부는 이미 fail-open으로
   * 설계돼 있어(거부/미지원 모두 'follow' 진입 후 GPS course 폴백) 이 구분이 없어도 동작에는
   * 영향이 없지만, 디버깅 시 오해하지 않도록 남긴다 — 인터페이스를 boolean 에서 3-state 로
   * 바꾸는 것은 호출부 영향이 커 최소 변경 원칙상 보류했다.
   */
  async requestCompassPermission(): Promise<boolean> {
    if (this.isNative && this.platform === 'ios') {
      const { status } = await Gps.requestPermission();
      return status === 'granted';
    }
    const DOE = (typeof DeviceOrientationEvent !== 'undefined'
      ? (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> })
      : undefined);
    if (!DOE || typeof DOE.requestPermission !== 'function') return true;
    try {
      return (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * 나침반 방위를 구독한다. 구독 해제 함수를 반환한다(watchLocation과 동일 패턴).
   * iOS 네이티브: GpsPlugin.startHeading() + 'headingUpdate' 리스너(CLHeading, 이미 진북 보정).
   * Android/웹: deviceorientationabsolute(있으면, 절대 방위) → 없으면 deviceorientation(상대값일
   * 수 있으나 대부분 기기에서 실질적으로 절대값에 가까움) 폴백. alpha 는 화면 회전을 보정하지
   * 않으므로 screen.orientation.angle 을 더해 "화면이 보여주는 위" 기준으로 정규화한다.
   * webkitCompassHeading 분기는 남겨둔다 — 네이티브 앱(iOS)은 위에서 먼저 갈라지므로 이 웹
   * 분기는 실제로는 Android/데스크톱/모바일 Safari(비네이티브 테스트)에만 도달하지만, 모바일
   * Safari 로 열었을 때는 여전히 webkitCompassHeading 이 더 정확한 값을 준다.
   * 기기에 자력계/DeviceOrientation 자체가 없으면(구형 기기·데스크톱) no-op 구독을 반환한다 —
   * 호출부는 이 경우 한 번도 handler 가 불리지 않는 것으로 판정해 GPS course 폴백을 유지한다.
   */
  watchCompassHeading(handler: CompassHeadingHandler): () => void {
    if (this.isNative && this.platform === 'ios') {
      let listenerHandle: PluginListenerHandle | null = null;
      let stopped = false;
      void Gps.addListener('headingUpdate', (e) => handler(e.heading)).then((h) => {
        if (stopped) { void h.remove(); return; }
        listenerHandle = h;
      });
      void Gps.startHeading();
      return () => {
        stopped = true;
        void listenerHandle?.remove();
        void Gps.stopHeading();
      };
    }

    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return () => {};

    const onEvent = (e: DeviceOrientationEvent) => {
      const iosHeading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof iosHeading === 'number' && Number.isFinite(iosHeading)) {
        handler(iosHeading);
        return;
      }
      if (e.alpha == null) return;
      const screenAngle = window.screen?.orientation?.angle ?? 0;
      handler(((360 - e.alpha + screenAngle) % 360 + 360) % 360);
    };

    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(eventName, onEvent as EventListener, true);
    return () => window.removeEventListener(eventName, onEvent as EventListener, true);
  }

  /**
   * 외부 URL 열기 (구글맵 길안내 등). 웹/네이티브 모두 새 컨텍스트로 열어
   * 인앱 웹뷰가 아닌 시스템 핸들러(설치된 앱)가 처리하도록 위임.
   * 네이티브 외부-앱 직링크 보강이 필요하면 이 메서드만 교체(@capacitor/browser 등).
   */
  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * 외부 브라우저(시스템 브라우저)로 URL 을 연다. 인앱 웹뷰로 열리면 안 되는 경로
   * (예: 웹 계약 결제 — Apple IAP 판정 리스크 회피)에 쓴다. 실패는 조용히 로그만
   * 남긴다(버튼이 죽지 않도록) — 호출부에서 별도 에러 처리 불필요.
   */
  async openExternalUrl(url: string): Promise<void> {
    try {
      await Browser.open({ url });
    } catch (err) {
      console.warn('[NativeInterface] openExternalUrl failed:', err);
    }
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
   * 네이티브(iOS/Android): 키보드는 순수 오버레이(웹뷰 리사이즈 없음)라 innerHeight 계측이
   * 무의미 — KeyboardBridge 의 keyboardWillShow/Hide 이벤트가 유일한 소스.
   * (iOS: UIKit 키보드 노티, Android: WindowInsetsCompat IME inset)
   * 웹: 계측 폴백 (baseline innerHeight delta + visualViewport inset 의 max).
   */
  /** 네이티브 키보드 브리지 fan-out — 소비자가 여럿이어도(화면당 시트/컴포저 다수) 브리지 리스너는 1회만 등록 */
  private kbHandlers = new Set<KeyboardChangeHandler>();
  private kbBridgeStarted = false;

  onKeyboardChange(handler: KeyboardChangeHandler): () => void {
    // isPluginAvailable 가드: 프론트는 원격 서빙이라 KeyboardBridge 미탑재 구 APK 와
    // 조합될 수 있다 — 그 경우 아래 계측 폴백으로 보낸다 (브리지 없이는 이벤트가 전혀 없음).
    if (this.isNative && Capacitor.isPluginAvailable('KeyboardBridge')) {
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

    // 웹 / 구빌드(KeyboardBridge 미탑재 APK) 계측 폴백
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

    // 유입 귀속(016 §6-2 #30) — 캡처된 ref 를 redirect flow의 state 에 실어 콜백까지 들고
    // 간다(routers/auth.py:oauth_*_start). 없으면 서버가 'organic' 으로 처리.
    const ref = getStoredAcqRef();
    const startUrl = `https://saigon.doil.me/api/bff/auth/oauth/${provider}/start${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
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
    // F-19: 강제 업데이트 판정에 필요한 설치본 버전. 커스텀 Device 플러그인의
    // getAppVersion() 경유(양 플랫폼에 이미 등록된 플러그인 — @capacitor/app 은
    // native 프로젝트에 등록되지 않아 사용하지 않는다). fail-open —
    // 실패 시 'unknown' 유지, 호출부는 'unknown'일 때 절대 차단하지 않는다.
    let appVersion = 'unknown';
    if (this.isNative) {
      try {
        appVersion = (await Device.getAppVersion()).version;
      } catch {
        // 미구현/조회 실패 — 'unknown' 유지
      }
    }
    return {
      platform: this.platform,
      osVersion: 'unknown',
      appVersion,
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

/**
 * ── dev GPS 좌표 오버라이드 (`/dev/gps` 하네스 전용) ────────────────────────
 *
 * 실기기 없이 "내 위치가 X 일 때 화면이 어떻게 나오는지"를 확인하기 위한 개발용 백도어다.
 * `/dev/gps` 래핑 페이지가 iframe 으로 앱을 띄우고, 같은 출처의 localStorage 에 좌표를 써서
 * 앱이 그 값을 읽게 한다. (부모가 iframe 의 navigator.geolocation 을 갈아끼우는 방식은
 * 앱 스크립트가 먼저 도는 타이밍에 실패한다 — 그래서 앱이 읽는 방향으로 뒤집었다.)
 *
 * **2중 게이트** — 둘 다 만족해야 동작한다:
 *  1. 호스트 허용목록 — 운영 도메인(app.saigon-rider.com)에서는 어떤 값이 들어와도 무시된다.
 *     ⚠️ 빌드타임 플래그(`import.meta.env.DEV`)를 쓰지 않는 이유: frontend/Dockerfile 이
 *     `npm run build`(프로덕션 모드)로 빌드해 **dev 스택에서도 DEV 가 false** 라, 정작
 *     테스트하려는 환경에서 코드가 사라진다.
 *  2. 명시적 opt-in 키 — 키가 없으면(기본) 실측을 그대로 쓴다.
 *
 * 하네스 자체(`dev-test/gps/`)는 docker-compose.prod.yml 이 nginx `volumes: !override` 로
 * 개발 마운트를 빼므로 운영에 서빙되지 않는다(2026-08-06 리뷰에서 누락이 발견돼 보강).
 */
const DEV_GPS_KEY = '__dev_gps';
const DEV_GPS_HOSTS = ['localhost', '127.0.0.1', 'saigon.doil.me'];

function readDevGpsOverride(): GeoPosition | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!DEV_GPS_HOSTS.includes(window.location.hostname)) return null;
    const raw = window.localStorage.getItem(DEV_GPS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown; heading?: unknown; speed?: unknown };
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const heading = parsed.heading != null && Number.isFinite(Number(parsed.heading)) ? Number(parsed.heading) : null;
    const speed = parsed.speed != null && Number.isFinite(Number(parsed.speed)) ? Number(parsed.speed) : null;
    return { lat, lng, accuracy: 5, speed, heading };
  } catch {
    return null;
  }
}

/**
 * @capacitor/geolocation 플러그인이 현재 플랫폼에 등록돼 있는지 동기 판정한다.
 * Android·iOS 는 이 플러그인을 vendoring 하지 않으므로(native/ios/Podfile,
 * native/android 쪽 settings — GpsPlugin 이 CoreLocation/LocationForegroundService 를
 * 직접 씀) 항상 false 를 반환해 getLocation()/watchLocation() 이 처음부터
 * navigator.geolocation 을 쓰게 만든다. 웹에서는 @capacitor/geolocation 이 자체 web
 * 구현(GeolocationWeb, 내부적으로 navigator.geolocation 을 감쌈)을 등록하므로 true —
 * 기존 웹 동작(회귀 없음)을 그대로 유지한다. 플러그인 배제가 풀리면(Podfile/gradle 복원)
 * 이 판정이 자동으로 Capacitor 경로를 다시 고른다.
 */
function isGeolocationPluginAvailable(): boolean {
  return Capacitor.isPluginAvailable('Geolocation');
}

function normalizeLocationPermission(state: string): LocationPermissionState {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt'; // 'prompt' | 'prompt-with-rationale'
}

// ─── 싱글턴 export ──────────────────────────────────────────────────────────

export const native = new NativeInterface();
