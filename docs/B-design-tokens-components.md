# Saigon Rider — 디자인 토큰 + 컴포넌트 추출 가이드 v1.0

> 발행일: 2026-05-18
> 입력: screens_v3_rpg.html (36 화면) + screens v2 (27 화면)
> 출력: `@saigon-rider/tokens` 패키지 + `@saigon-rider/ui` 컴포넌트 19개

---

## 0. 산출물 구조

```
packages/
├── tokens/
│   ├── package.json
│   ├── src/
│   │   ├── colors.ts        # 브랜드/네온/등급/게임 통화
│   │   ├── typography.ts    # 폰트/크기/굵기
│   │   ├── spacing.ts       # 4/8/12/16/20/24/32
│   │   ├── radius.ts        # 4/8/12/16/20/24/28/32
│   │   ├── shadow.ts        # card/pop/inset
│   │   ├── gradient.ts      # sunset/night/mesh
│   │   ├── animation.ts     # mythic-shimmer/pity-pulse
│   │   └── index.ts         # re-export
│   ├── css/
│   │   └── tokens.css       # :root CSS variables
│   ├── tailwind.config.js   # Tailwind preset
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
    │   │   ├── RarityCard.tsx
    │   │   ├── RarityChip.tsx
    │   │   ├── CurrencyBadge.tsx
    │   │   ├── PityBar.tsx
    │   │   ├── GachaCardBack.tsx
    │   │   ├── ProgressRing.tsx
    │   │   └── ConfettiLayer.tsx
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

## §2. 컴포넌트 19개 추출

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

### 2.2 RarityCard (등급별 카드 베이스 — 가장 많이 쓰임)

```typescript
// packages/ui/src/game/RarityCard.tsx
import { type ReactNode } from 'react';
import type { Rarity } from '@saigon-rider/tokens';

export interface RarityCardProps {
  rarity: Rarity;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  spotlight?: boolean;  // 가챠 결과 화면에서 Mythic 강조용
  className?: string;
}

export function RarityCard({
  rarity, children, size = 'md', spotlight, className,
}: RarityCardProps) {
  const sizeClasses = {
    sm: 'p-2 rounded-xl',
    md: 'p-3 rounded-2xl',
    lg: 'p-4 rounded-3xl',
  }[size];

  return (
    <div
      data-r={rarity}
      className={`rarity-card relative overflow-hidden ${sizeClasses} ${className ?? ''} ${
        spotlight && rarity === 'M' ? 'animate-mythic-shimmer scale-[1.18]' : ''
      } ${spotlight && rarity === 'L' ? 'scale-[1.07]' : ''}`}
    >
      {children}
    </div>
  );
}

// CSS (등급별 fill/border/glow):
// .rarity-card[data-r="C"] { background: var(--r-c-bg); border: 1.5px solid var(--r-c-border); }
// .rarity-card[data-r="R"] { background: var(--r-r-bg); border: 1.5px solid var(--r-r-border);
//                            box-shadow: 0 8px 24px var(--r-r-glow); }
// .rarity-card[data-r="E"] { background: var(--r-e-bg); border: 2px solid var(--r-e-border);
//                            box-shadow: 0 12px 32px var(--r-e-glow); }
// .rarity-card[data-r="L"] { background: linear-gradient(135deg, var(--r-l-bg), #FFF);
//                            box-shadow: 0 0 0 2px var(--r-l-fill), 0 16px 48px var(--r-l-glow); }
// .rarity-card[data-r="M"] {
//   background: linear-gradient(white, white) padding-box,
//               var(--r-m-grad) border-box;
//   border: 2px solid transparent;
//   box-shadow: 0 0 0 1px rgba(255,255,255,.3) inset, 0 20px 60px var(--r-m-glow);
// }
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

- [ ] `import { brand, rarity } from '@saigon-rider/tokens'`이 작동하는가
- [ ] `tokens.css`를 import하면 모든 CSS 변수가 적용되는가
- [ ] Tailwind `bg-r-l`, `text-brand-500` 같은 유틸리티가 작동하는가
- [ ] NativeWind에서도 같은 클래스가 작동하는가 (RN 환경)
- [ ] Storybook에서 19개 컴포넌트가 모두 렌더링되는가
- [ ] `<RarityCard rarity="M" spotlight>`가 Mythic shimmer 애니메이션과 함께 보이는가
- [ ] `<CurrencyBadge currency="GC" amount={240} />`가 보석 아이콘과 함께 보라색으로 보이는가
- [ ] `<PityBar current={87} max={100} showLabel />`가 펄스 애니메이션을 보여주는가

---

(끝)
