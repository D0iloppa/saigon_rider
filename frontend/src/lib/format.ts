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
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const date = new Date(iso);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

// 만료 임박: ISO → "4h 12m" / "30m"
export function formatTimeLeft(iso?: string): string | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return '만료';
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
  try {
    // dynamic import would cause async — use the module-level singleton instead
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lang: string = require('@/lib/i18n').default.language ?? 'en';
    return LOCALE_MAP[lang] ?? 'en-US';
  } catch {
    return 'en-US';
  }
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
