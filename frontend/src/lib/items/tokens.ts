export const collection = {
  STREET_CLASSIC: {
    primary:   '#8A9099',
    secondary: '#2A3140',
    accent:    '#FCD34D',
    mood:      'matte-vintage',
  },
  NEON_SAIGON: {
    primary:   '#FF2D9C',
    secondary: '#00F0FF',
    accent:    '#B6FF1C',
    glow:      'rgba(255,45,156,.65)',
    glow2:     'rgba(0,240,255,.5)',
  },
  TET_FESTIVAL: {
    primary:   '#DC2626',
    secondary: '#FBBF24',
    accent:    '#FFE4D2',
  },
  MEKONG_DELTA: {
    primary:   '#6B8E23',
    secondary: '#2DD4BF',
    accent:    '#92400E',
  },
  DELIVERY_HUSTLE: {
    primary:   '#FACC15',
    secondary: '#1F2937',
    accent:    '#DC2626',
  },
  SAIGON_GHOST: {
    primary:   '#0E0D1A',
    secondary: '#8B5CF6',
    accent:    '#1E40AF',
    glow:      'rgba(139,92,246,.75)',
  },
  LEGEND_OF_SAIGON: {
    primary:   '#FFB800',
    secondary: '#B91C1C',
    accent:    '#FFFFFF',
  },
} as const;

export const itemRarityFx = {
  C: { glow: 'none', dropShadow: 'none' },
  R: {
    glow: 'rgba(59,130,246,.45)',
    dropShadow:
      'drop-shadow(0 0 4px rgba(59,130,246,.7)) drop-shadow(0 0 8px rgba(59,130,246,.3))',
  },
  E: {
    glow: 'rgba(139,92,246,.50)',
    dropShadow:
      'drop-shadow(0 0 8px rgba(139,92,246,.7)) drop-shadow(0 0 16px rgba(139,92,246,.4))',
  },
  L: {
    glow: 'rgba(255,184,0,.65)',
    dropShadow:
      'drop-shadow(0 0 12px rgba(255,184,0,.8)) drop-shadow(0 0 24px rgba(255,184,0,.4))',
    sparkles: 4,
  },
  M: {
    glow: 'rgba(255,45,156,.70)',
    dropShadow:
      'drop-shadow(0 0 16px rgba(255,45,156,.7)) drop-shadow(0 0 32px rgba(0,240,255,.4)) drop-shadow(0 0 48px rgba(255,184,0,.3))',
    sparkles: 6,
    conicGradient: true,
  },
} as const;
