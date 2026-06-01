# Saigon Rider — 디자인 토큰 + 컴포넌트 추출 가이드 v1.1

> 발행일: 2026-05-18 (v1.1 업데이트)
> 입력: screens_v3_rpg.html (36 화면) + screens v2 (27 화면) + **Skywork v4 아이템 자산** (saigon-rider-items.svg + saigon-rider-items.css)
> 출력: `@saigon-rider/tokens` 패키지 + `@saigon-rider/ui` 컴포넌트 **24개**

---

## v1.1 변경 요약 (v1.0 → v1.1)

Skywork v4 결과물 도착으로 디자인 시스템이 보강됨. v1.0 내용은 모두 유효하며 다음이 **추가**됨:

| 영역 | v1.0 | v1.1 |
|---|---|---|
| **CSS 토큰** | 앱 전체 토큰 (brand/ink/neon/spacing 등) | + **아이템 도메인 토큰** (컬렉션 7개 × 등급 효과 5단계) — §1.8 신규 |
| **컴포넌트** | 19개 | + 5개 = **24개** (CollectionChip, ItemSparkle, InventoryCell, ItemSvgRenderer, MythicCardOverlay) — §2.20~§2.24 신규 |
| **RarityCard** | 라이트 surface 위 기본 5등급 | + Mythic conic-gradient 회전 애니메이션 + 다크/라이트 surface 모드 prop — §2.2 업데이트 |
| **외부 자산** | 없음 | + `saigon-rider-items.svg` (98KB sprite) + `saigon-rider-items.css` (10KB) — §7 신규 |
| **패키지** | tokens + ui | + **`@saigon-rider/items`** (sprite + 메타데이터, 신규) |

내 자체 토큰(§1.1-§1.7)과 Skywork 토큰(§1.8)은 **다른 도메인**이라 충돌 없음:
- 내 토큰: **앱 chrome** (헤더·탭바·CTA·텍스트) — 라이트 surface 위주
- Skywork 토큰: **아이템 카드** (가챠·인벤토리·상점 안의 아이템 시각화) — 다크 surface 위주

---

## 0. 산출물 구조 (업데이트)

```
packages/
├── tokens/
│   ├── package.json
│   ├── src/
│   │   ├── colors.ts          # 브랜드/네온/등급/게임 통화
│   │   ├── typography.ts      # 폰트/크기/굵기
│   │   ├── spacing.ts         # 4/8/12/16/20/24/32
│   │   ├── radius.ts          # 4/8/12/16/20/24/28/32
│   │   ├── shadow.ts          # card/pop/inset
│   │   ├── gradient.ts        # sunset/night/mesh
│   │   ├── animation.ts       # mythic-shimmer/pity-pulse
│   │   ├── items.ts        ⭐ # NEW v1.1: 컬렉션 컬러 + 아이템 등급 효과 (TS 매핑)
│   │   └── index.ts           # re-export
│   ├── css/
│   │   ├── tokens.css         # :root CSS variables (앱 chrome)
│   │   └── items.css       ⭐ # NEW v1.1: Skywork 아이템 도메인 토큰
│   ├── tailwind.config.js     # Tailwind preset
│   └── README.md
│
├── items/                  ⭐ # NEW v1.1: Skywork 자산 + 메타데이터 패키지
│   ├── package.json
│   ├── sprite/
│   │   └── saigon-rider-items.svg   # 98KB SVG sprite (Skywork v4)
│   ├── src/
│   │   ├── metadata.ts        # 27개 아이템 메타 (id/name/slot/collection/rarity)
│   │   ├── catalog.json       # 메타데이터 JSON
│   │   └── index.ts
│   └── README.md
│
└── ui/
    ├── package.json
    ├── src/
    │   ├── primitives/
    │   │   ├── PhoneFrame.tsx
    │   │   ├── Icon3D.tsx
    │   │   ├── PhotoFrame.tsx
    │   │   ├── BottomTabBar.tsx
    │   │   └── TopBar.tsx
    │   ├── game/
    │   │   ├── RarityCard.tsx        # ⭐ v1.1 UPDATE: 다크/라이트 모드 prop
    │   │   ├── RarityChip.tsx
    │   │   ├── CurrencyBadge.tsx
    │   │   ├── PityBar.tsx
    │   │   ├── GachaCardBack.tsx
    │   │   ├── ProgressRing.tsx
    │   │   ├── ConfettiLayer.tsx
    │   │   ├── CollectionChip.tsx ⭐ # NEW v1.1: 컬렉션 식별 칩
    │   │   ├── ItemSparkle.tsx    ⭐ # NEW v1.1: Legendary sparkle 애니메이션
    │   │   ├── InventoryCell.tsx  ⭐ # NEW v1.1: 인벤토리/가챠 결과 셀
    │   │   ├── ItemSvgRenderer.tsx⭐ # NEW v1.1: sprite use 래퍼 (RN/Web 분기)
    │   │   └── MythicCardOverlay.tsx⭐# NEW v1.1: conic-gradient 회전 오버레이
    │   ├── content/
    │   │   ├── BentoCell.tsx
    │   │   ├── PrimaryCTA.tsx
    │   │   ├── GlassButton.tsx
    │   │   ├── SerifItalic.tsx
    │   │   ├── MicroLabel.tsx
    │   │   ├── NeonGlow.tsx
    │   │   └── NoiseTexture.tsx
    │   └── index.ts
    ├── stories/         # Storybook
    └── README.md
```

---

## §1. 디자인 토큰

### 1.1 colors.ts

```typescript
// packages/tokens/src/colors.ts
export const brand = {
  50:  '#FFF1E8',
  100: '#FFDDC4',
  200: '#FFBB8A',
  300: '#FF9966',
  500: '#FF5A1F',  // PRIMARY
  600: '#ED4310',
  700: '#B82C08',
  900: '#4A1203',
} as const;

export const ink = {
  900: '#08090F',
  800: '#11131C',
  700: '#1A1D2A',
  600: '#262A3D',
  500: '#3D4256',
} as const;

export const neon = {
  cyan:  '#00F0FF',
  lime:  '#B6FF1C',
  pink:  '#FF2D9C',
  amber: '#FFB800',
} as const;

export const game = {
  xp:   '#8B5CF6',  // 보라 (Skill Pt)
  exp:  '#22C55E',  // 그린 (레벨 EXP)
  gold: '#FFB800',  // 옐로우 (Gold)
} as const;

export const surface = {
  bg:        '#F7F5F0',
  surface:   '#FFFFFF',
  surface2:  '#FAF7F2',
  line:      '#E8E3DA',
  text:      '#0B0D14',
  text2:     '#4A4F62',
  text3:     '#8A8E9E',
} as const;

export const status = {
  success: '#16A34A',
  warn:    '#F59E0B',
  danger:  '#EF3B3B',
} as const;

// 등급 (RPG)
export const rarity = {
  C: {
    fill:   '#9CA3AF',
    bg:     '#F3F4F6',
    border: '#D1D5DB',
    glow:   'rgba(156,163,175,0)',
    grad:   'linear-gradient(135deg, #E5E7EB, #9CA3AF)',
  },
  R: {
    fill:   '#3B82F6',
    bg:     '#DBEAFE',
    border: '#60A5FA',
    glow:   'rgba(59,130,246,.45)',
    grad:   'linear-gradient(135deg, #60A5FA, #1D4ED8)',
  },
  E: {
    fill:   '#8B5CF6',
    bg:     '#EDE9FE',
    border: '#A78BFA',
    glow:   'rgba(139,92,246,.55)',
    grad:   'linear-gradient(135deg, #A78BFA, #6D28D9)',
  },
  L: {
    fill:   '#FF7438',
    bg:     '#FFE4D2',
    border: '#FF9966',
    glow:   'rgba(255,116,56,.70)',
    grad:   'linear-gradient(135deg, #FFB800, #FF5A1F, #B82C08)',
  },
  M: {
    fill:   '#FF2D9C',
    glow:   'rgba(255,45,156,.80)',
    grad: `linear-gradient(135deg,
            #FF2D9C 0%, #FF7438 25%,
            #FFB800 50%, #00F0FF 75%,
            #B6FF1C 100%)`,
  },
} as const;

export type Rarity = keyof typeof rarity;
```

### 1.2 typography.ts

```typescript
// packages/tokens/src/typography.ts
export const fontFamily = {
  sans: ['Pretendard', '-apple-system', 'sans-serif'],
  mono: ['"Space Grotesk"', 'sans-serif'],
  serif: ['"Instrument Serif"', 'serif'],
} as const;

export const fontSize = {
  micro:      ['11px',  { lineHeight: '14px', letterSpacing: '0.04em' }],
  caption:    ['13px',  { lineHeight: '18px' }],
  body:       ['15px',  { lineHeight: '22px' }],
  h3:         ['17px',  { lineHeight: '24px' }],
  h2:         ['20px',  { lineHeight: '28px' }],
  h1:         ['26px',  { lineHeight: '32px' }],
  display:    ['40px',  { lineHeight: '44px', letterSpacing: '-0.02em' }],
  displayXL:  ['56px',  { lineHeight: '60px', letterSpacing: '-0.03em' }],
} as const;

export const fontWeight = {
  regular: 400,
  medium:  500,
  semibold: 600,
  bold:    700,
} as const;

// 숫자 항상 tabular-nums + 약간 좁게
export const numericStyle = {
  fontFamily: fontFamily.mono.join(','),
  fontVariantNumeric: 'tabular-nums' as const,
  letterSpacing: '-0.02em',
};
```

### 1.3 spacing.ts / radius.ts

```typescript
// packages/tokens/src/spacing.ts
export const spacing = {
  0: 0,  1: 4,  2: 8,  3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64,
} as const;

// packages/tokens/src/radius.ts
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  phone: 56,        // phone-frame
  full: 9999,
} as const;
```

### 1.4 shadow.ts / gradient.ts

```typescript
// packages/tokens/src/shadow.ts
export const shadow = {
  card: '0 1px 2px rgba(11,13,20,.04), 0 4px 12px rgba(11,13,20,.06), 0 16px 40px rgba(11,13,20,.06)',
  pop:  '0 8px 24px rgba(255,90,31,.20), 0 24px 60px rgba(255,90,31,.18)',
  inset:'inset 0 1px 0 rgba(255,255,255,.6)',
  glowCyan:  '0 0 32px rgba(0,240,255,.6), 0 0 80px rgba(0,240,255,.3)',
  glowAmber: '0 0 32px rgba(255,184,0,.7)',
} as const;

// packages/tokens/src/gradient.ts
export const gradient = {
  sunset: `
    radial-gradient(at 20% 20%, #FFD96B 0%, transparent 50%),
    radial-gradient(at 80% 30%, #FF5A1F 0%, transparent 55%),
    radial-gradient(at 60% 90%, #7C3AED 0%, transparent 60%),
    linear-gradient(160deg, #FF7438, #B82C08)
  `,
  night: `
    radial-gradient(at 30% 20%, #1A1D2A 0%, transparent 50%),
    radial-gradient(at 70% 80%, #FF2D9C 0%, transparent 30%),
    linear-gradient(160deg, #11131C, #08090F)
  `,
  mesh1: `
    radial-gradient(at 0% 0%, #FF9966 0%, transparent 50%),
    radial-gradient(at 100% 100%, #7C3AED 0%, transparent 50%),
    #FFF1E8
  `,
} as const;
```

### 1.5 animation.ts

```typescript
// packages/tokens/src/animation.ts
export const keyframes = {
  mythicShimmer: `
    @keyframes mythic-shimmer {
      0%, 100% { background-position: 0% 50%; }
      50%      { background-position: 100% 50%; }
    }
  `,
  pityPulse: `
    @keyframes pity-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,90,31,.6); }
      50%      { box-shadow: 0 0 12px 4px rgba(255,90,31,.6); }
    }
  `,
  shimmer: `
    @keyframes shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `,
  legendaryFloat: `
    @keyframes legendary-float {
      0%, 100% { transform: translateY(0px); }
      50%      { transform: translateY(-6px); }
    }
  `,
} as const;
```

### 1.6 tokens.css (CSS variables 통합)

```css
/* packages/tokens/css/tokens.css */
:root {
  /* Brand */
  --brand-50: #FFF1E8;
  --brand-100: #FFDDC4;
  --brand-200: #FFBB8A;
  --brand-300: #FF9966;
  --brand-500: #FF5A1F;
  --brand-600: #ED4310;
  --brand-700: #B82C08;
  --brand-900: #4A1203;

  /* Ink */
  --ink-900: #08090F;
  --ink-800: #11131C;
  --ink-700: #1A1D2A;
  --ink-600: #262A3D;
  --ink-500: #3D4256;

  /* Neon */
  --neon-cyan:  #00F0FF;
  --neon-lime:  #B6FF1C;
  --neon-pink:  #FF2D9C;
  --neon-amber: #FFB800;

  /* Game currency */
  --xp:   #8B5CF6;
  --exp:  #22C55E;
  --gold: #FFB800;

  /* Surface */
  --bg:        #F7F5F0;
  --surface:   #FFFFFF;
  --surface-2: #FAF7F2;
  --line:      #E8E3DA;
  --text:      #0B0D14;
  --text-2:    #4A4F62;
  --text-3:    #8A8E9E;

  /* Status */
  --success: #16A34A;
  --warn:    #F59E0B;
  --danger:  #EF3B3B;

  /* Rarity C ~ M */
  --r-c-fill:   #9CA3AF; --r-c-bg: #F3F4F6; --r-c-border: #D1D5DB; --r-c-glow: rgba(156,163,175,0);
  --r-r-fill:   #3B82F6; --r-r-bg: #DBEAFE; --r-r-border: #60A5FA; --r-r-glow: rgba(59,130,246,.45);
  --r-e-fill:   #8B5CF6; --r-e-bg: #EDE9FE; --r-e-border: #A78BFA; --r-e-glow: rgba(139,92,246,.55);
  --r-l-fill:   #FF7438; --r-l-bg: #FFE4D2; --r-l-border: #FF9966; --r-l-glow: rgba(255,116,56,.70);
  --r-m-fill:   #FF2D9C; --r-m-glow: rgba(255,45,156,.80);

  /* Shadows */
  --shadow-card:  0 1px 2px rgba(11,13,20,.04), 0 4px 12px rgba(11,13,20,.06), 0 16px 40px rgba(11,13,20,.06);
  --shadow-pop:   0 8px 24px rgba(255,90,31,.20), 0 24px 60px rgba(255,90,31,.18);
  --shadow-inset: inset 0 1px 0 rgba(255,255,255,.6);

  /* Gradients */
  --grad-sunset: radial-gradient(at 20% 20%, #FFD96B 0%, transparent 50%), radial-gradient(at 80% 30%, #FF5A1F 0%, transparent 55%), radial-gradient(at 60% 90%, #7C3AED 0%, transparent 60%), linear-gradient(160deg, #FF7438, #B82C08);
  --grad-night:  radial-gradient(at 30% 20%, #1A1D2A 0%, transparent 50%), radial-gradient(at 70% 80%, #FF2D9C 0%, transparent 30%), linear-gradient(160deg, #11131C, #08090F);

  /* Animation duration */
  --duration-fast:  150ms;
  --duration-base:  250ms;
  --duration-slow:  400ms;
  --easing:         cubic-bezier(0.4, 0.0, 0.2, 1);
}
```

### 1.7 Tailwind preset

```javascript
// packages/tokens/tailwind.config.js
import { brand, ink, neon, game, surface, status, rarity } from './src/colors';
import { fontFamily, fontSize, fontWeight } from './src/typography';
import { spacing } from './src/spacing';
import { radius } from './src/radius';
import { shadow } from './src/shadow';

export default {
  theme: {
    extend: {
      colors: {
        brand,
        ink,
        neon,
        ...game,
        ...surface,
        ...status,
        // 등급은 flat한 접근으로
        'r-c': rarity.C.fill,
        'r-c-bg': rarity.C.bg,
        'r-c-border': rarity.C.border,
        'r-r': rarity.R.fill,
        'r-r-bg': rarity.R.bg,
        'r-r-border': rarity.R.border,
        // ... E/L/M 동일 패턴
      },
      fontFamily,
      fontSize,
      fontWeight,
      spacing,
      borderRadius: radius,
      boxShadow: shadow,
      backgroundImage: {
        'grad-sunset': 'var(--grad-sunset)',
        'grad-night':  'var(--grad-night)',
      },
      keyframes: {
        'mythic-shimmer': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
        'pity-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,90,31,.6)' },
          '50%':      { boxShadow: '0 0 12px 4px rgba(255,90,31,.6)' },
        },
      },
      animation: {
        'mythic-shimmer': 'mythic-shimmer 3s linear infinite',
        'pity-pulse':     'pity-pulse 1.5s ease-in-out infinite',
      },
    },
  },
};
```

---

### 1.8 ⭐ items.ts + items.css (NEW v1.1 — Skywork 아이템 도메인 토큰)

**위치**: `packages/tokens/src/items.ts` + `packages/tokens/css/items.css`

이건 **아이템 카드 전용** 토큰. 앱 chrome 토큰(§1.1~§1.5)과 명확히 분리. 출처: Skywork v4 `saigon-rider-items.css` (10KB) 그대로 도입 + TypeScript 매핑 추가.

#### 1.8.1 items.ts (TypeScript 매핑)

```typescript
// packages/tokens/src/items.ts

// 컬렉션 7개 (각각 primary / secondary / accent + 일부 glow)
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
    primary:   '#DC2626',  // 베트남 빨강
    secondary: '#FBBF24',  // 금
    accent:    '#FFE4D2',  // 등불 크림
  },
  MEKONG_DELTA: {
    primary:   '#6B8E23',  // 카키
    secondary: '#2DD4BF',  // 강물 청록
    accent:    '#92400E',  // 우드
  },
  DELIVERY_HUSTLE: {
    primary:   '#FACC15',  // 형광 옐로우
    secondary: '#1F2937',  // 매트 블랙
    accent:    '#DC2626',
  },
  SAIGON_GHOST: {
    primary:   '#0E0D1A',
    secondary: '#8B5CF6',
    accent:    '#1E40AF',
    glow:      'rgba(139,92,246,.75)',
  },
  LEGEND_OF_SAIGON: {
    primary:   '#FFB800',  // 골드
    secondary: '#B91C1C',  // 황실 빨강
    accent:    '#FFFFFF',
  },
} as const;

export type CollectionCode = keyof typeof collection;

// 등급별 카드 효과 (다크 surface 위에 표시될 때)
// 라이트 surface용은 §1.1 rarity (colors.ts) 그대로 사용
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
    sparkles: 4, // 카드 위에 떠다니는 sparkle 개수
  },
  M: {
    // Mythic은 conic-gradient 회전 오버레이 + 다중 drop-shadow
    glow: 'rgba(255,45,156,.70)',
    dropShadow:
      'drop-shadow(0 0 16px rgba(255,45,156,.7)) drop-shadow(0 0 32px rgba(0,240,255,.4)) drop-shadow(0 0 48px rgba(255,184,0,.3))',
    sparkles: 6,
    conicGradient: true,  // MythicCardOverlay 컴포넌트로 처리
  },
} as const;
```

#### 1.8.2 items.css (Skywork CSS 그대로 도입)

Skywork v4 결과물 `saigon-rider-items.css`를 그대로 `packages/tokens/css/items.css`로 복사. 주요 클래스:

| 클래스 | 용도 |
|---|---|
| `--col-{collection}-{tone}` | 컬렉션 컬러 토큰 (primary/secondary/accent/glow) |
| `.item-r-{c|r|e|l|m}` | SVG에 drop-shadow filter 적용 (등급별 글로우) |
| `.item-card[data-r="{C|R|E|L|M}"]` | 카드 컨테이너 (border + box-shadow + Mythic conic-gradient) |
| `.rarity-label[data-r="X"]` | 등급 라벨 칩 |
| `.col-chip[data-col="X"]` | 컬렉션 식별 칩 |
| `.inv-cell[data-r="X"]` | 인벤토리 셀 (aspect-ratio 1) |
| `.item-sparkle` | Legendary 위에 떠다니는 점 (애니메이션) |
| `.pity-gauge-fill` | 가챠 천장 게이지 (pulse 애니메이션) |
| `.item-icon-{sm|md|lg|xl|2xl}` | SVG 크기 유틸 (40/64/120/160/200px) |

#### 1.8.3 tokens.css에 import 추가

```css
/* packages/tokens/css/tokens.css 마지막에 추가 */

/* Item domain tokens (Skywork v4) */
@import './items.css';
```

#### 1.8.4 Tailwind preset 확장

```javascript
// packages/tokens/tailwind.config.js 에 추가
import { collection } from './src/items';

export default {
  theme: {
    extend: {
      colors: {
        // 기존 brand/ink/neon... 유지
        // 컬렉션 컬러를 flat key로 (예: bg-col-neon-primary)
        'col-street-primary':   collection.STREET_CLASSIC.primary,
        'col-street-secondary': collection.STREET_CLASSIC.secondary,
        'col-neon-primary':     collection.NEON_SAIGON.primary,
        'col-neon-secondary':   collection.NEON_SAIGON.secondary,
        'col-tet-primary':      collection.TET_FESTIVAL.primary,
        'col-tet-secondary':    collection.TET_FESTIVAL.secondary,
        'col-mekong-primary':   collection.MEKONG_DELTA.primary,
        'col-mekong-secondary': collection.MEKONG_DELTA.secondary,
        'col-delivery-primary': collection.DELIVERY_HUSTLE.primary,
        'col-ghost-primary':    collection.SAIGON_GHOST.primary,
        'col-ghost-secondary':  collection.SAIGON_GHOST.secondary,
        'col-legend-primary':   collection.LEGEND_OF_SAIGON.primary,
        'col-legend-secondary': collection.LEGEND_OF_SAIGON.secondary,
      },
      keyframes: {
        // 기존 mythic-shimmer/pity-pulse 유지
        'item-mythic-spin': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'item-sparkle-pulse': {
          '0%, 100%': { opacity: 1,   transform: 'scale(1)' },
          '50%':      { opacity: 0.3, transform: 'scale(0.4)' },
        },
      },
      animation: {
        'item-mythic-spin':   'item-mythic-spin 6s linear infinite',
        'item-sparkle-pulse': 'item-sparkle-pulse 2s ease-in-out infinite',
      },
    },
  },
};
```

---

## §2. 컴포넌트 24개 추출 (v1.0 19개 + v1.1 5개 신규)

### 2.1 PhoneFrame (모바일 프레임 — 시안용)

```typescript
// packages/ui/src/primitives/PhoneFrame.tsx
import type { ReactNode } from 'react';

export interface PhoneFrameProps {
  children: ReactNode;
  label?: string;
}

export function PhoneFrame({ children, label }: PhoneFrameProps) {
  return (
    <div className="phone-frame-wrapper">
      {label && <span className="screen-label">{label}</span>}
      <div className="phone-frame">
        {/* Dynamic Island */}
        <div className="dynamic-island" />
        <div className="phone-screen">{children}</div>
      </div>
    </div>
  );
}

// 클래스 정의 (Tailwind 미적용 시 raw CSS)
// .phone-frame {
//   width: 393px; height: 852px;
//   border-radius: 56px;
//   background: var(--ink-900);
//   padding: 12px;
//   box-shadow: 0 0 0 1.5px rgba(0,0,0,.1), 0 30px 80px rgba(0,0,0,.15);
// }
// .phone-screen { width:100%; height:100%; border-radius:44px; overflow:hidden; }
```

### 2.2 RarityCard (등급별 카드 베이스 — 가장 많이 쓰임) ⭐ v1.1 UPDATE

v1.0과 호환되며, **surface 모드 prop**과 **MythicCardOverlay 통합**이 추가됨.

```typescript
// packages/ui/src/game/RarityCard.tsx
import { type ReactNode } from 'react';
import type { Rarity } from '@saigon-rider/tokens';
import { MythicCardOverlay } from './MythicCardOverlay';
import { ItemSparkle } from './ItemSparkle';

export interface RarityCardProps {
  rarity: Rarity;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  spotlight?: boolean;
  className?: string;
  /**
   * v1.1 신규: surface 모드
   * - 'light': 앱 chrome 위 (라이트 surface, §1.1 토큰) — 인벤토리/도감
   * - 'dark':  게임 카드 위 (다크 surface, §1.8 Skywork 토큰) — 가챠 결과/상점
   */
  surface?: 'light' | 'dark';
}

export function RarityCard({
  rarity, children, size = 'md', spotlight, className,
  surface = 'light',
}: RarityCardProps) {
  const sizeClasses = {
    sm: 'p-2 rounded-xl',
    md: 'p-3 rounded-2xl',
    lg: 'p-4 rounded-3xl',
  }[size];

  // surface=dark → Skywork .item-card[data-r] 클래스 사용
  // surface=light → 기존 v1.0 .rarity-card[data-r] 사용
  const baseClass = surface === 'dark' ? 'item-card' : 'rarity-card';

  return (
    <div
      data-r={rarity}
      className={`${baseClass} relative overflow-hidden ${sizeClasses} ${className ?? ''} ${
        spotlight && rarity === 'M' ? 'scale-[1.18]' : ''
      } ${spotlight && rarity === 'L' ? 'scale-[1.07]' : ''}`}
    >
      {/* Mythic 다크 카드는 conic-gradient 회전 오버레이 (Skywork CSS의 ::before) */}
      {surface === 'dark' && rarity === 'M' && <MythicCardOverlay />}

      {/* Legendary 다크 카드는 sparkle 4개 (Skywork .item-sparkle) */}
      {surface === 'dark' && rarity === 'L' && (
        <>
          <ItemSparkle style={{ top: 12,  left: 16  }} />
          <ItemSparkle style={{ top: 24,  right: 20 }} delay={0.5} />
          <ItemSparkle style={{ bottom: 30, left: 28 }} delay={1.0} />
          <ItemSparkle style={{ bottom: 16, right: 14 }} delay={1.5} />
        </>
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
}

// 라이트 surface CSS (v1.0 그대로):
// .rarity-card[data-r="C"] { background: var(--r-c-bg); border: 1.5px solid var(--r-c-border); }
// .rarity-card[data-r="R"] { background: var(--r-r-bg); border: 1.5px solid var(--r-r-border); box-shadow: 0 8px 24px var(--r-r-glow); }
// .rarity-card[data-r="E"] { ... }
// .rarity-card[data-r="L"] { ... }
// .rarity-card[data-r="M"] { ... }

// 다크 surface CSS (v1.1 추가 — Skywork .item-card 그대로 사용. items.css 참고):
// .item-card[data-r="M"]::before { content:''; position:absolute; inset:-50%; ... }
// .item-card[data-r="M"]::before { animation: item-mythic-spin 6s linear infinite; }
```

**사용 예**:
```tsx
{/* 인벤토리 도감 — 라이트 모드 */}
<RarityCard rarity="L" size="md">  {/* surface 디폴트 = light */}
  <ItemSvgRenderer itemCode="HELMET_SAIGON_GHOST_L_01" />
  <div>Midnight Mayor</div>
</RarityCard>

{/* 가챠 결과 화면 — 다크 모드 + Mythic spotlight */}
<RarityCard rarity="M" surface="dark" spotlight size="lg">
  <ItemSvgRenderer itemCode="HELMET_LEGEND_OF_SAIGON_M_01" />
</RarityCard>
```



### 2.3 RarityChip (등급 라벨)

```typescript
// packages/ui/src/game/RarityChip.tsx
import type { Rarity } from '@saigon-rider/tokens';

const LABEL: Record<Rarity, string> = {
  C: 'COMMON',
  R: 'RARE',
  E: 'EPIC',
  L: 'LEGENDARY',
  M: 'MYTHIC',
};

export function RarityChip({
  rarity,
  short = false,
}: { rarity: Rarity; short?: boolean }) {
  return (
    <span data-r={rarity} className="rarity-chip">
      {short ? rarity : LABEL[rarity]}
    </span>
  );
}

// CSS:
// .rarity-chip {
//   font: 700 10px/1 'Space Grotesk', sans-serif;
//   letter-spacing: 6%;
//   text-transform: uppercase;
//   padding: 5px 8px;
//   border-radius: 6px;
//   color: white;
//   display: inline-block;
// }
// .rarity-chip[data-r="C"] { background: var(--r-c-fill); color: var(--text); }
// .rarity-chip[data-r="R"] { background: var(--r-r-grad); }
// .rarity-chip[data-r="E"] { background: var(--r-e-grad); }
// .rarity-chip[data-r="L"] { background: var(--r-l-grad); text-shadow: 0 1px 2px rgba(0,0,0,.3); }
// .rarity-chip[data-r="M"] {
//   background: var(--r-m-grad);
//   background-size: 200% 200%;
//   animation: mythic-shimmer 3s linear infinite;
// }
```

### 2.4 CurrencyBadge (GP/GC 표기 — 항상 동일)

```typescript
// packages/ui/src/game/CurrencyBadge.tsx
import { Icon3D } from '../primitives/Icon3D';

export type Currency = 'GP' | 'GC';

const ICON: Record<Currency, string> = {
  GP: '1fa99',      // 코인
  GC: '1f48e',      // 보석
};

const COLOR: Record<Currency, string> = {
  GP: '#B45309',
  GC: '#6D28D9',
};

export function CurrencyBadge({
  currency, amount, size = 'md',
}: {
  currency: Currency;
  amount: number | string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const iconSize = { sm: 16, md: 20, lg: 28 }[size];
  const fontSize = { sm: 13, md: 16, lg: 22 }[size];

  return (
    <span className="currency inline-flex items-center gap-1.5">
      <Icon3D hex={ICON[currency]} size={iconSize} />
      <span
        className="amt font-mono font-bold tabular-nums"
        style={{ fontSize, color: COLOR[currency], letterSpacing: '-0.02em' }}
      >
        {typeof amount === 'number' ? amount.toLocaleString() : amount}
      </span>
      <span
        className="unit font-mono font-bold opacity-60 uppercase"
        style={{ fontSize: fontSize * 0.7, letterSpacing: '6%' }}
      >
        {currency}
      </span>
    </span>
  );
}
```

### 2.5 PityBar (가챠 천장 게이지)

```typescript
// packages/ui/src/game/PityBar.tsx
export interface PityBarProps {
  current: number;
  max: number;
  showLabel?: boolean;
  guaranteeRarity?: 'E' | 'L' | 'M';
}

export function PityBar({ current, max, showLabel, guaranteeRarity = 'L' }: PityBarProps) {
  const pct = Math.min(100, (current / max) * 100);
  const isNear = pct >= 80;
  const remaining = max - current;

  return (
    <div className="w-full">
      <div className="pity-bar">
        <div
          className="pity-bar-fill"
          data-near={isNear}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex justify-between text-[10px] font-mono text-text-3">
          <span>{current} / {max}</span>
          <span>
            {guaranteeRarity} 보장까지 {remaining}회
          </span>
        </div>
      )}
    </div>
  );
}

// CSS:
// .pity-bar { height:8px; border-radius:4px; background:rgba(255,255,255,.08); overflow:hidden; }
// .pity-bar-fill { height:100%; border-radius:inherit;
//                  background:linear-gradient(90deg, var(--brand-300), var(--brand-500)); }
// .pity-bar-fill[data-near="true"] { animation: pity-pulse 1.5s ease-in-out infinite; }
```

### 2.6 GachaCardBack (가챠 뒷면)

```typescript
// packages/ui/src/game/GachaCardBack.tsx
export function GachaCardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = {
    sm: { w: 60, h: 80 },
    md: { w: 90, h: 120 },
    lg: { w: 140, h: 186 },
  }[size];

  return (
    <div
      className="gacha-card-back"
      style={{
        width: dimensions.w,
        height: dimensions.h,
      }}
    >
      {/* Conic glow effect */}
      <div className="absolute inset-2 rounded-lg gacha-back-glow" />
      {/* SR monogram */}
      <div className="gacha-back-monogram">SR</div>
    </div>
  );
}

// CSS:
// .gacha-card-back {
//   border-radius: 20px;
//   background:
//     radial-gradient(at 50% 30%, rgba(255,90,31,.2), transparent 50%),
//     repeating-linear-gradient(135deg, #1A1D2A 0px, #1A1D2A 8px, #11131C 8px, #11131C 16px);
//   border: 2px solid rgba(255,255,255,.08);
//   position: relative;
//   overflow: hidden;
//   box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 20px 50px rgba(0,0,0,.3);
// }
// .gacha-back-glow {
//   background: conic-gradient(from 0deg, transparent 0deg, rgba(0,240,255,.3) 60deg,
//               transparent 120deg, rgba(255,45,156,.3) 240deg, transparent 300deg);
//   opacity: .4;
//   filter: blur(8px);
// }
// .gacha-back-monogram {
//   position: absolute; inset: 0;
//   display: flex; align-items: center; justify-content: center;
//   font: 700 48px/1 'Space Grotesk';
//   color: rgba(255,255,255,.06);
//   letter-spacing: -0.04em;
// }
```

### 2.7 Icon3D (Notion Emoji 3D, onerror 폴백 포함)

```typescript
// packages/ui/src/primitives/Icon3D.tsx
export interface Icon3DProps {
  hex: string;            // 예: '1f3c6' for Trophy
  size?: number;
  className?: string;
  glow?: string;          // 'amber' | 'cyan' | 'pink' | string (color)
}

const GLOW_FILTERS: Record<string, string> = {
  amber: 'drop-shadow(0 8px 16px rgba(255,184,0,.5)) drop-shadow(0 0 32px rgba(255,184,0,.3))',
  cyan:  'drop-shadow(0 8px 16px rgba(0,240,255,.5))',
  pink:  'drop-shadow(0 8px 16px rgba(255,45,156,.5))',
  brand: 'drop-shadow(0 8px 16px rgba(255,90,31,.3))',
};

export function Icon3D({ hex, size = 48, className, glow }: Icon3DProps) {
  const url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.gif`;
  const filter = glow ? GLOW_FILTERS[glow] ?? glow : undefined;

  return (
    <img
      src={url}
      width={size}
      height={size}
      alt=""
      className={className}
      style={{ filter, objectFit: 'contain' }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

// 자주 쓰는 hex 코드 모음 (별도 const export 권장)
export const EMOJI = {
  TROPHY:    '1f3c6',
  STAR:      '2b50',
  GEM:       '1f48e',
  COIN:      '1fa99',
  HELMET:    '26d1',    // ⛑ 아니 motorcycle_helmet 안 함, 대신 motorcycle 1f3cd
  MOTORCYCLE:'1f3cd',
  FIRE:      '1f525',
  PARTY:     '1f389',
  SPARKLES:  '2728',
  DRAGON:    '1f409',
  MOON:      '1f319',
  BELL:      '1f514',
  GEAR:      '2699',
  LOCKED:    '1f512',
  CITY:      '1f3d9',
  COFFEE:    '2615',
  SATELLITE: '1f6f0',
  CAMERA:    '1f4f7',
  WARN:      '26a0',
  CHECK:     '2705',
  CLOCK:     '23f0',
} as const;
```

### 2.8 PhotoFrame (이미지 + 폴백)

```typescript
// packages/ui/src/primitives/PhotoFrame.tsx
import { useState } from 'react';

export interface PhotoFrameProps {
  src: string;
  seed?: string;          // picsum 폴백 seed
  width: number;
  height: number;
  className?: string;
  filter?: 'saturate' | 'none';
}

export function PhotoFrame({
  src, seed, width, height, className, filter = 'saturate',
}: PhotoFrameProps) {
  const [errored, setErrored] = useState(false);
  const fallbackUrl = `https://picsum.photos/seed/${seed ?? 'saigon'}/${width}/${height}`;

  return (
    <img
      src={errored ? fallbackUrl : src}
      width={width}
      height={height}
      alt=""
      className={`photo ${className ?? ''}`}
      style={{
        borderRadius: 20,
        filter: filter === 'saturate' ? 'saturate(1.15) contrast(1.05)' : undefined,
        objectFit: 'cover',
        backgroundColor: 'var(--surface-2)',
      }}
      onError={() => setErrored(true)}
    />
  );
}
```

### 2.9 ProgressRing (라이딩 HUD)

```typescript
// packages/ui/src/game/ProgressRing.tsx
export interface ProgressRingProps {
  progress: number;       // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  glowColor?: string;
  children?: ReactNode;
}

export function ProgressRing({
  progress, size = 270, strokeWidth = 12,
  color = 'var(--neon-cyan)',
  glowColor = 'rgba(0,240,255,.6)',
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Glow behind ring */}
      <div
        className="absolute"
        style={{
          width: size * 1.3,
          height: size * 1.3,
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 60%)`,
          filter: 'blur(30px)',
        }}
      />
      <svg width={size} height={size} className="absolute -rotate-90">
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 12px ${color})` }}
        />
        {/* End dot */}
        <circle
          cx={size / 2 + radius * Math.cos(2 * Math.PI * progress / 100 - Math.PI / 2)}
          cy={size / 2 + radius * Math.sin(2 * Math.PI * progress / 100 - Math.PI / 2)}
          r={8}
          fill="white"
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div className="relative z-10 text-center">{children}</div>
    </div>
  );
}
```

### 2.10 ConfettiLayer (가챠 결과 + 클리어 화면)

```typescript
// packages/ui/src/game/ConfettiLayer.tsx
import { useMemo } from 'react';

export interface ConfettiLayerProps {
  density?: 'sparse' | 'normal' | 'dense';   // 20 / 40 / 60개
  area?: 'top' | 'all';
  seed?: number;
}

const COLORS = [
  '#FF5A1F', '#00F0FF', '#B6FF1C', '#FFB800', '#FF2D9C', '#8B5CF6', '#FFFFFF',
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function ConfettiLayer({
  density = 'normal', area = 'top', seed = 42,
}: ConfettiLayerProps) {
  const count = { sparse: 20, normal: 40, dense: 60 }[density];

  const items = useMemo(() => {
    const rand = seededRandom(seed);
    return Array.from({ length: count }, (_, i) => {
      const isRect = rand() > 0.4;
      const color = COLORS[Math.floor(rand() * COLORS.length)];
      const x = rand() * 100;
      const y = rand() * (area === 'top' ? 40 : 100);
      const rotation = (rand() - 0.5) * 120;
      const sizeBase = 3 + rand() * 4;
      return {
        key: i, isRect, color, x, y, rotation,
        w: isRect ? sizeBase : sizeBase * 1.4,
        h: isRect ? sizeBase * 2.5 : sizeBase * 1.4,
        opacity: 0.6 + rand() * 0.4,
      };
    });
  }, [count, area, seed]);

  return (
    <svg
      className="absolute top-0 left-0 w-full pointer-events-none z-[2]"
      style={{ height: area === 'top' ? '46%' : '100%' }}
      viewBox={`0 0 393 ${area === 'top' ? 390 : 852}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {items.map(c =>
        c.isRect ? (
          <rect
            key={c.key}
            x={c.x * 3.93} y={c.y * 3.9}
            width={c.w} height={c.h} rx={1}
            fill={c.color} opacity={c.opacity}
            transform={`rotate(${c.rotation},${c.x*3.93+c.w/2},${c.y*3.9+c.h/2})`}
          />
        ) : (
          <circle
            key={c.key}
            cx={c.x * 3.93} cy={c.y * 3.9}
            r={c.w / 2}
            fill={c.color} opacity={c.opacity}
          />
        )
      )}
    </svg>
  );
}
```

### 2.11~2.19 나머지 9개 컴포넌트 (압축 사양)

다음 컴포넌트들은 위와 동일한 구조로 추출. 핵심 API와 CSS만 명시:

```typescript
// 2.11 BentoCell — Bento 그리드 셀
<BentoCell label="LIFETIME KM" size="lg|md|sm" value="248" emoji="1f3cd" />

// 2.12 PrimaryCTA — 메인 CTA (--brand-500 + shadow-pop + 양각)
<PrimaryCTA onClick={...} fullWidth disabled>퀘스트 시작 →</PrimaryCTA>
// height:60, radius:20, font:700 16px, shadow-pop,
// ::before linear-gradient(180deg, rgba(255,255,255,.25) 0%, transparent 50%)

// 2.13 GlassButton — 글래스 모피즘 버튼
<GlassButton dark size="md">PAUSE</GlassButton>
// background: rgba(17,19,28,.55); backdrop-filter: blur(24px) saturate(180%);
// border: 1px solid rgba(255,255,255,.08);

// 2.14 SerifItalic — Instrument Serif italic 한 줄
<SerifItalic>Tonight, Saigon belonged to you.</SerifItalic>
// font-family: 'Instrument Serif', serif; font-style: italic;

// 2.15 MicroLabel — mono uppercase 마이크로
<MicroLabel>TONIGHT'S QUEST</MicroLabel>
// font: 700 11px/1 'Space Grotesk'; letter-spacing: 6%; text-transform: uppercase;

// 2.16 TopBar — 상단 헤더 (← 백 + 제목 + 우측 액션)
<TopBar
  onBack={() => router.back()}
  title="설정"
  right={<Icon3D hex={EMOJI.GEAR} />}
/>

// 2.17 BottomTabBar — 하단 5탭 (4탭 + 중앙 FAB)
<BottomTabBar
  active="home"
  items={[
    { id:'home', label:'월드', icon: ... },
    { id:'quest', label:'퀘스트', icon: ... },
    { id:'fab', label:'', isFab: true, onClick: startRide },
    { id:'feed', label:'피드', icon: ... },
    { id:'profile', label:'프로필', icon: ... },
  ]}
/>

// 2.18 NeonGlow — 글로우 헬퍼 (자식 위에 색 글로우)
<NeonGlow color="cyan" size={40} blur={30}>...</NeonGlow>

// 2.19 NoiseTexture — 그라데이션 위 노이즈
<NoiseTexture opacity={0.4} />
// SVG turbulence base64 inline, mix-blend-mode: overlay
```

---

### 2.20 ⭐ CollectionChip (NEW v1.1)

컬렉션 식별 칩. Skywork `.col-chip[data-col="X"]` 그대로.

```typescript
// packages/ui/src/game/CollectionChip.tsx
import type { CollectionCode } from '@saigon-rider/tokens';

const LABEL: Record<CollectionCode, string> = {
  STREET_CLASSIC:    'Street Classic',
  NEON_SAIGON:       'Neon Saigon',
  TET_FESTIVAL:      'Tết Festival',
  MEKONG_DELTA:      'Mekong Delta',
  DELIVERY_HUSTLE:   'Delivery Hustle',
  SAIGON_GHOST:      'Saigon Ghost',
  LEGEND_OF_SAIGON:  'Legend of Saigon',
};

export interface CollectionChipProps {
  collection: CollectionCode;
  size?: 'sm' | 'md';
}

export function CollectionChip({ collection, size = 'md' }: CollectionChipProps) {
  return (
    <span data-col={collection} className={`col-chip ${size === 'sm' ? 'text-[9px]' : ''}`}>
      {LABEL[collection]}
    </span>
  );
}

// CSS는 items.css 그대로 사용 — .col-chip[data-col="NEON_SAIGON"] 등 7개 정의됨
```

**사용 예**:
```tsx
<CollectionChip collection="NEON_SAIGON" />  // 마젠타 #FF2D9C 칩
<CollectionChip collection="TET_FESTIVAL" /> // 빨강 #DC2626 칩
```

---

### 2.21 ⭐ ItemSparkle (NEW v1.1)

Legendary 카드 위에 떠 있는 반짝이는 점. Skywork `.item-sparkle` 그대로.

```typescript
// packages/ui/src/game/ItemSparkle.tsx
import type { CSSProperties } from 'react';

export interface ItemSparkleProps {
  /** 위치 (top/left/right/bottom) */
  style?: CSSProperties;
  /** 애니메이션 시작 지연 (초) */
  delay?: number;
  /** sparkle 색상 (디폴트 골드) */
  color?: string;
  /** 크기 (디폴트 6px) */
  size?: number;
}

export function ItemSparkle({
  style, delay = 0, color = '#FFB800', size = 6,
}: ItemSparkleProps) {
  return (
    <span
      className="item-sparkle"
      style={{
        ...style,
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 ${size * 1.3}px ${size * 0.5}px ${color}80`,
        animationDelay: `${delay}s`,
        position: 'absolute',
      }}
    />
  );
}

// CSS는 items.css의 .item-sparkle + @keyframes item-sparkle-pulse 사용
```

**사용 예** (RarityCard 안에서 surface=dark + L 등급일 때 자동 배치):
```tsx
<ItemSparkle style={{ top: 12, left: 16 }} />
<ItemSparkle style={{ top: 24, right: 20 }} delay={0.5} />
```

---

### 2.22 ⭐ InventoryCell (NEW v1.1)

인벤토리 그리드 / 가챠 결과 그리드의 정사각 셀. Skywork `.inv-cell[data-r]` 그대로.

```typescript
// packages/ui/src/game/InventoryCell.tsx
import { type ReactNode } from 'react';
import type { Rarity } from '@saigon-rider/tokens';
import { MythicCardOverlay } from './MythicCardOverlay';

export interface InventoryCellProps {
  rarity: Rarity;
  children: ReactNode;
  empty?: boolean;
  locked?: boolean;
  onClick?: () => void;
  className?: string;
}

export function InventoryCell({
  rarity, children, empty, locked, onClick, className,
}: InventoryCellProps) {
  return (
    <button
      data-r={rarity}
      onClick={onClick}
      disabled={empty || locked}
      className={`inv-cell ${empty ? 'opacity-30' : ''} ${className ?? ''}`}
    >
      {rarity === 'M' && !empty && <MythicCardOverlay variant="subtle" />}
      <div className="relative z-10">{children}</div>
      {locked && (
        <div className="absolute inset-0 bg-black/60 grid place-items-center text-white">
          🔒
        </div>
      )}
    </button>
  );
}

// CSS는 items.css의 .inv-cell[data-r="X"] (aspect-ratio:1 + 등급별 보더 글로우) 사용
```

**사용 예**:
```tsx
<div className="grid grid-cols-4 gap-2">
  {items.map(item => (
    <InventoryCell key={item.id} rarity={item.rarity}>
      <ItemSvgRenderer itemCode={item.code} size={64} />
    </InventoryCell>
  ))}
</div>
```

---

### 2.23 ⭐ ItemSvgRenderer (NEW v1.1)

SVG sprite의 아이템을 `<use>`로 호출하는 래퍼. RN/Web 분기 처리.

```typescript
// packages/ui/src/game/ItemSvgRenderer.tsx (Web 버전)
export interface ItemSvgRendererProps {
  itemCode: string;        // 예: 'HELMET_LEGEND_OF_SAIGON_M_01'
  size?: number;           // 디폴트 80
  rarity?: 'C' | 'R' | 'E' | 'L' | 'M';  // drop-shadow filter용
  className?: string;
}

export function ItemSvgRenderer({
  itemCode, size = 80, rarity, className,
}: ItemSvgRendererProps) {
  const filterClass = rarity ? `item-r-${rarity.toLowerCase()}` : '';

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`${filterClass} ${className ?? ''}`}
    >
      <use href={`#item-${itemCode}`} />
    </svg>
  );
}

// 사용 전제: HTML 어딘가에 saigon-rider-items.svg sprite가 inline embed되어 있거나,
//          빌드 시 dist/index.html에 자동 inject되어야 함.
//          또는 <use href="/assets/saigon-rider-items.svg#item-XXX"/> 외부 참조.
```

```typescript
// packages/ui/src/game/ItemSvgRenderer.native.tsx (RN 버전)
// React Native는 외부 SVG sprite + use를 직접 지원 안 함.
// → react-native-svg + 빌드 타임 transform 또는 inline SVG로 변환

import { SvgFromXml } from 'react-native-svg';
import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

// 빌드 타임에 sprite를 파싱해서 itemCode → SVG xml 매핑을 미리 생성
import itemSvgMap from '@saigon-rider/items/dist/item-xml-map.json';

export function ItemSvgRenderer({ itemCode, size = 80 }: ItemSvgRendererProps) {
  const xml = itemSvgMap[itemCode];
  if (!xml) return null;
  return <SvgFromXml xml={xml} width={size} height={size} />;
}

// 빌드 스크립트 (packages/items/build.mjs):
// 1. saigon-rider-items.svg 파싱
// 2. defs (gradients/filters) 추출 후 모든 item에 prepend
// 3. 각 <symbol id="item-XXX">을 standalone <svg>로 변환
// 4. itemCode → svgXml dict를 item-xml-map.json으로 저장
```

**사용 예**:
```tsx
{/* Web */}
<ItemSvgRenderer itemCode="HELMET_LEGEND_OF_SAIGON_M_01" size={120} rarity="M" />

{/* RN — 동일한 API */}
<ItemSvgRenderer itemCode="HELMET_LEGEND_OF_SAIGON_M_01" size={120} rarity="M" />
```

---

### 2.24 ⭐ MythicCardOverlay (NEW v1.1)

Mythic 등급 카드 뒤에서 회전하는 conic-gradient 오버레이. Skywork `.item-card[data-r="M"]::before` 그대로.

```typescript
// packages/ui/src/game/MythicCardOverlay.tsx
export interface MythicCardOverlayProps {
  variant?: 'full' | 'subtle';   // subtle은 InventoryCell용 (더 약함)
}

export function MythicCardOverlay({ variant = 'full' }: MythicCardOverlayProps) {
  const opacity = variant === 'subtle' ? 0.5 : 1;

  return (
    <span
      aria-hidden
      className="absolute pointer-events-none animate-item-mythic-spin"
      style={{
        inset: '-50%',
        borderRadius: '50%',
        opacity,
        background:
          'conic-gradient(from 0deg, rgba(255,45,156,.15), rgba(255,116,56,.10), rgba(255,184,0,.12), rgba(0,240,255,.12), rgba(182,255,28,.10), rgba(139,92,246,.15), rgba(255,45,156,.15))',
      }}
    />
  );
}

// RN 버전: react-native-svg로 conic-gradient 직접 구현 (RN은 conic-gradient 미지원)
// 또는 4~6장의 회전하는 linear-gradient mask로 근사
```

**사용**: `RarityCard` / `InventoryCell` 내부에서 자동 호출. 직접 호출할 일은 거의 없음.

---


## §3. RN ↔ Web 호환성 처리

### 3.1 NativeWind로 통합

```javascript
// apps/mobile/tailwind.config.js
import preset from '@saigon-rider/tokens/tailwind.config';

export default {
  presets: [preset],
  content: ['./app/**/*.{js,jsx,ts,tsx}', '../../packages/ui/src/**/*.{tsx,ts}'],
};
```

```typescript
// packages/ui/src/game/RarityCard.tsx (RN-호환 버전)
import { View } from 'react-native';
import { styled } from 'nativewind';

const StyledView = styled(View);

export function RarityCard({ rarity, children }: RarityCardProps) {
  return (
    <StyledView
      className={`rounded-2xl p-3 ${rarityClasses[rarity]}`}
    >
      {children}
    </StyledView>
  );
}

const rarityClasses = {
  C: 'bg-r-c-bg border border-r-c-border',
  R: 'bg-r-r-bg border border-r-r-border shadow-md',
  E: 'bg-r-e-bg border-2 border-r-e-border shadow-lg',
  L: 'bg-r-l-bg border-2 border-r-l-fill shadow-2xl',
  M: 'bg-white border-2 shadow-2xl',  // Mythic은 그라데이션 보더는 별도
};
```

### 3.2 웹 전용 효과 (RN에서 지원 안 됨)

| 효과 | Web | RN 대안 |
|---|---|---|
| `backdrop-filter: blur` | ✓ | `<BlurView>` (Expo) |
| `conic-gradient` | ✓ | `react-native-svg`로 직접 그림 |
| `filter: drop-shadow` | ✓ | `shadowColor + shadowOffset` 또는 SVG filter |
| `mix-blend-mode` | ✓ | RN에선 무시 (fallback to opacity) |
| CSS `@keyframes` | ✓ | `react-native-reanimated` 사용 |

```typescript
// 예: Mythic shimmer (RN)
import Animated, { useAnimatedStyle, withRepeat, withTiming, useSharedValue } from 'react-native-reanimated';

export function MythicShimmer({ children }) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withRepeat(withTiming(1, { duration: 3000 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value * 100 }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
```

---

## §4. Storybook 설정 (선택적이지만 권장)

```typescript
// packages/ui/stories/RarityCard.stories.tsx
import { RarityCard, RarityChip } from '@saigon-rider/ui';

export default {
  title: 'Game/RarityCard',
  component: RarityCard,
};

export const AllRarities = () => (
  <div className="grid grid-cols-5 gap-4 p-8">
    {(['C', 'R', 'E', 'L', 'M'] as const).map(r => (
      <RarityCard key={r} rarity={r}>
        <RarityChip rarity={r} />
        <div className="mt-2 text-center font-bold">Sample Item</div>
      </RarityCard>
    ))}
  </div>
);

export const MythicSpotlight = () => (
  <RarityCard rarity="M" spotlight>
    <div>Dragon Skin Limited</div>
  </RarityCard>
);
```

```bash
# Storybook 실행
pnpm --filter @saigon-rider/ui storybook
```

---

## §5. 추출 자동화 스크립트 (선택)

screens_v3_rpg.html에서 사용된 클래스를 자동 추출:

```javascript
// scripts/extract-classes.mjs
import { readFileSync } from 'fs';

const html = readFileSync('screens_v3_rpg.html', 'utf-8');

// CSS 변수 추출
const cssVars = [...html.matchAll(/--[\w-]+:\s*[^;]+/g)]
  .map(m => m[0])
  .filter((v, i, a) => a.indexOf(v) === i);

// 클래스 추출
const classes = [...html.matchAll(/class="([^"]+)"/g)]
  .flatMap(m => m[1].split(/\s+/))
  .filter((v, i, a) => a.indexOf(v) === i);

console.log('CSS Variables:', cssVars.length);
console.log('Unique Classes:', classes.length);
console.log(classes.sort());
```

---

## §6. 적용 체크리스트

토큰 패키지 완성 후 다음 확인:

**v1.0 항목**
- [ ] `import { brand, rarity } from '@saigon-rider/tokens'`이 작동하는가
- [ ] `tokens.css`를 import하면 모든 CSS 변수가 적용되는가
- [ ] Tailwind `bg-r-l`, `text-brand-500` 같은 유틸리티가 작동하는가
- [ ] NativeWind에서도 같은 클래스가 작동하는가 (RN 환경)
- [ ] Storybook에서 19개 컴포넌트가 모두 렌더링되는가
- [ ] `<RarityCard rarity="M" spotlight>`가 Mythic shimmer 애니메이션과 함께 보이는가
- [ ] `<CurrencyBadge currency="GC" amount={240} />`가 보석 아이콘과 함께 보라색으로 보이는가
- [ ] `<PityBar current={87} max={100} showLabel />`가 펄스 애니메이션을 보여주는가

**⭐ v1.1 신규 항목**
- [ ] `import { collection, itemRarityFx } from '@saigon-rider/tokens'`이 작동하는가
- [ ] `items.css`가 `tokens.css` 안에서 자동 import되는가
- [ ] Tailwind `bg-col-neon-primary`, `text-col-tet-secondary` 같은 컬렉션 유틸리티가 작동하는가
- [ ] `<RarityCard rarity="M" surface="dark">`가 conic-gradient 회전 오버레이를 보여주는가
- [ ] `<RarityCard rarity="L" surface="dark">`가 4개 sparkle 펄스 애니메이션을 보여주는가
- [ ] `<CollectionChip collection="NEON_SAIGON">`이 마젠타 #FF2D9C 칩으로 렌더되는가
- [ ] `<InventoryCell rarity="E">`가 보라 글로우 보더를 보여주는가
- [ ] `<ItemSvgRenderer itemCode="HELMET_LEGEND_OF_SAIGON_M_01" size={120} rarity="M" />`가 SVG sprite에서 아이템을 로드하고 drop-shadow filter를 적용하는가
- [ ] Storybook에 신규 5개 컴포넌트 (CollectionChip, ItemSparkle, InventoryCell, ItemSvgRenderer, MythicCardOverlay) 스토리가 추가됐는가

---

## §7. ⭐ Skywork 자산 통합 가이드 (NEW v1.1)

### 7.1 자산 파일 2개를 어디에 두는가

```
saigon-rider/                                  ← 모노레포 루트
└── packages/
    ├── tokens/
    │   └── css/
    │       └── items.css            ← 1. Skywork CSS (10KB)
    │
    └── items/                       ← 2. 새 패키지 (sprite + 메타)
        ├── package.json
        ├── sprite/
        │   └── saigon-rider-items.svg     ← Skywork SVG (98KB)
        ├── src/
        │   ├── metadata.ts          ← 27개 아이템 메타 (코드/이름/슬롯 등)
        │   ├── catalog.json
        │   └── index.ts
        └── build.mjs                ← (RN용) sprite → item-xml-map.json 생성
```

### 7.2 `@saigon-rider/items` 패키지 정의

```json
// packages/items/package.json
{
  "name": "@saigon-rider/items",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".":           "./src/index.ts",
    "./sprite":    "./sprite/saigon-rider-items.svg",
    "./xml-map":   "./dist/item-xml-map.json"
  },
  "scripts": {
    "build": "node build.mjs"
  }
}
```

### 7.3 metadata.ts (27개 아이템 카탈로그)

```typescript
// packages/items/src/metadata.ts
export type ItemSlot =
  | 'HELMET' | 'JACKET' | 'GLOVES' | 'BOOTS' | 'EYEWEAR' | 'NAMEPLATE'
  | 'BODY_PAINT' | 'WHEEL' | 'EXHAUST' | 'HEADLIGHT' | 'MIRROR' | 'DECAL'
  | 'NUMBER' | 'FRAME' | 'BACKDROP' | 'TITLE' | 'TRAIL' | 'HORN' | 'START_ANIM';

export type ItemRarity = 'C' | 'R' | 'E' | 'L' | 'M';

export type CollectionCode =
  | 'STREET_CLASSIC' | 'NEON_SAIGON' | 'TET_FESTIVAL' | 'MEKONG_DELTA'
  | 'DELIVERY_HUSTLE' | 'SAIGON_GHOST' | 'LEGEND_OF_SAIGON';

export interface ItemMeta {
  num: number;          // 카탈로그 순번 1~30
  itemCode: string;     // 'HELMET_LEGEND_OF_SAIGON_M_01'
  name: string;         // 'Saigon Crown'
  slot: ItemSlot;
  collection: CollectionCode;
  rarity: ItemRarity;
  itemNum: string;      // '01', '02', '03' ...
}

export const ITEMS: ItemMeta[] = [
  { num:  1, itemCode: 'HELMET_STREET_CLASSIC_C_01', name: 'Daily Commuter',     slot: 'HELMET', collection: 'STREET_CLASSIC',    rarity: 'C', itemNum: '01' },
  { num:  2, itemCode: 'HELMET_NEON_SAIGON_R_03',     name: 'Cyber Bui Vien',    slot: 'HELMET', collection: 'NEON_SAIGON',       rarity: 'R', itemNum: '03' },
  { num:  3, itemCode: 'HELMET_TET_FESTIVAL_E_01',    name: 'Year of the Dragon',slot: 'HELMET', collection: 'TET_FESTIVAL',      rarity: 'E', itemNum: '01' },
  { num:  4, itemCode: 'HELMET_SAIGON_GHOST_L_01',    name: 'Midnight Mayor',    slot: 'HELMET', collection: 'SAIGON_GHOST',      rarity: 'L', itemNum: '01' },
  { num:  5, itemCode: 'HELMET_LEGEND_OF_SAIGON_M_01',name: 'Saigon Crown',      slot: 'HELMET', collection: 'LEGEND_OF_SAIGON',  rarity: 'M', itemNum: '01' },
  { num:  6, itemCode: 'JACKET_STREET_CLASSIC_C_02',  name: 'Matte Rider',       slot: 'JACKET', collection: 'STREET_CLASSIC',    rarity: 'C', itemNum: '02' },
  { num:  7, itemCode: 'JACKET_NEON_SAIGON_E_02',     name: 'BuiVien Night',     slot: 'JACKET', collection: 'NEON_SAIGON',       rarity: 'E', itemNum: '02' },
  { num: 11, itemCode: 'BODY_PAINT_STREET_CLASSIC_C_03',   name: 'Pearl White Stock',     slot: 'BODY_PAINT', collection: 'STREET_CLASSIC',   rarity: 'C', itemNum: '03' },
  { num: 12, itemCode: 'BODY_PAINT_MEKONG_DELTA_R_04',     name: 'Bamboo Green',          slot: 'BODY_PAINT', collection: 'MEKONG_DELTA',     rarity: 'R', itemNum: '04' },
  { num: 13, itemCode: 'BODY_PAINT_DELIVERY_HUSTLE_E_02',  name: 'GrabExpress Tribute',   slot: 'BODY_PAINT', collection: 'DELIVERY_HUSTLE',  rarity: 'E', itemNum: '02' },
  { num: 14, itemCode: 'BODY_PAINT_SAIGON_GHOST_L_01',     name: 'Wraith Black',          slot: 'BODY_PAINT', collection: 'SAIGON_GHOST',     rarity: 'L', itemNum: '01' },
  { num: 15, itemCode: 'BODY_PAINT_LEGEND_OF_SAIGON_M_02', name: 'Saigon Sunset Wrap',    slot: 'BODY_PAINT', collection: 'LEGEND_OF_SAIGON', rarity: 'M', itemNum: '02' },
  { num: 16, itemCode: 'WHEEL_STREET_CLASSIC_C_01',        name: 'Standard Spoke',        slot: 'WHEEL', collection: 'STREET_CLASSIC',   rarity: 'C', itemNum: '01' },
  { num: 17, itemCode: 'WHEEL_NEON_SAIGON_E_01',           name: 'Neon Spoke 17',         slot: 'WHEEL', collection: 'NEON_SAIGON',      rarity: 'E', itemNum: '01' },
  { num: 18, itemCode: 'WHEEL_LEGEND_OF_SAIGON_L_01',      name: 'Imperial Gold',         slot: 'WHEEL', collection: 'LEGEND_OF_SAIGON', rarity: 'L', itemNum: '01' },
  { num: 19, itemCode: 'WHEEL_LEGEND_OF_SAIGON_M_01',      name: 'Dragon Wheel',          slot: 'WHEEL', collection: 'LEGEND_OF_SAIGON', rarity: 'M', itemNum: '01' },
  { num: 20, itemCode: 'DECAL_STREET_CLASSIC_C_02',        name: 'City Map Sticker',      slot: 'DECAL', collection: 'STREET_CLASSIC',   rarity: 'C', itemNum: '02' },
  { num: 21, itemCode: 'DECAL_TET_FESTIVAL_R_03',          name: 'Lantern Sticker',       slot: 'DECAL', collection: 'TET_FESTIVAL',     rarity: 'R', itemNum: '03' },
  { num: 22, itemCode: 'DECAL_SAIGON_GHOST_E_03',          name: 'Ghost Tag',             slot: 'DECAL', collection: 'SAIGON_GHOST',     rarity: 'E', itemNum: '03' },
  { num: 23, itemCode: 'DECAL_LEGEND_OF_SAIGON_M_01',      name: 'Dragon Skin Limited',   slot: 'DECAL', collection: 'LEGEND_OF_SAIGON', rarity: 'M', itemNum: '01' },
  { num: 24, itemCode: 'EXHAUST_SAIGON_GHOST_E_02',        name: 'Ghost Whisper',         slot: 'EXHAUST', collection: 'SAIGON_GHOST',   rarity: 'E', itemNum: '02' },
  { num: 25, itemCode: 'HEADLIGHT_TET_FESTIVAL_R_01',      name: 'Tết Lantern',           slot: 'HEADLIGHT', collection: 'TET_FESTIVAL', rarity: 'R', itemNum: '01' },
  { num: 26, itemCode: 'NAMEPLATE_LEGEND_OF_SAIGON_M_01',  name: 'Saigon Royalty',        slot: 'NAMEPLATE', collection: 'LEGEND_OF_SAIGON', rarity: 'M', itemNum: '01' },
  { num: 27, itemCode: 'TRAIL_NEON_SAIGON_E_01',           name: 'Cyber Trail',           slot: 'TRAIL', collection: 'NEON_SAIGON',      rarity: 'E', itemNum: '01' },
  { num: 28, itemCode: 'TRAIL_LEGEND_OF_SAIGON_M_01',      name: 'Rainbow Trail',         slot: 'TRAIL', collection: 'LEGEND_OF_SAIGON', rarity: 'M', itemNum: '01' },
  { num: 29, itemCode: 'START_ANIM_SAIGON_GHOST_L_01',     name: 'Phantom Boost',         slot: 'START_ANIM', collection: 'SAIGON_GHOST', rarity: 'L', itemNum: '01' },
  { num: 30, itemCode: 'TITLE_LEGEND_OF_SAIGON_L_01',      name: 'Saigon Mayor',          slot: 'TITLE', collection: 'LEGEND_OF_SAIGON', rarity: 'L', itemNum: '01' },
];

// 헬퍼 함수
export const itemByCode = (code: string) => ITEMS.find(i => i.itemCode === code);

export const itemsBySlot = (slot: ItemSlot) => ITEMS.filter(i => i.slot === slot);

export const itemsByCollection = (c: CollectionCode) =>
  ITEMS.filter(i => i.collection === c);

export const itemsByRarity = (r: ItemRarity) =>
  ITEMS.filter(i => i.rarity === r);
```

### 7.4 Sprite를 어떻게 페이지에 로드하는가

#### 7.4.1 Web (가장 간단)
```tsx
// apps/web/app/layout.tsx
import spriteUrl from '@saigon-rider/items/sprite';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {/* 페이지 첫 마운트 시 sprite를 한 번 inline embed */}
        <SpriteEmbed url={spriteUrl} />
        {children}
      </body>
    </html>
  );
}

function SpriteEmbed({ url }: { url: string }) {
  const [svg, setSvg] = useState<string>('');
  useEffect(() => { fetch(url).then(r => r.text()).then(setSvg); }, [url]);
  return <div hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

#### 7.4.2 React Native (변환 필요)
RN의 react-native-svg는 외부 `<use href="external.svg#id">`를 지원 안 함. 빌드 타임에 변환.

```javascript
// packages/items/build.mjs
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const svg = fs.readFileSync('./sprite/saigon-rider-items.svg', 'utf-8');
const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
const doc = dom.window.document;

// 1. <defs> 추출 (모든 아이템이 공유하는 gradient/filter)
const defs = doc.querySelector('defs')?.outerHTML || '';

// 2. 각 <symbol id="item-XXX">을 standalone <svg>로 변환
const xmlMap = {};
doc.querySelectorAll('symbol[id^="item-"]').forEach(symbol => {
  const code = symbol.id.replace(/^item-/, '');
  const viewBox = symbol.getAttribute('viewBox') || '0 0 200 200';
  const content = symbol.innerHTML;
  xmlMap[code] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs}${content}</svg>`;
});

fs.mkdirSync('./dist', { recursive: true });
fs.writeFileSync('./dist/item-xml-map.json', JSON.stringify(xmlMap, null, 2));
console.log(`✓ ${Object.keys(xmlMap).length} items extracted`);
```

```bash
cd packages/items
pnpm install jsdom -D
pnpm build  # → dist/item-xml-map.json 생성
```

이제 RN의 `ItemSvgRenderer`가 `import xmlMap from '@saigon-rider/items/xml-map'`로 사용 가능.

### 7.5 RarityCard surface 모드 선택 기준

| 화면 | surface | 이유 |
|---|---|---|
| INVENTORY-001 (도감) | `light` | 앱 chrome 위, 다른 라이트 카드들 사이 |
| SHOP-001 (상점 그리드) | `light` | 동일 |
| SHOP-002 (상품 상세) | `light` | 동일 |
| GACHA-HUB | `light` | 헤더 영역 |
| **GACHA-PULL-RESULT** | **`dark`** ⭐ | **다크 배경 spotlight + Mythic 회전 효과 핵심** |
| **GARAGE-001 / AVATAR-001 (장착화면)** | **`dark`** | **다크 게임 무드** |
| FEED 게시물 미리보기 | `light` | 일반 카드 |

### 7.6 Skywork 자산 라이선스 / 출처

- 출처: Skywork.ai v4 결과물 (자체 의뢰)
- 라이선스: 프로젝트 내부 사용 (Saigon Rider 앱)
- 27개 아이템 + 19개 베이스 SVG + 10개 데칼 토큰
- v1 출시까지 디자이너 1명이 213개로 확장 예정 (6주 작업)

---

(끝)

