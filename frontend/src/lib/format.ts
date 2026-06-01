import i18n from '@/lib/i18n';

// 거리: 미터 → "5.2 km" / "850 m"
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// 시간: 초 → "00:24:18"
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 짧은 시간: 초 → "24:18"
export function formatDurationShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 상대 시간: ISO → "12분 전" / "3시간 전"
export function formatRelativeTime(iso: string): string {
  const t = i18n.t.bind(i18n);
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t('common.justNow');
  if (min < 60) return t('common.minutesAgo', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('common.hoursAgo', { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t('common.daysAgoShort', { count: day });
  const date = new Date(iso);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

// 만료 임박: ISO → "4h 12m" / "30m"
export function formatTimeLeft(iso?: string): string | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return i18n.t('common.expired');
  const totalMin = Math.floor(diffMs / 60000);
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hr > 0) return `${hr}h ${min}m`;
  return `${min}m`;
}

const LOCALE_MAP: Record<string, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  vi: 'vi-VN',
};

function getLocale(): string {
  const lang: string = i18n.language ?? 'en';
  return LOCALE_MAP[lang] ?? 'en-US';
}

/**
 * 천 단위 콤마: 60000 → "60,000" / "60.000"
 * compact 옵션: 60000 → "60K" (en) / "6만" (ko)
 */
export function formatNumber(n: number, options?: { compact?: boolean }): string {
  const locale = getLocale();
  if (options?.compact) {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat(locale).format(n);
}

/** 숫자를 정수부 / 소수부(구분자 포함)로 분리. 소수부를 작은 폰트로 렌더해
 *  "10.473"(10.473km)이 "10,473"(천단위)로 오독되는 것을 방지하기 위함. */
export function splitNumberParts(n: number): { int: string; frac: string | null } {
  const parts = new Intl.NumberFormat(getLocale()).formatToParts(n);
  let int = '';
  let dec = '';
  let frac = '';
  for (const part of parts) {
    if (part.type === 'integer' || part.type === 'group') int += part.value;
    else if (part.type === 'decimal') dec = part.value;
    else if (part.type === 'fraction') frac += part.value;
  }
  return { int, frac: frac ? dec + frac : null };
}
