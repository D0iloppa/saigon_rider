import type { TFunction } from 'i18next';
import type { ListingStatus } from '@/api/market';

/** 가격 표기 — 0 = 나눔, 그 외 `1.234.567 đ` (베트남 관례: 마침표 천단위 + đ 후치. Chotot 실측 표기) */
export function formatPriceVnd(vnd: number, t: TFunction): string {
  if (vnd === 0) return t('market.free', { defaultValue: '나눔' });
  return `${vnd.toLocaleString('vi-VN')} đ`;
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

/** 거리 표기 — REF-02 '동네감' 핵심. 1km 미만은 m(도보권 정밀도), 이상은 오토바이
 * 소요시간(도심 ~20km/h ≈ 333m/분). "동네명만으론 거리감이 없다"는 당근 티어다운 비판을
 * 번개장터 '자전거 N분' 패턴으로 보완 — 오토바이 도시 호치민에 맞춤 (design-uplift-260707 §후속 2) */
export function formatDistance(m: number | null, t: TFunction): string {
  if (m == null) return '';
  if (m < 1000) return `${m}m`;
  const mins = Math.max(1, Math.round(m / 333));
  return t('market.bikeMinutes', { count: mins, defaultValue: `오토바이 ${mins}분` });
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
  if (status === 'HIDDEN') return 'market.statusHidden';
  return 'market.statusOnSale';
}
