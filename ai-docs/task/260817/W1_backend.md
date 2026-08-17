# 키워드 알림 (마켓 saved-search) — 백엔드·데이터·발송 파이프라인 전수 감사

- 감사 범위: `database/init/091,111,112,131,145,146`, `backend/app/routers/market.py`, `backend/app/routers/notifications.py`, `backend/app/schemas.py`, `backend/app/models.py`, `backend/app/noti_worker/__main__.py`, `backend/app/services/noti_events.py`, `backend/app/tests/`
- 방식: 읽기 전용. 코드 미수정. 추측 표기 없음 — 모든 판정에 파일:라인 근거.

## ① 6축 판정표

| 축 | 판정 | 근거 (파일:라인) |
|---|---|---|
| (a) 키워드 등록/저장 | **구현됨** | `backend/app/routers/market.py:1154-1181` `POST /keyword-alerts` |
| (b) 조회/수정/삭제 | **부분구현** (수정 API 없음, 조회·삭제만) | `market.py:1132-1151`(GET), `market.py:1184-1197`(DELETE). PUT/PATCH 없음 — "수정"은 삭제 후 재등록으로만 가능 |
| (c) 신규 매물과의 매칭 로직 | **구현됨** (단, SQL 매칭 아님 — Python substring) | `noti_worker/__main__.py:178-230` `_handle_listing_created` |
| (d) 푸시/인앱 알림 실제 발송 | **구현됨** | enqueue: `market.py:675-679` → outbox relay: `noti_worker/__main__.py:573-623` → consume: `noti_worker/__main__.py:450-461,493-518` → push: `noti_worker/__main__.py:76-106` |
| (e) 알림 설정 토글 연동 | **구현됨** | `notifications.py:135`(저장), `noti_worker/__main__.py:223-226`(게이트) |
| (f) 테스트 커버리지 | **부분구현** (worker 로직만, API 엔드포인트 0건) | `backend/app/tests/test_noti_worker_idempotency.py:281-310` |

## ② 각 축 상세

### (a) 등록/저장
- `POST /market/keyword-alerts` (`market.py:1154`) — body: `MarketplaceKeywordAlertCreateRequest{user_id, keyword}` (`schemas.py:315-317`).
- 검증: `body.keyword.strip()` 빈 문자열 거부(400) `market.py:1161-1162`. 본인 계정만 허용 `body.user_id != session_uid` → 403 `market.py:1163-1164`.
- 중복 방지: 앱 레벨 `func.lower(keyword) == keyword.lower()` 사전조회 후 이미 있으면 기존 row 반환(idempotent upsert처럼 동작) `market.py:1166-1175`. DB 레벨도 `uq_mp_kw_alert UNIQUE(user_id, lower(keyword))` 로 이중 방어 (`091_marketplace_keyword_alerts.sql:14`).
- **확인 불가/미구현 사항**:
  - **키워드 개수 상한 없음** — `add_keyword_alert` 어디에도 사용자당 카운트 체크 없음 (market.py:1154-1181 전체 검토). CHECK 제약도 스키마에 없음 (`091_...sql` 전체 8줄, CHECK 없음).
  - **최소 길이 검증 없음** — `strip()` 후 빈 문자열만 막고 1글자 키워드도 통과.
  - **정규화 없음** — 대소문자만 `.lower()`. 베트남어 성조(디아크리틱) 정규화(NFC/NFD, 성조 제거 등) 로직 전무. `d3.strip()` 외 unicode normalize 호출 없음.
  - **금칙어(banned_keywords) 연동 없음** — `grep`로 전수 확인한 결과 `BannedKeyword`/`banned_keywords` 참조 파일은 `models.py`, `routers/dm.py`(채팅 필터), `routers/admin_api/cms.py`(관리 CRUD) 3곳뿐. `market.py` 어디에도 import/참조 없음 → 사용자가 금칙어를 키워드 알림으로 등록해도 막히지 않음.

### (b) 조회/수정/삭제
- `GET /market/keyword-alerts?user_id=` (`market.py:1132-1151`) — 본인 확인(403) 후 `created_at DESC` 목록. 페이지네이션 없음(대량 시 이슈는 ④ 참조, 다만 개수 상한이 없어 이론상 무한 증가 가능).
- `DELETE /market/keyword-alerts/{alert_id}` (`market.py:1184-1197`) — body `MarketplaceKeywordAlertDeleteRequest{user_id}`. 소유권 이중 체크: `alert.user_id != session_uid or alert.user_id != body.user_id` (`market.py:1194`). IDOR 아님(타인 alert_id 넣어도 소유권 불일치로 403).
- **수정(PUT/PATCH) 엔드포인트 없음** — 키워드 문구 변경은 삭제+재등록으로만 가능. 스펙에 "수정"이 요구사항이라면 갭.

### (c) 매칭 로직
- 트리거: `market.py:673-679` 매물 등록(`create_listing`) 트랜잭션 내에서 `noti_events.enqueue(db, "market.listing_created", {...})` — **같은 DB 트랜잭션**에 적재(FD-6 outbox, `146_notification_outbox.sql`). 커밋 후 유실 없음.
- 발행: `noti_worker/__main__.py:573-623` `_drain_outbox_once`/`_outbox_relay_loop` 가 `notification_outbox.published_at IS NULL` 행을 폴링(1초 간격, `OUTBOX_IDLE_SLEEP_S=1`, `:56`)해 Redis stream(`noti:events`)으로 XADD.
- 소비: `_process_batch`(`:479-524`)가 `HANDLERS["market.listing_created"] = _handle_listing_created`(`:452`)로 디스패치.
- 매칭 쿼리 자체는 **SQL이 키워드로 필터링하지 않는다**:
  ```
  select(MarketplaceKeywordAlert).where(
      MarketplaceKeywordAlert.user_id.notin_(blocked_by_seller),
      MarketplaceKeywordAlert.user_id.notin_(blocking_seller),
  )
  ```
  (`noti_worker/__main__.py:192-199`) — **차단 관계만 SQL로 거르고, 시스템 전체의 키워드 알림 row 전부를 가져온 뒤** Python 루프에서 `alert.keyword.lower() not in title_lower`(`:208`)로 substring 매칭. `idx_mp_kw_alert_kw` (091:15, `lower(keyword)` 인덱스)는 이 쿼리에서 전혀 사용되지 않음 — WHERE 절에 keyword 조건이 없기 때문.
- 등록자 본인 제외(`:206`), 판매자와 상호 차단 관계 유저 제외(FD-9, `:189-197`).
- 알림 타입: `KEYWORD` (enum, `112_notifications_keyword_link.sql:3`), 딥링크 `market&id=<listing_id>` (`:185`).
- 매칭 방식은 **대소문자 무시 substring(Python `in`)** — SQL ILIKE/trigram/full-text 아님. 베트남어 성조 무관 매칭은 안 됨(정규화 안 하므로).

### (d) 발송
- 인앱 저장: `_insert_notification`(`:112-147`) — `ON CONFLICT (source_event_id, user_id) DO NOTHING` (부분 유니크 인덱스, `145_notifications_event_idempotency.sql:6-8`)로 Redis 재전달 시 중복 삽입 방지. **행은 게이트와 무관하게 항상 시도**(:212-220, `_push_enabled` 체크 이전에 insert 먼저 수행).
- 푸시 게이트: `elif await _push_enabled(db, alert.user_id, "keyword_alert")`(:223) — insert가 신규(`inserted=True`)일 때만 push 후보에 넣음. 재전달로 인한 중복 삽입 스킵 시 push도 스킵(:221-222) → 멱등성 보장.
- 실제 발송: 커밋 후 루프 밖에서 `_try_push`(:229-230) 호출 — `engine_client.notify_user_push` 경유(BFF→Engine, CLAUDE.md의 "BFF는 Engine DB 직접접근 금지" 준수, HTTP API만 사용).
- 실패 처리: `_try_push`(:76-106) — 503(재시도가능 오류)만 지수 백오프(최대 8초)로 최대 `MAX_DELIVERIES=5`(:52)회 재시도, 그 외 4xx/5xx나 기타 예외는 즉시 포기(로그만). 5회 소진 시 별도 DLQ 스트림(`noti:events:dlq`)에 XADD(:95-106) — 재처리 경로는 코드상 확인 안 됨(별도 DLQ 소비자 유무는 이 파일 범위 밖).
- 메시지 처리 자체 실패(핸들러 예외) 시: Redis PEL 재할당(`_claim_pending`, 코드에 언급됨 `:507-518`)으로 재시도, `MAX_DELIVERIES` 초과 시 DLQ 이동.

### (e) 설정 토글 연동
- `notification_settings.keyword_alert BOOLEAN DEFAULT true` (`111_notification_settings_keyword_alert.sql`), 모델 `models.py:1174`.
- 저장: `PUT /notifications/settings` → `settings.keyword_alert = body.keyword_alert`(`notifications.py:135`).
- 발송 게이트 사용: `noti_worker/__main__.py:223` — **불변식 준수 확인**: 인앱 `notifications` row는 토글 값과 무관하게 항상 insert(:212-220), 토글은 오직 push 여부만 결정(:223-226). 이 프로젝트 불변식("인앱은 항상 기록, 토글은 푸시만 게이트")과 코드가 정확히 일치. 설정 row가 없는 유저는 `_push_enabled`가 `row is None → True`(default 허용) 반환(:70-73) — 안전한 기본값.

### (f) 테스트
- `backend/app/tests/test_noti_worker_idempotency.py:281-310` `test_listing_event_can_insert_once_for_each_recipient` — `_handle_listing_created`의 **재전달 시 중복 삽입/중복 푸시 방지**만 검증. DB 쿼리와 substring 매칭 자체는 `SimpleNamespace`로 목킹되어 있어 **실제 대소문자·부분일치 로직은 테스트되지 않음**(예: "Full-face helmet" 제목에 keyword="helmet" 하드코딩, 매칭 조건문은 실행되지 않고 alerts 리스트가 이미 매칭된 것으로 가정됨 — `:284`에서 `SimpleNamespace(keyword="helmet")`을 직접 만들어 넣었을 뿐 `_handle_listing_created` 내부의 `if alert.keyword.lower() not in title_lower` 분기의 참/거짓 양쪽 다 별도로 검증 안 함, 실제로는 payload title="Full-face helmet"과 keyword="helmet"이 대소문자 무시 substring 매치되므로 우연히 통과).
- **API 엔드포인트 테스트 0건** — `grep -rln "keyword-alerts|keyword_alerts|MarketplaceKeywordAlert" backend/app/tests/` 결과 공백. `POST/GET/DELETE /market/keyword-alerts`에 대한 통합 테스트가 전무.
- 커버 안 된 것: 중복 등록 시 기존 row 반환, 타인 소유 삭제 시도 403, 키워드 상한/최소길이(애초 로직도 없음), 대소문자 무시 매칭의 양성/음성 케이스, `keyword_alert=false`일 때 실제 push 스킵(다른 필드("event")로만 유사 패턴 테스트됨, keyword_alert 자체는 없음), 판매자 본인 제외, 차단 유저 제외.

## ③ 치명적 갭 목록 (심각도순)

1. **[High] 매칭 쿼리가 전체 keyword_alerts 테이블을 매물 등록마다 풀스캔** — `noti_worker/__main__.py:192-199`의 SQL에 keyword 조건이 없어 시스템 전체 구독 row(차단 유저 제외)를 매번 로드 후 Python에서 substring 비교. `idx_mp_kw_alert_kw`(091:15) 인덱스가 이 경로에서 사장(死藏)됨. 매물 등록 빈도 × 전체 구독 행 수에 비례해 costs 증가 — ④ 참조.
2. **[Med] 키워드 개수 상한 없음** — `market.py:1154-1181`, `091_..sql` 어디에도 사용자당 cap이나 CHECK 제약 없음. 한 유저가 수백~수천 개를 등록하면 위 1번 풀스캔 문제와 결합해 성능이 더 악화되고, 매물 등록 1건당 Python 루프 반복 횟수도 그만큼 늘어남(현재는 "구독 행 수"가 곧 "루프 반복수"라 유저별 상한이 없으면 상한이 사실상 무한대).
3. **[Med] 금칙어(banned_keywords) 연동 완전 부재** — `market.py`가 `BannedKeyword`/`banned_keywords`를 전혀 참조하지 않음. 정책·감사 요구사항이 있다면(스팸/부적절어 키워드 알림 등록 차단) 미구현.
4. **[Low] 베트남어 성조 등 유니코드 정규화 없음** — `.lower()` 외 정규화 호출 없음. NFC/NFD 혼용 입력이나 성조 유무 차이로 사용자가 기대하는 매칭이 실패할 수 있음(코드로 실증은 안 됨, 로직 부재 확인만).
5. **[Low] 키워드 수정(PATCH/PUT) 엔드포인트 없음** — 요구사항이 "조회/수정/삭제"라면 수정 경로 부재.
6. **[Low] 테스트 커버리지 얕음** — API 레이어 0건, 매칭 로직의 실제 substring 분기 미검증(③-f 상세 참조).

## ④ 다수 키워드/다수 구독 시 성능 판정

- **매물 등록 1건당 비용**: `_handle_listing_created`가 실행하는 SQL은 `SELECT * FROM marketplace_keyword_alerts WHERE user_id NOT IN (...) AND user_id NOT IN (...)` (`noti_worker/__main__.py:192-199`) — WHERE 절에 keyword 필터가 없으므로 **테이블의 (차단관계 제외) 전체 행을 로드**. 이후 Python 루프에서 각 행마다 `str.lower()` + `in` 연산(`:208`) — **O(전체 구독 행 수 N)**, 인덱스 무관.
- 전체 구독 행 수가 증가(유저 수 × 유저당 키워드 수, 상한 없음)할수록 매물 등록 1건의 처리 시간이 선형으로 늘어남. 매물 등록 자체가 outbox를 통해 비동기 워커에서 처리되므로 매물 등록 API 응답 자체는 지연되지 않지만(enqueue만 하고 즉시 커밋, `market.py:675-685`), noti_worker의 처리량(throughput)은 이 풀스캔 비용에 종속됨 — 매물 등록이 몰리는 시간대에 워커가 밀리면 알림 지연이 누적될 수 있음(재시도/DLQ 로직은 있으나 이 풀스캔 자체를 완화하지 않음).
- **N+1은 아님** — 매물 1건당 쿼리는 1회(전체 alerts 조회), 유저별 개별 쿼리를 안 날림. 다만 "풀스캔형 O(N)"이 N+1보다 나을 수도 나쁠 수도 있음 — 구독자 규모가 커지면(수만 건) 이 쿼리 자체가 무거워짐.
- **개선 여지(제안, 미구현이라 코드 변경은 안 함)**: SQL에 `MarketplaceKeywordAlert.keyword` 를 `ILIKE ANY(...)` 나 title 토큰 기반 매칭으로 축소하거나, `idx_mp_kw_alert_kw`를 실제로 활용하는 방향(예: 키워드가 제목의 부분집합이 되는 역방향 매칭은 인덱스로 표현이 어려워 trigram/GIN 인덱스 검토 필요) — 이는 구현 아이디어일 뿐 감사 범위(읽기 전용) 밖.

## ⑤ 테스트 절차 제안

### 수동 재현 (컨테이너 환경)
1. 서비스 기동 확인: `docker compose --env-file .env ps` (bff, noti_worker, redis, postgres 기동 확인).
2. 키워드 알림 등록 (세션 쿠키 필요 — 로그인 후 `session_uid`):
   ```bash
   curl -sS -X POST http://localhost:18090/api/bff/market/keyword-alerts \
     -H "Content-Type: application/json" -b cookies.txt \
     -d '{"user_id":"<본인 UUID>","keyword":"helmet"}'
   ```
3. 다른 유저로 매물 등록(제목에 "helmet" 포함):
   ```bash
   curl -sS -X POST http://localhost:18090/api/bff/market/listings \
     -H "Content-Type: application/json" -b cookies_seller.txt \
     -d '{"seller_id":"<판매자 UUID>","title":"Full-face helmet for sale", ...}'
   ```
4. noti_worker 로그 확인: `docker compose logs -f noti_worker` 에서 `push sent user=<수신자>` 또는 `push skipped (keyword_alert=off)` 라인 확인 (지연 최대 `OUTBOX_IDLE_SLEEP_S=1`초 + 워커 폴링 주기).
5. DB에서 인앱 알림 row 직접 확인:
   ```sql
   SELECT * FROM notifications WHERE type='KEYWORD' ORDER BY created_at DESC LIMIT 5;
   ```
6. 토글 끈 뒤(재현): `PUT /notifications/settings {"user_id":..., "keyword_alert": false, ...}` 후 3~5 반복 — `notifications` row는 여전히 생기고 push만 스킵되는지 로그로 확인(`push skipped (keyword_alert=off)`, `noti_worker/__main__.py:226`).

### 자동 테스트 추가 지점
- **API 레벨** (`backend/app/tests/` 신규 `test_market_keyword_alerts.py`, 기존 `test_market_completion_request.py` 류의 httpx AsyncClient 패턴 참고):
  - `POST /market/keyword-alerts` 정상 등록 → 201 + row 존재.
  - 동일 키워드(대소문자 다르게) 재등록 → 기존 row 재사용(신규 insert 안 됨, count 불변) 검증.
  - 빈 문자열 keyword → 400.
  - 타인 user_id로 등록 시도 → 403.
  - `GET /market/keyword-alerts` 목록 정렬(최신순) 검증.
  - `DELETE /market/keyword-alerts/{id}` 타인 소유 삭제 시도 → 403, 본인 삭제 → 204 + row 삭제 확인.
- **매칭 로직 유닛 테스트** (`test_noti_worker_idempotency.py`에 케이스 추가 또는 신규 파일):
  - `_handle_listing_created` 실제 title/keyword 조합으로 대소문자 무시 매치(양성)와 미스매치(음성) 양쪽을 별도 케이스로 — 현재는 우연히 매치되는 값만 사용되고 있어 분기 커버리지가 없음.
  - `keyword_alert=false`인 유저 대상 push 스킵 케이스(기존 `test_proximity_hit_push_skipped_when_event_notifications_disabled` 패턴 미러).
  - 판매자 본인 키워드 알림 제외, 차단 관계 유저 제외 케이스.
- **컨테이너 내 실행**:
  ```bash
  docker compose --env-file .env exec bff pytest app/tests/test_noti_worker_idempotency.py app/tests/test_market_keyword_alerts.py -v
  ```

## ⑦ 관리자 설정 가능한 런타임 config 존재 여부 (대표 결정 — 키워드 상한값은 관리자 화면에서 조정 가능해야 함)

### 1) 범용 런타임 설정 저장소는 이미 있다 — `app_config` KV 테이블
- 스키마: `database/init/005_app_config.sql:6-14` — `app_config(key VARCHAR(200), value TEXT, group_name VARCHAR(100) DEFAULT 'default', description TEXT, created_at, updated_at, PRIMARY KEY(group_name, key))`. `idx_app_config_group` 인덱스 있음(:22).
- 모델: `backend/app/models.py:1340` `class AppConfig`.
- 이미 이 패턴으로 관리 중인 예: `dm.unread_poll_interval`(DM 폴링 주기, 10~300초), `oauth.*`(구글/자로 클라이언트 설정), `google.map`(레거시). `banned_keywords`는 **KV 패턴이 아니라 별도 테이블**(`131_banned_keywords.sql`, 목록형 데이터라 KV로 안 함) — 상한값처럼 **단일 스칼라 값**을 저장하는 용도로는 `banned_keywords`보다 `app_config`가 정확한 선례.

### 2) 어드민 API·읽기 경로 — 파일:라인, 그대로 재사용 가능 판정: **가능**
- **어드민 조회/저장 엔드포인트 선례**: `GET/PUT /admin/api/settings/service-config` (`backend/app/routers/admin_api/settings.py:362-412`).
  - `GET`(:362-370): `AppConfig` 에서 `group_name="dm", key="unread_poll_interval"` 조회, 없으면 기본값(`"30"`) 반환.
  - `PUT`(:373-412): 값 검증(`10 <= dm_val <= 300` 정수 범위, 위반 시 400 `:380-385`) → row 있으면 update, 없으면 insert(:387-400) → 감사로그 `audit(...)` 기록(:402-410) → commit.
  - 게이트: `verify_root_api`(root/admin, manager 차단, `:364,377`) — "전역 서비스 동작 변경"이므로 매니저 배제.
  - **캐시 없음** — 매 요청마다 DB 직접 조회(:367-369). 별도 인메모리/Redis 캐시 레이어 없음.
- **앱(프론트) 읽기 경로**: `GET /app-config` (공개, 인증 불요) — `backend/app/routers/app_version.py:18-30`. 전체 `app_config` 행을 읽어(:21) `group.key` 형태로 dict화(:22) 후 화이트리스트된 키만 골라 평면 JSON으로 응답(:23-30, 현재 `dm_poll_interval`, `google_client_id`, `is_dev`, `otp_dev_bypass` 4개만 노출). 캐시 없음, 매 호출 DB 재조회.
- **admin-frontend 화면 존재**: `admin-frontend/src/pages/system/SettingsPage.tsx:294-349` `ServiceConfigTab` — `useServiceConfig`/`useUpdateServiceConfig`(`admin-frontend/src/api/settings.ts:120-136`)로 GET/PUT 호출, "서비스 설정" 탭(`:349`)에 입력폼 존재.
- **판정**: 이 3계층(테이블 `app_config` → 어드민 API `service-config` → admin-frontend `ServiceConfigTab`)은 **그대로 재사용 가능**하다. 신규로 필요한 것은 (i) `service-config` 라우터에 `keyword_alert_max_count` 필드 추가(같은 GET/PUT 함수 확장, 새 엔드포인트 불필요), (ii) `app-config` 화이트리스트(`app_version.py:24-29`)에 항목 추가, (iii) `ServiceConfigTab`에 입력 필드 1개 추가. 범용 프레임워크 신설은 불필요 — 이미 있음.

### 3) 신설 필요 여부: **불필요** (기존 `app_config`/`service-config` 확장으로 충분)
- 참고로 최소 변경 스케치만 남긴다(코드 미변경, 감사 범위 밖 — 구현은 별도 작업):
  - `admin_api/settings.py`의 `ServiceConfigRow`/`ServiceConfigRequest`(:352-359 부근)에 `keyword_alert_max_count: str` 필드 추가, `get_service_config`/`update_service_config`에 `group_name="market", key="keyword_alert_max_count"` 조회/검증(양의 정수, 예: 1~100) 로직을 `dm_poll_interval`과 같은 방식으로 병렬 추가.
  - `app_version.py:24` 부근에 `"keyword_alert_max_count": int(cfg.get("market.keyword_alert_max_count", "20"))` 한 줄 추가.
  - 새 테이블·새 라우터·새 프레임워크는 과설계 — 값 하나 저장하는 데 불필요.

### 4) 상한 강제 지점 — 현재 없음, race 가능성 지목
- 현재: `market.py:1154-1181` `add_keyword_alert`에 **개수 카운트 검증 자체가 없음**(사전 확인한 대로 — ③번 갭과 동일 지점). 서버 권위로 강제하려면 `existing` 중복 체크(:1166-1175) 직후, insert 전에 다음이 필요:
  ```python
  count = (await db.execute(select(func.count()).select_from(MarketplaceKeywordAlert).where(MarketplaceKeywordAlert.user_id == body.user_id))).scalar_one()
  if count >= max_count:  # app_config 에서 읽은 값
      raise HTTPException(422, ...)
  ```
  (위치: `market.py:1177` `alert = MarketplaceKeywordAlert(...)` 라인 직전 — 실제 코드 변경은 이 감사 범위 밖이라 수행하지 않음, 지점만 지목.)
- **Race 가능성**: 위 카운트 체크는 `market.py`의 다른 상한 로직(`business_profile` 매물 5건 상한, `:610-629`)과 달리 **행 잠금(`FOR UPDATE`)이 없으면 동시 요청에 취약**하다. 참고로 `business_profile` 상한은 `SELECT ... FOR UPDATE`로 프로필 행을 잠가 동시 카운트 경합을 막는다(`market.py:615`). 키워드 알림은 유저가 락을 걸 상위 행이 마땅치 않음(유저 본인 행에 잠글 대상이 없음 — `users` 행을 잠그는 것은 과도). **현재 UNIQUE 제약(`uq_mp_kw_alert`)은 "동일 키워드 중복"만 막지 "총 개수 상한"은 보호하지 않는다** — 두 요청이 동시에 서로 다른 신규 키워드로 도착하면 카운트 체크를 동시에 통과해 상한을 1~수개 초과할 수 있다(soft cap). 엄격한 강제가 필요하면 `SELECT ... FOR UPDATE`로 유저 소유 최신 키워드 행(또는 `users` 행)을 잠그거나, DB 트리거/CHECK로는 표현 불가(상한이 관리자 조정 가능한 동적 값이라 CHECK 상수화 불가)하므로 애플리케이션 레벨에서 advisory lock(`pg_advisory_xact_lock(hashtext(user_id))`) 같은 명시적 직렬화가 필요 — 미구현.

### 5) 프론트가 상한값을 알 수 있는 경로
- **현재는 없음** — `GET /market/keyword-alerts` 응답이 `list[MarketplaceKeywordAlertOut]`(순수 배열, `schemas.py:308-312`, `market.py:1132` `response_model=list[...]`)이라 총 상한(N)을 얹을 자리가 없다(배열에 메타필드를 못 붙임 — 응답 형태를 객체로 바꾸는 breaking change 없이는 불가).
- **제안**: 이미 존재하고 프론트가 별도로 호출 가능한 공개 설정 엔드포인트 `GET /app-config`(`app_version.py:18-30`)에 `keyword_alert_max_count` 키를 얹는 것이 가장 적은 변경이다 — 이 엔드포인트는 인증 불요·이미 앱 부팅 시 호출되는 범용 설정 배포처이므로(`dm_poll_interval`이 이미 이 방식으로 배포됨) 키워드 등록 화면이 'n/N' 카운터를 그리려면 (i) `/app-config`에서 N을 받아오고 (ii) `GET /market/keyword-alerts`(현재 응답)의 배열 길이를 n으로 쓰면 된다 — **응답 스키마 변경 없이 조합 가능**. 대안으로 `MarketplaceKeywordAlertOut` 목록 응답 자체를 `{items: [...], max_count: N}` 객체로 바꾸는 방법도 있으나 이는 기존 배열 소비 코드(프론트) 변경을 요구하는 breaking change라 위 조합안이 더 최소 변경.

## 요약

마켓 키워드 알림은 등록→outbox(FD-6, 같은 트랜잭션)→Redis stream 릴레이→noti_worker 소비→인앱 저장(멱등, source_event_id+user_id 유니크)→푸시 게이트("인앱은 항상 기록, 토글은 푸시만 게이트" 불변식 준수)까지 파이프라인 자체는 엔드투엔드로 실제 동작하며 enqueue 누락 같은 치명적 단절은 없다(가장 우려했던 "등록만 되고 알림은 안 감" 시나리오는 해당 없음). 다만 매칭 쿼리가 키워드 조건 없이 전체 구독 행을 로드해 Python에서 substring 비교하는 구조라 `idx_mp_kw_alert_kw` 인덱스가 사장돼 있고, 구독자·키워드 수가 늘수록 매물 등록마다 비용이 선형으로 증가하는 풀스캔 구조이며, 키워드 개수 상한·최소 길이·금칙어 연동·유니코드 정규화가 전무해 스팸성/저품질 구독을 막을 장치가 없다. 테스트는 워커의 중복방지 로직만 목킹 기반으로 검증돼 있고 API 엔드포인트·실제 매칭 분기·토글별 게이트는 자동 테스트가 전혀 없다. 대표 결정(상한값 관리자 설정 가능)에 대해서는 이미 `app_config` KV 테이블 + `service-config` 어드민 GET/PUT(`dm.unread_poll_interval` 선례) + `ServiceConfigTab` admin-frontend 화면이라는 3계층 재사용 가능한 런타임 설정 인프라가 존재해 신규 프레임워크 없이 필드 추가만으로 충분하지만, 상한 강제(카운트 체크) 자체가 현재 코드에 없고 추가하더라도 동시 요청 시 락 없이는 soft cap에 그친다는 점, 프론트에 상한값을 전달할 경로도 현재는 없다는 점이 §7 갭이다.
