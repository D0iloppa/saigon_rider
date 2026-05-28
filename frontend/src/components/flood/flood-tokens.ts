/**
 * 침수 신고 시각화 토큰.
 * depth 코드는 백엔드/DB와 일치: 'ankle' | 'knee' | 'thigh' | 'above'.
 */

export type FloodDepthCode = 'ankle' | 'knee' | 'thigh' | 'above';

export type FloodTrustLevel = 'PENDING' | 'CONFIRMED' | 'VERIFIED';

export interface FloodDepthToken {
  code: FloodDepthCode;
  emoji: string;
  /** i18n 키 (예: 'info.flood.depthAnkle') */
  labelKey: string;
  /** 마커 안에 표시되는 한 글자 라벨 (ko) */
  shortLabel: string;
  /** 마커 stroke / 텍스트 등 메인 컬러 */
  color: string;
  /** 마커 채우기 색 */
  fillColor: string;
  /** 내부 텍스트 색 */
  textColor: string;
  /** 1 (낮음) ~ 4 (최고) */
  severity: 1 | 2 | 3 | 4;
}

export const DEPTH_TOKENS: Record<FloodDepthCode, FloodDepthToken> = {
  ankle: {
    code: 'ankle',
    emoji: '🟡',
    labelKey: 'info.flood.depthAnkle',
    shortLabel: '잔',
    color: '#B45309',
    fillColor: '#F59E0B',
    textColor: '#FFFFFF',
    severity: 1,
  },
  knee: {
    code: 'knee',
    emoji: '🟠',
    labelKey: 'info.flood.depthKnee',
    shortLabel: '정',
    color: '#9A3412',
    fillColor: '#F97316',
    textColor: '#FFFFFF',
    severity: 2,
  },
  thigh: {
    code: 'thigh',
    emoji: '🔴',
    labelKey: 'info.flood.depthThigh',
    shortLabel: '무',
    color: '#7F1D1D',
    fillColor: '#EF3B3B',
    textColor: '#FFFFFF',
    severity: 3,
  },
  above: {
    code: 'above',
    emoji: '⛔',
    labelKey: 'info.flood.depthAbove',
    shortLabel: '✕',
    color: '#450A0A',
    fillColor: '#7F1D1D',
    textColor: '#FFFFFF',
    severity: 4,
  },
};

export function getDepth(code: string | null | undefined): FloodDepthToken {
  if (code && code in DEPTH_TOKENS) return DEPTH_TOKENS[code as FloodDepthCode];
  return DEPTH_TOKENS.knee;
}

export interface FloodTrustToken {
  level: FloodTrustLevel;
  color: string;
  bgColor: string;
  /** i18n 키 (예: 'info.flood.trustVerified') */
  labelKey: string;
  /** 마커 옆 미니 배지 prefix (예: '👤', '✓') */
  icon: string;
}

export const TRUST_TOKENS: Record<FloodTrustLevel, FloodTrustToken> = {
  PENDING: {
    level: 'PENDING',
    color: '#6B7280',
    bgColor: '#F3F4F6',
    labelKey: 'info.flood.trustPending',
    icon: '⋯',
  },
  CONFIRMED: {
    level: 'CONFIRMED',
    color: '#1D4ED8',
    bgColor: '#DBEAFE',
    labelKey: 'info.flood.trustConfirmed',
    icon: '👤',
  },
  VERIFIED: {
    level: 'VERIFIED',
    color: '#15803D',
    bgColor: '#DCFCE7',
    labelKey: 'info.flood.trustVerified',
    icon: '✓',
  },
};

/** confidence_score → trust level (백엔드 _trust_level 과 동일 규칙) */
export function trustFromScore(score: number | null | undefined): FloodTrustLevel {
  const s = score ?? 0;
  if (s >= 3) return 'VERIFIED';
  if (s >= 1) return 'CONFIRMED';
  return 'PENDING';
}

/**
 * 신선도 opacity. 6시간 기준 선형 감쇠.
 * 0분 → 1.0, 360분(6h) → 0.4, 그 이상은 0.4 유지.
 */
export function freshnessOpacity(minutesAgo: number): number {
  const m = Math.max(0, minutesAgo);
  if (m >= 360) return 0.4;
  return 1 - (m / 360) * 0.6;
}

/** 분 단위를 짧은 라벨로 변환 (예: "5분 전", "2시간 전"). */
export function formatTimeAgo(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}
