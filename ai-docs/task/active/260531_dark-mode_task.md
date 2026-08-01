# 다크모드 (Dark Mode) 구현 — 태스크 SoT

- **카테고리**: `settings` (테마 토글은 설정 화면에서 제어)
- **상태**: IN_PROGRESS (코어 완료·빌드 통과, 실기기 시각검증은 사용자 진행 중)
- **착수일**: 2026-05-31
- **Notion 미러**: https://www.notion.so/3713bd6b405d81ffac98d26be3a7d6b5
- **Plane Feature**: SGR-192

## 목적

기존 디자인을 "라이트모드"로 유지한 채 "다크모드"를 **추가**한다.
- 핵심 제약: **라이트모드 디자인에 회귀(시각 변화)가 없어야 한다.**
- 전환 방식: **설정 화면 수동 토글**(시스템 추종 아님), 선택값 영속화.
- 범위: 인프라 + 전체 마이그레이션(하드코딩 surface hex → 토큰).

## 설계 핵심

- `tokens.css` `:root`(라이트)는 **불변**. `[data-theme="dark"]` 스코프에서 surface 토큰값만 재정의.
- 기본값 `light` → `[data-theme="dark"]` 셀렉터는 라이트에서 미매칭 → 회귀 0(구조적 보장).
- 치환은 **값-동일**(`#FFFFFF`→`var(--surface)`이고 `:root`에서 `--surface=#FFFFFF`).
- `<html data-theme>` 적용 지점은 기존 `data-platform`과 동일(documentElement).
- 다크 팔레트는 기존 `--ink-900~600` 야간 토큰 기반.

## Phase / 서브태스크

### Phase 1 — 인프라 (DONE)
- [x] P1-1 `tokens.css`에 `[data-theme="dark"]` 오버라이드 블록 + `.shimmer` 다크 대응 추가
- [x] P1-2 `store/useThemeStore.ts` 신규 (zustand persist `saigon-rider-theme`, documentElement 반영)
- [x] P1-3 `index.html` FOUC 방지 인라인 스크립트(렌더 전 `data-theme` 선반영)
- [x] P1-4 `Settings.tsx` 기존 무동작 토글 → theme store 배선
- 검증: tsc/eslint 클린

### Phase 2 — 마이그레이션 (DONE)
- [x] P2-1 surface 생 hex → 토큰 일괄 치환 (module CSS 14파일)
- [x] P2-2 지뢰 처리: `InfoFloodMap.module.css` 전역 누출 `:root` surface 재정의 제거
- [x] P2-3 `AppShell` splash 면 토큰화 (다크 프레임/장식 그라데이션은 유지)
- 검증: vite build 성공, sed 손상 0, 라이트 값-동일성 확인

### Phase 3 — 빌드/배포 (DONE)
- [x] P3-1 `docker compose ... up --build -d frontend` 재배포 (saigon_frontend Up)
- [ ] P3-2 실기기/브라우저 시각 검증 (사용자 진행) → 검증 후 Feature DONE 전환

### Phase 4 — 잔여 영역 (TODO, 코어 범위 외)
- [ ] P4-1 status 틴트 배경(앰버/그린/블루/레드 옅은 칩 배경) 다크 짝 토큰 신설
- [ ] P4-2 `globals.css .glass-light` 다크 대응(또는 `.glass` 전환)
- [ ] P4-3 `tokens.css` rarity-card 그라데이션 `#FFF` 끝점 다크 대응

## 변경 파일

- 신규: `frontend/src/store/useThemeStore.ts`
- `frontend/src/styles/tokens.css` (dark 블록 추가)
- `frontend/index.html` (인라인 스크립트 추가)
- `frontend/src/pages/settings/Settings.tsx` (토글 배선)
- module CSS 14파일: FloodDetailSheet, GachaPull, GachaMain, InfoFloodReport,
  InfoRepairDetail, InfoGasList, InfoRepairList, InfoRepairWrite, Inventory,
  CustomerSupport, ItemDetail, ShopCatalog, InfoFloodMap, AppShell

## 제약 / 유지 항목 (치환 금지)

- `color: #fff` (브랜드/액센트 위 흰 글씨) 12곳
- AppShell 다크 프레임(`#0B0D14`), ProfileMain/skeleton 장식 그라데이션
- 브랜드/네온/재화/status 액센트 hex (양 테마 공통)

## 관찰 (이번 범위 외, 보고만)

- module CSS에 tokens.css 미정의 토큰(`--border`,`--text-primary`,`--text-dim`,`--shadow-sm` 등) 참조하는 이름 드리프트 존재. 다크모드와 별개 기존 이슈.
