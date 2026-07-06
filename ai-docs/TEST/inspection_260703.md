# 전체 시스템 점검 보고서 (2026-07-03)

> 아키텍처·코드·서비스 전수 점검 결과. 영역별 감사(BFF / Engine / Frontend / 인프라·미커밋 diff) 4트랙 + 런타임 헬스체크 + 정적검증(ruff/tsc/eslint) + DB 마이그레이션 정합 확인.
> 조치 우선순위·다음 세션 착수 순서는 [`context/handoff_260703.md`](../context/handoff_260703.md) 참조.

## 1. 런타임 상태 — 전부 정상 ✅

| 항목 | 결과 |
|---|---|
| 컨테이너 10종 (`docker compose ps`) | 모두 Up, 재시작 루프 없음. healthy: bff/engine/db/redis |
| 헬스 엔드포인트 | nginx :18090 → BFF `{"status":"ok"}`, Engine `{"status":"ok"}` |
| PostgreSQL / Redis | 접속 정상, Redis PONG (clients 8) |
| **Engine 마이그레이션** | **DB `alembic_version` = `sre054` = 코드 head 일치** (과거 반복됐던 코드↔스키마 불일치 없음). `levelup_reward_policy` 존재(1행) |
| `.env` ↔ `.env.example` 키셋 | 동일 ✅ |
| 메모리 | 최대 saigon_bff 354MiB — 여유 |
| ⚠️ 단, worker 로그 | 72시간 내 `dispatch failed` 5회 (§3 E-9) |

## 2. 정적 검증

| 도구 | 결과 |
|---|---|
| ruff backend | 0건 ✅ |
| ruff engine | 1건 — `engine/app/main.py:173` E402 (경미) |
| `tsc -b` | 0 ✅ |
| ESLint | **error 1** — `SaigonMapV5.tsx:291` `react-hooks/preserve-manual-memoization` (React Compiler 최적화 스킵). **미커밋 파일이라 pre-commit(에러 0 요구)에서 커밋 차단 상태** + warning 185 (no-explicit-any, set-state-in-effect, no-console 등 누적) |

## 3. 발견 결함 — 조치 필요 사항

### 🔴 P0 — 보안 (즉시) — ✅ 전건 조치 완료 (2026-07-04, SoT [`task/active/260704_p0_security_fixes_task.md`](../task/active/260704_p0_security_fixes_task.md))

| ID | 위치 | 결함 | 조치 |
|---|---|---|---|
| S-1 | `backend/app/routers/users.py:234` | `DELETE /users/me` **무인증** — 임의 UUID로 타인 계정 논리삭제+phone/nickname 파기 가능 | `Depends(verify_user_session)` 추가, 세션 uid를 대상자로 |
| S-2 | `backend/app/routers/users.py:71` | `POST /users/me/skills/{key}/invest` **무인증** — 타인 SP 차감/스킬 조작 (보상 배율 직결 고위험) | 동일 |
| S-3 | `backend/app/routers/admin.py:60` + `docker-compose.yml` | `ADMIN_JWT_SECRET` 하드코딩 폴백(`dev_admin_jwt_secret`) — env 누락 시 admin JWT 위조 가능. compose에도 동일 기본값·`WIKI_AUTH_PASS:-changeme` | 폴백 제거 fail-fast, compose는 `${VAR:?required}` |
| S-4 | `frontend/src/store/useUserStore.ts:164` | **passcode 평문이 localStorage에 영속화** (zustand persist, partialize 없음). `X-Passcode` 헤더로 실사용되는 살아있는 credential | `partialize`로 passcode 제외 (OAuth 전환 완료 시 경로 자체 제거) |
| S-5 | `feed.py:197,356` / `market.py:432` / `ride.py:89` | 생성계 엔드포인트가 세션 uid를 받아놓고 **body의 user_id/seller_id를 대조하지 않음** — 인증 유저가 타인 명의 게시/거래등록/보상수령 가능. 근본: `verify_user_session`이 X-User-ID 자기신고(존재 확인만) | 단기: `body.user_id != _session_uid → 403` (수정/삭제 계열은 이미 대조함). 장기: SGR-B2 세션토큰으로 통합 |
| S-6 | `ride.py:78-98` | `submit_ride`가 `uq.user_id`·`uq.quest_id` 소유권/정합 검증 없음 — 저보상 uq에 고보상 quest_id 붙여 제출 가능. `is_success` 클라 신뢰 | `quest = db.get(Quest, uq.quest_id)`로 조회 + 소유권 체크 |
| S-7 | `contents.py:59-95` + nginx `client_max_body_size 0` | 업로드 **무인증** + `owner_type=system` 클라 지정 가능 + 크기 무제한(전체 메모리 적재) — DoS·오염 표면 | 세션 의존성 + system은 admin 전용 + 크기 상한, nginx 전역 2m/업로드만 상향 |

### 🟠 P1 — 안정성·머니 경로 (이번 스프린트)

| ID | 위치 | 결함 | 조치 |
|---|---|---|---|
| E-1 | `engine/app/workers/__main__.py:62-72` | **워커 배치에 per-message 격리 없음** — 포이즌 메시지 1건이 배치(최대 500건) 전체를 xack 못 하게 막고, 재클레임 시 이미 커밋된 마일리지 **이중 적립** + 무한 재처리. 과거 "거리 동결" 장애가 현재 코드에서도 그대로 재현됨 | 메시지 단위 try/except + 개별 xack, delivery-count 상한(예: 5) 초과 시 DLQ 격리 |
| E-2 | `docker-compose.yml` worker | **워커 liveness 신호 전무** — 크래시 루프여도 외부 탐지 불가 (healthcheck는 bff/engine/db/redis만) | 루프마다 Redis heartbeat SETEX + compose healthcheck |
| E-3 | `engine/app/services/mileage.py:11` | 워커 프로세스의 device→user 캐시가 **크로스 프로세스 무효화 안 됨** — 단말 양도 후 이전 유저에게 계속 적립. `_device_cache`·`_last_ts` 무한 성장 | TTL(5분) 또는 Redis pub/sub 무효화 |
| E-4 | `quest_completed_agent.py:60` | BFF 콜백 실패를 log만 남기고 xack — **보상 지급 조용히 누락** 가능 | 예외 재던지기(E-1 수정 선행) 또는 outbox |
| E-5 | `engine gacha.py:66` / `shop.py:44` / `balance.py:25` | 가챠/상점/credit-rp에 **멱등키 부재** — BFF 타임아웃 재시도 시 이중 차감·이중 지급 (DB 함수 자체는 원자적) | idempotency_key 컬럼+unique |
| E-6 | `engine reward.py:32-37,61` | 쿠폰 `monthly_quota` 검사·증가가 락 없는 read-modify-write — 동시 요청 시 월 쿼터 초과 발급 | `with_for_update()` 또는 조건부 UPDATE RETURNING |
| E-7 | `engine reward.py:41-58` | 외부 바우처 발급이 커밋 전·잔액 락 보유 중 수행 — commit 실패 시 바우처만 발급(이중 발급 소지). 현재 stub이라 잠복 | 2-phase: REQUESTED 커밋 → 발급 → 상태 갱신 |
| E-8 | `backend coupons.py:99` | 쿠폰 교환 멱등키를 서버가 생성(`or uuid4()`) — 클라 미전송 시 재시도마다 새 키 → RP 이중 차감 방지 무력 | idempotency_key 필수화 |
| E-9 | `engine bff_client.py:19` | **실측: 72h 내 dispatch failed 5회** (httpx ConnectError, WSL2 Docker DNS 추정) — 재시도 없이 EXP/보상 유실 | httpx retry transport 또는 실패 시 ack 보류 |
| B-1 | `info_repair.py:22` `info_flood.py:28` `info_gas.py:34` | **`_earn_gp_safe` `contextlib.suppress(Exception)` 패턴 3파일 잔존** — 6월에 잡은 침묵 TypeError 사고와 동일 코드. RP 적립 실패 무로그 소실. 또 `info_repair.py:310`은 적립 실패해도 `rp_earned=50` 하드코딩 응답 | weather식 `except → log.warning` 패턴으로 통일 + 공용 헬퍼 추출 |
| B-2 | `user_quests.py:121,99` | 퀘 포기 시 엔진 카드 취소 실패가 `except: pass` — 엔진 카드 ACTIVE 잔존(슬롯 꼬임), 장애가 정상처럼 위장됨 | 404만 정상 처리, 그 외 log.warning + 보정 배치 |
| E-10 | `fcm_push.py:114,125` | httpx 예외 미처리 → 브로드캐스트 중간 중단·로그 스킵. 무효 토큰(UNREGISTERED) 영구 재발송 | `_send_single` try/except False 반환 + 404 시 토큰 NULL |

### 🟡 P2 — 규약 위반·기술 부채

| ID | 위치 | 결함 | 조치 |
|---|---|---|---|
| A-1 | `backend quests.py:100-108` | **BFF가 `sre_seed_config`를 raw SQL 직접 조회** — 불변식 1 위반 (전수조사 결과 유일 1건) | `engine_client.get_seed()` 교체 |
| A-2 | `feed.py:202,361` / `admin.py:2783` / `info_repair.py:295` / `info_flood.py:186` | 레거시 `*_url` 컬럼 **신규 쓰기** 4계열 — 불변식(contents 중개) 위반. 특히 repair/flood `photo_url`은 클라 임의 URL 저장·재출력(저장형 XSS 표면). PostComment/RepairReview/FloodReport는 content_id 컬럼 자체가 없는 미마이그레이션 엔티티 | `*_content_id` 전환 + 3개 엔티티 마이그레이션 등록 |
| A-3 | `backend main.py:120-126` | CORS `allow_origins=["*"]` + `allow_credentials=True` — admin 쿠키와 결합 시 CSRF 표면 | 오리진 화이트리스트 |
| A-4 | `nginx default.conf` | ① `/engine/` IP allowlist가 운영 토폴로지(호스트 nginx→docker-proxy)에서 무력 — 실방어선은 X-Service-Key뿐 ② 보안 헤더 부재 ③ `/dev-test/.ls/` autoindex | `/engine/` location 제거 권장 |
| A-5 | `engine/Dockerfile` | ① CMD에 `--reload` 포함(운영 이미지 dev 모드) ② `.dockerignore` 부재로 `firebase-credentials.json`이 **이미지 레이어에 구워짐** — 레지스트리 push 시 키 유출 | reload는 dev compose 오버라이드로, .dockerignore + 볼륨 주입 |
| F-1 | `FeedList.tsx:161` (ImageViewer) | 동적 이미지 raw `<img>` — AppImage 폴백·재시도 로직 중복 구현 | AppImage 전환 (제스처 사유면 주석) |
| F-2 | `FeedList.module.css:156,196` | `env(safe-area-inset-top)` 직접 사용 — `--status-bar-height` Android 분기 우회 | 변수로 교체 |
| F-3 | `frontend/src/lib/session.ts:26` | 세션 쿠키 `Secure` 플래그 없음 | https 조건부 추가 검토 |
| F-4 | map 컴포넌트 일대 | 데드 파일: `NeighborhoodMap.legacy.*`, `SaigonMapV3/V4`(tracked, import 0), `getRainRadar`+`RainRadarData` dead export, `saigon-rider-items.svg.bak`. **주의: SaigonMapV2는 WorldMap/MarketMain/LocationPickerSheet 3곳 활성 — 삭제 금지** | 요청 시 일괄 정리 (카파시 §3: 언급만) |
| F-5 | `useRideStore.ts:162` | 이중 pause 시 pause 구간 누락 — `if (get().isPaused) return;` 가드 1줄 | 저위험, 여유 시 |
| E-11 | `engine shop.py:81` | 일일 추천상품이 `date.today()`(컨테이너 TZ) — VN 자정 아닌 UTC 자정(VN 07:00)에 교체 | `ZoneInfo("Asia/Ho_Chi_Minh")` |
| E-12 | `engine reward.py:23` | 멱등키가 user 스코프 아님 — 타인 redemption 반환(바우처 노출) 소지. service-key 내부라 저위험 | user_id AND key 조회 |
| A-6 | `profile.py:176` | xp-balance 무인증 조회(읽기 노출) / `market.py:455` 매물등록 시 키워드알림 전건 로드+동기 푸시(지연) / `feed.py:326` 댓글 무페이지네이션 | 여유 시 |
| A-7 | `utils.py:61` | imgproxy KEY/SALT 빈 값이면 `/insecure` URL 폴백 — 운영 서명 미적용 가능성 | 배포 체크리스트에 등록 |
| D-1 | `CLAUDE.md` ↔ `ai-docs/index.md` | 실파일은 `index.md`(소문자)인데 참조는 `INDEX.md` — case-sensitive 체크아웃에서 깨짐 | 참조 통일 |

### 📌 커밋 전 필수 (현재 워킹트리)

1. **ESLint error 1건 해소** — `SaigonMapV5.tsx:291` `onViewportChange` 메모이제이션 (pre-commit 차단 중)
2. **백업/잡파일 정리** — `NeighborhoodMap_bak.tsx/.module.css`, `NeighborhoodMap_v3bak.tsx`, 루트 `image.png` 삭제 또는 gitignore (`git add .` 시 유입됨)
3. `seed_dummy_market.py` 주석의 테스트 계정 전화번호 정리 고려
4. diff 자체 품질은 양호 — GPS 재측정 가드, useInfiniteScroll 의존성 픽스, BottomSheet rAF, 신규 SearchBox 레이스/누수 없음, i18n 3로케일 완전 동기(1,277키 일치 전수검증). `map.py` 응답 키 `district_id`가 실제론 ward id (동작 무해, 개명 권장)

## 4. 클린 판정 (불변식 준수 확인)

- ✅ naive datetime: backend·engine 모두 위반 0 (engine `date.today()` 1건만 — E-11)
- ✅ engine_client 시그니처: 전 함수 × 콜사이트 약 80곳 전수 대조 — 불일치 0
- ✅ Engine 마이그레이션 체인: 54개 완전 선형, head `sre054`, DB 적용 일치
- ✅ quest_validators 레지스트리: enum 4종 = 레지스트리 4종 = DB enum 완전 일치
- ✅ 네이티브 브리지: `navigator.*` native.ts 외부 0건, eslint-disable 이탈 없음
- ✅ i18n ko/en/vi: 1,277키 완전 일치
- ✅ 하드코딩 시크릿: S-3 폴백 외 없음. git 추적 시크릿 없음(`firebase-credentials.json` gitignore 정상, `google-services.json`은 android 서브모듈 semi-public 허용)
- ✅ 이벤트 경로 멱등성(event_bus): idempotency 테이블 + unique 이중 방어 — 견고
- ✅ RP 일일캡 60: VN 일자 리셋·FOR UPDATE 직렬화 정확

## 5. 워킹트리 diff 정독 리뷰 + 조치 (2026-07-04, /code-review high)

> 지도 v5 전환 diff(900줄) 대상. 파인더 8앵글 → 후보 25클러스터 → 검증자 6트랙(1-vote) → 확정 findings. REFUTED 6건 기각(인덱스 부재·common.back 미등록·현위치 버튼 info 회귀·didAutoLocate 중복 등 — 검증에서 사실관계 오류로 판명).

### 수정 완료 ✅

| # | 결함 | 조치 |
|---|---|---|
| 1 | **create_listing이 ward_id 미설정** → 실유저 매물이 지도 배지·총계에서 영구 누락 (dev DB 실측 7건) | `utils.find_nearest_ward_id()` 신설(공용 `haversine_m`과 함께) → create_listing 배정. **dev DB 백필 UPDATE 10건 완료**, 배지 총계 154→161 확인 |
| 2 | 초기 진입 시 마운트 rAF가 GPS 줌을 전역 뷰로 덮어쓰는데 좁은 ward bbox는 커밋됨 → 리스트/지도 불일치 고착 | initialGps 마운트 focus에 `suppressBbox` — 초기화 경로는 bbox를 emit하지 않음(가이드 상태에서 시작) |
| 3 | useInfiniteScroll 스테일 응답 레이스 (필터/탭 전환 중 구 응답이 새 목록 덮어씀, 4개 화면 영향) | `reqSeqRef` 시퀀스 토큰 — 스테일 응답 폐기 |
| 4 | SearchBox Enter에 IME composition 가드 없음 (ko/vi 조합 확정 Enter가 반조합 검색어 제출) | `!e.nativeEvent.isComposing` 가드 (DmDetail 기존 패턴) |
| 5 | 타이핑만 하고 뒤로가기해도 검색 모드 고착 + 패널 뒤 숨은 라이브 fetch/지도 re-fit | 라이브 디바운스 제거 → **제출 시점(`submittedQuery`)에만 검색**. 뒤로가기=draft 복원, X=검색 해제 |
| 6 | 검색 마커 탭이 ward 선택 동시 오발화 (region 모드 오진입, 해제 칩은 숨겨짐) | pointerdown 실타깃 기억(`downTarget`) + `data-marker` 가드로 ward 히트테스트 스킵 |
| 7 | ward 선택 시 이펙트 재발화가 `setViewportBbox(null)`을 500ms 뒤 무효화 → 지역 해제 후 가이드 상태 건너뜀 | 3중: LOD 이펙트 `onViewportChange(true)`(bbox는 제스처/줌/fit만 emit) + NeighborhoodMap region 모드 bbox 무시(modeRef) + resetToViewport에서 bbox/타이머 클리어 |
| 8 | `district_id` 키에 ward id 혼입 (다음 소비자의 조인 함정) | 응답 키·프론트 타입 `region_id` 개명 + 주석 (현 소비자는 lat/lng/count만 사용 — 무파급 확인) |
| 9 | 키 입력마다 미memo SaigonMapV5(수천 SVG 노드) 전체 리컨실 | `export default memo(SaigonMapV5)` (콜백 props useCallback 계약은 기존과 동일) |
| 10 | **ESLint `preserve-manual-memoization` error — pre-commit 차단** | 원인 격리(프로브 실험): 마운트 rAF 이펙트(빈 deps)가 `onViewportChange`를 직접 클로저 캡처 → latest-ref(`onViewportChangeRef`) 경유로 해소. 부수로 polyActive/selWard도 ref 미러(콜백 체인 안정화, V2 검증자가 지적한 이펙트 중복 실행 해소) |
| 11 | locateCtrl 인라인 bottom이 info 페이지 4곳 버튼 12px 하강 | zoomControls와 동일한 조건부 스타일로 |
| 12 | 시드 스크립트: DEPTH1_WARDS 37행 동결 사본(SGR-310 재발 위험) + haversine 4번째 사본 + 테스트계정 전화번호 주석 | `saigon-depth1.json` 직접 `json.load()` + `scripts.assign_wards.haversine_m` 재사용 + 주석 정리. master.py 인라인 `_haversine`도 utils로 통합(4벌→1벌) |
| 13 | `_bak` 백업 3종 + 루트 image.png (커밋 유입 위험, tsc 에러 원인) | 삭제 |

**검증**: `tsc -b` 0 / ESLint error 0 (pre-commit 차단 해소) / ruff backend 0 / BFF --reload 반영 후 `district-counts` 스모크(region_id·총계 161)·`wards/resolve` 정상 / 프론트 컨테이너 재빌드.

### 보류 (의도적 — 사유 기록)

- **headerCount 배지-우선 표기**: 배지 표시 중 헤더=전역 총계 vs 시트=bbox 필터 목록 불일치 — 헤더를 지도 배지 합계와 맞추려는 **의도적 트레이드오프**(SaigonMapV5 주석 명시)로 판정, 유지. #1 수정으로 "총계가 실제보다 작은" 이중 왜곡은 해소됨.
- **SearchBox ↔ MarketSearch 통합 / fitToPoints·renderBody 공용화 / vv 하드닝의 useKeyboardInset 이관**: 확정된 중복이나 이 diff 밖 화면(마켓검색·DM·ProfileCard)의 시각 회귀 검증이 필요해 별도 작업으로 backlog. useInfiniteScroll 센티넬 콜백-ref 전환도 동일(현 4개 소비처는 정상 동작 확인됨).

## 6. 문서·그래프 상태

- **codebase-memory ADR이 비어 있었음**(`no_adr`) — 재인덱싱 초기화 이슈(agent-guidelines §9)로 유실된 상태였고, 본 점검에서 재인덱싱 후 복구함
- 그래프 인덱스는 본 점검 마무리 시 `index_repository`로 재인덱싱 완료
- `_bak`/`v3bak` 노드가 그래프에 잡히므로 조회 시 데드 코드로 필터해 읽을 것 (frontend-page-map.md에 기재됨)
