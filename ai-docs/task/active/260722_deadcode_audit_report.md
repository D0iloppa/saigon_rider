# 데드코드 감사 보고서 (reachability-based dead-code audit)

> 작성 2026-07-22. **상태: 분석 완료 · 코드 미수정 · 사용자 승인 대기.**
> 방법: 진입점(entry roots)에서의 정적 도달성으로 active/dead 판정. BFF·Engine·Frontend 세 영역 서브에이전트(Sonnet) 병렬 정독 후 감독이 교차검증·분류.
> **이 문서는 "무엇을 지울지" 제안일 뿐이다. 승인 전 어떤 파일도 수정하지 않았다.**
> 검증 원칙: 현재 파일(grep/read)이 ground truth. codebase-memory 인덱스는 직전 대량 변경(codex 156파일) 전이라 참고용으로만 사용, 모든 판정은 파일로 재확인.

---

## 0. 방법론 — "active"의 정의 (오분류 방지)

"프론트가 부르면 active, 아니면 dead"를 글자대로 쓰면 살아있는 인프라를 dead로 오판한다. 그래서 **active = 아래 7개 진입점 중 하나라도 도달**로 정의했다.

| # | 진입점(root) | 예 |
|---|---|---|
| 1 | 프론트 fetch | `frontend/src/api/*.ts` 호출 |
| 2 | OAuth 브라우저 redirect | `/oauth/*/callback` |
| 3 | 네이티브/단말 | GPS `sreMessage`(Android/iOS BackgroundService), device-map |
| 4 | 관리자 콘솔 | `admin_api`, `admin_legacy` |
| 5 | Engine ↔ BFF | `engine_client`(BFF→Engine), `internal`(Engine→BFF, service-key) |
| 6 | 백그라운드 | worker(Redis stream), APScheduler job, cron |
| 7 | 인프라 | `/health`·`/ready`·`/metrics` |

**분류 범례:**
- 🟢 **정리** — 검증된 dead, 미래 계획 없음, 삭제 안전
- 🟡 **보류** — dead-to-frontend지만 (a) 잠정보류 기능 소속 (b) write-active/read-dead (c) 외부·수동·ops 경로라 정적 확정 불가 → **삭제 금지, 코드 보존**
- 🔵 **확인필요** — 제품/구조 결정이 있어야 정리/보류가 갈림

---

## 1. ⚠️ 교차검증 정정 (3-way audit의 핵심 소득)

Worker A(BFF)는 "프론트 api 함수가 존재하면 그 엔드포인트는 active"로 봤으나, Worker C(프론트)가 **그 api 함수 자체의 호출처가 0**임을 잡았다. 즉 `엔드포인트 ← api함수(존재) ← [아무도 안 부름]` 체인이라 **엔드포인트도 실제로는 dead**다. A 단독으로는 놓쳤을 항목:

| 프론트 api 함수 (호출처 0) | 연결된 BFF 엔드포인트 | 정정 |
|---|---|---|
| `apiUpdateNickname` | `PUT /profile/nickname` | A=active → **실제 dead** |
| `fetchSafetyGrades` | `GET /master/safety-grades` | A=active → **실제 dead** |
| `fetchDistrictQuestCounts` | `GET /quests/district-counts` | A=active → **실제 dead** |
| `fetchRecommendedQuests` | `GET /quests/recommended` | A=active → **실제 dead** |
| `fetchBusinessProfile`(by-id) | `GET /biz/public/{id}` 계열 | A=active → **의심 dead** (biz는 활성 기능 — 별도 경로 도달 가능성, 확인필요) |

→ 프론트 api 함수와 그 대응 BFF 엔드포인트는 **쌍으로 정리**한다(양쪽 다 죽어야 안전 삭제).

---

## 2. 🟢 정리 대상 (verified dead — 승인 시 제거)

### 2.1 폐기된 폰/passcode 인증 (OAuth 전환 잔재) — 우선순위 1
| 대상 | 위치 | 근거 |
|---|---|---|
| `POST /auth/register` | `backend/.../auth.py:64` | 프론트0+백엔드0 호출 |
| `POST /auth/login` | `auth.py:103` | 동일 |
| `apiRegister`, `apiLogin` | `frontend/.../api/auth.ts:30,37` | 호출처 0 |
| `store.passcode` 필드 + 배선 | `store/useUserStore.ts:14,66-73,141` | 항상 null (세팅처 없음) |
| QuestDetail `handleDbgComplete` passcode 분기 | `pages/quest/QuestDetail.tsx:126-141` | passcode 항상 null → 도달 불가 분기 (버튼 UI는 별도 판단) |
| `data/countryCodes.ts` (전체 86줄) | `data/countryCodes.ts` | 다국가 다이얼코드 — VN(+84) 하드코딩 전환으로 고아 |

### 2.2 대체된(superseded) 프론트 컴포넌트/페이지
| 대상 | 위치 | 근거 |
|---|---|---|
| `WorldMap.tsx` | `pages/home/WorldMap.tsx` | 자체 주석 "백업(미사용)", WorldMapV2가 대체 |
| `SaigonMapV3.tsx` (640줄) | `components/maps/` | 참조 0, V5가 대체 |
| `SaigonMapV4.tsx` (425줄) | `components/maps/` | 참조 0(주석 언급만), V5가 대체 |
| `DynamicIsland.tsx`, `RouteMap.tsx` | `components/ride/` | RideNav이 다른 컴포넌트 사용 |
| `useKeyboardInset.ts` | `hooks/` | `useKeyboard`가 대체 |
| `PhotoCard.tsx` | `components/ui/` | 참조 0 (AppImage 직접 사용) |

### 2.3 미배선 프론트 컴포넌트 (기능 자체는 다른 UI로 동작 or 미구현)
| 대상 | 위치 | 근거 |
|---|---|---|
| `GasStationMarker.tsx`, `WaitReportSheet.tsx` + `lib/waitReportCooldown.ts` | `components/gas/`, `lib/` | InfoGasList에 미배선 (단, `/info/gas/wait-report` 백엔드는 다른 UI로 active — 컴포넌트만 고아) |
| `FloodDetailSheet/FloodHotspotLayer/FloodMarker.tsx` | `components/flood/` | InfoFloodMap 인라인 렌더로 대체 (중신뢰 — InfoFloodMap 대체 여부 재확인 권장) |
| 미사용 api 함수 | `api/*.ts` | `translateAll`+`pickLang`(translate.ts), `apiUpdateNickname`, `fetchSafetyGrades`, `fetchDistrictQuestCounts`, `fetchRecommendedQuests` — §1 참조 |
| 소형 고아 헬퍼 | `lib/infoCoords.ts:getDefaultLabel`, `lib/serviceArea.ts:SERVICE_AREA_GEOMETRY_VERSION`, `components/maps/district-data.ts:isWithinHcmc·isWithinDistrictRadius` | 참조 0 |

### 2.4 BFF 미사용 엔드포인트
| 대상 | 위치 | 근거 |
|---|---|---|
| `GET /ride/streak`, `/ride/history`, `POST /ride/safety-grade` | `ride.py:180,195,232` | 호출처 0 |
| `POST /ride/submit` | `ride.py:72` | Engine 카드 플로우로 대체 (⚠️ 머니 경로 — 제거 전 보상 지급 경로 이중확인) |
| `GET /quests/pins`, `POST /quests/{id}/bookmark`, `GET /quests/{id}/participants` | `quests.py:372,558,582` | 호출처 0 |
| `GET /quests/district-counts`, `/quests/recommended` | `quests.py:333,390` | §1 정정 (프론트 함수 미사용) |
| `PUT /profile/nickname`, `GET /master/safety-grades` | `profile.py:102`, `master.py:60` | §1 정정 |
| `GET /master/service-area`, `/master/wards/resolve` | `master.py:14,30` | 프론트가 클라이언트에서 자체 계산 |
| `GET /badges/{id}`, `GET /users/me/badges`(중복), `GET /profile/{id}/xp-balance` | `badges.py:39`, `users.py:174`, `profile.py:182` | 호출처 0 |
| `GET /info/gas/stations/nearby-v2` | `info_gas.py:270` | 후속 엔드포인트로 대체 |
| `GET /contents/{id}/img` | `contents.py:173` | imgproxy 직접 URL 사용 |

### 2.5 Engine — `_admin`(X-Admin-Token) 게이트: 발급 코드 부재로 원천 도달 불가
> **구조적 발견**: Engine `/v1/admin/*` 중 `verify_admin_jwt`(`X-Admin-Token`, `ENGINE_ADMIN_JWT_SECRET` 서명) 게이트 라우트는 **그 토큰을 mint하는 코드가 레포 어디에도 없다**. BFF admin 콘솔은 `_svc`(service-key)로 Engine에 접근하므로, `_admin` 방식은 **아무도 안 쓰는 중복 인증**이다.

| 대상 | 위치 |
|---|---|
| `GET/POST/PUT /v1/admin/action-definitions` | `engine/.../admin.py:90,111,125` |
| `GET /v1/admin/users/{id}` (get_user_summary) | `admin.py:146` |
| `POST /v1/admin/users/{id}/adjust` (admin_adjust) | `admin.py:175` |
| `GET /v1/admin/audit-logs` | `admin.py:215` (BFF admin_api audit와 별개) |

→ **정리 방향 2택**: (a) 이 라우트들 제거, 또는 (b) `_admin` 의존 자체 제거. **어느 쪽이든 제품엔 영향 없음**(현재 도달 불가). → 실행은 🔵확인 후.

### 2.6 Engine 미사용 상세조회(list는 쓰되 by-id 미사용)
| 대상 | 위치 |
|---|---|
| `GET /v1/catalog/{id}` | `catalog.py:43` |
| `GET /v1/events/{id}` | `events.py:25` |
| `GET /v1/users/{id}/quest-cards`(active-list; `/completed`만 사용) | `quest_cards.py:63` |

---

## 3. 🟡 보류 대상 (dead-to-frontend지만 삭제 금지)

| 대상 | 위치 | 보류 이유 |
|---|---|---|
| **게이미피케이션 dead 엔드포인트** — `GET /gacha/eligibility/{code}`·`/inventory/equipment`·`/inventory/collection-progress`·`/season/levels/{code}`·`POST /season/claim` | BFF gacha/inventory/season.py | 게이미피케이션 **잠정보류**(중고거래 피벗). 기능째로 게이트 OFF 대상 — 개별 삭제 아님. `season/claim`은 CUR-1/EG-1 머니버그지만 게이트되면 무해 |
| 게이미피케이션 프론트 고아 — `CurrencyBadge`, `GachaCardBack`, `RarityCard`, `CollectionChip`, `RewardIcon`, `fetchGachaPullLog`, `fetchCurrentSeason` | components/game·ui, api/gacha·season.ts | 위와 동일 — 보류 기능 소속 코드는 동결 |
| **missions.py 라우터** — `GET /users/{id}/missions` 외 2 | `engine/.../missions.py:15,40,53` | **write-active/read-dead**: read API는 죽었으나 `mission.update_progress`(event마다)·`expire_missions` job은 계속 동작. 데이터 소비처(리포팅 등) 확인 전 삭제 금지 |
| **reward-partner/catalog/redemption 관리** — `/v1/admin/reward-partners`·`reward-catalog`·`redemptions`·`redemptions/{id}/fulfill` | `engine/.../admin.py:1070-1176` | `_svc` 게이트지만 미배선. **마일리지→RP→기프티콘 코어**(보존 방향)의 파트너/바우처 관리라 향후 필요 가능성. 특히 `fulfill`은 수동 바우처 처리 운영경로 |
| RP 원장 조회 — `GET /users/{id}/transactions`·`/expirations`, `redemptions/{id}` | `engine/.../balance.py:114,168`, `redemptions.py:71` | 기프티콘/RP 코어의 잔액이력 UI 후속 가능성 |
| ops/수동 트리거 — `POST /info/flood/admin/predict-risk`, `/info/gas/admin/refresh`·`upsert` | BFF info_*.py | service-key 보호 + 문서상 "운영자 수동". cron은 서비스함수 직접호출로 우회 — HTTP는 curl/Postman 운영경로 추정 |
| `internal.py` 5개 (grant-exp/gold/badge, mileage-skill-pct, quest-card-completed) | `backend/.../internal.py` | **active** — Engine 워커 콜백(레포 밖 호출자). 도킹스트링+멱등키+`retry_quest_rewards.py` 재사용으로 확정 |
| `EventAgent`(stub), `scripts/load_missions.py`, `/v1/metrics·docs·redoc` | engine/ | 미구현 배선/수동 seed/인프라 — dead 아님 |

---

## 4. 🔵 확인필요 (결정 후 정리/보류 갈림)

| 대상 | 위치 | 필요한 결정 |
|---|---|---|
| `dev_context.py` 사용자 `router`(`/dev/context·features·todos·summary`) — **main.py 미마운트** | `backend/.../dev_context.py:41-316` | admin_router(`/admin-legacy/dev`)는 active. **사용자향 `/dev/*` API를 앞으로 쓸 계획 없으면 제거.** (current.md의 admin 2차 이식 "DEV Context"와 관계 확인) |
| Engine `_admin` 게이트 6라우트 (§2.5) | `engine/.../admin.py` | 라우트 제거 vs `_admin` 인증 자체 폐기 — 둘 중 택 |
| `fetchBusinessProfile`(by-id) → `/biz/public/{id}` | api/biz.ts, biz.py | biz는 활성 기능 — BizPublic 상세가 다른 경로로 도달하는지 확인 후 |
| `GET /app-version/releases`·`{id}` | `app_version.py:47,76` | 네이티브 앱 스토어 업데이트체크 화면(레포 밖)이 쓰는지 |
| `GET /contents/{id}` (메타) | `contents.py:192` | ops/디버그 유틸인지 |
| `QuestDetail` `[DBG] 완료` 버튼 UI | `pages/quest/QuestDetail.tsx` | passcode 분기는 죽었으나 버튼은 렌더됨 — 디버그 버튼째 제거할지 |
| `admin_legacy.py`(~90 라우트) | `backend/.../admin_legacy.py` | URL 도달가능이라 "dead"는 아니나, admin-frontend(신규 SPA)가 이미 대체한 legacy 페이지가 있으면 고아. **legacy→SPA 이식 컷오버 목록 있으면 별도 감사** |

---

## 5. 반드시 지킬 것 (착수 시)

1. **⚠️ 착수 전 체크포인트 커밋 권장** — 현재 워킹트리 **156파일 미커밋**(codex 작업 + 과거 누적). 정리 diff를 이 위에 얹으면 분리·리뷰 불가. codex 작업을 작업단위로 먼저 커밋해 정리를 독립 diff로.
2. **🟢 정리도 신뢰경계별 PR 분리** — 폰인증 / 프론트 컴포넌트 / BFF 엔드포인트 / Engine 별도. 머니 경로(`/ride/submit`) 포함 PR은 재현 테스트 후.
3. **네이티브 미검증** — `native/android·ios` submodule 비어 있어 grep 불가. WebView 구조상 프론트 JS가 클라이언트라 커버되나, 네이티브가 직접 부르는 엔드포인트(GPS 등)는 제거 대상에서 제외했다(active 유지).
4. **삭제 후** — `docker compose --env-file .env up --build -d <svc>` 재빌드 + codebase-memory `index_repository`(현재 stale) 재인덱싱 + 회귀 하네스.
5. **게이미피케이션은 "삭제" 아님** — 보류(🟡)는 기능 게이트 OFF 결정과 함께 다뤄야 하며 코드 제거가 아니다.

---

## 6. 요약 수치

- 🟢 정리 후보: 폰인증 6 + 프론트 컴포넌트/헬퍼 ~15 + BFF 엔드포인트 ~15 + Engine ~9 = **약 45건** (+ SaigonMapV3/V4·WorldMap 등 대형 파일 3개 ≈ 1,500줄)
- 🟡 보류: 게이미피케이션 클러스터 + missions(write-active) + reward-partner/RP원장 + ops경로 + internal콜백
- 🔵 확인필요: dev_context 미마운트 라우터, Engine `_admin` 6라우트, app-version, biz by-id, admin_legacy 컷오버 등 **6건**

**다음 단계**: 이 문서를 사용자가 검토 → 🟢 착수 승인 범위 + 🔵 결정 회신 → (커밋 체크포인트 후) 영역별 PR로 정리 실행.
