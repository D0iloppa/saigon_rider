/** 베트남 정유 브랜드 컬러 토큰 + 가격 포맷팅 헬퍼. */

export interface BrandToken {
  code: string;
  displayName: string;
  primary: string;
  accent: string;
  textColor: string;
}

export const BRAND_TOKENS: Record<string, BrandToken> = {
  PETROLIMEX:   { code: 'PETROLIMEX',   displayName: 'Petrolimex',   primary: '#003F87', accent: '#FFCC00', textColor: '#FFFFFF' },
  PVOIL:        { code: 'PVOIL',        displayName: 'PVOil',        primary: '#F36F21', accent: '#FFFFFF', textColor: '#FFFFFF' },
  SAIGON_PETRO: { code: 'SAIGON_PETRO', displayName: 'Saigon Petro', primary: '#1E7F3E', accent: '#FFFFFF', textColor: '#FFFFFF' },
  MIPEC:        { code: 'MIPEC',        displayName: 'Mipec',        primary: '#8B4513', accent: '#FFFFFF', textColor: '#FFFFFF' },
  COMECO:       { code: 'COMECO',       displayName: 'Comeco',       primary: '#6B7280', accent: '#FFFFFF', textColor: '#FFFFFF' },
  MARKET_AVG:   { code: 'MARKET_AVG',   displayName: 'Market avg',   primary: '#475569', accent: '#FFFFFF', textColor: '#FFFFFF' },
  UNKNOWN:      { code: 'UNKNOWN',      displayName: '—',            primary: '#9CA3AF', accent: '#FFFFFF', textColor: '#FFFFFF' },
};

export function getBrand(code?: string | null): BrandToken {
  if (!code) return BRAND_TOKENS.UNKNOWN;
  return BRAND_TOKENS[code] ?? BRAND_TOKENS.UNKNOWN;
}

/** 자유 텍스트 brand → 정규화 code (042 마이그 SQL 과 동일 매핑). */
export function deriveBrandCode(raw?: string | null): string {
  if (!raw) return 'UNKNOWN';
  const s = raw.toLowerCase();
  if (s.includes('petrolimex')) return 'PETROLIMEX';
  if (s.includes('pvoil') || s.includes('pv oil') || s.includes('pv-oil')) return 'PVOIL';
  if (s.includes('saigon petro') || s.includes('sài gòn petro')) return 'SAIGON_PETRO';
  if (s.includes('mipec')) return 'MIPEC';
  if (s.includes('comeco')) return 'COMECO';
  return 'UNKNOWN';
}

/** '21,560' → '21.5k' */
export function formatPriceShort(vnd: number | null | undefined): string {
  if (vnd == null) return '—';
  if (vnd < 10_000) return `${vnd}đ`;
  return `${(vnd / 1000).toFixed(1).replace('.0', '')}k`;
}

/** '21,560 VND/L' */
export function formatPriceFull(vnd: number | null | undefined): string {
  if (vnd == null) return '—';
  return `${vnd.toLocaleString('en-US')} VND/L`;
}
