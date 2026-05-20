# 현재 상황 (Session Carry-Over)

> 다음 스레드가 이 파일만 읽고도 작업을 이어받을 수 있도록 작성.  
> 완료 이력은 [`context/history.md`](history.md)로 이관됨. 여기에는 활성 상태만 유지.  
> **마지막 갱신**: 2026-05-19 (문서 현행화 완료)

---

## SRE 게이미피케이션 v2 업그레이드 계획 (2026-05-18) — 📋 PLANNED

RPG 경제 패러다임 도입 — 미션 보상을 통화(GP/GC) 중심으로 전환, 가챠 5종 + 상점 + 일일 추천 + 천장 시스템 신규 추가.  
기획서: `_tmp/sre-upgrade/sre-gamification-deployment-guide.md` (v2.0, 14개 결과물)

### 서브태스크 6개
1. **SUB-1**: 기획 문서 정식 색인 등록 — ✅ DONE (2026-05-18)
2. **SUB-2**: DB 마이그레이션 연계 — ⚡ IN PROGRESS (Alembic 리비전 완료, DB 실행/검증 미완)
3. **SUB-2.5**: Skywork 자산 통합 — ✅ DONE (2026-05-18)
4. **SUB-3**: Engine 서비스 + BFF 프록시 — ⚡ IN PROGRESS (구현 완료, 휴먼 검증 대기)
5. **SUB-4**: 프론트 UI — ⚡ IN PROGRESS (페이지 완료, 네비게이션 연결 완료, 휴먼 검증 대기)
   - 완료: `/gacha`, `/gacha/pull/:code`, `/shop`, `/shop/item/:code`, `/inventory`, `/inventory/equip-preview`, `/season`
   - CurrencyHUD 공통 컴포넌트 (WorldMap 헤더 연동)
   - i18n ko/en/vi 전체 (gachaPull/itemDetail/equipPreview/seasonPass/gameHub 추가)
   - **FAB → Game Hub Sheet** (2026-05-19): 탭바 FAB 버튼이 게임 허브 바텀시트 런처로 전환
     - 시트 내 5개 진입점: 게러지, 인벤토리, 상점, 가챠, 시즌패스
     - 기존 4탭(월드/퀘스트/피드/프로필) 유지, FAB의 퀘스트 중복 제거
   - **게임 컴포넌트 5종** (2026-05-19): `components/game/` — PityBar, ConfettiLayer, RarityChip, CurrencyBadge, GachaCardBack
   - `components/ui/items/` 중복 5개 삭제 (미사용 파일 정리)
6. **SUB-5**: __DEV Context 등록 — ✅ DONE (2026-05-18)
7. **SUB-6**: 관리자 콘솔 확장 — 운영 대시보드 4종 (⚡ IN PROGRESS, 휴먼 검증 대기)

### 태스크 파일
[`task/active/260518_sre_upgrade_plan_task.md`](../task/active/260518_sre_upgrade_plan_task.md)

---

## 활성 태스크

| 태스크 파일 | 요약 | 상태 |
|---|---|---|
| [`260518_sre_upgrade_plan_task.md`](../task/active/260518_sre_upgrade_plan_task.md) | SRE 게이미피케이션 v2 연계 플랜 | ⚡ IN PROGRESS |
| [`260520_capacitor_migration_task.md`](../task/active/260520_capacitor_migration_task.md) | Capacitor 도입 — NativeInterface 전환 | ✅ DONE |
| [`260520_redis_message_queue_task.md`](../task/active/260520_redis_message_queue_task.md) | Redis Streams 메시지 큐 도입 | ✅ DONE |

> 이전 활성 태스크는 모두 아카이브 완료 → [`task/archive.md`](../task/archive.md)

### GAP 보완 작업 (§9 미구현 사항 — 2026-05-18 추가)

`__DEV_todos` #31~#40 등록 완료. 구현 진행 현황:

| Todo | GAP | 내용 | 상태 |
|---|---|---|---|
| #35 | H4 | 시즌 1 시드 (014 마이그레이션) | ✅ DONE |
| #33 | H2 | 누락 API 6개 (unequip/gacha_log/eligibility/collection_progress/season_level/claim_reward) | ✅ DONE (2026-05-18) — 전 레이어 완료 |
| #34 | H3 | UI 컴포넌트 5종 (PityBar/ConfettiLayer/RarityChip/CurrencyBadge/GachaCardBack) | ✅ DONE |
| #32 | H1 | E2E 테스트 시나리오 5개 | TODO |
| #36 | M1 | PostgreSQL 뷰 7개 검토 | TODO |
| #37 | M2 | DB 보안 정책 (RLS) 검토 | TODO |
| #38 | M3 | PostgREST RPC → Engine 매핑 확인 | TODO |
| #39 | L1 | 파일 인벤토리 불일치 정리 | TODO |
| #40 | L2 | Tailwind 아이템 토큰 확장 | TODO |

**GAP-H2 (#33) — ✅ 6개 전부 완료 (2026-05-18)**:
- `engine/app/schemas.py`: 신규 스키마 7개 추가 완료
  - `GachaPullLogRead`, `GachaEligibility`, `UnequipRequest`, `CollectionProgressRead`
  - `SeasonLevelRead`, `ClaimSeasonRewardRequest`, `ClaimSeasonRewardResult`
- 구현 완료 엔드포인트:
  1. ✅ `unequip_slot` — DELETE /v1/inventory/{user_uuid}/equip/{slot}
  2. ✅ `gacha_pull_log` — GET /v1/gacha/log/{user_uuid}
  3. ✅ `check_gacha_eligibility` — GET /v1/gacha/eligibility/{gacha_code}
  4. ✅ `item_collection_progress` — GET /v1/inventory/{user_uuid}/collection-progress
  5. ✅ `season_level_view` — GET /v1/season/levels/{season_code}?user_uuid=... (level/sxp_threshold/is_locked/is_claimed)
  6. ✅ `claim_season_reward` — POST /v1/season/{user_uuid}/claim (body: level, track FREE|PREMIUM)
- 비고: `season_reward` 테이블 미존재 → season.max_level/sxp_per_level로 레벨 목록 생성, claimed_levels ARRAY로 수령 추적
- **다음**: GAP-H1 (#32) — E2E 테스트 시나리오 5개

**GAP-H3 (#34) — ✅ 5개 전부 완료 (2026-05-19)**:
- `frontend/src/components/game/` 디렉토리에 5개 컴포넌트 + index.ts 배럴 생성
  - `PityBar` — 천장 진행 바 (current/ceiling/dark 프롭)
  - `ConfettiLayer` — SVG 축하 파티클 오버레이
  - `RarityChip` — 등급 배지 (C/R/E/L/M, count 옵션)
  - `CurrencyBadge` — 단일 통화 배지 (GP/GC/SXP, light/dark surface)
  - `GachaCardBack` — 가챠 로딩 카드 뒷면 (flip 애니메이션)
- GachaMain.tsx: 인라인 PityBar → 공용 `PityBar` 컴포넌트로 교체
- GachaPull.tsx: ConfettiSvg/인라인 rarity-chip/cardBack → 공용 컴포넌트로 교체
- `tokens.css`: `gacha-card-flip` keyframe 추가
- tsc + vite build 통과

**FAB → Game Hub Sheet (2026-05-19)**:
- 설계 시안 `screens_v3_rpg.html` 분석 → 탭바 5번째 자리가 화면별 컨텍스트 탭
- 기존 FAB(퀘스트 중복) → Game Hub 바텀시트 런처로 전환
- 변경 파일:
  - `components/layout/TabBar.tsx` — FAB onClick → GameHubSheet 열기
  - `components/game/GameHubSheet.tsx` + `.module.css` — 신규
  - `locales/{ko,en,vi}/translation.json` — `gameHub.*` 5키 추가
- `components/ui/items/` 미사용 중복 컴포넌트 5개 삭제 (PityBar/RarityChip/CurrencyBadge/ConfettiLayer/GachaCardBack)
- tsc + vite build 통과
- **휴먼 검증 필요** → [`TEST/260519_game_hub_test.md`](../TEST/260519_game_hub_test.md)

### 프로필 페이지 — 기록/배지 실데이터 연동 (2026-05-19) — ✅ DONE

**변경 사항:**
- **기록 탭**: mock 데이터 제거 → `GET /api/users/me/quest-history` 실데이터 연동 (퀘스트 완료 이력, 페이지네이션, empty state)
- **배지 탭**: mock 데이터 제거 → `GET /api/badges?user_id=` 실데이터 연동 (전체 배지 + 획득 여부, 다국어, empty state)
- **이번 달 통계 카드**: 하드코딩 제거 → `GET /api/users/me/stats` 실데이터 연동
- **배지 모델 확장**: `condition_rule JSONB` + 다국어(ko/vi/en) + `icon_content_id` + `is_active` 추가 (032 마이그레이션)
- **관리자 배지 CRUD**: `/admin/badges` — 등록/수정/삭제 + Condition Rule Builder (JSONB, AND/OR 복합 조건)
- i18n: ko/en/vi 프로필 empty state 번역 추가

**파일:**
- `backend/app/models.py`, `schemas.py` — Badge 모델/스키마 확장
- `backend/app/routers/badges.py` — 전체 배지 목록 API
- `backend/app/routers/users.py` — 퀘스트 완료 이력 API
- `backend/app/routers/admin.py` — 배지 관리 CRUD
- `backend/app/templates/admin/admin_badges_{list,form}.html`
- `frontend/src/pages/profile/ProfileMain.tsx` — 기록/배지/통계 실데이터
- `frontend/src/api/{profile,types}.ts` — API 타입 + fetch 함수
- `database/init/032_badge_condition_rule.sql`

### 문서 현행화 (2026-05-19) — ✅ DONE

SRE v2 게이미피케이션 도입 이후 코드-문서 간 괴리 전면 해소. 대상:
- **README.md**: 디렉토리 구조 (신규 라우터 14개, 프론트 페이지 7개, game 컴포넌트 6개, hooks 2개, store 3개, API 10개), BFF·Engine 엔드포인트 전면 갱신, DB 마이그레이션 024~032 반영
- **Wiki (bff.md)**: Gacha/Shop/Inventory/Wallet/Season/Master/AppVersion/DEV Context 9개 섹션 추가
- **Wiki (frontend.md)**: 신규 페이지·game 컴포넌트·UI 컴포넌트·store 반영
- **Wiki (database.md)**: 마이그레이션 024~032, Engine Alembic 010~017, feed_post_images·badges 확장 테이블 추가
- **Wiki (engine.md)**: 변경 없음 (이미 v2 설계 포함)
- **ai-docs/spec/overview.md**: 그룹 H 화면 9개 + F-13~F-17 기능 34개 추가, F-10 구현 상태 갱신
- **ai-docs/schema/erd.md**: 전면 재구성 (기본/마스터/소셜/시스템/Engine 5개 그룹 32개 테이블)
- **ai-docs/context/frontend.md**: game 컴포넌트 6개 + 신규 UI 컴포넌트 6개 추가

---

## Redis Streams 메시지 큐 도입 (2026-05-20) — ✅ DONE

**Feature #47** (`infra`) | `sre_message_tbl` 직접 INSERT → Redis Streams 버퍼 + Consumer Worker 배치 INSERT 전환.

캐시워크 규모(1000대+) GPS/heartbeat/event 메시지 처리를 위해 Redis Streams 도입.
- API(Engine): Redis XADD → 즉시 응답
- Worker: Consumer Group → bulk INSERT → PostgreSQL
- Redis 포트 미노출 (Docker 내부 네트워크 전용)

### 서브태스크 진행 현황
1. **SUB-1**: Redis 서비스 docker-compose 추가 — ✅ DONE
2. **SUB-2**: redis-py 의존성 + Redis 클라이언트 모듈 — ✅ DONE
3. **SUB-3**: 메시지 엔드포인트 Redis XADD 전환 — ✅ DONE
4. **SUB-4**: Consumer Worker 구현 — ✅ DONE
5. **SUB-5**: Worker 서비스 docker-compose 등록 — ✅ DONE
6. **SUB-6**: Fallback (Redis 장애 시 직접 DB INSERT) — ✅ DONE
7. **SUB-7**: 통합 테스트 + docker compose up 검증 — ✅ DONE

### 태스크 파일
[`task/active/260520_redis_message_queue_task.md`](../task/active/260520_redis_message_queue_task.md)

---

### 다음 우선순위
1. **GAP-H1 (#32)** E2E 테스트 시나리오 5개 → M/L 순
2. GameHubSheet 내 CurrencyHUD GP/GC 값 실제 API 연동 (현재 하드코딩)
3. SUB-2 DB 마이그레이션 실행/검증 (Alembic 리비전 완료, DB 실행 미완)

---

## Capacitor 도입 — NativeInterface 추상화 전환 (2026-05-20) — ✅ DONE

**Feature #46** (`infra`) | `NativeInterface` 자체 프로토콜(postMessage Mode 0/1/2) → Capacitor 플러그인 기반으로 전환 완료.

- `native.ts` 전면 재작성 (319줄 → ~120줄): 타입 안전 메서드 기반, Capacitor 플러그인 래핑
- 사용처 2곳(FeedCreate, FeedList) 마이그레이션 완료
- `vite-env.d.ts` 레거시 Window 타입 제거
- 활성 플러그인: `@capacitor/geolocation`만 설치, 나머지는 stub (사용 시점에 추가)
- 웹만 전환 — 네이티브 앱은 기존 WebView 유지, Capacitor 셸 미사용
- **브라우저 UI 수동 검증 필요**: FeedCreate 위치 추가, FeedList neighborhood 필터

### 태스크 파일
[`task/active/260520_capacitor_migration_task.md`](../task/active/260520_capacitor_migration_task.md)

---

## 미해결 결함 (❌, [issues.md](../TEST/issues.md))

| 기능 ID | 화면 | 수정 방향 |
|---|---|---|
| F-AUTH-LOGIN | AUTH-002 OtpInput | `handleVerify` → `apiLogin(phone, passcode)` 호출 |
| F-02-7 | AUTH-002 재전송 | 재전송 버튼 onClick에 `apiRegister(phone)` 호출 추가 |
| F-03-2 | PROFILE-SETUP 닉네임 중복 | debounce + `check-nickname` API 연동 |

---

## 진행 중 / 부분 점검 (🟡)

- F-03-1 닉네임 1자 IME 이슈 — 재빌드 후 재점검 필요
- 퀘스트 `thumbnail_content_id` 미연결 — DB 퀘스트가 mock 데이터와 달라 직접 매핑 필요

---

## 이미지 서빙 아키텍처 (2026-05-15 확정)

> 신규 이미지 추가 시 반드시 확인 — 상세는 [`workflow/system-contents-upload.md`](../workflow/system-contents-upload.md)

```
thumbnail_url 결정 순서 (_to_out in quests.py):
  1. quest.thumbnail_content.file_path  → build_imgproxy_url()
  2. quest.district.image_content.file_path → build_imgproxy_url()
  3. MOCK_IMG_ENDPOINT (BFF_PUBLIC_URL/contents/mock-img → 랜덤 302)
```

- **content_id 기반 서빙**: `GET /api/bff/contents/{id}/img?w=800&h=450` → 302 → imgproxy
- **owner_type**: `system` / `user` / `mock` / `profile_mock`

---

## 현재 프론트엔드 CSS 아키텍처 핵심 규칙

> **신규 페이지 추가 시 반드시 확인** — 상세는 [`context/frontend.md`](frontend.md) §2~§3

- `<StatusBar>` 를 헤더 최상단 첫 자식으로 배치, 헤더 `padding-top: 0` 유지
- `TopBar` 컴포넌트 사용 시 내부에 StatusBar 포함 → 추가 불필요
- 고정 px 값으로 상단 여백 지정 금지 → `var(--status-bar-height)` 사용
- 플랫폼 분기 필요 시 `[data-platform="ios"]` / `[data-platform="android"]` CSS 선택자 활용

---

## 다음 스레드 진입 시 권장 순서

1. [INDEX.md](../INDEX.md) → 이 파일 (`current.md`) 확인
2. 필요한 활성 태스크 로드 (파일명으로 선택적 로드)
3. 완료 이력이 필요하면 [`context/history.md`](history.md) 참조
4. 필요 시 [`TEST/issues.md`](../TEST/issues.md) 와 해당 섹션 체크리스트만 추가 로드
