/**
 * 광고 성과 계측 훅/유틸 — 정본 §5 #6, D-1/D-19 (ai-docs/task/active/260817_commercial_readiness_audit).
 *
 * viewability 판정·어트리뷰션·봇 필터는 범위 밖(D-1) — 노출은 "요소가 뷰포트에 1회 들어오면"으로
 * 단순 판정한다. 배치 전송(events 배열)으로 스크롤당 다발 노출의 요청 폭주를 피한다.
 *
 * ⚠️ 배선 범위: ADS_ENABLED(lib/adPlacement.ts)가 꺼져 있어 market_feed/market_top/home_card/
 * home_empty 지면은 지금 렌더되지 않는다. 이 훅 자체는 그 지면에도 그대로 쓸 수 있게 범용으로
 * 만들었다 — 배선은 #10(노출 재개)에서 한다. 지금은 ad_detail/biz_profile 두 곳만 배선한다.
 */
import { useEffect } from 'react';
import { api } from '@/api/client';

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
  business_profile_id?: string | null;
  occurred_at: string;
}

const MAX_BATCH = 20; // 백엔드 AdEventsIngestRequest 상한과 일치
const FLUSH_INTERVAL_MS = 3000;

let queue: QueuedAdEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
// 세션(탭 새로고침 전까지) 내 같은 광고·같은 노출면의 중복 노출 전송만 억제한다 — 영구 dedup 아님.
const seenImpressions = new Set<string>();

function flush() {
  flushTimer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  api
    .realFetch('/market/ads/events', { method: 'POST', body: JSON.stringify({ events: batch }) }, 'bff', {
      silent: true,
    })
    .catch(() => {
      // 계측 실패가 사용자 흐름을 막으면 안 된다 — 조용히 버림(재시도 없음, D-1 최소범위).
    });
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

/** 노출 1건 기록(세션 내 같은 ad+surface 중복 억제). */
export function trackAdImpression(adId: string, surface: AdEventSurface, businessProfileId?: string | null): void {
  const key = `${surface}:${adId}`;
  if (seenImpressions.has(key)) return;
  seenImpressions.add(key);
  enqueue({
    ad_id: adId,
    event_type: 'impression',
    surface,
    business_profile_id: businessProfileId ?? null,
    occurred_at: new Date().toISOString(),
  });
}

/** 클릭/CTA 이벤트 기록 — 중복 억제 없음(매 클릭 전송). */
export function trackAdEvent(
  adId: string,
  surface: AdEventSurface,
  eventType: Exclude<AdEventType, 'impression'>,
  businessProfileId?: string | null,
): void {
  enqueue({
    ad_id: adId,
    event_type: eventType,
    surface,
    business_profile_id: businessProfileId ?? null,
    occurred_at: new Date().toISOString(),
  });
}

/** 요소가 뷰포트에 들어오면 노출 1회를 기록하는 훅(viewability 판정 없음 — 범위 밖). */
export function useAdImpression(
  ref: React.RefObject<Element | null>,
  adId: string | null | undefined,
  surface: AdEventSurface,
  businessProfileId?: string | null,
): void {
  useEffect(() => {
    if (!adId || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            trackAdImpression(adId, surface, businessProfileId);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current, adId, surface, businessProfileId]);
}
