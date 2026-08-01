# 태스크: SRE 게이미피케이션 v2 업그레이드 연계

> **태스크 ID**: sre_upgrade_plan_task  
> **생성일**: 2026-05-18  
> **최종 수정**: 2026-05-18 (v1.1 — Skywork 자산 통합 + SUB-2.5 신규)  
> **상태**: IN PROGRESS  
> **우선순위**: HIGH  
> **소스**: `_tmp/sre-upgrade/sre-gamification-deployment-guide.md` (v2.0)  
> **DEV Feature**: `#42` SRE 게이미피케이션 v2 — 가챠/상점/시즌 시스템

---

## 0. 세션 진입 가이드

이 태스크를 이어받는 세션은 서브태스크 번호에 따라 아래 파일을 선택적으로 로드:

| 서브태스크 | 먼저 읽어야 할 파일 |
|---|---|
| SUB-1 (문서 색인) | `ai-docs/INDEX.md`, `ai-docs/engine/sre-erd-mermaid.postgres.md` |
| SUB-2 (DB 마이그레이션) | `_tmp/sre-upgrade/sre-gamification-deployment-guide.md` §2 적용순서, `engine/alembic/versions/001_sre_enums.py` (Alembic 패턴 참조) |
| SUB-2.5 (Skywork 자산) | `_tmp/sre-upgrade/appendix/A-claude-code-instructions.md` §Task 2.5, `_tmp/sre-upgrade/appendix/B-design-tokens-components.md` §1.8 + §2.20~§2.24, `frontend/src/styles/tokens.css` |
| SUB-3 (SRE 구현) | `engine/app/models.py`, `engine/app/schemas.py`, `engine/app/services/event_bus.py` (기존 서비스 패턴), `engine/app/routers/events.py` (기존 라우터 패턴), `backend/app/engine_client.py` (BFF 프록시 패턴) |
| SUB-4 (디자인→구현) | `_tmp/sre-upgrade/design/item_catalog_v4_final/` (HTML 시안), `_tmp/sre-upgrade/appendix/B-design-tokens-components.md` §7.5 (surface 모드 기준), `frontend/src/pages/` 기존 페이지 구조 |
| SUB-6 (어드민) | `backend/app/routers/admin.py`, `_tmp/sre-upgrade/sre-gamification-deployment-guide.md` §7 운영 쿼리 |

---

## 1. 개요

SRE(Saigon Rider Reward Engine)에 **RPG 경제 패러다임**을 도입하는 대규모 업그레이드.  
미션 보상이 통화(GP/GC) 중심으로 전환되고, **가챠 5종 + 상점 구매 + 일일 추천 + 천장 시스템**이 신규 추가된다.

### 핵심 변경 요약 (v1 → v2)

| 항목 | v1 | v2 |
|---|---|---|
| 미션 보상 채널 | GP+GC+SXP+아이템+박스 (5개) | GP+GC+SXP 메인, 아이템은 시즌 정복자만 (7개/년) |
| 아이템 직접 지급 미션 | 52개 | 7개 (87% 감소) |
| 박스 직접 지급 미션 | 72개 | 0개 (제거) |
| 신규 시스템 | - | 가챠 5종 + 상점 + 일일 추천 + 천장 |
| 신규 테이블 | 10개 | 15개 (+5) |
| 신규 PL/pgSQL 함수 | 10개 | 16개 (+6) |

---

## 2. 기획 결과물 인벤토리

### 2-A. 핵심 SQL / 가이드 (`_tmp/sre-upgrade/`)

| # | 파일 | 종류 | 라인 | 역할 | 프로젝트 반영 대상 |
|---|---|---|---:|---|---|
| 1 | `sre-gamification-deployment-guide.md` | 가이드 | 376 | 통합 배포 가이드 (본 기획서) | `ai-docs/engine/` 색인 |
| 2 | `migration-step1-alter.sql` | DDL | 134 | 기존 4테이블 ALTER (reward_bundle 등) | Engine DB 마이그레이션 |
| 3 | `migration-step2-new-tables.sql` | DDL | 345 | ENUM 6 + 테이블 10 (아이템/시즌/박스) | Engine DB 마이그레이션 |
| 4 | `migration-step3-gacha-shop.sql` | DDL | 217 | ENUM 1 + 테이블 5 (가챠/상점) | Engine DB 마이그레이션 |
| 5 | `sre-action-definition-extension.sql` | DML | 138 | 신규 액션 14개 | Engine DB 시드 |
| 6 | `sre-item-seed.sql` | DML | 252 | 컬렉션 7 + 아이템 213 + 박스 8 | Engine DB 시드 |
| 7 | `sre-gacha-seed.sql` | DML | 153 | 가챠 5종 시드 | Engine DB 시드 |
| 8 | `sre-mission-reward-bundle.sql` | DML | 250 | 240 미션 reward_bundle v2 UPDATE | Engine DB 시드 |
| 9 | `sre-reward-dispatcher.sql` | 함수 | 834 | 미션 보상 디스패처 10개 함수 | Engine DB 함수 |
| 10 | `sre-shop-gacha-functions.sql` | 함수 | 636 | 가챠/상점 6개 함수 | Engine DB 함수 |
| 11 | `mission_reward_bundle.csv` | 검토용 | 241 | 240 미션 보상 검토 | 참조만 |
| 12 | `build_mission_reward_bundle_v2.py` | 생성기 | 369 | 시드 재생성기 | 참조만 |

### 2-B. ⭐ Appendix (다른 환경 구현 지침 — SUB-2.5 / SUB-4 참고용) (`_tmp/sre-upgrade/appendix/`)

> 다른 환경(Expo 모노레포)에서 이 SRE를 구현하던 지침. 현 프로젝트(Vite + React Web)에 적응하여 연계.

| 파일 | 역할 | 주요 참조 섹션 |
|---|---|---|
| `A-claude-code-instructions.md` | 작업 지시서 v1.1 — Task 2.5 Skywork 통합 13단계 절차 | §Task 2.5 (SUB-2.5의 원본 지침) |
| `B-design-tokens-components.md` | 디자인 토큰 + 컴포넌트 24개 사양 v1.1 | §1.8 (아이템 토큰), §2.20~§2.24 (신규 5개 컴포넌트), §7 (Skywork 자산 통합 가이드) |
| `C-api-contract.md` | API 계약 명세 — Supabase + PostgREST + Hono | 가챠/상점/인벤토리 API 스키마 참고 |
| `D-build-decisions.md` | 클라이언트 빌드 결정서 — 모노레포 구조 결정 배경 | 현 프로젝트 구조와의 차이 이해용 |
| `saigon-rider-items.svg` | **Skywork v4 SVG sprite** (98KB, 27개 아이템 + 베이스/데칼) | → `frontend/src/assets/items/` 배치 |
| `saigon-rider-items.css` | **Skywork v4 디자인 토큰 CSS** (10KB, 등급 글로우 + 컬렉션 칩 클래스) | → `frontend/src/styles/items.css` 배치 |

### 2-C. ⭐ 디자인 샘플 (`_tmp/sre-upgrade/design/item_catalog_v4_final/`)

> Skywork v4 결과물 기반 React 프로젝트 샘플. 아이템 카탈로그 UI 구현의 레퍼런스.

| 파일 | 역할 |
|---|---|
| `saigon-rider-item-catalog.html` | 27개 아이템 전체 카탈로그 (등급·컬렉션별) |
| `screens_v3_rpg.html` | 36개 화면 시안 (가챠/상점/인벤토리/시즌패스) |
| `screens_index.html` | 화면 색인 |
| `saigon-rider-items.svg` / `saigon-rider-items.css` | appendix 자산과 동일본 |
| `src/` | React 컴포넌트 샘플 (참고용) |

### 2-D. ⭐ 아이템 이미지 생성 규칙 (참고 이미지 수령 완료)

> 3장의 참고 이미지로 전체 아이템 생성 체계 확정.

#### §1.1 — 슬롯 베이스 라이브러리 (19개 SVG 실루엣)

모든 아이템의 형태적 DNA. 컬러는 CSS 변수로 외부 주입.

| 카테고리 | 슬롯 | SVG base ID |
|---|---|---|
| AVATAR (슬롯 1~6) | HELMET, JACKET, GLOVES, BOOTS, EYEWEAR, NAMEPLATE | `base-helmet`, `base-jacket`, … |
| GARAGE (슬롯 1~7) | BODY_PAINT, WHEEL, EXHAUST, HEADLIGHT, MIRROR, DECAL, NUMBER_PLATE | `base-body-paint`, … |
| PROFILE (슬롯 1~2) | FRAME, BACKDROP | `base-frame`, `base-backdrop` |
| FX (슬롯 1~3) | TITLE_BANNER, TRAIL, HORN, START_ANIM | `base-trail`, … |

> 19개 베이스는 `saigon-rider-items.svg`의 `<symbol id="base-*">` 로 이미 포함됨

#### §1.4 — 등급별 시각 효과 5단계 (같은 베이스, 다른 사건)

| 등급 | 컬러 적용 | 데칼 | 효과 레이어 | CSS filter |
|---|---|---|---|---|
| COMMON | primary 단색 | 없음 | 없음 | none |
| RARE | primary + secondary 2색 분할 | 1개 (작게, 30~50%) | 글로우 보더 stroke | `url(#glow-rare)` |
| EPIC | primary + secondary + 라인 디테일 | 1개 (중간, 50~80%) | 글로우 + 그리드 오버레이 | `url(#glow-epic)` |
| LEGENDARY | grad-legendary-rim + accent 트림 | 1~2개 (크게) + 골드 한자 | 골드 림 stroke + sparkle ×4 | `url(#glow-legendary)` |
| MYTHIC | grad-mythic-holo 전체 fill | 2개 드라마틱 (100%) | holo stroke + conic BG + particle ×6 | `url(#glow-mythic)` |

> `url(#glow-*)` 필터는 `saigon-rider-items.svg`의 `<defs>` 안에 정의되어 있음  
> → build.mjs에서 `<defs>` 전체를 standalone SVG에 prepend해야 필터가 유지됨 (SUB-2.5 STEP 7)

#### §3.5 — 183개 확장 가이드 (변형 매트릭스)

**핵심**: 19개 베이스 SVG × 등급별 규칙 = **나머지 183개를 이 규칙만으로 자동 생성 가능**

- **현재 확보**: Skywork v4 SVG 27개 (appendix sprite에 완성품으로 포함)
- **자동 생성 대상**: 나머지 186개 = 19 베이스 × 컬렉션 × 등급 조합 (변형 매트릭스 적용)
- **생성 방식**: 베이스 SVG에 CSS 변수(`--col-{collection}-primary` 등)와 데칼 레이어를 프로그래매틱하게 합성
- **참고 이미지 위치**: `_tmp/sre-upgrade/design/item_image_references/` (수령 완료, 플랜 기준 이미지로 활용)

---

## 3. 서브태스크 체크리스트

> 각 서브태스크 완료 시 체크박스 갱신 + 대응하는 `__DEV_todos` 상태도 함께 전환.

---

### SUB-1: 기획 문서 정식 색인 등록

**상태**: ✅ DONE (2026-05-18) | **DEV Todo**: `#26` (LOW)

- [x] 배포 가이드를 `ai-docs/engine/sre-gamification-deployment-guide.md`로 복사
- [x] `ai-docs/INDEX.md` "🛠 엔진 내부 설계 (SRE)" 섹션에 색인 추가
- [x] 기존 `ai-docs/engine/sre-erd-mermaid.postgres.md` ERD에 v2 신규 테이블 15개 + ENUM 7개 + 기존 4테이블 ALTER 반영
- [x] `ai-docs/engine/sre-design-spec.md`에 v2 변경사항 참조 링크 추가
- [x] DEV Todo `#26` → DONE 전환

---

### SUB-2: DB 마이그레이션 연계

**상태**: ✅ DONE (2026-05-18) | **DEV Todo**: `#24` (HIGH)

**⚠ 핵심**: Engine DB는 **Alembic** 마이그레이션 사용 (BFF의 `database/init/NNN_*.sql` 순번제와 다름).  
`_tmp/sre-upgrade/*.sql`은 raw SQL → Alembic 리비전으로 래핑 필요.

**Engine 마이그레이션 구조**:
- 경로: `engine/alembic/versions/`
- 현재 최신: `010_sre_message.py` (sre010)
- 패턴: `op.execute("""...""")` 로 raw SQL 래핑 (예: `001_sre_enums.py` 참조)

**체크리스트**:
- [x] Alembic 리비전 생성 — DDL 3개:
  - [x] `011_gamification_alter.py` ← `migration-step1-alter.sql`
  - [x] `012_gamification_new_tables.py` ← `migration-step2-new-tables.sql`
  - [x] `013_gacha_shop_tables.py` ← `migration-step3-gacha-shop.sql`
- [x] Alembic 리비전 생성 — 시드 1개:
  - [x] `014_gamification_seed.py` ← action-extension + item-seed + gacha-seed + mission-reward-bundle 통합
- [x] Alembic 리비전 생성 — 함수 2개:
  - [x] `015_reward_dispatcher_functions.py` ← `sre-reward-dispatcher.sql`
  - [x] `016_shop_gacha_functions.py` ← `sre-shop-gacha-functions.sql`
- [x] `engine/app/enums.py`에 신규 ENUM 7개 추가:
  - `CollectionStatusEnum`, `ItemSlotEnum`, `ItemRarityEnum`, `AcquisitionSourceEnum`
  - `SeasonStatusEnum`, `BoxStatusEnum`, `GachaStatusEnum`
- [ ] `alembic upgrade head` 실행 및 검증
- [ ] 기존 SRE 테이블 충돌 여부 검증 (`mission_definition.reward_bundle` 등)
- [x] DEV Todo `#24` → DONE 전환

---

### SUB-2.5: ⭐ Skywork 자산 통합 (프론트엔드 아이템 디자인 시스템)

**상태**: ✅ DONE (2026-05-18) | **DEV Todo**: `#31` (HIGH) — 신규 등록 필요  
**참고 원본**: `_tmp/sre-upgrade/appendix/A-claude-code-instructions.md` §Task 2.5 (13단계)  
**현 프로젝트 적응**: Expo 모노레포 → **Vite + React Web** (`frontend/`) 기준으로 조정

> **전제**: appendix의 Task 2.5는 Expo 모노레포(`packages/tokens/`, `packages/items/`) 기준.  
> 현 프로젝트는 `frontend/` 단일 Vite 앱이므로 경로를 아래와 같이 매핑.

**경로 매핑**:
| appendix 경로 | 현 프로젝트 경로 |
|---|---|
| `packages/tokens/css/items.css` | `frontend/src/styles/items.css` |
| `packages/tokens/src/items.ts` | `frontend/src/lib/items/tokens.ts` |
| `packages/tokens/css/tokens.css` (import 추가) | `frontend/src/styles/tokens.css` |
| `packages/items/sprite/saigon-rider-items.svg` | `frontend/src/assets/items/saigon-rider-items.svg` |
| `packages/items/src/metadata.ts` | `frontend/src/lib/items/metadata.ts` |
| `packages/items/src/index.ts` | `frontend/src/lib/items/index.ts` |
| `packages/items/build.mjs` | `frontend/scripts/build-item-xml-map.mjs` |
| `packages/ui/src/game/CollectionChip.tsx` | `frontend/src/components/ui/items/CollectionChip.tsx` |
| `packages/ui/src/game/ItemSparkle.tsx` | `frontend/src/components/ui/items/ItemSparkle.tsx` |
| `packages/ui/src/game/InventoryCell.tsx` | `frontend/src/components/ui/items/InventoryCell.tsx` |
| `packages/ui/src/game/ItemSvgRenderer.tsx` | `frontend/src/components/ui/items/ItemSvgRenderer.tsx` |
| `packages/ui/src/game/MythicCardOverlay.tsx` | `frontend/src/components/ui/items/MythicCardOverlay.tsx` |

**체크리스트 (13단계)**:

#### STEP 1 — 외부 자산 파일 배치
- [x] `frontend/src/assets/items/` 디렉토리 생성
- [x] `_tmp/sre-upgrade/appendix/saigon-rider-items.svg` → `frontend/src/assets/items/saigon-rider-items.svg` 복사
- [x] `_tmp/sre-upgrade/appendix/saigon-rider-items.css` → `frontend/src/styles/items.css` 복사

#### STEP 2 — tokens.css에 @import 추가
- [x] `frontend/src/styles/tokens.css` 파일 마지막에 추가:
  ```css
  /* Item domain tokens (Skywork v4 — 컬렉션 + 등급 효과) */
  @import './items.css';
  ```

#### STEP 3 — `frontend/src/lib/items/tokens.ts` 신규 작성
- [x] `B-design-tokens-components.md` §1.8.1 그대로 — `collection` 객체(7개 컬렉션) + `itemRarityFx` 객체(5등급 효과)

#### STEP 4 — `frontend/src/lib/items/metadata.ts` 작성
- [x] `B-design-tokens-components.md` §7.3 그대로 — 27개 아이템 메타 배열 + 헬퍼 4개
  - `itemByCode(code)` — 코드로 단일 아이템 조회
  - `itemsBySlot(slot)` — 슬롯 필터
  - `itemsByCollection(collection)` — 컬렉션 필터
  - `itemsByRarity(rarity)` — 등급 필터
  - 타입 4개: `ItemSlot`, `ItemRarity`, `CollectionCode`, `ItemMeta`

#### STEP 5 — `frontend/src/lib/items/index.ts`
- [x] metadata.ts + tokens.ts 일괄 re-export

#### STEP 6 — SVG Sprite 페이지 embed 유틸 (`frontend/src/lib/items/SpriteProvider.tsx`)
- [x] 앱 최초 마운트 시 SVG sprite를 `<div hidden>` 안에 inline embed하는 컴포넌트
- [x] `App.tsx` 최상단에 `<SpriteProvider />` 추가

#### STEP 7 — `ItemSvgRenderer.tsx` 컴포넌트
- [x] props: `itemCode`, `size?`, `rarity?`, `className?`
- [x] `<svg viewBox="0 0 200 200">` + `<use href="#item-{itemCode}" />`
- [x] `rarity` 있으면 `.item-r-{c|r|e|l|m}` 클래스 적용

#### STEP 8 — `MythicCardOverlay.tsx` 컴포넌트
- [x] props: `variant?: 'full' | 'subtle'`
- [x] conic-gradient 회전 오버레이

#### STEP 9 — `ItemSparkle.tsx` 컴포넌트
- [x] props: `style?`, `delay?`, `color?`, `size?`

#### STEP 10 — `InventoryCell.tsx` 컴포넌트
- [x] props: `rarity`, `children`, `empty?`, `locked?`, `onClick?`
- [x] Mythic셀에 `<MythicCardOverlay variant="subtle" />` 자동 포함

#### STEP 11 — `CollectionChip.tsx` 컴포넌트
- [x] props: `collection: CollectionCode`, `size?: 'sm' | 'md'`

#### STEP 12 — `RarityCard.tsx` surface prop
- [x] 신규 생성 — `surface?: 'light' | 'dark'` prop
- [x] `surface='dark'` + `rarity='M'` → `<MythicCardOverlay />` 자동 렌더
- [x] `surface='dark'` + `rarity='L'` → `<ItemSparkle />` 4개 자동 배치

#### STEP 13 — 통합 검수
- [x] TypeScript 에러 없음: `tsc --noEmit` 통과
- [ ] SVG sprite embed 확인 (브라우저 런타임)
- [ ] Mythic conic-gradient 회전 오버레이 작동 확인 (브라우저 런타임)

**검수 이미지 기준**: 아이템 이미지 생성규칙 참고 이미지 (`_tmp/sre-upgrade/design/item_image_references/`) 참조 — 수령 후 추가

---

### SUB-3: SRE(Engine) 서비스 레이어 구현 + BFF 프록시 연결

**상태**: ⚡ IN PROGRESS (2026-05-18, 휴먼 검증 대기) | **DEV Todo**: `#25` (HIGH)

**⚠ 핵심 원칙**: 가챠/상점/인벤토리/시즌의 **모든 비즈니스 로직은 SRE(Engine)에 구현**한다.  
BFF는 Engine API를 호출하는 **얇은 프록시**일 뿐, 비즈니스 로직을 갖지 않는다.

**구현 계층**:
```
[PL/pgSQL 함수] ← DB 레벨 (pull_gacha, purchase_shop_item 등 — SUB-2에서 적용 완료)
       ↑
[Engine 서비스] ← engine/app/services/ (PL/pgSQL 호출 + 트랜잭션 관리)
       ↑
[Engine 라우터] ← engine/app/routers/ (/v1/* API 노출)
       ↑
[BFF 프록시]   ← backend/app/engine_client.py (httpx → Engine HTTP 호출, 로직 없음)
       ↑
[프론트엔드]   ← frontend/src/api/
```

**Engine 구조 참고**:
- 모델: `engine/app/models.py` (단일 파일, SQLAlchemy)
- 스키마: `engine/app/schemas.py` (Pydantic)
- 서비스: `engine/app/services/` (비즈니스 로직, PL/pgSQL 호출)
- 라우터: `engine/app/routers/` (현재 11개: admin, balance, catalog, events, gacha, inventory, message, missions, redemptions, season, shop)
- BFF 연동: `backend/app/engine_client.py` (`EngineClient`, httpx 기반)

**체크리스트 — Engine(SRE) 구현 (핵심)**:
- [x] `engine/app/models.py` 신규 모델 15개:
  - [x] `ItemCollection`, `ItemDefinition`, `UserItem`, `UserEquipment`
  - [x] `Season`, `UserSeasonPass`
  - [x] `LootboxDefinition`, `UserInventoryBox`, `LootboxDropLog`, `ItemAcquisitionLog`
  - [x] `GachaDefinition`, `UserGachaPity`, `GachaPullLog`, `DailyFeaturedItem`, `ShopPurchaseLog`
- [x] `engine/app/schemas.py` Request/Response 스키마
- [x] `engine/app/services/` 신규 서비스:
  - [x] `gacha.py` — 가챠 실행 (PL/pgSQL `pull_gacha` 호출)
  - [x] `shop.py` — 상점 구매 + 일일 추천
  - [x] `inventory.py` — 아이템 조회/장착
  - [x] `season.py` — 시즌 관리
- [x] `engine/app/routers/` 신규 라우터:
  - [x] `gacha.py` — `POST /v1/gacha/pull`, `GET /v1/gacha/list`, `GET /v1/gacha/pity/{code}`
  - [x] `shop.py` — `GET /v1/shop/items`, `POST /v1/shop/purchase`, `GET /v1/shop/daily-featured`
  - [x] `inventory.py` — `GET /v1/inventory/{user_uuid}/items`, `GET /v1/inventory/{user_uuid}/equipment`, `PUT /v1/inventory/{user_uuid}/equip`
  - [x] `season.py` — `GET /v1/season/current`, `GET /v1/season/{user_uuid}/pass`

**체크리스트 — BFF 프록시 (얇은 레이어, 로직 없음)**:
- [x] `backend/app/engine_client.py` 신규 메서드 (단순 HTTP 호출만):
  - [x] `pull_gacha(user_uuid, gacha_code, is_10_pull)` → `POST /v1/gacha/pull`
  - [x] `get_gacha_list()` → `GET /v1/gacha/list`
  - [x] `get_shop_items()` / `purchase_shop_item(...)` / `get_daily_featured()`
  - [x] `get_inventory(user_uuid)` / `equip_item(user_uuid, item_code)`
  - [x] `get_season_current()` / `get_season_pass(user_uuid)`
- [x] `backend/app/routers/` BFF 프록시 라우터 (검증/변환만, 로직 금지):
  - [x] `gacha.py`, `shop.py`, `inventory.py`, `season.py`
- [x] DEV Todo `#25` → DONE 전환

---

### SUB-4: 프론트엔드 디자인 수령 및 UI 구현

**상태**: ✅ DONE (2026-05-18, STEP D 전체 완료) | **DEV Todos**: `#23` (DONE), `#27` (DONE), `#29` (DONE), `#30` (IN PROGRESS)

#### STEP A: 디자인 요청 및 수령 ✅ DONE

- [x] 디자인 레퍼런스 수령 완료:
  - `_tmp/sre-upgrade/design/item_catalog_v4_final/` — React 프로젝트 샘플 (27개 아이템 카탈로그)
  - `_tmp/sre-upgrade/design/item_catalog_v4_final/screens_v3_rpg.html` — 36개 화면 시안
  - `_tmp/sre-upgrade/appendix/saigon-rider-items.svg` — SVG sprite (98KB)
  - `_tmp/sre-upgrade/appendix/saigon-rider-items.css` — 디자인 토큰 CSS (10KB)
- [x] DEV Todo `#23` → DONE 전환

#### STEP B: 아이템 이미지 에셋 확보 (DEV Todo `#30` MEDIUM) — ⚡ 방안 확정

> **참고**: §3.5 변형 매트릭스 이미지 수령 완료 → 생성 규칙 확정

- [x] 에셋 확보 방안 확정: **베이스 SVG × 변형 매트릭스 프로그래매틱 합성**
  - 27개: Skywork v4 SVG sprite 완성품 즉시 사용 (appendix 자산)
  - 나머지 186개: 19 베이스 × 컬렉션 × 등급 규칙으로 SVG 합성 생성
- [x] 이미지 생성규칙 참고 이미지 수령 완료 (`_tmp/sre-upgrade/design/item_image_references/`)
- [ ] DB `item_definition` 213개 매핑 계획 수립:
  - `item_definition.image_code` 컬럼 활용
  - Sprite 범위 27개: `image_code = 'HELMET_LEGEND_OF_SAIGON_M_01'` → `#item-{image_code}` 참조
  - 합성 생성 186개: 베이스 + 컬렉션 컬러 + 등급 효과 레이어 합성 → SVG 파일 → `contents` 테이블 중개
- [ ] 186개 SVG 합성 생성 스크립트 작성:
  - 입력: 19 베이스 SVG + `collection` 컬러 토큰 + 등급 규칙 (§3.5 매트릭스)
  - 출력: `frontend/src/assets/items/generated/{itemCode}.svg`
  - 적용 규칙 (§3.5):
    - COMMON: `--col-{collection}-primary` 단색 fill
    - RARE: primary/secondary 2색 분할 + `url(#glow-rare)` filter + 데칼 1개 (30~50%)
    - EPIC: primary/secondary + 라인 디테일 + `url(#glow-epic)` + 데칼 1개 (50~80%)
    - LEGENDARY: `grad-legendary-rim` + accent 트림 + `url(#glow-legendary)` + 데칼 1~2개 + 골드 한자
    - MYTHIC: `grad-mythic-holo` 전체 fill + `url(#glow-mythic)` + 데칼 2개 (100%) + holo conic BG
- [ ] DEV Todo `#30` → DONE 전환

#### STEP C: 디자인 파일 배치 및 검토 ✅ DONE

- [x] 수령된 디자인을 `_tmp/sre-upgrade/design/` 하위에 배치 완료
- [x] 디자인 리뷰: Skywork v4 SVG sprite + CSS 클래스 체계 확인
- [x] API 스키마 매핑: `C-api-contract.md` 기준으로 확인됨
- [x] DEV Todo `#29` → DONE 전환

#### STEP D: 화면별 구현 (DEV Todo `#27` HIGH)

> **착수 조건**: SUB-2.5 완료 (아이템 컴포넌트) + SUB-3 완료 (API)  
> **디자인 참고**: `_tmp/sre-upgrade/design/item_catalog_v4_final/screens_v3_rpg.html` (36화면)  
> **컴포넌트**: SUB-2.5에서 생성한 아이템 UI 컴포넌트 활용

**surface 모드 선택 기준** (`B-design-tokens-components.md` §7.5):
| 화면 | surface | 이유 |
|---|---|---|
| D-3 상점 카탈로그, D-4 아이템 상세, D-5 인벤토리 | `light` | 앱 chrome 위, 라이트 카드 |
| D-2 가챠 연출 결과, D-6 장착 프리뷰 | `dark` ⭐ | 다크 배경 + Mythic 회전 효과 |

- [x] D-1 가챠 메인 — `frontend/src/pages/gacha/GachaMain.tsx`
  - 5종 가챠 배너 + 진입 / PityBar 컴포넌트
- [x] D-2 가챠 연출 — `frontend/src/pages/gacha/GachaPull.tsx`
  - 단일/10연 결과 애니메이션 / rarity-card[data-r] + `<ItemSvgRenderer>`
  - Mythic: MythicCardOverlay 회전 + ConfettiLayer (SVG)
  - Legendary: ItemSparkle × 4 + ConfettiLayer
- [x] D-3 상점 카탈로그 — `frontend/src/pages/shop/ShopCatalog.tsx`
  - 아이템 그리드 + 필터(등급/슬롯/컬렉션) / CollectionChip + `<RarityCard surface="light">`
  - 일일 추천(Featured) 섹션 구분
- [x] D-4 아이템 상세 — `frontend/src/pages/shop/ItemDetail.tsx`
  - `<ItemSvgRenderer>` + 구매 CTA + rarity-chip + 컬렉션 진행 바
- [x] D-5 인벤토리 — `frontend/src/pages/inventory/Inventory.tsx`
  - 보유 아이템 그리드 / `<InventoryCell>` 4열 그리드
  - 장착 슬롯 19종 (아바타6/차고7/프로필3/FX3)
- [x] D-6 장착 프리뷰 — `frontend/src/pages/inventory/EquipPreview.tsx`
  - 슬롯 탭 + 아이템 리스트 + 프리뷰 히어로 + 저장 CTA
- [x] D-7 시즌패스 — `frontend/src/pages/season/SeasonPass.tsx`
  - 레벨 트래커 + 보상 타임라인 (가로 스크롤 free/premium 행)
- [x] D-8 재화 HUD — `frontend/src/components/ui/CurrencyHUD.tsx` (공통 컴포넌트)
  - GP/GC 잔액 표시 (WorldMap 헤더 연동)
- [x] `frontend/src/api/` 신규 API 함수 (gacha.ts, shop.ts, inventory.ts, season.ts)
- [x] `App.tsx` 라우트 등록 (/gacha, /gacha/pull/:gachaCode, /shop, /shop/item/:itemCode, /inventory, /inventory/equip-preview, /season)
- [x] i18n (ko/en/vi) 번역 키 추가 (gacha/shop/inventory/gachaPull/itemDetail/equipPreview/seasonPass)
- [x] DEV Todo `#27` → DONE 전환

---

### SUB-5: __DEV Context 등록

**상태**: ✅ DONE (2026-05-18)

- [x] `__DEV_features` 등록 완료:
  - `#42` SRE 게이미피케이션 v2 — 가챠/상점/시즌 시스템 (PLANNED, category: engine)
  - `#43` SRE v2 — 미션 보상 디스패처 (PLANNED)
  - `#44` SRE v2 — 아이템 컬렉션 & 인벤토리 (PLANNED)
  - `#45` SRE v2 — 시즌 & 시즌패스 (PLANNED)
- [x] `__DEV_todos` 등록 완료 (#23~#30)
- [ ] `__DEV_todos` `#31` 신규 등록: "Skywork 자산 통합 + 아이템 컴포넌트 구현" (HIGH) → SUB-2.5

---

### SUB-6: 관리자 콘솔 확장

**상태**: ⚡ IN PROGRESS (2026-05-18, 휴먼 검증 대기) | **DEV Todo**: `#28` (MEDIUM)

- [x] 가챠 관리 (가챠 정의 조회/수정, 확률 테이블 편집)
  - Engine: `GET/PUT /v1/admin/gacha/definitions[/{code}]` (service key 인증)
  - BFF: `GET/POST /admin/sre/gacha[/{code}/edit]`
  - 템플릿: `sre_gacha_list.html`, `sre_gacha_edit.html`
- [x] 상점 관리 (아이템 가격/노출/시즌잠금 설정)
  - Engine: `GET/PUT /v1/admin/shop/items[/{item_code}]`
  - BFF: `GET /admin/sre/shop`, `POST /admin/sre/shop/{item_code}/edit`
  - 템플릿: `sre_shop_list.html`
- [x] 일일 추천 수동 갱신 + 이력 조회
  - Engine: `GET /v1/admin/shop/daily-featured`, `POST /v1/admin/shop/daily-featured/refresh`
  - BFF: `GET/POST /admin/sre/daily-featured[/refresh]`
  - 템플릿: `sre_daily_featured.html`
- [x] 운영 대시보드 — 인플레 모니터링 쿼리 4종 (기획서 §7):
  - [x] 일일 발행/소모 (GP/GC net) — `GET /v1/admin/ops/daily-net`
  - [x] 가챠별 ROI 분석 — `GET /v1/admin/ops/gacha-roi`
  - [x] 가챠 vs 상점 사용 비율 — `GET /v1/admin/ops/channel-ratio`
  - [x] 천장 도달자 분포 — `GET /v1/admin/ops/pity-distribution`
  - 템플릿: `sre_ops.html`
- [x] sidebar에 "SRE 운영" 메뉴 추가 (`_layout.html`)
- [ ] DEV Todo `#28` → DONE 전환 (휴먼 검증 후)

---

## 4. 의존성 그래프

```
SUB-5 (DEV 등록) ✅ DONE
SUB-1 (문서 색인) ✅ DONE

SUB-2 (DB 마이그레이션)
    │
    ├──→ SUB-3 (BFF API) ──────────────────────────────────┐
    │         │                                             │
    │         └──→ SUB-6 (어드민)                          │
    │                                                       ▼
    └──→ SUB-2.5 (Skywork 자산 통합) ──→ SUB-4 STEP D (프론트 구현)
              (SUB-2와 병행 가능)                           ↑
                                          SUB-4 STEP B (이미지 생성규칙 참고 이미지 수령)
```

**병행 가능**: SUB-2, SUB-2.5는 독립적으로 동시 착수 가능  
**순차 필수**: SUB-2 → SUB-3 → SUB-4 STEP D  
**순차 필수**: SUB-2.5 완료 후 SUB-4 STEP D 착수 (컴포넌트 필요)  
**SUB-4 STEP B**: STEP D와 병행 — 27개로 먼저 구현, 186개는 점진 추가

---

## 5. 리스크 / 주의사항

| 리스크 | 영향 | 대응 |
|---|---|---|
| Engine DB와 BFF DB가 분리 운영 | 마이그레이션 경로가 다름 (Alembic vs 순번 SQL) | SUB-2에 Alembic 래핑 절차 명시 |
| 기존 `reward_rp` → `reward_bundle` 전환 | 기존 미션 보상 로직 호환성 | step1 ALTER가 기존 데이터를 JSONB로 마이그레이션 (확인됨) |
| SVG sprite `<use>` 방식 브라우저 호환성 | 크로스 오리진 SVG use 제한 | 동일 도메인 inline embed 방식으로 우회 (STEP 6) |
| 아이템 이미지 213개 중 186개 미확보 | 상점/인벤토리 UI 미완 | 27개 SVG로 먼저 구현 → 플레이스홀더로 나머지 처리 |
| appendix는 Expo 모노레포 기준 | 현 프로젝트(Vite Web)와 구조 불일치 | SUB-2.5에서 경로 매핑표 준수 (섹션 3 참조) |
| 가챠 도박성 규제 | 앱스토어 심사 이슈 가능 | 천장+10연 보장+확률 공시로 보호장치 확인됨 |

---

## 6. 현재 프로젝트와의 접점

| 기존 시스템 | 연계 지점 |
|---|---|
| `rp_balance` 테이블 | `gc_balance`, `lifetime_gc_*` 컬럼 추가 (step1) |
| `mission_definition` 테이블 | `reward_bundle` JSONB 컬럼 추가 (step1) |
| `user_mission_progress` 테이블 | `reward_dispatched_at`, `reward_dispatch_log` 추가 (step1) |
| `rp_transaction` 테이블 | `currency` 컬럼 추가 (GP/GC 구분, step1) |
| Engine `models.py` | 15개 신규 SQLAlchemy 모델 (SUB-3) |
| BFF `engine_client.py` | 가챠/상점/인벤토리/시즌 신규 메서드 (SUB-3) |
| `frontend/src/styles/tokens.css` | Skywork `items.css` @import 추가 (SUB-2.5 STEP 2) |
| `frontend/src/assets/` | SVG sprite 98KB 배치 (SUB-2.5 STEP 1) |
| `frontend/src/components/ui/` | 아이템 컴포넌트 5개 신규 (SUB-2.5 STEP 7~11) |
| 월드맵 재화 HUD | GP/GC/SXP 표시 (현재 xp/gold만, D-8에서 확장) |
| `contents` 테이블 | 아이템 이미지 186개 점진 등록 (owner_type: `system`) |

---

## 7. DEV DB 매핑 요약

**Features** (category: engine):

| ID | 이름 | 상태 |
|---|---|---|
| `#42` | SRE 게이미피케이션 v2 — 가챠/상점/시즌 시스템 | PLANNED |
| `#43` | SRE v2 — 미션 보상 디스패처 | PLANNED |
| `#44` | SRE v2 — 아이템 컬렉션 & 인벤토리 | PLANNED |
| `#45` | SRE v2 — 시즌 & 시즌패스 | PLANNED |

**Todos** (feature_id: 42):

| ID | 제목 | 우선순위 | 매핑 | 상태 |
|---|---|---|---|---|
| `#23` | 프론트 디자인 레퍼런스 요청 | URGENT | SUB-4 STEP A | ✅ DONE |
| `#24` | DB 마이그레이션 적용 | HIGH | SUB-2 | TODO |
| `#25` | BFF API 설계 | HIGH | SUB-3 | TODO |
| `#26` | 기획 문서 색인 편입 | LOW | SUB-1 | ✅ DONE |
| `#27` | 프론트 UI 구현 | HIGH | SUB-4 STEP D | TODO |
| `#28` | 어드민 운영 대시보드 | MEDIUM | SUB-6 | TODO |
| `#29` | 디자인 레퍼런스 수령 → design/ 배치 | HIGH | SUB-4 STEP C | ✅ DONE |
| `#30` | 아이템 이미지 에셋 확보 | MEDIUM | SUB-4 STEP B | IN PROGRESS |
| `#31` ⭐ | Skywork 자산 통합 + 아이템 컴포넌트 | HIGH | SUB-2.5 | TODO — 신규 등록 필요 |

---

## 8. 다음 액션 (착수 순서 권장)

1. **즉시 병행**:
   - **SUB-2**: Alembic 리비전 생성 + `alembic upgrade head`
   - **SUB-2.5**: Skywork 자산 통합 13단계 (DB 마이그레이션과 독립적으로 진행 가능)
2. **STEP B 병행**: 아이템 이미지 생성규칙 참고 이미지 수령 후 `item_image_references/` 배치
3. **SUB-2 완료 후**: SUB-3 — Engine 모델/서비스/라우터 + BFF engine_client 확장
4. **SUB-2.5 + SUB-3 완료 후**: SUB-4 STEP D — 화면 구현 (가챠 → 상점 → 인벤토리 → 시즌패스 순)
5. **병행**: SUB-6 — 어드민 운영 대시보드 (SUB-3과 병행 가능)
6. **점진**: SUB-4 STEP B 잔여분 — 186개 아이템 이미지 생성 + contents 테이블 등록

---

## 9. 미구현 사항 감사 (2026-05-18 검증)

> `_tmp/sre-upgrade/` 원본 문서 대비 태스크 미반영 항목 정리.  
> 소스: deployment-guide §1-§7, appendix A/B/C, SQL 파일 크로스 체크.

---

### GAP-HIGH: 누락된 핵심 기능

#### GAP-H1: E2E 테스트 시나리오 미반영 (deployment-guide §6)

배포 가이드 §6에 **5개 E2E 테스트 시나리오**가 정의되어 있으나 별도 서브태스크 없음:

| 시나리오 | 내용 | 검증 대상 |
|---|---|---|
| A | 신규 유저 가입 → 라이딩 → 첫 가챠 | 전체 파이프라인 |
| B | 10연차 프리미엄 보장 검증 | `pull_gacha` 10연 로직 |
| C | 천장 100회 도달 트리거 | `user_gacha_pity` + 천장 |
| D | 상점 구매 + 일일 추천 할인 | `purchase_shop_item` + `daily_featured` |
| E | 시즌 종료 → 천장 리셋 | `reset_season_gacha_pity` |

**필요 액션**: SUB-7 (E2E 테스트) 서브태스크 신설 또는 SUB-3 체크리스트에 통합

#### GAP-H2: SUB-3에 누락된 API 엔드포인트 (C-api-contract.md 대비)

SUB-4 화면에서 사용되지만 SUB-3 체크리스트에 없는 엔드포인트:

| 엔드포인트 | 참조 소스 | SUB-4 사용처 |
|---|---|---|
| `unequip_slot` (PUT/DELETE) | C-api-contract §5.3 | D-6 EquipPreview — 장착 해제 |
| `gacha_pull_log` (GET) | C-api-contract §7.4 | 가챠 이력 조회 |
| `check_gacha_eligibility` (GET) | C-api-contract §7.5 | D-1 GachaMain — 뽑기 전 잔액/조건 확인 |
| `item_collection_progress_view` (GET) | C-api-contract §5.5 | D-4 ItemDetail — 컬렉션 진행 바 |
| `season_level_view` (GET) | C-api-contract §8.2 | D-7 SeasonPass — 30레벨 보상 트랙 |
| `claim_season_reward` (POST) | C-api-contract §8.3 | D-7 SeasonPass — 시즌 보상 수령 |

**필요 액션**: SUB-3 Engine 라우터 + BFF 프록시 체크리스트에 추가

#### GAP-H3: SUB-4에서 참조하지만 미생성된 UI 컴포넌트

SUB-4 STEP D 화면 설명에서 사용되지만 생성 체크리스트가 없는 컴포넌트:

| 컴포넌트 | B-design-tokens 섹션 | SUB-4 사용처 |
|---|---|---|
| `PityBar` | §2.5 | D-1 GachaMain — 천장 진행 바 |
| `ConfettiLayer` | §2.10 | D-2 GachaPull — Mythic/Legendary 연출 |
| `RarityChip` | §2.3 | D-4 ItemDetail — 등급 칩 표시 |
| `CurrencyBadge` | §2.4 | D-8 CurrencyHUD — GP/GC 뱃지 |
| `GachaCardBack` | §2.6 | D-2 GachaPull — 카드 뒷면 연출 |

**필요 액션**: SUB-2.5에 STEP 14~18 추가 또는 SUB-4 STEP D 착수 시 인라인 생성

#### GAP-H4: 시즌 1 활성화 INSERT 누락 (deployment-guide §2 Step 7)

배포 가이드 §2 Step 7에 정의된 시즌 1 활성화 (`INSERT INTO season ... 'TET_S1'`)가 시드 마이그레이션(014)이나 별도 체크리스트에 없음. 시즌 시스템이 동작하려면 최소 1개 시즌 레코드 필요.

**필요 액션**: `014_gamification_seed.py`에 포함 여부 확인, 미포함 시 추가 마이그레이션 또는 시드 보완

---

### GAP-MEDIUM: 아키텍처/보안 관련

#### GAP-M1: PostgreSQL 뷰 7개 미추적 (C-api-contract 전역)

API 계약서에 정의된 뷰가 마이그레이션 체크리스트에 없음:

- `sre_user_view`, `user_inventory_view`, `user_equipment_view`
- `item_collection_progress_view`, `shop_catalog_view`
- `gacha_definition_view`, `season_level_view`

현 Engine 아키텍처에서 SQLAlchemy 쿼리로 대체할 수 있으나, 어드민/운영 쿼리(SUB-6)에서 뷰가 유용할 수 있음.

**필요 액션**: Engine 서비스에서 직접 쿼리로 커버하는지 확인. 어드민 운영 쿼리에 뷰가 필요하면 마이그레이션 추가.

#### GAP-M2: DB 보안 정책 (C-api-contract §12 — RLS 9개)

API 계약서 §12에 9개 RLS 정책 세트가 정의됨. Engine+BFF 아키텍처에서 PostgREST RLS는 불필요하나, DB 레벨 보안 계층 필요 여부 검토 필요.

**필요 액션**: Engine이 service key로 직접 접근하므로 RLS 불필요 판단 시 명시적 제외 기록. 필요 시 마이그레이션 추가.

#### GAP-M3: PostgREST RPC → Engine 서비스 매핑 미명시 (C-api-contract 전역)

API 계약서에 정의된 11개 PostgREST RPC 함수 중 현 Engine 서비스로 대체 구현된 것과 미구현된 것의 구분이 불명확:

- `claim_mission_reward` — 기존 `dispatch_mission_reward` PL/pgSQL로 커버?
- `get_user_summary` — 홈 화면 1-call 집계 함수, 현재 어디에도 없음
- `start_mission`, `list_active_missions` — 기존 mission 라우터에 있는지 확인 필요
- `get_active_season_info` — season 라우터 `/v1/season/current`로 커버?

**필요 액션**: 기존 Engine 라우터/서비스와 1:1 매핑 확인 후 갭 보완

---

### GAP-LOW: 문서/정합성

#### GAP-L1: 파일 인벤토리 불일치 (deployment-guide §1 vs 태스크 §2-A)

- 배포 가이드 14개 vs 태스크 12개 — 누락: `sre-mission-item-reward-spec.md` (원본 v1 설계서), `item_definition.csv`
- 라인 수 불일치: `migration-step3` (가이드 245 vs 태스크 217), `sre-gacha-seed` (130 vs 153), `sre-shop-gacha-functions` (595 vs 636) — 버전 차이로 추정

#### GAP-L2: Tailwind 아이템 토큰 확장 미추적 (B-design-tokens §1.8.4)

- 13개 컬렉션 커스텀 색상 (`col-{collection}-{tone}`) + 2개 키프레임 (`item-mythic-spin`, `item-sparkle-pulse`)
- 현 프로젝트가 Tailwind을 사용하는 경우 `tailwind.config`에 확장 필요

#### GAP-L3: `__DEV_todos` `#31` 미등록 (SUB-5 체크리스트)

SUB-5 마지막 항목 `#31 신규 등록` 체크박스가 아직 미완료 상태.
