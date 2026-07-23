# 전 서비스 출시감사 반영 현황 종합 (Applied Summary)

> 작성 2026-07-23. READ-ONLY 검증 결과물 — 코드 변경 없음.
> 기준: `origin/main` HEAD `a40b126`.
> 검증 방법: git log/diff 정독 + 4개 Sonnet 서브에이전트 병렬 코드 대조(주장이 아니라 실제 파일:라인 확인). 각 항목 옆에 검증 근거를 남긴다.

---

## 1. 개요

2026-07-22~23 사이 `saigon_rider` 전 서비스에 대해 사용자 관점 출시차단 보안/품질 감사가 수행됐고, 그 발견사항이 두 레이어로 구현됐다.

- **Layer 1 (Claude, 이 문서 이전 세션, "Batch A~F")**: 체크포인트 `8790ac2` → `2961114`(Batch B 보안/IDOR) → `3bff5c5`(Engine device-map null가드) → `4fdb06c`(Batch C 거래무결성) → `21b3734`(Batch D 경제정합) → `e79d35b`(market-fe SOLD 셀렉터 제거) → `387656e`(Batch E 피드/지원/비즈) → `3755179`(Batch F 인프라 하드닝).
- **Layer 2 (대표, Layer 1 위에 추가)**: `3896ae8`(감사 문서 재조정) → `68b3ccf`(OAuth Redis 교환코드) → `f8db988`(피드 차단+비동기 업로드) → `23b6761`(쿠폰/차고 게이트) → `4fe39e5`(안전정보 unavailable) → `c3818fe`/`d0ec8e9`(운영 seed 안전) → `4933165`(알림 재전달 dedup) → `5a1d635`(번역 fail-closed) → `796de18`(admin 브루트포스+migration lint) → `dbd0935`(알림 outbox) → `a40b126`(핸드오프 문서 추가).

감사 소스 문서: `ai-docs/task/active/260722_service_user_full_launch_audit_task.md`(SoT, 대표가 `3896ae8`에서 갱신), `ai-docs/task/active/260722_fullservice_audit_remaining.md`(SUPERSEDED — Batch 체크리스트 원본), `.orca/drops/HANDOFF_FULL_SERVICE_REVIEW.md` + `.orca/drops/260722_map_service_launch_blockers_task.md`(원본 finding 상세, AUTH-*/MKT-*/ENG-*/CUR-*/EG-*/FD-*/BIZ-*/DB-*/ADM-*/지도 P0-P1).

**결론(선요약)**: P0급 계정탈취·IDOR·거래위조·경제정합성·인프라 하드닝 findings는 거의 전부 코드상 RESOLVED로 확인됐다. 유일하게 코드 레벨에서 진짜 안 고쳐진 것은 **가챠 SQL 함수(EG-2~5)** 인데, 이는 라우터/라우트 자체를 게이트 OFF 해서 현재 사용자에게 도달 불가능한 상태로 무력화했다(고친 게 아니라 닫은 것 — 재오픈 시 재검토 필수). 그 외 남은 것은 안전정보 predictor의 부분 실패 잔여 케이스, 홈 화면 일부 위젯의 에러/빈상태 미분리, 그리고 처음부터 "코드 밖" 게이트로 명시된 외부 검증(실기기, 외부 API 키, fresh volume, 약관 문안)이다.

---

## 2. Finding별 반영 현황

### 2.1 인증·세션·IDOR (AUTH-*, P0-1/P0-2, MKT-5/6, QST-4/5, FD-1, BIZ-5, CUR-5)

| ID | 상태 | 레이어/커밋 | 근거 |
|---|---|---|---|
| P0-1/AUTH-1 (UUID-only 인증) | **RESOLVED** | Layer1 `2961114` | `backend/app/deps.py:54-85` `verify_user_session`이 `X-Session-Token`을 요구하고 pbkdf2 해시를 `user.passcode_hash`와 대조 + `session_expires_at` 확인 |
| AUTH-2 (전화번호 재등록 탈취) | **RESOLVED** | Layer1 `5c52e54` | `/auth/register`·`/auth/login` 엔드포인트 자체가 삭제됨(데드코드 정리와 함께) |
| AUTH-3 (무인증 `/auth/me?phone=`) | **RESOLVED** | Layer1 `5c52e54`/`2961114` | `/auth/me`가 `phone` 쿼리를 받지 않고 세션에서만 유저 파생 |
| AUTH-4 (차단 우회 DM/팔로우) | **RESOLVED** | Layer1 `2961114` | `dm.py:386`, `follows.py:69` 모두 `require_unblocked` 호출 |
| AUTH-5 (sender_id 위조) | **RESOLVED** | Layer1 `2961114` | `dm.py:404` `sender_id=_session_uid` 하드고정 |
| AUTH-6 (프로필 IDOR) | **RESOLVED** | Layer1 `2961114` | `profile.py:54-56,109-110` `user_id != _session_uid → 403` |
| AUTH-7 (팔로우 IDOR) | **RESOLVED** | Layer1 `2961114` | `follows.py:60,87` 동일 패턴 |
| AUTH-8 (device-map 무인증) | **RESOLVED** | Layer1 `2961114`(BFF), `3bff5c5`(engine) | `auth.py:76-99` `verify_user_session` 요구, `engine/app/routers/device_map.py:130` `COALESCE(NULLIF(fcm_token,''), existing)` |
| AUTH-9 (skill_pt 비원자) | **RESOLVED**(스코프 한정) | Layer1 `2961114` | `users.py:90-98` `UPDATE ... WHERE skill_pt >= 1` 원자적 조건부. 감사가 지목한 그 경로 한정 수정 — 타 skill_pt 소모경로는 이번 라운드에서 별도 재확인 안 됨(리스크 낮음) |
| AUTH-10 (dev-login fail-open) | **RESOLVED** | Layer1 `2961114` | `auth.py:805-825` 허용목록 방식(`development/dev/local/test`)으로 반전, 주석에 AUTH-10 명시 |
| AUTH-11 (OAuth state in-process) + P0-1 잔여(장기토큰 URL 노출) | **RESOLVED** | Layer2 `68b3ccf` | `backend/app/services/oauth_flow.py` Redis 기반 state/1회용 exchange code(120s TTL), `frontend/src/pages/auth/OAuthResult.tsx`+`api/auth.ts`가 `/auth/oauth/exchange` 호출. 콜백 URL에 세션토큰 없음 |
| AUTH-12/CUR-5 (IDOR: stats/quest-history/badges) | **RESOLVED** | Layer1 `2961114` | `users.py:105-110,177-184` 세션+본인검증, `badges.py:16-19` user_id 파라미터 자체 제거 |
| MKT-5/6 (찜/키워드알림 IDOR) | **RESOLVED** | Layer1 `2961114` | `market.py:892-918,933-976` 세션 대조 |
| QST-4 (퀘스트 accept IDOR) | **RESOLVED** | Layer1 `2961114` | `quests.py:353` |
| QST-5 (user_quest 취소 IDOR) | **RESOLVED** | Layer1 `2961114` | `user_quests.py:35-41` `_get_owned_user_quest` |
| FD-1 (좋아요 IDOR) | **RESOLVED** | Layer1 `2961114` | `feed.py:411-412` |
| BIZ-5 (internal.py UUID try/except 없음) | **RESOLVED** | Layer1 `2961114` | `internal.py:58-61,84-86,103-105,114-118` 4개 핸들러 모두 try/except 400 |
| P0-5 (`[DBG]` 강제완료 라우트) | **RESOLVED** | Layer1 `5c52e54`+`87a7bb0` | `backend/app/routers/quests.py`에 force-complete 라우트 전무(전체 파일 확인), 프론트 DBG 버튼도 제거 |
| ADM-1 (dev_context 무인증 CRUD) | **RESOLVED**(원 우려보다 나음) | Layer1 `5c52e54` | 원 감사가 "미배선이라 잠재적"이라 강등했던 구 `router`(무인증)는 삭제됐고, `admin_router`(prefix `/admin-legacy`, 전 엔드포인트 `Depends(verify_admin_session)`)만 남아 `main.py:183`에 등록됨. 즉 무인증 경로 자체가 사라짐 |

### 2.2 거래무결성 (P0-4, MKT-1/2/3/7, DB-2/3/10/11, migration 139/140)

| ID | 상태 | 레이어/커밋 | 근거 |
|---|---|---|---|
| P0-4 (제3자 강제예약) | **RESOLVED** | Layer1 `4fdb06c`/`2961114` | `dm.py:217-220` 대화생성 시 `listing.seller_id == other_user_id` 강제, `market.py:1051-1136,1266-1347` 제안/약속 accept가 실제 참여자·역할 검증 + `SELECT FOR UPDATE` |
| MKT-1 (거래이력 없는 리뷰) | **RESOLVED** | Layer1 `4fdb06c` | `market.py:790-840` COMPLETED 약속 존재 검증(양방향) + 앱레벨 중복방지(DB 유니크는 아님 — 이론상 타이트레이스 남을 수 있음, 저위험) |
| MKT-2 (cross-conversation 이중 accept) | **RESOLVED** | Layer1 `4fdb06c` | migration `140` `uq_mp_appointment_active_per_listing` 부분 유니크(매물당 ACCEPTED 1건) |
| MKT-3 (SOLD 수동전환) | **RESOLVED** | Layer1 `4fdb06c` + Layer1 `e79d35b`(프론트 셀렉터 제거) | `market.py:581-583` `status=="SOLD"` PATCH 요청 400 거부, complete_appointment 경로로만 전이 |
| MKT-7 (완료후 가격변경+합의가 미스냅샷) | **RESOLVED** | Layer1 `4fdb06c` | `market.py:620-622` SOLD 상태 가격PATCH 409, migration `140` `agreed_price_vnd` 컬럼+완료시점 스냅샷(`market.py:1199`) |
| MKT-9/DB-2 (음수가격) | **RESOLVED** | migration `140` | listings/offers/ride_sessions 3컬럼 nonneg CHECK |
| MKT-11/DB-10 (리뷰 rating 타입불일치, fresh DB insert 전멸) | **RESOLVED** | migration `139` | VARCHAR(GOOD/BAD) → `SMALLINT CHECK(1..5)`로 전환, `models.py` 정합 |
| DB-3 (ride_sessions user_quest_id unique 없음) | **RESOLVED** | migration `140` | `UNIQUE(user_quest_id)` 추가 |
| DB-11 (appointment/offer status CHECK 없음) | **RESOLVED** | migration `140` | status CHECK 제약 추가 |

### 2.3 Engine 경제 정합성 (ENG-*, CUR-*, EG-*)

| ID | 상태 | 레이어/커밋 | 근거 |
|---|---|---|---|
| ENG-1 (캡 boolean 게이트, 클램프 아님) | **RESOLVED** | Layer1 `21b3734` | `xp_ledger.py:166-174` 잠금 하 재조회 후 `amount=headroom`로 클램프 |
| ENG-2 (MILEAGE_XP is_active=false 방치) | **RESOLVED** | Layer2 `6dec07d`(alembic `060`) | `060_mileage_policy_reactivate.py:23` `UPDATE reward_policy SET is_active=true` |
| ENG-4 (신규계정 RP 감쇄 누락) | **RESOLVED** | Layer1 `21b3734` | `event_bus.py:174-179` RP도 `penalty_multiplier` 적용 |
| ENG-9 (캡초과 PROCESSED, REJECTED 아님) | **RESOLVED** | Layer1 `21b3734` | `anti_abuse.py:89-90` `rejected=True` |
| ENG-10 (RP 원장 없음) | **RESOLVED** | Layer1 `21b3734` + alembic `061` | `gc_transaction` 테이블 신설, `xp_ledger.py:111-135` `credit_gc()`가 매 지급마다 `record_gc_tx()` 기록 |
| ENG-11 (ops daily-net SQL 없는 컬럼) | **RESOLVED** | Layer2 `6dec07d` | `engine/app/routers/admin.py:484-500` `xp_transaction`만 조회, `currency`는 하드코딩 리터럴 |
| ENG-12 (naive datetime) | **RESOLVED** | Layer1 `21b3734` | `event_bus.py:55-56` naive datetime 422 거부 (프로젝트 timezone-aware 강제 규칙 정합) |
| EG-6 (가챠/상점 idem key 없음) | **RESOLVED** | (engine idempotency 인프라) | `gacha.py:98-113`, `shop.py:100-115` `operation_idempotency.claim_or_replay`/`store_response` |
| **EG-2 (SEASON_PULL fallback이 collection_filter 무시)** | **OPEN**(코드 미수정, 기능 게이트로 무력화) | 해당없음 | `engine/alembic/versions/016_shop_gacha_functions.py:137-142` fallback SQL이 여전히 `collection_code` 필터 없음 |
| **EG-3 (천장/10연보장 충돌)** | **OPEN**(코드 미수정, 게이트로 무력화) | 해당없음 | `016:107-112,264-274` 강제등급 우선순위·pity 리셋 로직 원본 그대로 |
| **EG-4 (중복아이템 환급 0)** | **OPEN**(코드 미수정, 게이트로 무력화) | 해당없음 | `alembic/015_reward_dispatcher_functions.py:33-40` common/rare/epic 환급 여전히 0 |
| **EG-5 (SEASON_LOCKED 환급통화 GP 하드코딩)** | **OPEN**(코드 미수정, 게이트로 무력화) | 해당없음 | `015:248-250` `v_refund_currency := 'GP'` 그대로 |
| MKT/CUR 나머지(CUR-1~4,6-12, EG-1,7-11) | **DEFERRED**(기능 게이트로 범위 밖) | Layer2 `23b6761`, `9554025`, `bfbbf73` | 시즌·가챠·상점·인벤토리·쿠폰이 전부 게이트 OFF라 이 finding들이 딛고 선 기능 자체가 사용자에게 도달 불가 (§2.5 참조) |

**가챠 게이트 결정(§7 원 질문에 대한 실제 답)**: `260722_fullservice_audit_remaining.md` §7이 제기한 "(a) 가챠도 게이트 OFF" vs "(b) EG-2~5 출시 전 수정" 중 **(a)가 채택됐다** — 코드 수정이 아니라 접근 차단으로 처리됐다. `backend/app/main.py:23,179` gacha 라우터 include 주석처리, `frontend/src/App.tsx:86-89,401-404` `/gacha*` 라우트/임포트 주석처리(`bfbbf73`). Engine 자체는 `engine/app/main.py:147-150`에 gacha/shop/inventory/season 라우터가 여전히 마운트돼 있지만 전 엔드포인트가 `Depends(verify_service_key)`(클라이언트가 갖지 못하는 내부 시크릿)로 막혀 있어 외부에서 직접 호출 불가. **결론: EG-2~5는 고쳐진 게 아니라 닫힌 것 — 향후 가챠를 재오픈하려면 이 4건을 먼저 실제로 수정해야 한다.**

### 2.4 피드·알림·지원 (FD-*)

| ID | 상태 | 레이어/커밋 | 근거 |
|---|---|---|---|
| FD-1 (좋아요 IDOR) | RESOLVED | Layer1 `2961114` | (2.1 참조) |
| FD-2/FD-12 (지원 유저답글/알림 없음) | **RESOLVED** | Layer1 `387656e` | `support.py:85` `POST /tickets/{id}/replies`(유저), `admin_api/support.py:153-176` 답변 시 `noti_events.publish` |
| FD-3 (차단필터 없음) | **RESOLVED** | Layer1 `387656e` | `feed.py:189-192,238-240,260-262,456-458` 양방향 `UserBlock notin_` 필터, write 경로도 `require_unblocked` |
| FD-4 (신고 라우트 없음) | **RESOLVED** | Layer1 `387656e` | `feed.py:535-618` post/comment 신고 라우트, `database/init/144_reports_feed.sql` |
| FD-6 (발행실패 삼킴 → 알림유실) | **RESOLVED**(잔여 명시) | Layer2 `dbd0935` | `noti_events.enqueue()`가 호출자 트랜잭션 내 outbox row만 적재(커밋 안함), `noti_worker/__main__.py` `_outbox_relay_loop`가 미발행 row를 `skip_locked`로 발행+`published_at` 마킹, `dm.py:419`/`market.py:560`이 실제 enqueue 호출. **잔여**: worker가 outbox row 발행 후 provider 호출 전 crash하는 좁은 창(감사 문서 자체가 명시한 accepted residual, 신규 갭 아님) |
| FD-9 (차단유저 키워드알림) | **RESOLVED** | Layer1 `387656e` | `noti_worker/__main__.py:187-193` 양방향 UserBlock 제외 |
| 알림 재전달 dedup | **RESOLVED** | Layer2 `4933165`+`dbd0935` | `database/init/145` 부분유니크 `(source_event_id,user_id)`, 컨슈머가 outbox `event_id`를 msg_id보다 우선 사용 |

### 2.5 비즈·컨텐츠·시스템 (BIZ-*)

| ID | 상태 | 레이어/커밋 | 근거 |
|---|---|---|---|
| BIZ-1 (업로드 동기 I/O) | **RESOLVED** | Layer2 `f8db988` | `contents.py:96,103` `asyncio.to_thread(mkdir/write_bytes)` |
| BIZ-2 (SVG 저장형 XSS) | **RESOLVED** | Layer2 `f8db988` | `contents.py:44-53,101` 매직바이트 스니핑, SVG는 허용목록에 없음, 선언-실제 mime 불일치 400 |
| BIZ-3 (번역 rate limit 없음) | **RESOLVED** | Layer2 `5a1d635` | `translate.py:27-46` 길이상한 5000 + Redis 원자 rate limit(30/60s), Redis 장애시 503 fail-closed |
| BIZ-5 (internal.py UUID 500) | RESOLVED | Layer1 `2961114` | (2.1 참조) |
| BIZ-9 (번역실패 무표시) | **RESOLVED** | Layer2 `dbd0935` | 백엔드 `translation_failed` 플래그(선재), 프론트 `MarketDetail.tsx:301-302`/`FeedDetail.tsx:154-155`가 "번역 일시 불가" 배지 렌더 |

### 2.6 admin (ADM-*)

| ID | 상태 | 레이어/커밋 | 근거 |
|---|---|---|---|
| ADM-1 | RESOLVED | Layer1 `5c52e54` | (2.1 참조) |
| ADM-2/3/4 (admin_legacy XSS 3종) | **RESOLVED** | Layer1 `9554025` | `admin_legacy.py:544`(quote), `:551`(h()), `:2003`(item_code 속성화+onclick 인라인 제거), 배지 조건 화이트리스트+escape |
| ADM-5 (JWT role fail-open→root) | **RESOLVED** | Layer1 `9554025` | `admin_auth.py:60` `role or "admin"`(최소권한으로 반전) |
| ADM-6 (브루트포스 무방비) | **RESOLVED** | Layer2 `796de18` | `services/admin_login_throttle.py` username+IP 2축 escalating lockout, 양쪽 로그인 배선 |

### 2.7 Database·infra (DB-*)

| ID | 상태 | 레이어/커밋 | 근거 |
|---|---|---|---|
| DB-1 (fresh DB init 체인 끊김) | **RESOLVED**(사전 확인, Batch A~F 이전) | 이전 세션 | `260722_fullservice_audit_remaining.md` §0에 이미 해결로 기록(041/060 `to_regclass` 가드 + alembic auto) |
| DB-2/3/10/11 | RESOLVED | migration 139/140 | (2.2 참조) |
| DB-4 (서비스키 fail-fast 없음) | **RESOLVED** | Layer1 `3755179` | `docker-compose.yml:130,141,220,265,307` `${ENGINE_SERVICE_KEY:?...}`/`${ADMIN_PASS_HASH:?...}` |
| DB-6 (migration prefix 중복) | **RESOLVED**(baseline grandfather + 신규차단) | Layer2 `796de18` | `tools/check_migration_prefixes.py` 기존 002/042/092/093/138 중복 5쌍 grandfather, 신규 중복만 차단. `.pre-commit-config.yaml:19-24` 훅 배선 |
| DB-8 (nginx rate limit 없음) | **RESOLVED** | Layer1 `3755179` | `nginx/conf.d/default.conf:3,5,84,99,115` `limit_req_zone`/`limit_req` |
| DB-9 (보안헤더 없음) | **RESOLVED** | Layer1 `3755179` | 같은 conf `:21-28` XFO/XCTO/Referrer-Policy/HSTS/CSP |
| DB-14 (`[DEV]` seed 운영노출) | **RESOLVED** | Layer2 `c3818fe`/`d0ec8e9` | `database/init/095,096,098,106,107,114,117,118,123` 각 파일이 `app.seed_profile IN (development/dev/local/test)` 가드로 dev seed 격리, `docker-compose.prod.yml:53` `app.seed_profile=production` 하드코딩, `tools/check_production_seed_safety.py` + pre-commit |

### 2.8 지도·안전정보 (map SoT — `.orca/drops/260722_map_service_launch_blockers_task.md` 자체 번호 P0-1~8/P1-1~13)

| ID(map 문서) | 상태 | 레이어/커밋 | 근거 |
|---|---|---|---|
| P0-2/P0-3(map, 위치 프라이버시) | **RESOLVED**(Batch 이전부터) | 이전 세션 | `FeedCreate.tsx:36` `locOn=false` 기본, `feed.py:88-96,121-122` `_public_coordinates()` ward centroid 마스킹만 반환 |
| P0-5(map, RideNav 강제 origin/route mode) | **RESOLVED**(Batch 이전부터) | 이전 세션 | `RideNav.tsx`에 `DEV_FORCE_HCMC_ORIGIN` 없음, `resolveOrigin()`이 실 GPS만 사용; `info_route.py:89,150,199` `two_wheeler` 모드 + `lang: Literal["ko","en","vi"]` |
| P0-7(map, 가짜 날씨 mock) | **RESOLVED** | Layer2 `4fe39e5` | `info_weather.py:93-136,332-335` 실패시 `_get_stale_cached`(실제 마지막 성공 데이터+`stale=true`) 또는 502/503, 고정 mock 날짜 없음. 프론트 unavailable/stale 배지 신규 |
| P0-7(map, 침수 단일투표 해제) | **RESOLVED**(Batch 이전부터) | 이전 세션 | `info_flood.py:27,69,271` `_RESOLVE_QUORUM=2` + 거리 가드 이미 구현 |
| **P0-7(map, predictor 부분실패 시 0% 덮어쓰기)** | **PARTIAL/OPEN** | 해당없음 | `backend/app/jobs/predict_flood_risk.py:92` `DELETE FROM flood_risk_daily`가 무조건 실행(전체 API 키 미설정일 때만 스킵). `_max_pop_24h`(29-40)가 개별 요청 실패를 삼켜 `0.0` 반환 — 일부 district만 provider 장애여도 해당 구 위험도가 0%로 덮이고 기존 스냅샷 보존 없음. **미해결 잔여 버그**(전체 장애 케이스만 가드됨) |
| P1-1(map, 위치 store 원자성) | **RESOLVED** | (범위내, 정확한 커밋 미특정) | `frontend/src/store/useLocationStore.ts:6-13` 단일 `LocationSnapshot{coords,wardId,wardName,source,measuredAt,accountId}` |
| P1-2(map, bbox 클라 필터→서버) | **RESOLVED** | 범위내 | `feed.py:141-186`, `market.py:222-328` 서버측 bbox 파라미터+필터. 클라 `.filter()`는 방어적 재확인용으로만 잔존 |
| **P1-3(map, 오류=0건 위장)** | **PARTIAL** | Layer2 `4fe39e5`(안전정보만) | 침수/날씨는 loading/ready/unavailable 분리됐으나 `WorldMapV2.tsx:190-238` 홈 화면의 `nearbyProducts`/`recentProducts`/`ads`/`communityPosts`는 여전히 `.catch(()=>setX([]))`로 에러를 빈 배열과 동일시함(안전 필수경로 아님, 저위험이나 미해결) |
| P1-4(map, block/HIDDEN 일관성) | **RESOLVED**(best-effort) | 범위내 | `market.py:229,234,293-305,391-405` viewer_id는 세션에서 파생, block+HIDDEN/REMOVED 필터 목록·상세 양쪽 적용. DM 등 타 표면은 이번 라운드에서 재확인 안 함 |

### 2.9 게이미피케이션 게이트 현황 (가챠/상점/인벤토리/시즌/쿠폰/차고)

| 대상 | 프론트 | BFF | Engine |
|---|---|---|---|
| 가챠(`/gacha*`) | 라우트/임포트 주석처리 (`App.tsx:86-89,401-404`) | 라우터 include 주석처리 (`main.py:23,179`) | 라우터는 마운트돼 있으나 전 엔드포인트 `verify_service_key` 요구(외부 접근 불가) |
| 상점/인벤토리/시즌 | 동일하게 주석처리 | 동일하게 주석처리(`season.py` 라인 40,182 등) | 동일 |
| 쿠폰(coupons) | 진입점(`ProfileMain.tsx` 배너 등) 삭제 | 라우터 import/include **완전 삭제**(주석 아님) | alembic `062`가 INTERNAL 파트너 catalog `is_active=false`로 비활성화 |
| 차고(garage) | `/garage` 라우트 삭제, `GameHubSheet.tsx` 진입점 제거 | 해당없음 | 해당없음 — `frontend/src/pages/garage/Garage.tsx` 파일은 고아로 남아있음(참조 없음, 삭제 안 됨 — 무해한 dead code) |

---

## 3. 대표(Layer 2) push가 추가로 반영한 것 — Layer 1 대비 delta

Layer 1(Batch A~F)이 세션/IDOR/거래/보상/경제/피드/지원/인프라 결함 대부분을 이미 닫았고, Layer 2는 그 위에서 **Claude가 끝내지 못했거나(P0-1 OAuth 잔여) Batch 문서 자체가 "중위험 후속"으로 미룬 항목**을 마무리했다:

1. **OAuth 1회용 exchange code + Redis state (`68b3ccf`)** — Batch F까지도 OAuth state가 프로세스 메모리(멀티워커 배포시 무작위 `invalid_state`)였고 콜백 URL에 장기 세션토큰이 노출됐다. Layer 2가 `oauth_flow.py`를 신설해 Redis 10분 TTL·원자적 1회 소비 state + 콜백에는 2분 TTL 단회용 code만 전달, `/auth/oauth/exchange`에서 세션 발급하도록 재설계. **이건 Layer 1이 REDID/완성한 게 아니라 Layer 1이 손대지 못한 부분을 Layer 2가 처음 구현**한 것.
2. **알림 transactional outbox (`4933165`+`dbd0935`)** — Layer 1(Batch E)은 재전달 dedup(`msg_id` 기반)까지만 했고 "발행 자체가 실패하면 영구 유실"은 미해결로 남겨뒀다(FD-6). Layer 2가 `notification_outbox` 테이블+`enqueue()`(도메인 트랜잭션 내 적재)+`_outbox_relay_loop`(skip_locked 발행)로 producer 측 유실을 닫고, dedup 키를 Redis msg_id에서 불변 `event_id`(outbox row id)로 승격해 재전달과 재발행 모두 멱등화했다.
3. **운영 `[DEV]` seed 격리 (`c3818fe`/`d0ec8e9`)** — Batch F는 DB-4/DB-6/DB-8/DB-9만 다뤘고 DB-14(`[DEV]` 광고 운영노출)는 Low로 후순위였다. Layer 2가 9개 init 파일에 `app.seed_profile` 조건 가드를 추가하고 `docker-compose.prod.yml`에 profile을 명시, `tools/check_production_seed_safety.py` pre-commit 게이트 신설.
4. **feed 차단필터 + 비동기 업로드 (`f8db988`)** — Batch E가 만든 차단필터/신고 라우트 위에, Layer 2가 BIZ-1(업로드 동기 I/O)·BIZ-2(SVG XSS)를 같은 커밋에서 함께 처리(contents.py 매직바이트 검증).
5. **쿠폰/차고 게이트 (`23b6761`)** — Layer 1 Batch F 시점엔 게이미피케이션(인벤/상점/가챠/시즌) 게이트 OFF만 돼 있었고 INTERNAL 쿠폰 catalog와 차고는 별개로 살아있었다(P0-6 원 결함: 실 제휴 없는 쿠폰이 500 RP 차감). Layer 2가 이걸 추가로 닫고 alembic `062`로 catalog 자체를 비활성화.
6. **안전정보 unavailable 상태 (`4fe39e5`)** — 백엔드 날씨/침수 로직은 이미 정상이었지만(체크포인트 이전부터), 프론트가 그 상태를 UI에 반영하지 않았다. Layer 2가 loading/ready/unavailable 3분리 + stale 배지 + 침수제보 GPS를 명시적 버튼 뒤로 이동.
7. **admin 브루트포스 + migration lint (`796de18`)** — ADM-6/DB-6은 Batch 문서에서 "코드상 비차단 후속"으로 유예됐던 항목인데 Layer 2가 마저 처리.
8. **번역실패 프론트 노출 (`dbd0935`)** — BIZ-9은 백엔드가 이미 `translation_failed` 신호를 내고 있었지만 프론트가 소비 안 하던 것을 Layer 2가 배지로 연결.

**Layer 2가 Layer 1을 REDO/대체한 지점은 확인되지 않음** — 전부 Batch 문서가 스스로 "중위험 후속" 또는 "잔여"로 명시했던 항목의 완성이며 충돌/재작업은 없었다.

---

## 4. 아직 OPEN/DEFERRED — 출시 전 남은 것

**코드 레벨 미해결(단, 접근 차단으로 무력화된 것 포함)**:
- **EG-2~5 (가챠 SQL 함수 버그)** — `016_shop_gacha_functions.py`/`015_reward_dispatcher_functions.py`는 감사 이후 단 한 번도 수정되지 않았다. 현재는 라우터 자체가 프론트/BFF 양쪽에서 막혀 있어 사용자가 도달할 수 없지만, **가챠를 재오픈하려면 이 4건을 먼저 실제로 고쳐야 한다.** 재오픈 체크리스트 항목으로 명시 필요.
- **침수 predictor 부분실패 잔여** (`backend/app/jobs/predict_flood_risk.py:29-46,92`) — 전체 API 키 미설정 케이스는 가드됐지만, 개별 district provider 요청이 실패하면 그 구는 강수확률 0.0으로 계산되고 `DELETE FROM flood_risk_daily`가 무조건 실행돼 기존 스냅샷이 보존되지 않는다. 부분 실패에서도 "안전 0건"으로 보일 수 있는 P0-7의 핵심 위협이 좁은 범위로 남아있음.
- **홈 화면 위젯 에러=빈상태 혼동** (`WorldMapV2.tsx:190-238`) — `nearbyProducts`/`recentProducts`/`ads`/`communityPosts`는 여전히 실패를 빈 배열로 표시. 안전정보(날씨/침수)만큼 심각하지 않지만 P1-3/P1-10(API 공통계층) 취지에는 미달.
- **FD-6 delivery-side 잔여**(감사 스스로 accepted residual로 명시) — outbox row 발행 후 provider 호출 전 worker crash 시 인앱 알림은 남고 push만 유실되는 좁은 창. `_try_push` 재시도+DLQ가 provider측 실패는 이미 커버하므로 실사용 리스크는 낮음.

**외부 게이트(코드 검토로는 확인 불가, 처음부터 이 문서 밖 범위로 명시됨)**:
- Android/iOS 실기기: 권한 프롬프트, 백그라운드 GPS, FCM, OAuth 딥링크 왕복.
- 실제 Google Routes/날씨/스토어 키 + 운영 도메인·TLS에서 외부 실패주입, worker kill/retry 검증.
- Docker/compose fresh-volume bootstrap, 브라우저 E2E (`docker` 미설치 PC 제약 — 이번 검증 PC도 동일 제약 있음, 실행하지 않음).
- 가입 전 약관 동의 버전, 개인정보 내보내기/탈퇴 보존범위 — 제품·법무 결정 대기.

**범위 밖(원 감사의 P1/P2 UX 백로그, 이번 Batch A~F/Layer2 어느 쪽도 다루지 않음 — 새로 발견된 게 아니라 원래부터 후순위)**: DM latest-N 커서/읽음처리, 매물 수정·삭제 API 부재, 사업자 재심사 워크플로우, IAP/광고 wrapper 미완성, 랭킹/미션 라우트 부재, i18n·접근성(lang 동기화, OTP semantics 등). 게이미피케이션이 전체 게이트 OFF이므로 CUR-1~4/6-12, EG-1/7-11 등 시즌·상점 종속 finding도 함께 도달불가 상태로 동결.

**출시 판단**: 감사 SoT(`260722_service_user_full_launch_audit_task.md`)의 자체 판정과 이번 검증이 일치 — **코드상 P0/High 피해경로는 닫혔으나(가챠 제외 전부 RESOLVED, 가챠는 게이트로 무력화), 위 외부 게이트가 끝나기 전까지 HOLD.**

---

## 5. 마이그레이션 인벤토리 (체크포인트 `8790ac2` → HEAD `a40b126`)

### `database/init/` 신규 (8개, 모두 prefix 신규·충돌 없음)

| 파일 | 목적 |
|---|---|
| `139_marketplace_reviews_rating_int.sql` | `marketplace_reviews.rating` VARCHAR(GOOD/BAD) → SMALLINT CHECK(1..5) |
| `140_marketplace_trade_integrity.sql` | `agreed_price_vnd` 스냅샷, nonneg CHECK 3종, appointment status CHECK, 매물당 활성약속 부분유니크, ride_sessions unique |
| `141_app_versions_active_unique.sql` | 앱버전 활성행 제약(BIZ-11 계열) |
| `142_notifications_support_type.sql` | 알림 SUPPORT 타입 추가 |
| `143_marketplace_biz_poi_geom.sql` | GEOGRAPHY+GIST 인덱스(DB-7) |
| `144_reports_feed.sql` | 피드 신고 테이블/제약(FD-4) |
| `145_notifications_event_idempotency.sql` | `(source_event_id,user_id)` 부분유니크(재전달 dedup) |
| `146_notification_outbox.sql` | `notification_outbox` 테이블(FD-6) |

### `database/init/` 기존 파일 수정 (M, 20개) — dev-seed 가드 삽입 위주
`001,084,088,090,095,096,098,105,106,107,110,113,114,117,118,123,124` — 대부분 `app.seed_profile` dev 전용 가드 삽입(`095/096/098/106/107/114/117/118/123`) + 088/090/105/110은 rating/CHECK/appointment 정합용 보완.

### Engine `alembic/versions/` 신규 (3개)

| 리비전 | 목적 |
|---|---|
| `060_mileage_policy_reactivate.py` | MILEAGE_XP `is_active=true` 재활성(ENG-2) |
| `061_gc_transaction_ledger.py` | `gc_transaction` 원장 테이블 신설(ENG-10) |
| `062_disable_internal_coupon_catalog.py` | INTERNAL 파트너 reward_catalog 비활성(P0-6) |

### 중복 prefix 충돌

**새로운 충돌 없음.** 기존 중복(`002`×2, `042`×2, `092`×2, `093`×2, `138`×2 — 총 5쌍/10파일)은 `tools/check_migration_prefixes.py`의 `BASELINE_DUP_FILES`에 grandfather돼 있고, 이 감사 기간에 추가된 139~146은 전부 고유 prefix라 lint 통과.

### 적용 방식

- `database/init/*.sql`: fresh volume(`docker compose down -v && up`)에서 사전순 자동 적용. **기존 dev DB(볼륨 유지)에는 자동 적용 안 됨** — 특히 `140`(trade integrity), `145`/`146`(알림), `139`(rating 타입변경)는 기존 볼륨에 이미 위반 데이터가 있으면 CHECK/UNIQUE 추가가 실패할 수 있어 수동 backfill/정리 후 적용 필요.
- Engine alembic(`060~062`): `alembic upgrade head`로 기존 DB에도 순차 자동 적용(다운타임 없는 온라인 마이그레이션 전제, `062`는 `downgrade()`가 no-op이라 롤백 시 수동 재활성 필요).
- `notification_outbox`/`notifications_event_idempotency`는 `bff_migrate`가 fresh/기존 DB 양쪽에 idempotent DDL을 먼저 적용하고 readiness가 누락 스키마를 차단하도록 배선됨(코드 확인, `docker-compose.yml` 변경분 참조) — 별도 수동 조치 불필요.

---

## 6. ADR 반영용 요약 (5-8줄)

- 세션 인증을 UUID-only 신뢰에서 `X-Session-Token` 서버검증(pbkdf2+만료)으로 전환, 전 mutation 라우터에 owner/participant 가드 일괄 적용(`deps.py`, Batch B `2961114`).
- OAuth 로그인 흐름 변경: 콜백 URL이 장기 세션토큰 대신 2분 TTL 1회용 code를 전달하고 신규 `POST /auth/oauth/exchange`가 세션을 발급(`oauth_flow.py`, `68b3ccf`) — state도 Redis 공유스토어로 이동(멀티워커 대응).
- 거래(marketplace) 상태머신: 매물당 활성 약속 1건 제약 + 완료시점 합의가격 스냅샷 + SOLD는 오직 appointment-complete 경로로만 전이(`market.py`, migration `140`).
- 경제 원장: RP/GC 증감마다 `gc_transaction` 원장 row 기록(alembic `061`), 일일 캡은 boolean 게이트가 아닌 `min(raw, headroom)` 클램프로 전환.
- 게이미피케이션(가챠/상점/인벤토리/시즌/쿠폰/차고) 전체 게이트 OFF — 프론트 라우트/BFF 라우터 주석처리 또는 삭제. **가챠 SQL 함수의 EG-2~5는 미수정 상태로 남아있어, 재오픈 전 반드시 선행 수정 필요.**
- 안전정보(날씨/침수) 응답에 loading/ready/unavailable/stale 상태 분리 도입, 침수 predictor는 전체 provider 장애는 가드됐으나 부분(district별) 장애 시 기존 스냅샷 보존 로직은 미구현(잔여).
- 알림 파이프라인에 transactional outbox(`notification_outbox`) 도입 — 도메인 트랜잭션과 Redis publish를 원자적으로 묶고, dedup 키를 Redis msg_id에서 불변 outbox event_id로 승격.
- 신규 라우트: `/auth/oauth/exchange`(세션 교환), 피드 신고 라우트(POST 신고/댓글신고), `POST /support/tickets/{id}/replies`(유저 재질문) — 신규 domain rule: 거래 상태 전이는 role(seller/buyer) 명시적 검증 + 행 잠금 기반.
