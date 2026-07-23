import type { MarketAd } from '@/api/market';

/**
 * 광고 노출 주기 — 콘텐츠 N개마다 광고 1개 삽입.
 * `/market/ads` 응답은 서버가 이미 광고료(tier/fee) 비례로 가중 로테이션한 시퀀스이므로,
 * 프론트는 위치기반 순환만 한다 — 재가중/재정렬 금지(가중치는 서버 SoT).
 */
export const AD_EVERY = 6;

/** 무한스크롤 확장 시 노출 한도 증분(고정값 — 랜덤 아님). */
const AD_LIMIT_STEP = 3;

/** 초기 노출 한도. */
export const AD_LIMIT_INITIAL = 3;

export interface AdSlot {
  ad: MarketAd;
  /** ads 배열 내 순환 인덱스 — 반복 노출되는 광고의 복합 key(`${ad.id}-${ord}`)에 쓴다. */
  ord: number;
}

/** 콘텐츠 인덱스 i 슬롯에 배치할 광고(없으면 null). adLimit 생략 시 무제한. */
export function adAtIndex(i: number, ads: readonly MarketAd[], adLimit = Infinity): AdSlot | null {
  if (ads.length === 0 || i % AD_EVERY !== 0) return null;
  const ord = Math.floor(i / AD_EVERY);
  if (ord >= adLimit) return null;
  return { ad: ads[ord % ads.length], ord };
}

/** 무한스크롤 시 다음 adLimit(결정적 증분 — 랜덤 아님). */
export const nextAdLimit = (prev: number) => prev + AD_LIMIT_STEP;
