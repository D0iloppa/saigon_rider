# 태스크: SRE 게이미피케이션 v2 업그레이드 연계

> **태스크 ID**: sre_upgrade_plan_task  
> **생성일**: 2026-05-18  
> **상태**: PLANNED  
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
| SUB-3 (SRE 구현) | `engine/app/models.py`, `engine/app/schemas.py`, `engine/app/services/event_bus.py` (기존 서비스 패턴), `engine/app/routers/events.py` (기존 라우터 패턴), `backend/app/engine_client.py` (BFF 프록시 패턴) |
| SUB-4 (디자인→구현) | `_tmp/sre-upgrade/design/` (추후 배치), `frontend/src/pages/` 기존 페이지 구조 |
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

## 2. 기획 결과물 인벤토리 (`_tmp/sre-upgrade/`)

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

**상태**: TODO | **DEV Todo**: `#24` (HIGH)

**⚠ 핵심**: Engine DB는 **Alembic** 마이그레이션 사용 (BFF의 `database/init/NNN_*.sql` 순번제와 다름).  
`_tmp/sre-upgrade/*.sql`은 raw SQL → Alembic 리비전으로 래핑 필요.

**Engine 마이그레이션 구조**:
- 경로: `engine/alembic/versions/`
- 현재 최신: `010_sre_message.py` (sre010)
- 패턴: `op.execute("""...""")` 로 raw SQL 래핑 (예: `001_sre_enums.py` 참조)

**체크리스트**:
- [ ] Alembic 리비전 생성 — DDL 3개:
  - [ ] `011_gamification_alter.py` ← `migration-step1-alter.sql`
  - [ ] `012_gamification_new_tables.py` ← `migration-step2-new-tables.sql`
  - [ ] `013_gacha_shop_tables.py` ← `migration-step3-gacha-shop.sql`
- [ ] Alembic 리비전 생성 — 시드 1개:
  - [ ] `014_gamification_seed.py` ← action-extension + item-seed + gacha-seed + mission-reward-bundle 통합
- [ ] Alembic 리비전 생성 — 함수 2개:
  - [ ] `015_reward_dispatcher_functions.py` ← `sre-reward-dispatcher.sql`
  - [ ] `016_shop_gacha_functions.py` ← `sre-shop-gacha-functions.sql`
- [ ] `engine/app/enums.py`에 신규 ENUM 7개 추가:
  - `CollectionStatusEnum`, `ItemSlotEnum`, `ItemRarityEnum`, `AcquisitionSourceEnum`
  - `SeasonStatusEnum`, `BoxStatusEnum`, `GachaStatusEnum`
- [ ] `alembic upgrade head` 실행 및 검증
- [ ] 기존 SRE 테이블 충돌 여부 검증 (`mission_definition.reward_bundle` 등)
- [ ] DEV Todo `#24` → DONE 전환

---

### SUB-3: SRE(Engine) 서비스 레이어 구현 + BFF 프록시 연결

**상태**: TODO | **DEV Todo**: `#25` (HIGH)

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
- 라우터: `engine/app/routers/` (현재 7개: admin, balance, catalog, events, message, missions, redemptions)
- BFF 연동: `backend/app/engine_client.py` (`EngineClient`, httpx 기반, 기존 사용: profile.py, ride.py, feed.py)

**체크리스트 — Engine(SRE) 구현 (핵심)**:
- [ ] `engine/app/models.py` 신규 모델 15개:
  - [ ] `ItemCollection`, `ItemDefinition`, `UserItem`, `UserEquipment`
  - [ ] `Season`, `UserSeasonPass`
  - [ ] `LootboxDefinition`, `UserInventoryBox`, `LootboxDropLog`, `ItemAcquisitionLog`
  - [ ] `GachaDefinition`, `UserGachaPity`, `GachaPullLog`, `DailyFeaturedItem`, `ShopPurchaseLog`
- [ ] `engine/app/schemas.py` Request/Response 스키마
- [ ] `engine/app/services/` 신규 서비스:
  - [ ] `gacha.py` — 가챠 실행 (PL/pgSQL `pull_gacha` 호출 또는 Python)
  - [ ] `shop.py` — 상점 구매 + 일일 추천
  - [ ] `inventory.py` — 아이템 조회/장착
  - [ ] `season.py` — 시즌 관리
- [ ] `engine/app/routers/` 신규 라우터:
  - [ ] `gacha.py` — `POST /v1/gacha/pull`, `GET /v1/gacha/list`, `GET /v1/gacha/pity/{code}`
  - [ ] `shop.py` — `GET /v1/shop/items`, `POST /v1/shop/purchase`, `GET /v1/shop/daily-featured`
  - [ ] `inventory.py` — `GET /v1/inventory/{user_uuid}/items`, `GET /v1/inventory/{user_uuid}/equipment`, `PUT /v1/inventory/{user_uuid}/equip`
  - [ ] `season.py` — `GET /v1/season/current`, `GET /v1/season/{user_uuid}/pass`

**체크리스트 — BFF 프록시 (얇은 레이어, 로직 없음)**:
- [ ] `backend/app/engine_client.py` 신규 메서드 (단순 HTTP 호출만):
  - [ ] `pull_gacha(user_uuid, gacha_code, is_10_pull)` → `POST /v1/gacha/pull`
  - [ ] `get_gacha_list()` → `GET /v1/gacha/list`
  - [ ] `get_shop_items()` / `purchase_shop_item(...)` / `get_daily_featured()`
  - [ ] `get_inventory(user_uuid)` / `equip_item(user_uuid, item_code)`
  - [ ] `get_season_current()` / `get_season_pass(user_uuid)`
- [ ] `backend/app/routers/` BFF 프록시 라우터 (검증/변환만, 로직 금지):
  - [ ] `gacha.py`, `shop.py`, `inventory.py`, `season.py`
- [ ] DEV Todo `#25` → DONE 전환

---

### SUB-4: 프론트엔드 디자인 수령 및 UI 구현

**상태**: BLOCKED (디자인 미확정) | **DEV Todos**: `#23` (URGENT), `#27` (HIGH), `#29` (HIGH), `#30` (MEDIUM)

> **🚨 BLOCKER**: 프론트엔드 디자인 레퍼런스가 아직 작성되지 않았음.  
> 디자인이 추후 제공될 예정. 수령 시 `_tmp/sre-upgrade/design/`에 배치.

#### STEP A: 디자인 요청 및 수령 (DEV Todo `#23` URGENT)

- [ ] 디자인 요청서 작성 및 기획자/디자이너에게 전달
- [ ] 디자인 레퍼런스 수령 → `_tmp/sre-upgrade/design/`에 배치
- [ ] DEV Todo `#23` → DONE 전환

**요청 대상 화면 8종**:

| # | 화면 | 설명 | 참고 레퍼런스 |
|---|---|---|---|
| D-1 | 가챠 메인 | 5종 가챠 배너 + 진입 | 리니지/원신 가챠 레이아웃 |
| D-2 | 가챠 연출 | 단일/10연 결과 애니메이션 | 등급별 이펙트 차등 (C→M) |
| D-3 | 상점 카탈로그 | 아이템 그리드 + 필터(등급/슬롯/컬렉션) | 일일 추천(Featured) 섹션 구분 |
| D-4 | 아이템 상세 | 아이템 미리보기 + 구매/장착 CTA | 등급별 배경 색상 차등 |
| D-5 | 인벤토리 | 보유 아이템 그리드 + 장착 슬롯 | 슬롯 19종 (아바타6/차고7/프로필3/FX3) |
| D-6 | 장착 프리뷰 | 아바타/차고/프로필 장착 미리보기 | 실시간 프리뷰 |
| D-7 | 시즌패스 | 레벨 트래커 + 보상 타임라인 | 포트나이트/원신 시즌패스 참고 |
| D-8 | 재화 HUD | GP/GC/SXP 잔액 상시 표시 | 월드맵 또는 공통 헤더 배치 |

#### STEP B: 아이템 이미지 에셋 확보 (DEV Todo `#30` MEDIUM)

- [ ] 에셋 확보 방안 결정 (213개 아이템 × 등급별)
  - 옵션 A: AI 생성 (Midjourney/DALL-E) → 일괄 생성 후 `contents` 테이블 중개
  - 옵션 B: 디자이너 제작 (시간 소요 큼)
  - 옵션 C: 플레이스홀더 → 점진적 교체
- [ ] `contents` 테이블에 아이템 이미지 등록 (owner_type: `system`)
- [ ] DEV Todo `#30` → DONE 전환

#### STEP C: 디자인 파일 배치 및 검토 (DEV Todo `#29` HIGH)

- [ ] 수령된 디자인을 `_tmp/sre-upgrade/design/` 하위에 화면별 정리:
  - `_tmp/sre-upgrade/design/D-1_gacha_main.{png|fig}`
  - `_tmp/sre-upgrade/design/D-2_gacha_animation.{png|fig}`
  - ... (D-3 ~ D-8)
- [ ] 디자인 리뷰 → 구현 가능성 판단 + API 스키마 매핑 확인
- [ ] DEV Todo `#29` → DONE 전환

#### STEP D: 화면별 구현 (DEV Todo `#27` HIGH)

> STEP A~C 완료 + SUB-3 (API) 완료 후 착수

- [ ] D-1 가챠 메인 — `frontend/src/pages/gacha/GachaMain.tsx`
- [ ] D-2 가챠 연출 — `frontend/src/pages/gacha/GachaPull.tsx` (애니메이션)
- [ ] D-3 상점 카탈로그 — `frontend/src/pages/shop/ShopCatalog.tsx`
- [ ] D-4 아이템 상세 — `frontend/src/pages/shop/ItemDetail.tsx`
- [ ] D-5 인벤토리 — `frontend/src/pages/inventory/Inventory.tsx`
- [ ] D-6 장착 프리뷰 — `frontend/src/pages/inventory/EquipPreview.tsx`
- [ ] D-7 시즌패스 — `frontend/src/pages/season/SeasonPass.tsx`
- [ ] D-8 재화 HUD — `frontend/src/components/ui/CurrencyHUD.tsx` (공통 컴포넌트)
- [ ] `frontend/src/api/` 신규 API 함수 (gacha.ts, shop.ts, inventory.ts, season.ts)
- [ ] `App.tsx` 라우트 등록
- [ ] i18n (ko/en/vi) 번역 키 추가
- [ ] DEV Todo `#27` → DONE 전환

---

### SUB-5: __DEV Context 등록

**상태**: ✅ DONE (2026-05-18)

- [x] `__DEV_features` 등록 완료:
  - `#42` SRE 게이미피케이션 v2 — 가챠/상점/시즌 시스템 (PLANNED, category: engine)
  - `#43` SRE v2 — 미션 보상 디스패처 (PLANNED)
  - `#44` SRE v2 — 아이템 컬렉션 & 인벤토리 (PLANNED)
  - `#45` SRE v2 — 시즌 & 시즌패스 (PLANNED)
- [x] `__DEV_todos` 등록 완료:
  - `#23` 프론트 디자인 레퍼런스 요청 (URGENT) → SUB-4 STEP A
  - `#24` DB 마이그레이션 적용 (HIGH) → SUB-2
  - `#25` BFF API 설계 (HIGH) → SUB-3
  - `#26` 기획 문서 색인 편입 (LOW) → SUB-1
  - `#27` 프론트 UI 구현 (HIGH) → SUB-4 STEP D
  - `#28` 어드민 운영 대시보드 (MEDIUM) → SUB-6
  - `#29` 디자인 레퍼런스 수령 → design/ 배치 (HIGH) → SUB-4 STEP C
  - `#30` 아이템 이미지 에셋 213개 확보 (MEDIUM) → SUB-4 STEP B

---

### SUB-6: 관리자 콘솔 확장

**상태**: TODO | **DEV Todo**: `#28` (MEDIUM)

- [ ] 가챠 관리 (가챠 정의 조회/수정, 확률 테이블 편집)
- [ ] 상점 관리 (아이템 가격/노출/시즌잠금 설정)
- [ ] 일일 추천 수동 갱신 + 이력 조회
- [ ] 운영 대시보드 — 인플레 모니터링 쿼리 4종 (기획서 §7):
  - [ ] 일일 발행/소모 (GP/GC net)
  - [ ] 가챠별 ROI 분석
  - [ ] 가챠 vs 상점 사용 비율
  - [ ] 천장 도달자 분포
- [ ] DEV Todo `#28` → DONE 전환

---

## 4. 의존성 그래프

```
SUB-5 (DEV 등록) ✅ DONE

SUB-1 (문서 색인) ─────────────────────────────────────┐
                                                        │
SUB-2 (DB 마이그레이션) ──→ SUB-3 (BFF API) ──┬──→ SUB-4 STEP D (프론트 구현)
                                    │          │              ↑
                                    ↓          │    SUB-4 STEP A (디자인 요청)
                              SUB-6 (어드민)   │    SUB-4 STEP B (에셋 확보)
                                               │    SUB-4 STEP C (디자인 배치)
                                               │              │
                                               └──────────────┘
```

**병행 가능**: SUB-1, SUB-2, SUB-4 STEP A/B는 독립 → 동시 착수 가능  
**순차 필수**: SUB-2 → SUB-3 → SUB-4 STEP D  
**BLOCKER**: SUB-4 STEP D는 STEP A~C + SUB-3 모두 완료 후 착수

---

## 5. 리스크 / 주의사항

| 리스크 | 영향 | 대응 |
|---|---|---|
| Engine DB와 BFF DB가 분리 운영 | 마이그레이션 경로가 다름 (Alembic vs 순번 SQL) | SUB-2에 Alembic 래핑 절차 명시 |
| 기존 `reward_rp` → `reward_bundle` 전환 | 기존 미션 보상 로직 호환성 | step1 ALTER가 기존 데이터를 JSONB로 마이그레이션 (확인됨) |
| 아이템 이미지 에셋 213개 | 이미지 제작/확보 병목 | SUB-4 STEP B에서 방안 결정 (AI 생성/디자이너/플레이스홀더) |
| 가챠 도박성 규제 | 앱스토어 심사 이슈 가능 | 천장+10연 보장+확률 공시로 보호장치 확인됨 |
| 프론트 디자인 미확정 | SUB-4 STEP D 착수 불가 | STEP A 디자인 요청을 최우선 처리 (URGENT) |

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
| 월드맵 재화 HUD | GP/GC/SXP 표시 (현재 xp/gold만, D-8에서 확장) |
| `contents` 테이블 | 아이템 이미지 213개 중개 (SUB-4 STEP B) |

---

## 7. DEV DB 매핑 요약

> 서브태스크 완료 시 아래 ID의 상태를 함께 갱신할 것.

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
| `#23` | 프론트 디자인 레퍼런스 요청 | URGENT | SUB-4 STEP A | TODO |
| `#24` | DB 마이그레이션 적용 | HIGH | SUB-2 | TODO |
| `#25` | BFF API 설계 | HIGH | SUB-3 | TODO |
| `#26` | 기획 문서 색인 편입 | LOW | SUB-1 | TODO |
| `#27` | 프론트 UI 구현 | HIGH | SUB-4 STEP D | TODO |
| `#28` | 어드민 운영 대시보드 | MEDIUM | SUB-6 | TODO |
| `#29` | 디자인 레퍼런스 수령 → design/ 배치 | HIGH | SUB-4 STEP C | TODO |
| `#30` | 아이템 이미지 에셋 확보 | MEDIUM | SUB-4 STEP B | TODO |

---

## 8. 다음 액션 (착수 순서 권장)

1. **즉시**: SUB-4 STEP A — 디자인 요청서 작성 및 전달 (BLOCKER 해소)
2. **즉시**: SUB-1 — 기획 문서를 정식 문서 체계에 편입
3. **다음**: SUB-2 — Alembic 리비전 생성 + `alembic upgrade head`
4. **이후**: SUB-3 — Engine 모델/서비스/라우터 + BFF engine_client 확장
5. **병행**: SUB-6 — 어드민 운영 대시보드 (SUB-3과 병행 가능)
6. **디자인 수령 후**: SUB-4 STEP B/C → STEP D — 화면 구현
