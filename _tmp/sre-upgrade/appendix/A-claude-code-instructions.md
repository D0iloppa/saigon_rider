# Saigon Rider — Claude Code 작업 지시서 v1.1

> 발행일: 2026-05-18 (v1.1 업데이트)
> 형식: Claude Code (`claude` CLI)에 그대로 던지면 작동
> 범위: Phase 0 (모노레포 + 토큰 + 컴포넌트 + **Skywork 자산 통합**) + Phase 1 (인증 + 홈)
> 전제: D/C/B(v1.1) 결정서를 다 읽었거나, 또는 이 문서를 단독으로 실행 가능

## v1.1 변경 요약
Phase 0에 **Task 2.5 신규 추가** — Skywork v4 디자인 자산(`saigon-rider-items.svg` 98KB + `saigon-rider-items.css` 10KB)을 토큰 패키지에 통합 + 새 `@saigon-rider/items` 패키지 생성. 예상 소요 1-2시간. 이로써 Phase 0 총 소요는 2-3일 → **3일** (약 4시간 증가).

---

## §0. Claude Code에 던지는 방법

### 0.1 새 디렉토리에서 시작

```bash
mkdir saigon-rider && cd saigon-rider
git init
claude
```

### 0.2 첫 메시지로 던질 내용 (이 문서 통째)

```
이 문서대로 Saigon Rider 앱을 처음부터 만들어줘. Phase 0 시작.
참고 자료:
- screens_v3_rpg.html (36 화면 HTML 시안)
- D-build-decisions.md (기술 결정)
- C-api-contract.md (API 명세)
- B-design-tokens-components.md (토큰/컴포넌트, v1.1)
- sre-* 백엔드 SQL 7개 (마이그레이션용)
- saigon-rider-items.svg (Skywork v4 SVG sprite, 98KB)        ⭐ NEW v1.1
- saigon-rider-items.css (Skywork v4 디자인 토큰 CSS, 10KB)   ⭐ NEW v1.1

위 파일들은 /docs 폴더에 넣을 거야 (SVG/CSS는 /assets/skywork-v4/).
나는 위임형이니까 적극적으로 결정하고 진행해. 막힌 게 있으면 구체적으로 질문해.

먼저 Phase 0의 Task 1부터 시작:
```

(이후 본 문서 §1부터 통째 붙여넣기)

---

## §1. Phase 0 — 모노레포 + 디자인 시스템 (예상 3일, v1.1)

### Task 1: 모노레포 셋업 (30분)

```bash
# pnpm 설치 (없으면)
npm install -g pnpm

# 프로젝트 초기화
pnpm init
```

`package.json` 수정:
```json
{
  "name": "saigon-rider",
  "private": true,
  "packageManager": "pnpm@8.15.0",
  "scripts": {
    "build":     "pnpm -r build",
    "dev":       "pnpm --filter @saigon-rider/mobile dev",
    "dev:web":   "pnpm --filter @saigon-rider/web dev",
    "storybook": "pnpm --filter @saigon-rider/ui storybook",
    "typecheck": "pnpm -r typecheck",
    "lint":      "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "prettier": "^3.2.0",
    "eslint": "^8.57.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`.gitignore`:
```
node_modules
dist
.expo
.next
*.log
.env*
!.env.example
.DS_Store
```

`tsconfig.base.json` (루트):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**검수 기준**:
- [ ] `pnpm install` 실행 시 에러 없음
- [ ] `pnpm-workspace.yaml`에 packages 경로 명시됨
- [ ] `.gitignore`에 모든 빌드 산출물 포함

---

### Task 2: `@saigon-rider/tokens` 패키지 (1시간)

```bash
mkdir -p packages/tokens/{src,css}
cd packages/tokens
```

`packages/tokens/package.json`:
```json
{
  "name": "@saigon-rider/tokens",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./css": "./css/tokens.css",
    "./tailwind": "./tailwind.config.js"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

`packages/tokens/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

이제 **B 결정서 §1을 그대로 따라** 다음 파일 생성:
- `src/colors.ts` (brand/ink/neon/game/surface/status/rarity)
- `src/typography.ts` (fontFamily/fontSize/fontWeight/numericStyle)
- `src/spacing.ts`
- `src/radius.ts`
- `src/shadow.ts`
- `src/gradient.ts`
- `src/animation.ts` (keyframes)
- `src/index.ts` (re-export all)
- `css/tokens.css` (:root CSS variables 전체)
- `tailwind.config.js` (Tailwind preset)

`src/index.ts`:
```typescript
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './radius';
export * from './shadow';
export * from './gradient';
export * from './animation';
```

**검수 기준**:
- [ ] `pnpm --filter @saigon-rider/tokens typecheck` 통과
- [ ] `import { brand, rarity } from '@saigon-rider/tokens'`가 다른 패키지에서 import 가능
- [ ] `css/tokens.css`에 50+ CSS 변수 정의됨

---

### Task 2.5: ⭐ Skywork 자산 통합 (1-2시간) — v1.1 신규

**전제**: B 결정서 v1.1의 §1.8 + §7을 따라 진행. Skywork에서 받은 2개 파일을 위치시키고 토큰 패키지에 통합.

#### 2.5.1 외부 자산 파일 배치

사용자가 다음 2개 파일을 제공:
- `saigon-rider-items.svg` (98KB, SVG sprite)
- `saigon-rider-items.css` (10KB, 디자인 토큰 CSS)

```bash
# tokens 패키지에 CSS 복사
cp /path/to/saigon-rider-items.css packages/tokens/css/items.css

# 새 items 패키지 생성
mkdir -p packages/items/{sprite,src,dist}
cp /path/to/saigon-rider-items.svg packages/items/sprite/saigon-rider-items.svg
```

#### 2.5.2 `packages/tokens/css/tokens.css` 마지막에 import 추가

```css
/* 기존 :root { ... } 전부 유지하고, 파일 마지막에 추가 */

/* Item domain tokens (Skywork v4 — 컬렉션 + 등급 효과) */
@import './items.css';
```

#### 2.5.3 `packages/tokens/src/items.ts` 신규 작성

B 결정서 §1.8.1 그대로 복사 — `collection` 객체(7개 컬렉션) + `itemRarityFx` 객체(5등급 효과) + `CollectionCode` 타입 정의.

#### 2.5.4 `packages/tokens/src/index.ts` 업데이트

```typescript
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './radius';
export * from './shadow';
export * from './gradient';
export * from './animation';
export * from './items';        // ⭐ NEW v1.1
```

#### 2.5.5 `packages/tokens/tailwind.config.js` 확장

B 결정서 §1.8.4 그대로 — `colors`에 `col-{collection}-{tone}` 13개 추가 + `keyframes`/`animation`에 `item-mythic-spin`, `item-sparkle-pulse` 2개 추가.

#### 2.5.6 `packages/items` 패키지 정의

```bash
cd packages/items
```

`package.json`:
```json
{
  "name": "@saigon-rider/items",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".":         "./src/index.ts",
    "./sprite":  "./sprite/saigon-rider-items.svg",
    "./xml-map": "./dist/item-xml-map.json"
  },
  "scripts": {
    "build":     "node build.mjs",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "jsdom": "^24.0.0",
    "@types/jsdom": "^21.1.6",
    "typescript": "^5.4.0"
  }
}
```

`tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist-ts",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

#### 2.5.7 `packages/items/src/metadata.ts` 작성

B 결정서 §7.3 그대로 — 27개 아이템 메타 배열 + 헬퍼 함수 4개(`itemByCode`, `itemsBySlot`, `itemsByCollection`, `itemsByRarity`) + 타입 정의 4개(`ItemSlot`, `ItemRarity`, `CollectionCode`, `ItemMeta`).

#### 2.5.8 `packages/items/src/index.ts`

```typescript
export * from './metadata';
```

#### 2.5.9 `packages/items/build.mjs` (RN용 SVG 변환 스크립트)

```javascript
// packages/items/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const SPRITE_PATH = './sprite/saigon-rider-items.svg';
const OUT_PATH = './dist/item-xml-map.json';

const svg = fs.readFileSync(SPRITE_PATH, 'utf-8');
const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
const doc = dom.window.document;

// 1. <defs> 추출
const defsEl = doc.querySelector('defs');
const defs = defsEl ? defsEl.outerHTML : '';

// 2. 각 item symbol → standalone SVG
const xmlMap = {};
let count = 0;

doc.querySelectorAll('symbol[id^="item-"]').forEach(symbol => {
  const code = symbol.id.replace(/^item-/, '');
  const viewBox = symbol.getAttribute('viewBox') || '0 0 200 200';
  const content = symbol.innerHTML;
  xmlMap[code] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs}${content}</svg>`;
  count++;
});

// 3. base + decal symbols도 같이 저장 (혹시 단독 렌더링 필요할 때)
doc.querySelectorAll('symbol[id^="base-"], symbol[id^="decal-"]').forEach(symbol => {
  const id = symbol.id;
  const viewBox = symbol.getAttribute('viewBox') || '0 0 200 200';
  const content = symbol.innerHTML;
  xmlMap[id] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs}${content}</svg>`;
});

fs.mkdirSync('./dist', { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(xmlMap, null, 0));

console.log(`✓ ${count} items + bases/decals extracted → ${OUT_PATH}`);
console.log(`  Output size: ${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB`);
```

빌드 실행:
```bash
cd packages/items
pnpm install
pnpm build  # → dist/item-xml-map.json 생성 (~120 KB)
```

#### 2.5.10 `packages/items/README.md` 작성

```markdown
# @saigon-rider/items

Skywork v4 디자인 자산 + 메타데이터.

## 자산
- `sprite/saigon-rider-items.svg` — 98KB, 27개 아이템 + 19개 베이스 + 10개 데칼 토큰
- `dist/item-xml-map.json` — RN용 standalone SVG 매핑 (build.mjs로 생성)

## 사용 (Web)
\`\`\`tsx
import spriteUrl from '@saigon-rider/items/sprite';
// 페이지 어딘가에 sprite를 inline embed 한 후 <use href="#item-XXX"/> 호출
\`\`\`

## 사용 (RN)
\`\`\`tsx
import xmlMap from '@saigon-rider/items/xml-map';
import { SvgFromXml } from 'react-native-svg';
<SvgFromXml xml={xmlMap['HELMET_LEGEND_OF_SAIGON_M_01']} width={120} height={120} />
\`\`\`

## 메타데이터
\`\`\`tsx
import { ITEMS, itemByCode, itemsByRarity } from '@saigon-rider/items';
const mythicItems = itemsByRarity('M');  // 6개
\`\`\`
```

#### 2.5.11 모바일 앱이 sprite를 로드하도록 설정 (선언만, 실제 사용은 Phase 2)

```javascript
// apps/mobile/metro.config.js 에 SVG asset transformer 추가
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};
```

#### 2.5.12 통합 검수

```bash
# tokens 패키지 typecheck
pnpm --filter @saigon-rider/tokens typecheck

# items 패키지 build + typecheck
pnpm --filter @saigon-rider/items build
pnpm --filter @saigon-rider/items typecheck

# 결과 파일 확인
ls -la packages/tokens/css/items.css       # 10 KB
ls -la packages/tokens/src/items.ts        # 약 3-4 KB
ls -la packages/items/sprite/*.svg          # 98 KB
ls -la packages/items/dist/item-xml-map.json # 약 110-130 KB
```

#### 2.5.13 빠른 통합 테스트 (선택)

`packages/items/test.html` 임시 생성:
```html
<!DOCTYPE html>
<html><head><style>
  body { background: #0F0E17; padding: 20px; }
  @import url('../tokens/css/tokens.css');
</style></head>
<body>
  <object data="./sprite/saigon-rider-items.svg" type="image/svg+xml"
          style="display:none"></object>
  <div class="item-card" data-r="M" style="width:200px;padding:20px;border-radius:24px">
    <svg viewBox="0 0 200 200" class="item-r-m" style="width:160px;height:160px">
      <use href="./sprite/saigon-rider-items.svg#item-HELMET_LEGEND_OF_SAIGON_M_01"/>
    </svg>
    <span class="rarity-label" data-r="M">MYTHIC</span>
  </div>
</body></html>
```

브라우저에서 열어 Mythic 헬멧이 conic-gradient 회전과 함께 보이면 성공.

**검수 기준 (Task 2.5)**:
- [ ] `packages/tokens/css/items.css` 존재 + `tokens.css`가 import함
- [ ] `import { collection, itemRarityFx, type CollectionCode } from '@saigon-rider/tokens'` 작동
- [ ] Tailwind `bg-col-neon-primary`, `bg-col-tet-secondary` 등 컬렉션 유틸리티 작동
- [ ] `packages/items` 패키지 빌드 성공 → `dist/item-xml-map.json` 생성
- [ ] `import { ITEMS, itemByCode } from '@saigon-rider/items'` 작동
- [ ] `itemByCode('HELMET_LEGEND_OF_SAIGON_M_01')?.name === 'Saigon Crown'` 확인
- [ ] `apps/mobile/metro.config.js`에 SVG transformer 설정됨
- [ ] (선택) 통합 테스트 HTML이 Mythic 헬멧을 회전 효과와 함께 보여줌

**Phase 0 종료 후 이어지는 후속 작업** (Phase 2 가챠/상점 슬라이스에서):
- Task 3 (ui 패키지) 핵심 5개 + B v1.1의 신규 5개 (CollectionChip, ItemSparkle, InventoryCell, ItemSvgRenderer, MythicCardOverlay) 추가 작성
- RarityCard에 `surface="dark" | "light"` prop 통합 (B v1.1 §2.2 그대로)
- GACHA-PULL-RESULT 화면에서 `<RarityCard surface="dark" spotlight>` + `<ItemSvgRenderer>` 조합으로 진짜 아이템 표시

---

### Task 3: `@saigon-rider/ui` 패키지 + 핵심 컴포넌트 5개 (3-4시간)

```bash
mkdir -p packages/ui/src/{primitives,game,content}
cd packages/ui
```

`packages/ui/package.json`:
```json
{
  "name": "@saigon-rider/ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@saigon-rider/tokens": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.4.0"
  }
}
```

**우선 만들 컴포넌트 5개** (가장 자주 쓰임):

1. `src/primitives/Icon3D.tsx` — B 결정서 §2.7 그대로
2. `src/primitives/PhotoFrame.tsx` — B 결정서 §2.8 그대로
3. `src/game/RarityCard.tsx` — B 결정서 §2.2 그대로
4. `src/game/RarityChip.tsx` — B 결정서 §2.3 그대로
5. `src/game/CurrencyBadge.tsx` — B 결정서 §2.4 그대로

`src/index.ts`:
```typescript
// Primitives
export { Icon3D, EMOJI } from './primitives/Icon3D';
export { PhotoFrame } from './primitives/PhotoFrame';

// Game
export { RarityCard } from './game/RarityCard';
export { RarityChip } from './game/RarityChip';
export { CurrencyBadge } from './game/CurrencyBadge';
```

**검수 기준**:
- [ ] `pnpm --filter @saigon-rider/ui typecheck` 통과
- [ ] 다른 패키지에서 `import { RarityCard } from '@saigon-rider/ui'` 가능

---

### Task 4: Storybook (선택, 1시간) — 컴포넌트 검증용

```bash
cd packages/ui
pnpm dlx storybook@latest init --type react --builder vite --yes
```

각 컴포넌트의 stories 파일 생성. B 결정서 §4 예시 따라:
- `src/primitives/Icon3D.stories.tsx`
- `src/game/RarityCard.stories.tsx` (5등급 모두 시연)
- `src/game/RarityChip.stories.tsx`
- `src/game/CurrencyBadge.stories.tsx`

```bash
pnpm storybook
```

**검수 기준**:
- [ ] http://localhost:6006 에서 Storybook 작동
- [ ] RarityCard의 5등급 (C/R/E/L/M) 시각적으로 명확히 구분
- [ ] Mythic 카드에서 shimmer 애니메이션 작동
- [ ] CurrencyBadge GP/GC 둘 다 정상 렌더

---

### Phase 0 종료 시점 (Day 2-3)

```
saigon-rider/
├── packages/
│   ├── tokens/          ✓ 완성
│   └── ui/              ✓ 5개 컴포넌트
├── package.json         ✓
├── pnpm-workspace.yaml  ✓
├── tsconfig.base.json   ✓
└── .gitignore           ✓
```

다음 단계 (Phase 1)로 진입 전 git commit 권장:
```bash
git add -A
git commit -m "Phase 0: 모노레포 + 디자인 토큰 + 컴포넌트 5개"
```

---

## §2. Phase 1 — Expo 앱 + 인증 + 홈 (예상 1주)

### Task 5: Expo 앱 셋업 (1시간)

```bash
cd apps
pnpm dlx create-expo-app@latest mobile --template blank-typescript
cd mobile
```

`apps/mobile/package.json` 수정 (의존성 추가):
```json
{
  "name": "@saigon-rider/mobile",
  "main": "expo-router/entry",
  "dependencies": {
    "@saigon-rider/tokens": "workspace:*",
    "@saigon-rider/ui": "workspace:*",
    "expo": "~50.0.0",
    "expo-router": "~3.4.0",
    "expo-status-bar": "~1.11.0",
    "expo-linking": "~6.2.0",
    "expo-font": "~11.10.0",
    "expo-splash-screen": "~0.26.0",
    "react": "18.2.0",
    "react-native": "0.73.0",
    "react-native-safe-area-context": "4.8.2",
    "react-native-screens": "~3.29.0",
    "react-native-gesture-handler": "~2.14.0",
    "react-native-reanimated": "~3.6.0",
    "react-native-svg": "14.1.0",
    "@react-native-async-storage/async-storage": "1.21.0",
    "react-native-mmkv": "^2.11.0",
    "@supabase/supabase-js": "^2.39.0",
    "@tanstack/react-query": "^5.20.0",
    "zustand": "^4.5.0",
    "nativewind": "^4.0.36",
    "lucide-react-native": "^0.330.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0",
    "@types/react": "~18.2.0",
    "typescript": "^5.4.0"
  }
}
```

`apps/mobile/app.json`:
```json
{
  "expo": {
    "name": "Saigon Rider",
    "slug": "saigon-rider",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "saigonrider",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "cover",
      "backgroundColor": "#08090F"
    },
    "ios": { "supportsTablet": false, "bundleIdentifier": "app.saigonrider" },
    "android": { "package": "app.saigonrider" },
    "plugins": ["expo-router", "expo-font"],
    "experiments": { "typedRoutes": true }
  }
}
```

`apps/mobile/tailwind.config.js`:
```javascript
import preset from '@saigon-rider/tokens/tailwind.config';

module.exports = {
  presets: [preset],
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    '../../packages/ui/src/**/*.{tsx,ts}',
  ],
};
```

`apps/mobile/babel.config.js`:
```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      'react-native-reanimated/plugin',
    ],
  };
};
```

`apps/mobile/metro.config.js`:
```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// 모노레포 지원
config.watchFolders = [path.resolve(__dirname, '../..')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
```

`apps/mobile/global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```bash
pnpm install
pnpm dev   # Expo Dev Server 시작
```

**검수 기준**:
- [ ] `pnpm dev` → QR 코드 출력
- [ ] iOS Simulator 또는 Android Emulator에서 빈 화면 정상 로드
- [ ] `@saigon-rider/tokens` 와 `@saigon-rider/ui`가 import 가능

---

### Task 6: Supabase 셋업 + SRE 마이그레이션 (1시간)

```bash
# Supabase 프로젝트 생성 (CLI 또는 대시보드)
pnpm dlx supabase init
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <your-project-ref>
```

`supabase/migrations/` 폴더에 SRE SQL 7개를 순서대로 복사:
```
20260518000001_migration-step1-alter.sql
20260518000002_migration-step2-new-tables.sql
20260518000003_migration-step3-gacha-shop.sql
20260518000004_sre-action-definition-extension.sql
20260518000005_sre-item-seed.sql
20260518000006_sre-gacha-seed.sql
20260518000007_sre-mission-reward-bundle.sql
20260518000008_sre-reward-dispatcher.sql
20260518000009_sre-shop-gacha-functions.sql
20260518000010_sre-auth-trigger.sql   # C 결정서 §0.4
20260518000011_sre-rls-policies.sql   # C 결정서 §12
20260518000012_sre-api-functions.sql  # C 결정서의 신규 함수들
```

`20260518000012_sre-api-functions.sql`에 들어갈 내용 (C 결정서 §2~§8에서 정의한 함수들):
- `current_sre_user_id()`
- `get_active_season_info()`
- `get_user_summary()`
- `list_active_missions()`
- `start_mission()`
- `claim_mission_reward()`
- `equip_item()`
- `unequip_slot()`
- `check_gacha_eligibility()`
- `get_season_pass()`
- `claim_season_reward()`

뷰들도 같이:
- `sre_user_view`
- `user_inventory_view`
- `user_equipment_view`
- `item_collection_progress_view`
- `shop_catalog_view`
- `gacha_definition_view`
- `season_level_view`

```bash
pnpm dlx supabase db push
```

**검수 기준**:
- [ ] Supabase 대시보드에서 모든 테이블 생성 확인
- [ ] `SELECT * FROM gacha_definition` → 5종 가챠 확인
- [ ] `SELECT * FROM item_definition LIMIT 5` → 213개 중 5개 확인
- [ ] RLS 정책이 모든 user 테이블에 활성화됨

---

### Task 7: API 클라이언트 패키지 (`@saigon-rider/api`, 1시간)

```bash
mkdir -p packages/api/src
cd packages/api
```

`packages/api/package.json`:
```json
{
  "name": "@saigon-rider/api",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

`src/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export function createSupabaseClient(config: {
  url: string;
  anonKey: string;
  storage?: any;  // AsyncStorage 또는 MMKV
}) {
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      storage: config.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
```

`src/auth.ts`:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export const authApi = (supabase: SupabaseClient) => ({
  sendOtp: (phone: string) =>
    supabase.auth.signInWithOtp({ phone }),

  verifyOtp: (phone: string, token: string) =>
    supabase.auth.verifyOtp({ phone, token, type: 'sms' }),

  signOut: () => supabase.auth.signOut(),

  getCurrentUser: () => supabase.auth.getUser(),
});
```

`src/profile.ts`:
```typescript
export const profileApi = (supabase: SupabaseClient) => ({
  getMe: () =>
    supabase.from('sre_user_view').select('*').single(),

  getSummary: () => supabase.rpc('get_user_summary'),

  updateNickname: (nickname: string) =>
    supabase
      .from('sre_user')
      .update({ nickname })
      .eq('user_id', supabase.auth.getUser().then(r => r.data.user?.id)),
});
```

(C 결정서 §13의 도메인별 API 클라이언트 그대로 작성)

`src/index.ts`:
```typescript
export * from './supabase';
export * from './auth';
export * from './profile';
export * from './mission';
export * from './ride';
export * from './shop';
export * from './gacha';
export * from './inventory';
export * from './season';
export * from './types';
```

`src/types.ts` — Supabase CLI로 자동 생성:
```bash
pnpm dlx supabase gen types typescript --linked > packages/api/src/types.ts
```

**검수 기준**:
- [ ] `import { profileApi } from '@saigon-rider/api'` 작동
- [ ] TypeScript 자동 완성에 `sre_user_view`, `item_definition` 등 테이블 타입 노출됨
- [ ] `pnpm --filter @saigon-rider/api typecheck` 통과

---

### Task 8: Expo Router 라우팅 + Supabase 클라이언트 (1시간)

`apps/mobile/app/_layout.tsx`:
```typescript
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import '../global.css';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = Font.useFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    'SpaceGrotesk-Regular': require('../assets/fonts/SpaceGrotesk-Regular.ttf'),
    'SpaceGrotesk-Bold': require('../assets/fonts/SpaceGrotesk-Bold.ttf'),
    'InstrumentSerif-Italic': require('../assets/fonts/InstrumentSerif-Italic.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </QueryClientProvider>
  );
}
```

`apps/mobile/lib/supabase.ts`:
```typescript
import { createSupabaseClient } from '@saigon-rider/api';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

const mmkvStorageAdapter = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

export const supabase = createSupabaseClient({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL!,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  storage: mmkvStorageAdapter,
});
```

`.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

`.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

**검수 기준**:
- [ ] 앱 부팅 시 폰트 로드 후 splash 사라짐
- [ ] `supabase` 인스턴스 import 가능
- [ ] `(auth)` 그룹 라우트 인식

---

### Task 9: 인증 슬라이스 4화면 (1-2일)

**화면 4개**: SPLASH → AUTH-001 → AUTH-002 → PROFILE-SETUP

#### 9.1 SPLASH (`app/index.tsx`)

```typescript
// app/index.tsx
import { View, Text, ImageBackground } from 'react-native';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Redirect } from 'expo-router';

export default function Splash() {
  const [session, setSession] = useState<any | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  if (session === undefined) return null;
  if (session) return <Redirect href="/(tabs)/home" />;

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800' }}
      className="flex-1 justify-end"
    >
      <View className="bg-black/60 px-6 pt-20 pb-12">
        <Text
          className="text-white text-center"
          style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 56, letterSpacing: -2 }}
        >
          SAIGON{'\n'}RIDER
        </Text>
        <Text
          className="text-white/80 text-center mt-2"
          style={{ fontFamily: 'InstrumentSerif-Italic', fontSize: 17 }}
        >
          Where every ride becomes a quest
        </Text>
      </View>

      <View className="bg-white rounded-t-3xl px-6 pt-8 pb-12 gap-3">
        <Link href="/(auth)/phone" asChild>
          <Pressable className="bg-brand-500 rounded-2xl py-4 items-center">
            <Text className="text-white font-bold text-base">시작하기</Text>
          </Pressable>
        </Link>
        <Pressable className="py-3 items-center">
          <Text className="text-text-2 font-medium">로그인</Text>
        </Pressable>
      </View>
    </ImageBackground>
  );
}
```

(Pressable, ImageBackground import 추가)

#### 9.2 AUTH-001 Phone (`app/(auth)/phone.tsx`)

`app/(auth)/_layout.tsx`:
```typescript
import { Stack } from 'expo-router';
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`app/(auth)/phone.tsx`:
```typescript
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Icon3D, EMOJI } from '@saigon-rider/ui';
import { authApi } from '@saigon-rider/api';
import { supabase } from '../../lib/supabase';

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const fullPhone = `+84${phone}`;

  async function sendOtp() {
    setLoading(true);
    const { error } = await authApi(supabase).sendOtp(fullPhone);
    setLoading(false);
    if (error) {
      Alert.alert('오류', error.message);
    } else {
      router.push({ pathname: '/(auth)/otp', params: { phone: fullPhone } });
    }
  }

  return (
    <View className="flex-1 bg-bg px-6 pt-20">
      {/* TODO: 백버튼 (헤더에) */}

      <Text className="text-text font-bold text-[26px] leading-8">
        휴대폰 번호로{'\n'}로그인
      </Text>
      <Text className="text-text-2 mt-2 text-sm">
        +84 베트남 번호로 인증 코드를 보내드려요
      </Text>

      <View className="mt-8 bg-surface rounded-2xl flex-row items-center px-4 py-5 shadow-card border border-line">
        <Icon3D hex={EMOJI.FLAG_VN ?? '1f1fb-1f1f3'} size={32} />
        <Text className="ml-2 mr-3 font-mono font-bold text-lg">+84</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="901 234 567"
          keyboardType="phone-pad"
          maxLength={10}
          className="flex-1 text-2xl"
          style={{ fontFamily: 'SpaceGrotesk-Bold' }}
        />
      </View>

      <Pressable
        onPress={sendOtp}
        disabled={phone.length < 9 || loading}
        className={`mt-8 rounded-2xl py-4 items-center ${
          phone.length < 9 || loading ? 'bg-line' : 'bg-brand-500'
        }`}
        style={{
          shadowColor: '#FF5A1F',
          shadowOpacity: 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <Text className="text-white font-bold text-base">
          {loading ? '전송 중...' : '인증 코드 받기'}
        </Text>
      </Pressable>

      <Text className="text-text-3 text-xs text-center mt-6 leading-5">
        계속을 누르면 이용약관과 개인정보처리방침에 동의합니다
      </Text>
    </View>
  );
}
```

#### 9.3 AUTH-002 OTP (`app/(auth)/otp.tsx`)

```typescript
import { View, Text, TextInput, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useRef } from 'react';
import { authApi } from '@saigon-rider/api';
import { supabase } from '../../lib/supabase';

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const router = useRouter();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

  const handleChange = (idx: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newCode = [...code];
    newCode[idx] = value;
    setCode(newCode);
    setError(false);

    if (value && idx < 5) inputs.current[idx + 1]?.focus();

    if (newCode.every(c => c !== '') && newCode.length === 6) {
      verify(newCode.join(''));
    }
  };

  async function verify(token: string) {
    const { error } = await authApi(supabase).verifyOtp(phone!, token);
    if (error) {
      setError(true);
    } else {
      router.replace('/(auth)/profile-setup');
    }
  }

  return (
    <View className="flex-1 bg-bg px-6 pt-20">
      <Text className="text-text font-bold text-[26px] leading-8">
        인증 코드 입력
      </Text>
      <Text className="text-text-2 mt-2 text-sm">
        {phone} 로 보낸 6자리
      </Text>

      <View className="flex-row justify-between mt-10 px-4">
        {code.map((digit, i) => (
          <View
            key={i}
            className={`w-12 h-16 rounded-2xl items-center justify-center shadow-card border-2 ${
              error ? 'border-danger' : digit ? 'border-brand-500' : 'border-line bg-surface'
            } bg-surface`}
            style={error ? { transform: [{ rotate: '-1deg' }] } : undefined}
          >
            <TextInput
              ref={el => (inputs.current[i] = el)}
              value={digit}
              onChangeText={v => handleChange(i, v)}
              keyboardType="number-pad"
              maxLength={1}
              className="text-2xl font-bold w-full h-full text-center"
            />
          </View>
        ))}
      </View>

      {error && (
        <Text className="text-danger text-sm text-center mt-4">
          잘못된 코드예요. 다시 입력해주세요.
        </Text>
      )}

      <Text className="text-text-3 text-sm text-center mt-8">
        02:47 후 재전송 가능
      </Text>
    </View>
  );
}
```

#### 9.4 PROFILE-SETUP (`app/(auth)/profile-setup.tsx`)

```typescript
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Icon3D, EMOJI } from '@saigon-rider/ui';
import { supabase } from '../../lib/supabase';

const STYLES = [
  { id: 'COMMUTER', name: '출퇴근러', desc: 'Quận 1 ↔ Thủ Đức 매일 라이드', emoji: EMOJI.CITY },
  { id: 'CAFE_HUNTER', name: '카페 헌터', desc: '숨은 카페를 찾아 떠나는 라이드', emoji: EMOJI.COFFEE },
  { id: 'NIGHT_RIDER', name: '나이트 라이더', desc: 'Bùi Viện의 밤은 짧다', emoji: EMOJI.MOON },
];

export default function ProfileSetup() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [style, setStyle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function complete() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // sre_user 업데이트 (트리거로 row는 이미 생성됨)
    await supabase
      .from('sre_user')
      .update({ nickname, rider_style: style })
      .eq('external_user_uuid', user.id);

    setLoading(false);
    router.replace('/(tabs)/home');
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40 }}>
      <Text className="text-text font-bold text-[24px]">
        당신은 어떤 라이더인가요?
      </Text>

      <View className="mt-6 bg-surface rounded-2xl flex-row items-center px-4 py-4 shadow-card border border-line">
        <Icon3D hex="1f464" size={28} />
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="닉네임을 정해주세요"
          className="flex-1 ml-2 text-base"
          maxLength={20}
        />
      </View>

      <View className="mt-6 gap-3">
        {STYLES.map(s => (
          <Pressable
            key={s.id}
            onPress={() => setStyle(s.id)}
            className={`bg-surface rounded-2xl p-5 flex-row items-center shadow-card border-2 ${
              style === s.id ? 'border-brand-500' : 'border-transparent'
            }`}
          >
            <Icon3D hex={s.emoji} size={64} />
            <View className="flex-1 ml-4">
              <Text className="font-bold text-lg">{s.name}</Text>
              <Text className="text-text-2 text-sm mt-1">{s.desc}</Text>
            </View>
            <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
              style === s.id ? 'border-brand-500' : 'border-line'
            }`}>
              {style === s.id && <View className="w-3 h-3 rounded-full bg-brand-500" />}
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={complete}
        disabled={!nickname || !style || loading}
        className={`mt-8 rounded-2xl py-4 items-center ${
          !nickname || !style || loading ? 'bg-line' : 'bg-brand-500'
        }`}
      >
        <Text className="text-white font-bold text-base">
          {loading ? '저장 중...' : '시작하기'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

**검수 기준**:
- [ ] SPLASH → 시작하기 → PHONE으로 이동
- [ ] PHONE에서 가짜 +84 901 234 567 입력 → OTP로 이동
- [ ] OTP에서 6자리 입력 시 자동 검증
- [ ] 잘못된 OTP는 빨간 보더 + 흔들림
- [ ] 정상 OTP 후 PROFILE-SETUP 이동
- [ ] 닉네임 + 스타일 선택 → 홈(/(tabs)/home)로 이동
- [ ] Supabase 대시보드에서 `auth.users`와 `sre_user`에 row 생성 확인

---

### Task 10: 홈 화면 (HOME-001) — 미니멀 버전 (4-6시간)

전체를 한 번에 만들기 어려우니, **3단계로 단순화**:

#### Step A: 기본 구조 + 데이터 fetch
```typescript
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Icon3D, EMOJI } from '@saigon-rider/ui';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { height: 84 } }}>
      <Tabs.Screen name="home" options={{
        title: '월드',
        tabBarIcon: () => <Icon3D hex={EMOJI.CITY} size={24} />,
      }} />
      <Tabs.Screen name="quest" options={{
        title: '퀘스트',
        tabBarIcon: () => <Icon3D hex="1f3af" size={24} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: '프로필',
        tabBarIcon: () => <Icon3D hex="1f464" size={24} />,
      }} />
    </Tabs>
  );
}
```

```typescript
// app/(tabs)/home.tsx
import { View, Text, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { profileApi, CurrencyBadge, Icon3D, EMOJI } from '@saigon-rider/ui';
import { supabase } from '../../lib/supabase';

export default function Home() {
  const { data: summary } = useQuery({
    queryKey: ['user-summary'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_user_summary');
      return data;
    },
  });

  if (!summary) return <View className="flex-1 bg-bg" />;

  const { profile, active_season, today_missions_count, lifetime_km } = summary;

  return (
    <ScrollView className="flex-1 bg-bg">
      {/* Sunset Header */}
      <View
        className="px-6 pt-16 pb-8"
        style={{
          background: 'var(--grad-sunset)' as any,  // RN에선 LinearGradient로
        }}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-full bg-white/20" />
          <View>
            <Text className="text-white font-bold">{profile.nickname}</Text>
            <Text className="text-white/70 text-xs">LV.{profile.tier ?? 1}</Text>
          </View>
        </View>

        <Text className="text-white text-xl font-bold mt-6">
          Chào buổi tối ✨
        </Text>
        <Text className="text-white/80 text-sm">
          오늘 {today_missions_count}개 미션 완료
        </Text>
      </View>

      {/* Currency Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mt-6 px-4">
        <View className="bg-surface rounded-2xl p-4 mr-3 shadow-card w-32">
          <CurrencyBadge currency="GP" amount={profile.gp ?? 0} size="lg" />
        </View>
        <View className="bg-surface rounded-2xl p-4 mr-3 shadow-card w-32">
          <CurrencyBadge currency="GC" amount={profile.gc ?? 0} size="lg" />
        </View>
      </ScrollView>

      {/* Active Season */}
      {active_season && (
        <View className="bg-surface mx-4 mt-4 rounded-3xl p-4 shadow-pop">
          <Text className="text-xs text-text-3 uppercase font-bold tracking-wider">
            CURRENT SEASON
          </Text>
          <Text className="text-lg font-bold mt-1">{active_season.display_name}</Text>
          <Text className="text-text-2 text-sm">
            {active_season.days_remaining}일 남음
          </Text>
        </View>
      )}

      <Text className="text-center text-text-3 my-12 text-xs">
        — 더 많은 콘텐츠는 다음 Phase에서 —
      </Text>
    </ScrollView>
  );
}
```

#### Step B (Phase 1.5): 풀 디자인 적용
B 결정서의 컴포넌트들 + screens_v3_rpg.html의 HOME-001 디테일 그대로 옮김 (LinearGradient + 노이즈 + 저폴리 지도 SVG + 추천 카드 등).

#### Step C (Phase 2): 진짜 월드맵 + 실시간 데이터
나중에 진행.

**검수 기준**:
- [ ] 로그인 후 홈 화면에서 닉네임 + GP/GC 표시
- [ ] `get_user_summary` RPC가 정상 호출
- [ ] 활성 시즌 정보 표시
- [ ] 탭바에서 다른 탭 누르면 미구현 빈 화면이라도 라우팅 작동

---

### Phase 1 종료 (Day 7-10)

```
saigon-rider/
├── apps/
│   └── mobile/                ✓ Expo 앱 부팅 가능
│       └── app/
│           ├── index.tsx       ✓ SPLASH
│           ├── (auth)/
│           │   ├── phone.tsx   ✓ AUTH-001
│           │   ├── otp.tsx     ✓ AUTH-002
│           │   └── profile-setup.tsx  ✓ PROFILE-SETUP
│           └── (tabs)/
│               ├── _layout.tsx ✓ 탭바
│               └── home.tsx    ✓ HOME-001 미니멀
├── packages/
│   ├── tokens/                ✓
│   ├── ui/                    ✓ 컴포넌트 5개
│   └── api/                   ✓ Supabase 클라이언트
└── supabase/
    └── migrations/             ✓ SRE SQL 12개 적용
```

```bash
git add -A
git commit -m "Phase 1: Expo + Supabase + 인증 4화면 + 홈 미니멀"
```

---

## §3. Phase 1 이후 (참고)

### Phase 2 (1주): 퀘스트 + 라이딩 (가짜 GPS)
- QUEST-LIST, QUEST-DETAIL
- RIDE-ACTIVE (10초마다 가짜 좌표 시뮬레이션)
- RIDE-RESULT-S/F (dispatch_mission_reward 실호출)
- Hono 사이드카 API 셋업 (Cloudflare Workers)

### Phase 3 (1주): 가챠 + 상점 + 인벤토리
- SHOP-001/002 + purchase_shop_item
- GACHA-HUB + GACHA-PULL-RESULT (Reanimated 카드 뒤집기)
- INVENTORY-001 + equip_item

### Phase 4 (1주): 진짜 GPS + 푸시 + 폴리시
- expo-location 백그라운드 트래킹
- expo-notifications + 푸시 등록
- 라이딩 anti-abuse (속도 검증)
- v3 디자인 폴리시 미세조정

### Phase 5+ : 피드, 게러지/아바타, 시즌패스, IAP

---

## §4. 문제 해결 가이드 (Claude Code가 막힐 때)

| 문제 | 해결 |
|---|---|
| Metro Bundler가 packages를 못 찾음 | `metro.config.js`에 `watchFolders` 추가 (Task 5 참고) |
| NativeWind 클래스 무시됨 | `babel.config.js` 플러그인 순서 확인 (preset-expo가 먼저) |
| Supabase RLS 403 에러 | `current_sre_user_id()` 함수가 트리거로 row 생성 후 작동하는지 확인 |
| `pull_gacha` RPC 호출 시 SECURITY 에러 | `GRANT EXECUTE ON FUNCTION pull_gacha TO authenticated` 필요 |
| Expo 앱이 monorepo에서 build 실패 | `metro.config.js`의 `nodeModulesPaths` 양쪽 다 추가 |
| AsyncStorage warning | `react-native-mmkv` 사용으로 대체 (위 Task 8) |
| 빈 화면, 콘솔 에러 없음 | React Query devtools 추가, Sentry 활성화 |

---

## §5. 매일 진행 체크리스트

**Day 1**: Task 1 + Task 2 (모노레포 + tokens 기본)
**Day 2**: Task 2.5 ⭐ (Skywork 자산 통합) + Task 3 (ui 5개)
**Day 3**: Task 4 (Storybook) + Task 5 (Expo)
**Day 4**: Task 6+7 (Supabase 마이그레이션 + api 패키지)
**Day 5**: Task 8 (Expo Router) + Task 9.1+9.2 (SPLASH + PHONE)
**Day 6**: Task 9.3+9.4 (OTP + PROFILE-SETUP)
**Day 7**: Task 10 Step A (HOME 기본)
**Day 8**: Task 10 Step B (HOME 디자인) + 폴리시
**Day 9-10**: 버그픽스, OnTimePush 권한, EAS Preview 빌드 첫 시도

---

## §6. Claude Code 사용 팁

### 효율적 프롬프트
```
"이 Task의 검수 기준 모두 통과하는 코드를 작성해줘.
파일 경로는 정확히 지키고, 의존성도 package.json에 다 넣어줘.
타입 에러 없이 작동해야 해."
```

### 막혔을 때
```
"위 에러를 처음부터 분석해봐. supabase 로그도 확인해줘.
RLS 정책 디버깅이 필요하면 SECURITY DEFINER 함수로 우회해보자."
```

### Phase 종료마다
```
"이번 Phase 산출물을 정리하고 README.md를 업데이트해줘.
다음 Phase에서 무엇이 필요할지 TODO.md도 만들어줘."
```

---

(끝)
