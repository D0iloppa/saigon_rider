/**
 * 범용 화면 진입 이벤트 트래커 — useAdEvents.ts(정본 §5 #6, D-1/D-19)와 동일한 배치+keepalive+
 * pagehide 패턴을 재사용한다. WebView 가 백그라운드로 가면 JS 타이머가 freeze/kill 되어 큐가
 * 유실되므로, navigator.sendBeacon(navigator.* 직접 호출 — ESLint error) 대신
 * fetch(keepalive:true) + pagehide/visibilitychange 로 이탈 시 남은 큐를 흘린다.
 *
 * ⚠️ 백엔드 엔드포인트 미구현 — 조사 결과 보고:
 * backend/app/routers/tracking.py 는 first-touch 하나만 제공하고, 그 파일 docstring 이 "프론트
 * 범용 트래커(화면진입 계측 등)는 이 작업의 범위가 아니다"라고 명시한다. funnel_events.record() 는
 * 서버 내부 비즈니스 로직(회원가입·거래 등 특정 이벤트) 발화 지점에서만 호출되고, 클라이언트가
 * 임의 화면명을 실어 보낼 수 있는 공개 ingest 엔드포인트가 아니다. useAdEvents.ts 가 쓰는
 * POST /api/bff/market/ads/events 도 ad_id·제한된 이벤트 enum 전용이라 화면 이벤트를 태울 수 없다.
 * 아래 POST /api/bff/tracking/screen-events 는 이 훅이 소비할 것을 전제로 한 **제안 경로**일 뿐
 * 서버에 없다 — 백엔드가 추가하기 전까지는 404 로 조용히 실패한다(에러는 삼킨다, useAdEvents와
 * 동일). 백엔드 담당자가 해당 라우트(요청 스키마: {events: [{screen, occurred_at}]}, 익명ID/
 * 세션ID 는 X-Anon-Id/X-Session-Id 헤더로 이미 실려 온다)를 추가하면 이 훅은 그대로 살아난다.
 */
import { useEffect, useRef } from 'react';
import { loadSession } from '@/lib/session';
import { trackingRequestHeaders } from '@/lib/tracking';

interface QueuedScreenEvent {
  screen: string;
  occurred_at: string;
}

const MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 3000;

let queue: QueuedScreenEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** 공용 client.ts 를 우회 — 세션 만료/계정제한 부수효과 없음, 에러는 조용히 버림(useAdEvents와 동일). */
function send(events: QueuedScreenEvent[]): void {
  if (events.length === 0) return;
  const session = loadSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...trackingRequestHeaders(),
  };
  if (session?.userId && session.sessionToken) {
    headers['X-User-Id'] = session.userId;
    headers['X-Session-Token'] = session.sessionToken;
  }
  fetch('/api/bff/tracking/screen-events', {
    method: 'POST',
    headers,
    body: JSON.stringify({ events }),
    keepalive: true, // 페이지 이탈 중에도 요청이 살아남게 한다
  }).catch(() => {
    // 계측 실패가 사용자 흐름을 막으면 안 된다 — 조용히 버림(엔드포인트 미구현 시 항상 여기로 옴).
  });
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  send(batch);
  if (queue.length > 0) scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

function enqueue(event: QueuedScreenEvent) {
  queue.push(event);
  if (queue.length >= MAX_BATCH) flush();
  else scheduleFlush();
}

if (typeof document !== 'undefined') {
  document.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** 라우트(화면명)가 바뀔 때마다 화면 진입 이벤트 1건을 큐잉한다. App.tsx 에서 1회만 마운트. */
export function useScreenTracking(screenName: string): void {
  const lastRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastRef.current === screenName) return;
    lastRef.current = screenName;
    enqueue({ screen: screenName, occurred_at: new Date().toISOString() });
  }, [screenName]);
}
