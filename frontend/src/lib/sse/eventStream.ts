/**
 * fetch 기반 SSE 리더 (워키토키 `d_modules/.../transport/eventStream.ts` 이식 — 패키지 경계상 import 대신 복제).
 *
 * 브라우저 내장 `EventSource` 를 쓰지 않는 이유: **커스텀 헤더를 붙일 수 없다.** 이 앱은 세션을
 * `X-User-Id`/`X-Session-Token` 헤더로 보내므로 fetch 스트림 리더로 읽는다.
 *
 * 워키토키 원본과의 차이: 이 채널은 이벤트 **페이로드(data:)를 싣는다**(설계 D3) — `event:` 와
 * `data:`(여러 줄이면 \n 결합) 를 함께 넘긴다. `:` 로 시작하는 줄은 keepalive 코멘트라 무시.
 */
export interface SseMessage {
  event: string;
  data: string;
}

export interface EventStreamHandle {
  close(): void;
}

export interface OpenEventStreamOptions {
  headers?: Record<string, string>;
  onMessage: (msg: SseMessage) => void;
  /** 연결이 열렸을 때(첫 응답 헤더 수신). */
  onOpen?: () => void;
  /** 연결 실패·중단·정상 종료 — 호출부는 재시도 여부를 여기서 정한다. */
  onClose: (err?: unknown) => void;
}

export function openEventStream(url: string, opts: OpenEventStreamOptions): EventStreamHandle {
  const controller = new AbortController();
  let closed = false;

  const finish = (err?: unknown) => {
    if (closed) return;
    closed = true;
    opts.onClose(err);
  };

  (async () => {
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream', ...(opts.headers ?? {}) },
      });
      if (!res.ok || !res.body) {
        finish(Object.assign(new Error(`event stream ${res.status}`), { status: res.status }));
        return;
      }
      opts.onOpen?.();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 이벤트 블록은 빈 줄로 끝난다. 마지막 조각은 아직 안 끝난 블록이므로 버퍼에 남긴다.
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          let event = 'message';
          const data: string[] = [];
          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith(':')) continue;
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
          }
          if (data.length > 0 || event !== 'message') opts.onMessage({ event, data: data.join('\n') });
        }
      }
      finish();
    } catch (err) {
      // abort 는 우리가 닫은 것 — closed 플래그로 이미 걸러진다.
      finish(err);
    }
  })();

  return {
    close() {
      if (closed) return;
      closed = true;
      controller.abort();
    },
  };
}
