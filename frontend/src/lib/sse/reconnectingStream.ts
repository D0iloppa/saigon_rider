import { openEventStream, type EventStreamHandle, type SseMessage } from './eventStream';

/**
 * 재연결 SSE (워키토키 `hybrid.ts` 의 재연결·지터 백오프·포그라운드 강제 재연결 부분만 이식).
 *
 * 폴링 폴백은 두지 않는다 — 이 채널은 SSE 페이로드가 데이터 그 자체이고(설계 D3), 정합성은
 * **재연결 시점의 `onReconnect`(GET 전량 재동기화)** 가 담당한다(설계 §3-4).
 *
 * 포그라운드 복귀: 백그라운드에서 웹뷰가 정지돼 스트림이 끊긴 줄도 모르는 반죽음 상태가 되므로,
 * 복귀 시 백오프를 기다리지 않고 스트림을 강제로 다시 연다.
 */
export interface ReconnectingStreamOptions {
  url: () => string;
  headers?: () => Record<string, string>;
  onMessage: (msg: SseMessage) => void;
  /** 스트림이 (재)연결됐을 때 — 호출부는 GET 으로 상태를 전량 재동기화한다. */
  onOpen?: () => void;
  /** 재시도해도 풀리지 않는 실패(403/404/410) — 호출부가 채널을 정리한다. 이후 재시도하지 않는다. */
  onFatal?: (status: number) => void;
  onError?: (err: unknown) => void;
}

export interface ReconnectingStreamHandle {
  stop(): void;
}

const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 60000;
const FATAL_STATUSES = new Set([401, 403, 404, 410]);

export function startReconnectingStream(opts: ReconnectingStreamOptions): ReconnectingStreamHandle {
  let source: EventStreamHandle | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let stopped = false;

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = () => {
    if (stopped || retryTimer !== null) return;
    // 지터 — 서버 재시작 때 모든 클라이언트가 같은 순간에 몰리지 않게.
    const backoff = Math.min(RETRY_BASE_MS * 2 ** attempts, RETRY_MAX_MS);
    attempts += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, backoff * (0.5 + Math.random()));
  };

  const open = () => {
    if (stopped || source !== null) return;
    source = openEventStream(opts.url(), {
      headers: opts.headers?.(),
      onOpen: () => {
        attempts = 0;
        opts.onOpen?.();
      },
      onMessage: opts.onMessage,
      onClose: (err) => {
        source = null;
        if (stopped) return;
        const status = (err as { status?: number } | undefined)?.status;
        if (status !== undefined && FATAL_STATUSES.has(status)) {
          stopped = true;
          opts.onFatal?.(status);
          return;
        }
        if (err) opts.onError?.(err);
        scheduleRetry();
      },
    });
  };

  const onVisibility = () => {
    if (stopped || document.visibilityState !== 'visible') return;
    attempts = 0;
    clearRetry();
    source?.close();
    source = null;
    open();
  };

  document.addEventListener('visibilitychange', onVisibility);
  open();

  return {
    stop() {
      stopped = true;
      clearRetry();
      document.removeEventListener('visibilitychange', onVisibility);
      source?.close();
      source = null;
    },
  };
}
