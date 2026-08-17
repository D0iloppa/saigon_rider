/**
 * 광고 성과 계측 훅/유틸 — 정본 §5 #6, D-1/D-19 (ai-docs/task/active/260817_commercial_readiness_audit).
 *
 * viewability 판정·어트리뷰션·봇 필터는 범위 밖(D-1) — 노출은 "요소가 뷰포트에 1회 들어오면"으로
 * 단순 판정한다. 배치 전송(events 배열)으로 스크롤당 다발 노출의 요청 폭주를 피한다.
 *
 * ⚠️ 배선 범위: ADS_ENABLED(lib/adPlacement.ts)가 꺼져 있어 market_feed/market_top/home_card/
 * home_empty 지면은 지금 렌더되지 않는다. 이 훅 자체는 그 지면에도 그대로 쓸 수 있게 범용으로
 * 만들었다 — 배선은 #10(노출 재개)에서 한다. 지금은 ad_detail/biz_profile 두 곳만 배선한다.
 *
 * code-review medium 지적 #1: 계측 전송은 공용 client.ts(api.realFetch)를 쓰지 않는다. client.ts
 * 는 419/401/403을 세션 만료·계정제한 처리(강제 로그아웃 + /splash 리다이렉트)와 묶어서 처리하는데,
 * 그 부수효과는 `silent`로 막히지 않는다 — 계측 비콘 하나가 실패해도 사용자가 로그아웃당할 수 있었다.
 * 세션 라이프사이클은 사용자가 실제로 요청한 API 호출에서만 다뤄야 한다. 그래서 이 모듈은 fetch를
 * 직접 호출해 완전히 격리한다(에러는 전부 삼킨다, 세션 처리 없음).
 */
import { useCallback, useRef } from 'react';
import { loadSession } from '@/lib/session';

/** D-19(001_DECISIONS.md §3) 확정 카탈로그 — proximity 는 기존 전용 경로(useProximityAlerts)가 쓰므로 여기 없음. */
export type AdEventSurface =
  | 'market_feed'
  | 'market_top'
  | 'home_card'
  | 'home_empty'
  | 'ad_detail'
  | 'biz_profile';

export type AdEventType =
  | 'impression'
  | 'click'
  | 'cta_call'
  | 'cta_follow'
  | 'cta_favorite'
  | 'cta_review'
  | 'cta_news_view'
  | 'cta_profile_enter'
  | 'cta_share';

interface QueuedAdEvent {
  ad_id: string;
  event_type: AdEventType;
  surface: AdEventSurface;
  occurred_at: string;
}

const MAX_BATCH = 20; // 백엔드 AdEventsIngestRequest 상한과 일치
const FLUSH_INTERVAL_MS = 3000;

let queue: QueuedAdEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
// 세션(탭 새로고침 전까지) 내 같은 광고·같은 노출면의 중복 노출 전송만 억제한다 — 영구 dedup 아님.
const seenImpressions = new Set<string>();

/** 공용 client.ts 를 우회하는 계측 전용 전송 — 세션 만료/계정제한 부수효과 없음, 에러는 조용히 버림. */
function send(events: QueuedAdEvent[]): void {
  if (events.length === 0) return;
  const session = loadSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.userId && session.sessionToken) {
    headers['X-User-Id'] = session.userId;
    headers['X-Session-Token'] = session.sessionToken;
  }
  fetch('/api/bff/market/ads/events', {
    method: 'POST',
    headers,
    body: JSON.stringify({ events }),
    keepalive: true, // 페이지 이탈 중에도 요청이 살아남게 한다(#2 이탈 flush)
  }).catch(() => {
    // 계측 실패가 사용자 흐름을 막으면 안 된다 — 조용히 버림(재시도 없음, D-1 최소범위).
  });
}

function flush() {
  // enqueue()가 MAX_BATCH 도달 시 flush()를 직접 부르는 경로와, 예약된 타이머가 발화하는 경로가
  // 겹치면 타이머가 중복 등록돼 같은 배치가 두 번 POST 될 수 있었다(code-review medium #4) —
  // flush() 진입 시 항상 기존 타이머를 취소해 라이프사이클을 하나로 고정한다.
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

function enqueue(event: QueuedAdEvent) {
  queue.push(event);
  if (queue.length >= MAX_BATCH) flush();
  else scheduleFlush();
}

if (typeof document !== 'undefined') {
  // 페이지 이탈 시 남은 노출 배치를 흘리지 않는다(code-review medium #2-2).
  // navigator.sendBeacon 은 CLAUDE.md 가 금지하는 navigator.* 직접 호출이라 쓰지 않는다 —
  // fetch(keepalive: true) + document 이벤트(다른 화면도 이미 이 패턴을 씀, 예: DmDetail.tsx)로 대체.
  document.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** 노출 1건 기록(세션 내 같은 ad+surface 중복 억제). 다발 노출이므로 배치 큐에 태운다. */
export function trackAdImpression(adId: string, surface: AdEventSurface): void {
  const key = `${surface}:${adId}`;
  if (seenImpressions.has(key)) return;
  seenImpressions.add(key);
  enqueue({
    ad_id: adId,
    event_type: 'impression',
    surface,
    occurred_at: new Date().toISOString(),
  });
}

/**
 * 클릭/CTA 이벤트 기록 — 중복 억제 없음(매 클릭 전송).
 *
 * code-review medium 지적 #2: cta_call 직후 native.openUrl('tel:…')로 WebView 가 백그라운드로
 * 가면 모바일은 타이머를 freeze/kill 하므로 3초 노출 디바운스에 태우면 유실된다. 클릭/CTA 는
 * 노출보다 드물고 가치가 높으므로 큐를 거치지 않고 즉시 전송한다.
 */
export function trackAdEvent(
  adId: string,
  surface: AdEventSurface,
  eventType: Exclude<AdEventType, 'impression'>,
): void {
  send([
    {
      ad_id: adId,
      event_type: eventType,
      surface,
      occurred_at: new Date().toISOString(),
    },
  ]);
}

/**
 * 요소가 뷰포트에 들어오면 노출 1회를 기록하는 콜백 ref(viewability 판정 없음 — 범위 밖).
 *
 * code-review medium 지적 #3: RefObject + `ref.current`를 의존성으로 읽던 이전 구현은, 관찰
 * 대상 엘리먼트가 훅의 의존성이 마지막으로 바뀐 렌더 이후에 붙으면(스켈레톤 먼저, 카드 나중
 * 패턴) 이펙트가 재실행되지 않아 노출이 영구 미기록됐다. 콜백 ref 는 노드가 실제로 DOM 에
 * 붙는 시점에 호출되므로 이 경합이 원천적으로 없다.
 */
export function useAdImpression(
  adId: string | null | undefined,
  surface: AdEventSurface,
): (node: Element | null) => void {
  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback(
    (node: Element | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || !adId) return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              trackAdImpression(adId, surface);
              observer.disconnect();
            }
          }
        },
        { threshold: 0.5 },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [adId, surface],
  );
}
