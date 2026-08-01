# 사이공라이더 디자인 시스템 — 화면 정비 규칙 (v1 · 2026-07-25)

> **이 문서는 화면군별 정비 담당팀의 유일한 기준이다.** 여기 없는 결정은 임의로 내리지 말고,
> 참조 화면(`pages/info/` 4화면 · `pages/map/NeighborhoodMap*` · `pages/market/`)의 기존 답을 따른다.
> 목표: 앱 전체가 **하나의 시각 언어**로 읽히게 한다. 배경 지시: "디자인 최고가 될 수 있도록 부족한 부분 다 작업해."

## 0. 공용 자산 위치 (이것만 소비한다)

| 자산 | 경로 | 역할 |
|---|---|---|
| 전역 토큰 | `frontend/src/styles/tokens.css` | 색·그림자·라운드·레이아웃 변수. **색은 무조건 여기 토큰** |
| 전역 유틸 클래스 | `frontend/src/styles/globals.css` | `.num`(숫자) · `.micro`(마이크로 라벨) · `.serif` · `.shimmer` |
| **표면 문법 (승격됨)** | `frontend/src/styles/system.module.css` | 카드·행·칩·배지·섹션 라벨·상태·스켈레톤·컨텍스트바·지도 블록 |
| 상태 블록 | `frontend/src/components/ui/StateBlock.tsx` | 빈/오류/안전 상태 (구 `pages/info/InfoState` 승격) |
| 리스트 스켈레톤 | `frontend/src/components/ui/SkeletonRows.tsx` | 목록형 로딩 상태 |
| 서브페이지 헤더 | `frontend/src/components/layout/TopBar.tsx` | 뒤로가기 + 타이틀 + 우측 액션 |
| 기타 공용 UI | `frontend/src/components/ui/*` | §7 표 참조 |

`system.module.css` 는 정보 4화면 재설계에서 검증된 `infoSystem.module.css` 를 전역 승격한 것이다.
**화면 전용 module.css 에 카드/행/배지/스켈레톤을 새로 만들지 마라** — 먼저 system.module.css 에 있는지 확인하고, 있으면 import 해서 쓴다:

```tsx
import sys from '@/styles/system.module.css';
// <div className={sys.card}> <div className={sys.row}> ...
```

---

## 1. 폰트 · 숫자 표기

**로드되는 폰트는 4종뿐이다** (`frontend/index.html`): Pretendard(본문) · Space Grotesk 400–700(숫자·라벨) · Instrument Serif(장식) · Noto Color Emoji(콘텐츠 이모지). **새 폰트 추가 금지.**

- **`JetBrains Mono` 전면 금지.** 앱 어디서도 로드되지 않는 유령 폰트다 — 지정하면 시스템 모노(쿠리어체)로 폴백돼 오히려 싸구려로 보인다. 발견 즉시 아래 표준으로 교체한다. (기존 7개 파일은 이미 정리 완료.)
- **모든 수치**(가격 ₫, 거리 km, 속도, 시간, 카운트, 평점, 재화량)는 전역 `.num` 을 쓴다. CSS Modules 화면에서도 전역 클래스는 문자열로 그대로 섞는다:

```tsx
// BEFORE — 유령 폰트 로컬 클래스
<span className={styles.mono}>{price.toLocaleString()} ₫</span>
// AFTER — 전역 .num (globals.css)
<span className={`${styles.priceVal} num`}>{price.toLocaleString()} ₫</span>
```

- CSS 쪽에서 폰트를 직접 지정해야 할 때(공용 컴포넌트 등)는 `.num` 정의를 그대로 복제한다:

```css
font-family: 'Space Grotesk', sans-serif;
font-variant-numeric: tabular-nums;   /* 숫자 갱신 시 자릿수 흔들림 방지 */
letter-spacing: -0.02em;
```

- **Space Grotesk 에 `font-weight: 800` 이상 금지** — 로드 최대 굵기가 700이라 합성 볼드로 뭉개진다. 700까지만.
- `.mono` 라는 로컬 클래스를 **새로 만들지 마라.** 남아 있는 것(pages/info 4파일)은 이미 `.num` 문법으로 정의만 교체돼 있다 — 화면 정비 시 전역 `num` 으로 이관해도 된다.
- 섹션 라벨은 전역 `.micro` 또는 `sys.sectionLabel`(uppercase Space Grotesk 11px) — 직접 만들지 않는다.

## 2. 아이콘 정책 — lucide 표준, 이모지 판별 기준

**표준 아이콘은 lucide-react 하나다.** 크기 관례: 행 메타 12–14 / 버튼·칩 14–16 / 상태 블록 20 / 헤더 액션 20–22, `strokeWidth` 2 (12px 이하 소형은 2.5 허용).

### 판별 기준 (이 문장으로 판정한다)

> **글리프가 JSX/상수에 하드코딩되어 있고, 그 자리가 "아이콘 슬롯"(버튼·칩·행·라벨의 선행 장식, 섹션 타이틀 장식, 상태 그림, 탭 아이콘)이면 → UI 아이콘이다 → lucide 로 교체한다.**
> **글리프가 서버 데이터·사용자 입력·게임 콘텐츠 정의(아이템·보상·컬렉션 연출)에서 왔거나 그 일부면 → 콘텐츠다 → 유지한다.**

| 사례 | 판정 | 처리 |
|---|---|---|
| `💰 {gas.name}` — 리스트 행 제목 앞 장식 | UI 아이콘 | lucide `Fuel` 등으로 교체 |
| `⭐ {rating}` — 별점 표기 | UI 아이콘 | **`<StarIcon />`** (components/ui — OS 무관 렌더) |
| `+120 GP` 옆 재화 아이콘 | 게임 재화 (경계) | **`<RewardIcon type="GOLD" />`** — 이모지 직접 삽입 금지, 컴포넌트 경유 |
| 가챠/아이템 카드의 연출 이모지·장식 | 게임 콘텐츠 | 유지 (`items.css` · `lib/emoji` 체계) |
| 피드 글·채팅 등 사용자 입력 텍스트 속 이모지 | 사용자 콘텐츠 | **절대 건드리지 않는다** |
| 스플래시·탭바 FAB 오토바이 GIF (`/emoji/1f3cd.gif`) | 브랜드 콘텐츠 | 유지 |
| i18n 번역문 안에 박힌 장식 이모지 (예: `"⚠️ 주의"`) | UI 아이콘이 번역문에 새어든 것 | 번역문에서 빼고 JSX 에서 lucide 렌더 |

```tsx
// BEFORE — 이모지를 아이콘 대용으로
<div className={styles.rowTitle}>💰 {gas.name}</div>
// AFTER — lucide + 표면 문법
import { Fuel } from 'lucide-react';
<div className={sys.rowTitle}>
  <Fuel size={14} className={sys.rowMetaIcon} /> {gas.name}
</div>
```

애매하면 판정을 바꾸지 말고 **보고에 "경계 사례"로 남겨라** (임의 결정 금지).

## 3. 색 사용 규칙

**하드코딩 hex 금지 — tokens.css 토큰만.** (기존 하드코딩 발견 시 같은 계열 토큰으로 치환; 매핑이 불확실하면 경계 사례로 보고.)

| 색 | 용도 (이것 외 사용 금지) |
|---|---|
| `--brand-*` (오렌지) | **주 액션 1개**·활성 상태·브랜드 모멘트. 화면당 주 액션 CTA는 1개가 원칙 |
| `--success` / `--warn` / `--danger` | 실제 의미가 있을 때만 (안전·주의·위험/오류). 장식 금지 |
| 파랑 `#3B82F6` | **verified(검증) 표시 전용** (`sys.rowTitleIcon` · `VerifiedBadge`). 그 외 파랑 액센트 금지 |
| 골드/앰버 (`--gold`, `#B45309` 텍스트) | 재화(GP)·별점·리워드 힌트 전용 (`sys.badgeGold` · `sys.quietCtaIconGold`) |
| `--exp` `--xp` `--gc` | 해당 재화 표기 전용 |
| `--neon-*`, `--grad-*` | 라이딩 HUD·게임 연출 화면 전용. 정보성 화면 반입 금지 |

보조 강조가 필요하면 색을 늘리지 말고 **타이포 위계(굵기·크기)와 `--surface-2`/`--line` 헤어라인**으로 해결한다. 다크모드는 토큰만 쓰면 자동 대응된다 — `[data-theme="dark"]` 분기를 화면 css 에 직접 쓰지 않는다.

## 4. 표면 문법 — system.module.css

| 클래스 | 쓰임 |
|---|---|
| `.page` / `.scroll` | 화면 골격: 세로 flex + 내부 스크롤(스크롤바 숨김) |
| `.contextBar` + `.contextIcon`·`.contextText`·`.contextSpacer` | 헤더 아래 얇은 기준 바 (위치 기준·필터 요약 등) |
| `.chipBtn` / `.chipBtnActive` | 컨텍스트바·필터의 알약 칩 버튼 (활성 = brand-50 배경) |
| `.sectionHead` + `.sectionLabel`·`.sectionAside` | 섹션 라벨 행: 좌 uppercase micro 라벨, 우 보조 수치(`num` 병기) |
| `.card` | 기본 카드: surface + 1px line + `--r-md` + 그림자 1겹 |
| `.row` + `.rowTop`·`.rowTitle`·`.rowDist`·`.rowMeta`·`.rowMetaIcon`·`.metaDot`·`.rowFoot` | 카드 내부 리스트 행 문법 (눌림 = 배경 전환) |
| `.rowTitleIcon` | 제목 옆 verified 체크 (파랑 전용 슬롯) |
| `.actionChip` + `.actionPrimary`/`.actionNeutral` | 행 하단 액션 (경로·전화·상세) |
| `.miniBadge` + `.badgeGold`/`.badgeDanger`/`.badgeSafe` | 소형 상태 배지 |
| `.stateWrap` 계열 | 상태 블록 — 직접 쓰지 말고 `<StateBlock>` 사용 |
| `.skelRow`·`.skelBar`(`Wide`/`Narrow`) | 스켈레톤 — 목록은 `<SkeletonRows>`, 비목록은 이 클래스로 실제 골격 미러 |
| `.quietCta` + `.quietCtaIcon`(`Gold`) | 조용한 보조 CTA (제보·리워드 힌트 — 주 액션과 경쟁하지 않는 점선 카드) |
| `.mapBlock`·`.mapClosePill`·`.mapLoading` | 임베드 지도 블록 |

### 화면 헤더 — 2패턴만

1. **서브페이지** (뒤로가기 있는 모든 화면): `<TopBar title={...} />`. 자체 헤더 제작 금지.
2. **루트 탭 화면**: `NeighborhoodMapList.module.css` 의 헤더 문법을 따른다 — `padding-top: calc(var(--status-bar-height) + 10px)` (고정 px 금지), eyebrow(12px·brand-600) + `h1` 22px/800/−.02em, 우측 40×40 아이콘 액션, 탭은 박스 없는 언더라인 탭(brand-500 인디케이터 3px).

### 바텀시트

`components/ui/BottomSheet` 만 사용(그래버·키보드 대응 내장). 상단부 = 그래버 + 타이틀행(제목 15–16px/700 + 우측 닫기). 시트 내부 콘텐츠도 본 문법(`sys.row`, `sys.actionChip` 등)을 그대로 쓴다.

## 5. 상태 표현 — 4상태 모두 설계한다

데이터 화면은 **로딩 / 빈 / 오류 / 정상(+안전)** 4상태가 전부 있어야 한다. 스피너 단독 화면 금지.

```tsx
{loading ? (
  <div className={sys.card}><SkeletonRows count={3} /></div>
) : error ? (
  <div className={sys.card}>
    <StateBlock icon={AlertCircle} tone="error" title={t('...loadError')}
      actionLabel={t('common.retry')} onAction={refetch} />   {/* 오류엔 재시도 필수 */}
  </div>
) : items.length === 0 ? (
  <div className={sys.card}><StateBlock icon={Fuel} title={t('...empty')} /></div>
) : ( /* 목록 — sys.row */ )}
```

- 스켈레톤은 **실제 콘텐츠 골격을 미러**한다. 목록 = `<SkeletonRows>`; 카드형·통계형 = `sys.skelBar` 조합으로 같은 자리·같은 비율.
- `tone="safe"` 는 "조회 성공 + 이상 없음"(침수 없음 등) — **오류·빈과 절대 혼용 금지** (조회 실패를 "안전"처럼 보이게 하면 안 된다. 침수 계약 테스트가 이 원칙을 강제한다).
- 상태 문구는 반드시 i18n 3벌(ko/en/vi·vi는 실제 베트남어).

## 6. 저사양 제약 (베트남 보급형 Android · 4G 전제)

- **`backdrop-filter`/blur 신규 사용 금지.** 기존 `.glass`·Button `glass` variant 는 신규 화면에 반입하지 말고, 화면 정비 시 카드/서피스 문법으로 대체.
- **다중 그림자 금지** — 그림자는 `.card` 수준 1겹까지. `--shadow-pop` 은 주 액션 CTA 1곳만.
- **상시(무한 루프)·스크롤 연동 transform 애니메이션 금지.** 허용: 1회성 진입 트랜지션(BottomSheet slideup 등)과 스켈레톤 shimmer.
- **눌림 피드백은 배경 전환 한 겹**: `:active { background: var(--surface-2); }` (또는 `opacity: .75`). `transform: scale()` 눌림 신규 작성 금지 — 기존 공용 `Button` 의 scale(.98)은 예외로 유지(전면 교체는 회귀 위험, 이 문서 개정으로만 변경).
- 이미지: 동적 이미지는 `<AppImage>` 만 (imgproxy 리사이즈 경유) — `<img>` 직접 사용 금지.

## 7. 공용 컴포넌트 인덱스 (`components/ui`)

| 컴포넌트 | 이럴 때 쓴다 |
|---|---|
| `StateBlock` | 빈/오류/안전 상태 (§5) |
| `SkeletonRows` | 목록 로딩 (§5) |
| `Button` | 화면 주 CTA (variant: primary/secondary/ghost/danger) |
| `Chip` | 재화·태그 캡슐 (brand/gold/xp/exp 등 variant) |
| `BottomSheet` | 모든 시트 (§4) |
| `AppImage` | 모든 동적 이미지 |
| `SearchBox` | 검색 입력 |
| `StarIcon` | 별점의 별 (⭐ 이모지 대체) |
| `RewardIcon` | 재화 아이콘 (EXP/XP/GOLD/ITEM) |
| `VerifiedBadge` / `TrustTierChip` / `LevelBadge` | 신뢰·등급 표시 |
| `Toast` / `AlertDialog` / `ConfirmDialog` | 피드백·확인 |
| `TopBar`(layout) | 서브페이지 헤더 (§4) |
| `ProgressBar` / `Toggle` / `RadioCircle` / `SettingsRow` | 폼·설정 행 |

같은 목적의 로컬 구현을 발견하면 **공용으로 교체**하고, 공용에 없는 필요가 생기면 즉석 제작하지 말고 경계 사례로 보고한다.

## 8. 작업 체크리스트 (화면 하나를 끝낼 때마다)

1. `JetBrains Mono` 0건 · 수치에 `num`(또는 동일 문법) 적용
2. 아이콘 슬롯의 이모지 → lucide/StarIcon/RewardIcon (§2 판별 기준, 콘텐츠 이모지는 보존)
3. 하드코딩 색 → 토큰, 파랑·골드는 §3 전용 용도만
4. 4상태(로딩/빈/오류/정상) 존재, 오류에 재시도
5. 헤더가 2패턴 중 하나, 상단 여백 `var(--status-bar-height)`
6. blur·다중 그림자·상시 transform 없음, 눌림 = 배경 한 겹
7. i18n 3벌 (vi 실제 베트남어), `navigator.*` 직접 호출 없음
8. 검증: `npx tsc -b` 에러 0 · 수정 파일 `npx eslint` 에러 0 · locales JSON 파스 · (info 인접 수정 시) `node src/pages/info/infoLaunchSafety.contract.test.mjs` 5/5

## 변경 이력

- **v1 (2026-07-25)** — 최초 확립. `infoSystem.module.css` → `styles/system.module.css` 전역 승격, `InfoState` → `components/ui/StateBlock` 승격, `SkeletonRows` 신설, 유령 폰트(JetBrains Mono) 7파일 제거.
