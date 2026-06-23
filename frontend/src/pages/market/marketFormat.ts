import type { TFunction } from 'i18next';
import type { ListingStatus } from '@/api/market';

/** 가격 표기 — 0 = 나눔, 그 외 ₫1.234.567 (vi 천단위) */
export function formatPriceVnd(vnd: number, t: TFunction): string {
  if (vnd === 0) return t('market.free', { defaultValue: '나눔' });
  return `₫${vnd.toLocaleString('vi-VN')}`;
}

/** 상대 시간 — 방금/N분/N시간/N일 전 */
export function relativeTime(iso: string, t: TFunction): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return t('market.justNow', { defaultValue: '방금 전' });
  if (min < 60) return t('market.minAgo', { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('market.hourAgo', { count: h });
  return t('market.dayAgo', { count: Math.floor(h / 24) });
}

/** 거리 표기 — REF-02 '동네감' 핵심. m<1000이면 m, 아니면 km */
export function formatDistance(m: number | null): string {
  if (m == null) return '';
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

/** 매너온도 이모지 (REF-06: 별점 아닌 '체온' 은유) */
export function mannerEmoji(temp: number): string {
  if (temp >= 50) return '😍';
  if (temp >= 40) return '😊';
  if (temp >= 36.5) return '🙂';
  return '😐';
}

/** 매너온도 표기 — 36.5°C */
export function formatMannerTemp(temp: number): string {
  return `${temp.toFixed(1)}°C`;
}

/** 별점 표기: 후기 없으면 '—', 있으면 ⭐4.8 */
export function formatRating(avg: number | null, count: number): string {
  if (avg === null || count === 0) return '—';
  return `⭐ ${avg.toFixed(1)}`;
}

/** 거래 완료 건수 */
export function formatReviewCount(count: number, t: TFunction): string {
  return t('market.reviewCount', { count, defaultValue: `거래 ${count}건` });
}

/** 응답률 — 60% 미만이면 빈 문자열(미표시) */
export function formatResponseRate(rate: number | null, t: TFunction): string {
  if (rate === null) return '';
  if (rate >= 90) return t('market.responseVeryFast', { defaultValue: '응답 빠름' });
  if (rate >= 60) return t('market.responseNormal', { defaultValue: '응답 보통' });
  return '';
}

/** 상태 i18n 키 (ON_SALE/RESERVED/SOLD) */
export function statusLabelKey(status: ListingStatus): string {
  if (status === 'RESERVED') return 'market.statusReserved';
  if (status === 'SOLD') return 'market.statusSold';
  return 'market.statusOnSale';
}
