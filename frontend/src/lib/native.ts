/**
 * NativeInterface — WebView ↔ Native 통신 추상화 모듈
 *
 * 네이티브 측 약속:
 *   수신: window.nativeInterface.onMessage(jsonString) 을 호출해 응답 전달
 *   발신: Android → window.native.postMessage(jsonString)
 *         iOS    → window.webkit.messageHandlers.native.postMessage(jsonString)
 */

// ─── 메시지 프로토콜 타입 ────────────────────────────────────────────────────

interface NativeOutbound {
  key: string;
  callbackId?: string;
  params?: unknown;
}

interface NativeInbound {
  callbackId?: string; // 있으면 request 응답, 없으면 push 이벤트
  key?: string;        // push 이벤트 식별자
  result?: unknown;
  error?: string;
  data?: unknown;
}

interface PendingCallback {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── 지원 커맨드 키 상수 ─────────────────────────────────────────────────────

export const NATIVE_KEYS = {
  // Request/Response
  GET_LOCATION: 'getLocation',
  OPEN_CAMERA: 'openCamera',
  SHARE: 'share',
  HAPTIC: 'haptic',
  GET_DEVICE_INFO: 'getDeviceInfo',
  REQUEST_PERMISSION: 'requestPermission',

  // Push (네이티브 → 웹, 단방향)
  LOCATION_UPDATE: 'locationUpdate',
  APP_FOREGROUND: 'appForeground',
  DEEP_LINK: 'deepLink',
} as const;

export type NativeKey = (typeof NATIVE_KEYS)[keyof typeof NATIVE_KEYS];

// ─── 플랫폼 감지 ─────────────────────────────────────────────────────────────

type Platform = 'android' | 'ios' | 'browser';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'browser';
  if ((window as Window & { native?: { postMessage?: unknown } }).native?.postMessage) return 'android';
  if (
    (window as Window & { webkit?: { messageHandlers?: { native?: { postMessage?: unknown } } } })
      .webkit?.messageHandlers?.native?.postMessage
  )
    return 'ios';
  return 'browser';
}

// ─── NativeInterface 클래스 ───────────────────────────────────────────────────

class NativeInterface {
  private readonly platform: Platform;
  private readonly pending = new Map<string, PendingCallback>();
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();

  constructor() {
    this.platform = detectPlatform();
    this._exposeToWindow();
  }

  /** 단방향 전송 — 응답 불필요 */
  send(key: string, params?: unknown): void {
    this._post({ key, params });
  }

  /** 양방향 요청 — Promise로 응답 수신 */
  request<T = unknown>(key: string, params?: unknown, timeoutMs = 10_000): Promise<T> {
    const callbackId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callbackId);
        reject(new Error(`[NativeInterface] timeout: ${key} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pending.set(callbackId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this._post({ key, callbackId, params });
    });
  }

  /**
   * 네이티브 Push 이벤트 구독
   * @returns unsubscribe 함수
   */
  on<T = unknown>(key: string, handler: (data: T) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    const h = handler as (data: unknown) => void;
    this.listeners.get(key)!.add(h);

    return () => {
      this.listeners.get(key)?.delete(h);
    };
  }

  // ─── 내부 메서드 ────────────────────────────────────────────────────────────

  private _post(msg: NativeOutbound): void {
    const payload = JSON.stringify(msg);

    if (this.platform === 'android') {
      (window as Window & { native: { postMessage: (p: string) => void } }).native.postMessage(payload);
    } else if (this.platform === 'ios') {
      (
        window as Window & {
          webkit: { messageHandlers: { native: { postMessage: (p: string) => void } } };
        }
      ).webkit.messageHandlers.native.postMessage(payload);
    } else {
      this._devFallback(msg);
    }
  }

  /** 네이티브가 window.nativeInterface.onMessage(jsonString) 으로 호출하는 진입점 */
  private _handleInbound(raw: string): void {
    let msg: NativeInbound;
    try {
      msg = JSON.parse(raw) as NativeInbound;
    } catch {
      console.error('[NativeInterface] invalid JSON from native:', raw);
      return;
    }

    if (msg.callbackId) {
      // Request/Response 매칭
      const pending = this.pending.get(msg.callbackId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.callbackId);

      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    } else if (msg.key) {
      // Push 이벤트 배포
      const handlers = this.listeners.get(msg.key);
      if (handlers) {
        handlers.forEach((h) => h(msg.data));
      }
    }
  }

  /** 브라우저 개발 환경 fallback */
  private _devFallback(msg: NativeOutbound): void {
    console.warn('[NativeInterface][DEV] send →', msg);
    if (msg.callbackId) {
      // 100ms 후 null로 자동 resolve — UI 블로킹 방지
      setTimeout(() => {
        this._handleInbound(JSON.stringify({ callbackId: msg.callbackId, result: null }));
      }, 100);
    }
  }

  /** window에 수신 진입점 노출 — 네이티브가 직접 호출 */
  private _exposeToWindow(): void {
    if (typeof window === 'undefined') return;
    (window as Window & { nativeInterface: { onMessage: (raw: string) => void } }).nativeInterface = {
      onMessage: (raw: string) => this._handleInbound(raw),
    };
  }
}

// ─── 싱글턴 export ────────────────────────────────────────────────────────────

export const nativeInterface = new NativeInterface();
