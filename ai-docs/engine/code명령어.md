# SRE (Saigon Rider Reward Engine) 코드 작성 지시서

> **이 문서의 사용법**: 코딩 AI(Claude Code / Cursor / 기타 LLM 에이전트)에게 SRE 백엔드 개발을 단계별로 위임하기 위한 마스터 지시서입니다. 각 Stage 섹션을 그대로 복사해서 전달하거나, 전체 문서를 첨부 파일로 함께 제공해도 됩니다.
>
> 작업 순서: Stage 0 → 1 → 2 → ... 순서대로 진행하며, 각 단계가 검증을 통과한 후 다음 단계로 넘어갑니다.

---

## 0. 프로젝트 컨텍스트

### 0.1 무엇을 만드는가

**Saigon Rider Reward Engine (SRE)** — 베트남 호치민 라이더 앱의 미션·포인트·보상을 처리하는 백엔드 서비스. 모바일 앱과 분리된 채널-중립(channel-neutral) 엔진으로, "어떤 사용자가 어떤 행동을 했다"는 이벤트만 받아 RP(Reward Point)를 계산·적립·교환합니다.

8개 모듈로 구성: Event Bus, Mission, Point (Ledger), Reward, Anti-Abuse, Tier & Streak, Diversity Calculator, Audit Log.

### 0.2 입력 산출물 (총 7개)

코딩 작업 시작 전에 모든 문서를 읽고 이해해야 합니다.

| 파일 | 역할 | 우선순위 |
|---|---|---|
| `sre-design-spec.md` | 전체 설계서. 모듈 책임, API 시그니처, 핵심 룰 | ★★★ |
| `sre-schema.postgres.sql` | PostgreSQL DDL. 테이블·인덱스·트리거·ENUM | ★★★ |
| `sre-erd-mermaid.postgres.md` | ERD. 테이블 관계 시각 참조 | ★★ |
| `sre-mission-rule-mapping.md` | `target_rule` JSONB 스키마 정의서. 미션 평가 엔진의 진실 | ★★★ |
| `sre-mission-seed.sql` | 240개 미션 시드 INSERT | ★★★ |
| `sre-mission-mapping-full.csv` | 240개 미션의 원본 condition ↔ target_rule 매핑 (검증용) | ★ |
| `sre-api.openapi.yml` | OpenAPI 3.1 명세. 38개 엔드포인트 | ★★★ |

### 0.3 결정되지 않은 영역 (미리 알림)

다음 두 가지는 **합의되지 않은 상태**이며 Stage별로 다음과 같이 처리합니다:

1. **외부 파트너 API (Got It / Urbox / Viettel)** — Stage 5에서 인터페이스(`RewardProviderClient`)만 정의하고 **Stub 구현**으로 두기. 실 구현은 별도 PR로.
2. **메시지 큐 / 비동기 워커** — v1은 동기 처리로 시작. 큐 도입은 Stage 8 이후 별도 PR로.

### 0.4 공통 작업 원칙

이 원칙을 모든 Stage에서 지켜야 합니다.

- **DDL을 진실로 본다**: 컬럼명·타입·제약은 `sre-schema.postgres.sql`을 따른다. 다르게 짜고 싶으면 사용자에게 먼저 확인.
- **OpenAPI를 진실로 본다**: 엔드포인트 경로·메서드·요청/응답 스키마는 `sre-api.openapi.yml`을 따른다. 변경이 필요하면 사용자에게 먼저 확인.
- **이중 원장 무결성 절대 보존**: `rp_balance`는 캐시일 뿐이고 진실은 `rp_transaction`. 모든 잔액 변경은 트랜잭션 INSERT로 기록.
- **Idempotency-Key 필수**: 변동성 호출(POST/PUT)은 모두 멱등성 키를 받고 `idempotency_key` 테이블로 중복 차단.
- **모든 RP 변동·보상 교환·미션 완료는 `audit_log`에 기록**한다.
- **타임존**: 모든 timestamp는 `TIMESTAMPTZ` (UTC 저장, 표시는 Asia/Ho_Chi_Minh = UTC+7).
- **테스트 우선**: 각 Stage 완료 기준에 단위 테스트 통과를 포함. 통합 테스트는 Stage 8에서 일괄.
- **DB 변경 금지**: DDL은 입력 문서를 그대로 마이그레이션으로 사용한다. 임의로 컬럼 추가/삭제 금지.

---

## Stage 0 — 프로젝트 부트스트랩

### 목표
빌드·실행 가능한 빈 프로젝트 골격, DB 연결, CI 파이프라인 1차 구성.

### 결정해야 할 것 (사용자에게 확인 필수)

다음 5가지를 결정한 뒤 진행. 결정이 없으면 **(추천)** 표시된 옵션으로 진행하고 README에 명시.

1. **언어/프레임워크**
   - (추천) TypeScript + NestJS
   - 대안: Python + FastAPI / Java + Spring Boot / Go + Echo
2. **ORM / DB 클라이언트**
   - (추천 NestJS의 경우) Prisma 또는 TypeORM
   - (추천 FastAPI의 경우) SQLAlchemy 2.x
3. **마이그레이션 도구**
   - (추천) Flyway 또는 sqitch (ORM 마이그레이션과 분리). DDL은 입력 SQL을 그대로 V1__schema.sql로 사용.
4. **테스트 프레임워크**
   - (추천 TS) Jest + Supertest, (Python) pytest + httpx
5. **로컬 개발 환경**
   - docker-compose로 PostgreSQL 14+ 컨테이너 + 앱 컨테이너

### 구현 작업

1. 위 5개 결정에 따라 프로젝트 초기화 (`package.json` / `pyproject.toml` / `go.mod` 등)
2. 디렉토리 구조 생성:
   ```
   /src
     /modules
       /event-bus
       /mission
       /point
       /reward
       /anti-abuse
       /tier-streak
       /diversity
       /audit
     /shared
       /db
       /errors
       /idempotency
     /admin
   /migrations
     V1__schema.sql              # sre-schema.postgres.sql 그대로 복사
     V2__seed_action_def.sql     # 다음 Stage에서 작성
     V3__seed_mission.sql        # sre-mission-seed.sql 그대로 복사
   /tests
     /unit
     /integration
   /docs                         # 입력 산출물 7개 복사
   ```
3. `docker-compose.yml`: PostgreSQL 14 + 앱 + (선택) Adminer
4. 환경 변수 로딩: `.env.example` 작성 (DATABASE_URL, PORT, JWT_SECRET, ADMIN_TOKEN_SECRET, LOG_LEVEL)
5. 헬스체크 엔드포인트 2개 구현: `GET /healthz` (DB ping), `GET /version` (커밋 SHA)
6. CI: lint + 테스트만 돌아가는 최소 파이프라인 (GitHub Actions 또는 GitLab CI)
7. 표준 에러 응답 미들웨어: 모든 4xx/5xx는 `application/problem+json` (RFC 7807) 형식. `Problem` 스키마는 OpenAPI 명세 참조.

### 산출물
- 빌드 통과하는 빈 프로젝트
- `docker-compose up` → PostgreSQL 기동 → `V1__schema.sql` 마이그레이션 성공
- `curl localhost:PORT/healthz` → 200 OK

### 검증 기준
- [ ] `npm run build` / `python -m build` 통과
- [ ] `docker-compose up` 후 DDL 마이그레이션 무에러 (모든 테이블·인덱스·ENUM·트리거 생성됨)
- [ ] `/healthz` 200 응답 + DB 연결 확인
- [ ] CI 파이프라인 녹색

---

## Stage 1 — DB 시드 데이터 로딩

### 목표
`action_definition`, `tier_definition`, `abuse_rule` 시드를 작성하고, 미션 시드 SQL을 적용한다.

### 참조 문서
- `sre-design-spec.md` §6 (행동별 기본 RP, 등급, 어뷰징 가드)
- `sre-mission-rule-mapping.md` §3 (액션 코드 어휘집 26개)
- `sre-mission-seed.sql` (미션 240개)

### 구현 작업

1. **`V2__seed_action_def.sql` 작성**: `action_definition` 테이블에 26개 액션 코드 INSERT.

   설계서 §6의 12개 + `sre-mission-rule-mapping.md` §3의 추가 14개. 컬럼: `action_code`, `category_code` (RIDING/MAINT/MARKET/COMMUNITY/DELIVERY/MIXED), `display_name`, `base_rp` (RIDE_KM=1, QUEST_COMPLETE=100, MAINTENANCE_RECEIPT=200 등 설계서 §6 표 따름), `daily_count_limit` (FUEL_RECEIPT=1, MARKET_LISTING=3, SHARE_SNS=1, DELIVERY_RECEIPT=100, 기타 NULL), `is_active=TRUE`, `metadata_schema='{}'::jsonb`.

   `__META__`, `ACCOUNT_AGE`는 `is_active=FALSE`인 시스템 가상 액션으로 INSERT.

2. **`V3__seed_mission.sql`**: `sre-mission-seed.sql`을 그대로 마이그레이션 디렉토리에 복사.

3. **`V4__seed_tier_def.sql`**: `tier_definition` 5개 INSERT (Rookie/Rider/Veteran/Pro/Legend). 설계서 §6 표 따름.

4. **`V5__seed_abuse_rule.sql`**: `abuse_rule` 4개 INSERT.
   - `DAILY_RP_CAP_STANDARD`: 일반 사용자 일 RP 250 상한 (severity=MEDIUM, action=REDUCE)
   - `DAILY_RP_CAP_DRIVER`: 드라이버 일 RP 2000 상한 (severity=MEDIUM, action=REDUCE)
   - `NEW_ACCOUNT_PENALTY`: 가입 3일 이내 50% 적립 (severity=LOW, action=REDUCE)
   - `GPS_SPEED_RANGE`: 5~80km/h 벗어나면 라이딩 이벤트 거부 (severity=HIGH, action=REJECT)
   
   `condition_json`은 룰별로 적절한 임계값 JSON으로 채움 (예: `{"window_hours":24,"max_rp":250,"applies_to":["STANDARD"]}`).

### 산출물
- 5개 마이그레이션 파일 (V1~V5)
- 모든 시드 SQL이 무에러로 적용됨

### 검증 기준
- [ ] `SELECT COUNT(*) FROM action_definition` = 26
- [ ] `SELECT COUNT(*) FROM mission_definition` = 240
- [ ] `SELECT COUNT(*) FROM tier_definition` = 5
- [ ] `SELECT COUNT(*) FROM abuse_rule` = 4
- [ ] `mission_definition` 중 `target_rule->>'eligibility'`가 있는 행 = 18 (드라이버 한정 미션)
- [ ] `mission_definition` 중 `target_rule->'window'->>'type'='season'` 행 = 59

---

## Stage 2 — Event Bus + 멱등성 + Anti-Abuse 골격

### 목표
`POST /events` 엔드포인트가 동작하고, 멱등성·기본 어뷰징 검증이 통과·실패를 정확히 반환한다. RP 계산·적립은 Stage 3에서.

### 참조 문서
- `sre-api.openapi.yml`: `/events` (POST/GET), `Problem` 응답
- `sre-design-spec.md` §3.1 (Event Bus), §3.5 (Anti-Abuse)
- `sre-schema.postgres.sql`: `action_event`, `idempotency_key`, `abuse_rule`, `abuse_event`

### 구현 작업

1. **Event Bus 모듈**
   - `POST /events` 핸들러: `EventCreate` 스키마 검증 → 멱등성 키 검사 → Anti-Abuse 호출 → 결과 분기
   - `GET /events/{event_id}`: 단건 조회

2. **Idempotency 미들웨어/서비스**
   - 요청 시 `Idempotency-Key` 헤더 → `idempotency_key` 테이블 lookup
   - 같은 키 + 같은 페이로드 해시 → 캐시된 응답 그대로 반환 (200 OK)
   - 같은 키 + 다른 페이로드 → 409 Conflict (Problem 응답)
   - TTL: 24시간 후 자동 만료

3. **Anti-Abuse 모듈 (4개 룰)**
   - `DAILY_RP_CAP_STANDARD/DRIVER`: 사용자의 오늘(00:00 ICT~) 누적 RP 조회 후 상한 검사. 상한 도달 시 `action_event.process_status=REJECTED`, `reject_reason_code=DAILY_CAP`.
   - `NEW_ACCOUNT_PENALTY`: `sre_user.created_at`이 현재로부터 3일 이내면 `applied_multiplier=0.5`. (Stage 3에서 곱셈 적용)
   - `GPS_SPEED_RANGE`: action_code=RIDE_KM의 payload.avg_speed_kmh가 5~80 범위 밖이면 REJECT.
   - 룰 위반 시 `abuse_event` INSERT + `audit_log` INSERT.

4. **로그·관측성**
   - 모든 `POST /events` 요청을 구조화 로그(JSON)로 남김. 필드: timestamp, user_id, action_code, idempotency_key, process_status, reject_reason_code.

### 산출물
- `POST /events`가 동작하며 OpenAPI 명세대로 응답
- 멱등성 단위/통합 테스트 통과
- Anti-Abuse 4개 룰 단위 테스트 통과

### 검증 기준
- [ ] 동일 `Idempotency-Key`로 두 번 호출 → 동일 응답 + DB row 1개만
- [ ] 일 RP 250 누적 후 추가 라이딩 → 응답에 `rp_awarded=0`, status=REJECTED
- [ ] 가입 1일 차 사용자 → `applied_multiplier=0.5` 반환
- [ ] 속도 100km/h 라이딩 → 거부 + `abuse_event` 기록
- [ ] 모든 거부 응답은 `application/problem+json` 형식

---

## Stage 3 — Point Module (이중 원장)

### 목표
RP 적립·차감·만료가 `rp_transaction` 이중 원장으로 정확히 기록되고, `rp_balance` 캐시가 일치한다.

### 참조 문서
- `sre-design-spec.md` §3.3 (Point Module)
- `sre-schema.postgres.sql`: `rp_transaction`, `rp_balance`, `rp_expiration_schedule`
- `sre-api.openapi.yml`: `/users/{id}/balance`, `/users/{id}/transactions`, `/users/{id}/expirations`

### 구현 작업

1. **`PointService.earn(user_id, amount, source_type, source_id, related_event_id, memo)`**
   - 트랜잭션 시작 → `rp_transaction` INSERT (tx_type=EARN) → `rp_balance` UPDATE → 트랜잭션 종료
   - `expires_at` = NOW() + INTERVAL '3 months' (설계서 §6)
   - `rp_expiration_schedule` INSERT (status=PENDING, remaining_amount=amount)

2. **`PointService.redeem(user_id, amount, source_type, source_id)`**
   - 잔액 검증 → 부족 시 `INSUFFICIENT_BALANCE` 에러
   - `rp_transaction` INSERT (tx_type=REDEEM, amount=-amount) → `rp_balance` UPDATE
   - 만료 스케줄 FIFO 차감: 만료 임박한 expiration부터 `remaining_amount` 차감 (`status=PARTIALLY_USED`/`FULLY_USED`)

3. **`PointService.refund(transaction_id, reason)`**
   - 원본 거래의 amount 부호 반전한 새 트랜잭션 INSERT
   - 만료 스케줄 복구 (REDEEM으로 소비된 expiration 복원)

4. **만료 배치 (cron job 또는 백그라운드 워커)**
   - 매일 ICT 00:00에 `expires_at < NOW()` && `status IN (PENDING, PARTIALLY_USED)`인 expiration 검색
   - 잔여분만큼 `rp_transaction` INSERT (tx_type=EXPIRE) → 잔액 차감
   - `rp_expiration_schedule.status=EXPIRED` 업데이트

5. **잔액 조회 API**
   - `GET /users/{id}/balance`: `rp_balance` 캐시에서 즉시 반환 + `expiring_in_30d` 계산
   - `GET /users/{id}/transactions`: cursor 페이지네이션 (`?cursor=...&limit=20`)
   - `GET /users/{id}/expirations`: 향후 만료 예정 스케줄 목록

6. **정합성 검증 도구 (옵션, 권장)**
   - CLI 또는 admin 엔드포인트: `rp_transaction` 합계와 `rp_balance.current_balance`가 일치하는지 사용자별 비교

### 산출물
- 적립·차감·만료·환불이 동시 요청(동시성) 환경에서도 일관되게 동작
- 만료 배치 잡 동작

### 검증 기준
- [ ] 100 RP 적립 → 1200 RP 적립 → 잔액 1300, lifetime_earned 1300
- [ ] 500 RP 차감 → 잔액 800, lifetime_spent 500
- [ ] 3개월 + 1일 경과 후 배치 실행 → 만료 처리, 잔액 0
- [ ] 100명의 사용자에 대해 무작위로 100건씩 적립/차감 후 `SUM(amount)` = `rp_balance.current_balance` 모두 일치
- [ ] 차감 거래 환불 시 expiration 복구 검증

---

## Stage 4 — Mission Module + Target Rule Evaluator (가장 어려움)

### 목표
240개 미션의 `target_rule` JSONB를 해석하여 진행도(`current_value`)를 계산하고, 목표 도달 시 자동 완료 + RP 적립.

### 참조 문서 (반드시 정독)
- **`sre-mission-rule-mapping.md` 전체** — 평가 엔진의 진실. 8개 agg, 필터, 윈도우, eligibility 모두.
- `sre-design-spec.md` §3.2 (Mission Module)
- `sre-mission-mapping-full.csv` — 240개 미션의 실제 매핑 결과. 까다로운 케이스 검증용.
- `sre-api.openapi.yml`: missions 태그 5개 엔드포인트

### 구현 작업

1. **`MissionEvaluator.evaluate(user_id, target_rule, window_start, window_end)` → `{current_value, target_value, completed}`**

   8개 agg 모두 처리:
   - `sum_field`: `SELECT SUM((payload->>field)::numeric) FROM action_event WHERE user_id=? AND action_code=? AND occurred_at BETWEEN ? AND ?` (+ filters)
   - `count_event`: `SELECT COUNT(*) ...`
   - `count_distinct`: `SELECT COUNT(DISTINCT payload->>field) ...`
   - `count_distinct_district`: payload의 district 필드 distinct
   - `count_distinct_category`: 사용자의 카테고리 활동 카운트 (`behavior_category_log` 활용 가능)
   - `count_mission_complete`: `user_mission_progress.status=COMPLETED` 카운트 (label 조건 등)
   - `streak_days`: 윈도우 내 연속 라이딩일 최대값
   - `composite`: children 각각 평가 후 AND/OR 결합

2. **필터 적용 (PostgreSQL JSONB 쿼리)**
   - `time_of_day`: `EXTRACT(hour FROM occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN ? AND ?`
   - `date`: `TO_CHAR(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MM-DD') = ?`
   - `weather`: `payload->>'weather' = ?`
   - `geo.type=district`: `payload->>'district' IN (?)`
   - `geo.type=poi`: `payload->>'poi' IN (?)`
   - `geo.type=road`: `payload->>'road' IN (?)`
   - `speed_kmh`: `(payload->>'avg_speed_kmh')::numeric BETWEEN ? AND ?`

3. **윈도우 해석**
   - `calendar_day`: 오늘 00:00 ~ 23:59 ICT
   - `calendar_week`: 이번 주 월요일 ~ 일요일 ICT
   - `calendar_month`: 이번 달 1일 ~ 말일 ICT
   - `onboarding`: 사용자 `created_at` ~ `created_at + days`
   - `season`: `mission_definition.starts_at` ~ `ends_at` 사용. 둘 다 NULL이면 평가 결과 0 + 로그 경고.

4. **자격 필터 (`eligibility`)**
   - `target_rule.eligibility.account_type`이 있으면 사용자의 `sre_user.account_type`이 화이트리스트에 있어야 미션 노출/진행
   - `min_account_age_days`도 동일

5. **미션 진행도 관리**
   - 이벤트 처리 시(Stage 2 Event Bus 흐름에) 해당 사용자의 활성 미션 모두 재평가 → `user_mission_progress.current_value` 업데이트
   - `current_value >= target_value` → `status=COMPLETED`, `completed_at=NOW()`, Point Module로 `reward_rp` 적립 요청

6. **미션 추천 (`/users/{id}/mission-recommendations`)**
   - 자격 통과한 미션 후보 → 사용자의 약한 카테고리 기준 점수 매김
   - 약한 카테고리(최근 30일 이벤트 없는 category_code) 우선 추천
   - `mission_recommendation` 테이블 기록

7. **클레임/포기 API**
   - `POST /users/{id}/missions/{progress_id}/claim`: 보상 수동 수령(자동 적립이 아닌 미션 타입용)
   - `POST /users/{id}/missions/{progress_id}/abandon`: 진행 중 미션 포기 (`status=CANCELLED`)

### 산출물
- 240개 미션이 정상적으로 진행/완료됨
- Mission Evaluator 단위 테스트 풍부 (각 agg + 각 filter 조합)

### 검증 기준
- [ ] CSV의 240개 미션 각각에 대해 가짜 이벤트를 주입했을 때 `target_value`에 도달 → status=COMPLETED 자동 전이
- [ ] 드라이버 미션 18개는 STANDARD 계정에는 노출되지 않음
- [ ] 시즌 미션 59개는 `starts_at`/`ends_at` 외에는 진행도 0
- [ ] composite AND 미션: child 둘 다 완료해야 부모 완료
- [ ] `count_mission_complete`: 다른 미션 8개 완료 후 자동 완료 (예: O-MX-02)
- [ ] `streak_days`: 7일 연속 라이딩 시 STREAK_7 미션 완료

---

## Stage 5 — Reward Module (외부 API는 Stub)

### 목표
보상 카탈로그 조회, 교환 요청 처리, RP 차감 + 외부 API 호출 + 결과 저장. 외부 API는 인터페이스만 정의하고 Stub.

### 참조 문서
- `sre-design-spec.md` §3.4 (Reward Module), §7 예시 B
- `sre-schema.postgres.sql`: `reward_partner`, `reward_catalog`, `reward_redemption`
- `sre-api.openapi.yml`: rewards 태그 5개 엔드포인트

### 구현 작업

1. **`RewardProviderClient` 인터페이스 정의**
   ```typescript
   interface RewardProviderClient {
     issue(catalog: CatalogItem, user_id: number, idempotency_key: string): 
       Promise<{ voucher_code: string; external_response: object }>;
   }
   ```
   구현체: `InternalProviderClient` (즉시 voucher_code 생성), `GotItStubClient`, `UrboxStubClient`, `ViettelStubClient` — 모두 일단 랜덤 voucher_code 반환하고 로그만 남김.

2. **카탈로그 조회 (`GET /catalog`, `GET /catalog/{id}`)**
   - `is_active=TRUE` && `visible_from <= NOW() <= visible_until` 필터
   - 월간 소진(`monthly_issued >= monthly_quota`) 항목 제외 (또는 `available=false` 플래그)

3. **교환 요청 (`POST /users/{id}/redemptions`)**
   - 1단계: 잔액 검증 (`current_balance >= required_rp`)
   - 2단계: 멱등성 키 검사
   - 3단계: 트랜잭션 시작 → `RP 차감 (PointService.redeem)` → `reward_redemption INSERT (status=REQUESTED)` → 트랜잭션 종료
   - 4단계: 트랜잭션 외부에서 `RewardProviderClient.issue()` 호출
   - 5단계 (성공): `reward_redemption UPDATE status=FULFILLED, voucher_code, external_response`
   - 5단계 (실패): `PointService.refund()` 호출 + `reward_redemption UPDATE status=FAILED`
   - 6단계: `audit_log` INSERT

4. **이력 조회**
   - `GET /users/{id}/redemptions`: 사용자 교환 이력 (cursor 페이지네이션)
   - `GET /users/{id}/redemptions/{id}`: 단건

5. **보상 카탈로그 seed (옵션)**
   - 설계서 §8 "v1 6~10개 항목" 따라 데모용 시드 작성 (별도 마이그레이션 V6__seed_reward_catalog.sql)

### 산출물
- 교환 happy path 동작
- 외부 API 실패 시 자동 환불 동작
- Stub 클라이언트 3종

### 검증 기준
- [ ] 1000 RP 보유 → 1200 RP 항목 교환 → 400 Bad Request (`INSUFFICIENT_BALANCE`)
- [ ] 1500 RP 보유 → 1200 RP 항목 교환 → 잔액 300, voucher_code 발급
- [ ] Stub이 강제 실패하도록 설정 → 자동 환불, 잔액 복구, status=FAILED
- [ ] 같은 Idempotency-Key 재호출 → 두 번째 차감 없음

---

## Stage 6 — Tier & Streak + Diversity Calculator

### 목표
다양성 계수가 미션·이벤트 RP 계산에 반영되고, 등급이 자동 갱신된다.

### 참조 문서
- `sre-design-spec.md` §3.6, §3.7, §6 (다양성·등급 표)
- `sre-schema.postgres.sql`: `behavior_category_log`, `user_diversity_score`, `tier_definition`, `user_tier`

### 구현 작업

1. **Diversity Calculator**
   - 이벤트 처리 시 `action_definition.category_code`를 보고 `behavior_category_log` INSERT
   - 월 1회 또는 실시간(권장: 실시간) 계산: 이번 달 활동 카테고리 수 → `user_diversity_score` upsert
   - 카테고리 1개=1.0, 2개=1.2, 3개=1.4, 4개=1.6, 5+개=2.0
   - Event Bus가 RP 계산 시 이 multiplier를 곱함: `final_rp = base_rp * multiplier`

2. **Tier 모듈**
   - 이벤트 RP 적립 후 (또는 일배치) 사용자의 누적 RP + 다양성 카테고리 수 검사 → 등급 산정
   - `user_tier.current_tier_code` 업데이트, `achieved_at` 갱신
   - 등급 상승 시 `audit_log` INSERT

3. **API**
   - `GET /users/{id}/tier`: 현재 등급, 다음 등급 진행도
   - `GET /users/{id}/diversity-score`: 이번 달 카테고리 수, multiplier
   - `GET /tiers`: 등급 정의 목록

4. **Streak (옵션)**
   - 7일 연속 라이딩 감지 시 `STREAK_7` 액션 자동 생성 → 500 RP 적립 트리거 (설계서 §6)

### 산출물
- 다양성 계수가 적립 RP에 정확히 곱해짐
- 등급 전이 정상 동작

### 검증 기준
- [ ] 1개 카테고리만 활동 → multiplier=1.0
- [ ] 3개 카테고리 활동 → multiplier=1.4 → 10 RP base가 14 RP 적립으로 계산됨
- [ ] 누적 5000 RP + 카테고리 2개 → Rookie → Rider 자동 승급
- [ ] 7일 연속 라이딩 → STREAK_7 트리거 + 500 RP 적립

---

## Stage 7 — Admin API + Audit Log

### 목표
운영자가 룰을 수정하고 사용자를 검색·조정하며 감사 로그를 조회할 수 있다.

### 참조 문서
- `sre-api.openapi.yml`: admin 태그 18개 엔드포인트
- `sre-schema.postgres.sql`: `audit_log`

### 구현 작업

1. **AdminToken 인증 미들웨어** — 별도 시크릿, RBAC(role 검사). v1은 단순 "admin" role만.

2. **룰 CRUD**
   - `GET/POST/PUT /admin/action-definitions[/{code}]`
   - `GET/POST/PUT /admin/mission-definitions[/{id}]`
   - `GET/POST/PUT /admin/abuse-rules[/{code}]`
   - `GET/POST /admin/reward-partners`
   - `POST/PUT /admin/catalog[/{id}]`
   - 모든 변경은 `audit_log` INSERT (before_snapshot / after_snapshot)

3. **사용자 조회**
   - `GET /admin/users` (검색): external_user_uuid, account_type, status, is_driver_verified 쿼리 파라미터
   - `GET /admin/users/{user_id}` (단건)

4. **RP 수동 조정**
   - `POST /admin/users/{user_id}/adjust`: tx_type=ADJUST_PLUS/MINUS, amount, reason → Point Module 호출 + audit_log

5. **이벤트 재처리**
   - `POST /admin/events/{event_id}/reprocess`: REJECTED/PENDING 이벤트만 허용 → Anti-Abuse 재검사 (override_abuse_check 가능) → 정상 처리 흐름 → audit_log
   - 이미 PROCESSED면 409 Conflict

6. **감사 로그 검색**
   - `GET /admin/audit-log`: entity_type, entity_id, actor_user_id, date range 필터 + cursor 페이지네이션

### 산출물
- 18개 admin 엔드포인트 동작
- 모든 admin 액션이 audit_log에 기록됨

### 검증 기준
- [ ] AdminToken 없이 호출 시 401
- [ ] 어떤 룰을 변경하든 audit_log에 before/after 모두 기록됨
- [ ] 수동 RP 조정 → 사용자 잔액 즉시 반영 + 감사 로그
- [ ] REJECTED 이벤트 재처리 시 정상 RP 적립
- [ ] 이미 PROCESSED 이벤트 재처리 시 409

---

## Stage 8 — 통합 테스트 + 문서화

### 목표
End-to-End 시나리오가 동작하고 운영 문서가 정리된다.

### 구현 작업

1. **통합 테스트 시나리오 (최소 5개)**
   - **시나리오 A**: 신규 가입 → 14일 온보딩 미션 8개 완료 → O-MX-02 자동 완료 → 등급 전이
   - **시나리오 B**: 5km 라이딩 + 퀘스트 완료 → 다양성 1.4 적용 → 정확한 RP 계산 (설계서 §7 예시 A 재현)
   - **시나리오 C**: 1200 RP 보상 교환 → 외부 API 실패 → 자동 환불
   - **시나리오 D**: 일 RP 250 초과 시도 → 어뷰징 룰 발동 → 거부 + audit_log
   - **시나리오 E**: 멱등성 키 동일 호출 100회 → DB row 1개만 + 동일 응답

2. **부하 테스트 (옵션)**
   - `POST /events` 1000 RPS 60초 → p99 < 200ms 목표

3. **운영 문서**
   - `README.md`: 빌드/실행/배포 절차
   - `OPERATIONS.md`: 미션 추가 절차, 시즌 캠페인 등록 절차, 어뷰징 룰 변경 절차
   - `TROUBLESHOOTING.md`: 잔액 불일치 시 정합성 검증·복구 절차

4. **API 문서 자동 생성**
   - OpenAPI 스펙에서 Swagger UI 또는 Redoc 호스팅 (`/docs` 경로)

### 검증 기준
- [ ] 5개 시나리오 모두 통과
- [ ] 코드 커버리지 80% 이상
- [ ] `/docs`에서 OpenAPI 명세 시각화
- [ ] 운영 문서 3개 완성

---

## 부록 A — 다음 단계 (v1 이후)

이 지시서 범위 밖이며, 별도 PR로 진행:

- **외부 API 실 연동**: Got It, Urbox, Viettel Topup. 인증 방식·재시도·웹훅 콜백 정의 필요 (별도 통합 가이드 문서).
- **메시지 큐**: 이벤트 처리를 비동기로 전환 (Kafka/SQS/RabbitMQ). 처리량 증가 대응.
- **캐시**: Redis 기반 잔액·미션 진행도 캐시. 응답 속도 개선.
- **모니터링**: Prometheus + Grafana, 핵심 지표 알람.
- **DB 분리**: 트래픽 안정화 후 SRE 전용 DB 인스턴스로 분리 (설계서 §10 4단계).

---

## 부록 B — 자주 묻는 결정 사항 (코딩 AI가 헷갈리면 여기 참조)

- **Q: 미션 평가는 실시간인가 배치인가?**
  → 실시간. 이벤트 처리 시 해당 사용자의 활성 미션을 즉시 재평가.

- **Q: 다양성 계수는 언제 갱신되나?**
  → 이벤트 처리 시 실시간. `user_diversity_score`를 upsert.

- **Q: RP 만료는 FIFO인가 LIFO인가?**
  → FIFO. 만료가 가까운 expiration부터 차감.

- **Q: 신규 계정 50% 페널티는 base에 곱하나, 최종에 곱하나?**
  → base에 곱한 뒤 다양성 계수를 곱함. 즉 `final = base * 0.5 * diversity_multiplier`.

- **Q: 미션 시드의 `_unparsed`는 어떻게 처리하나?**
  → 현재 시드는 0건. 향후 발생 시 평가 엔진에서 `target_value=999999` 등으로 사실상 미달성 처리하고 로그 경고.

- **Q: 외부 user_id와 SRE user_id 매핑은 누가 만드나?**
  → 게이트웨이가 lazy create. `POST /events` 호출 시 `external_user_uuid`로 lookup → 없으면 `sre_user` INSERT.

- **Q: 모든 timestamp는 어떤 타임존?**
  → DB는 UTC 저장(TIMESTAMPTZ). API 응답은 ISO 8601 (offset 포함). 미션 윈도우 계산은 `Asia/Ho_Chi_Minh` (UTC+7) 기준.

---

## 부록 C — 진행 체크리스트

각 Stage 완료 시 사용자에게 보고:

- [ ] Stage 0: 부트스트랩
- [ ] Stage 1: 시드 로딩
- [ ] Stage 2: Event Bus + 멱등성 + Anti-Abuse
- [ ] Stage 3: Point Ledger
- [ ] Stage 4: Mission Evaluator
- [ ] Stage 5: Reward Module (Stub)
- [ ] Stage 6: Tier + Diversity
- [ ] Stage 7: Admin API
- [ ] Stage 8: 통합 테스트 + 문서

각 단계 보고 시 포함할 내용:
1. 무엇을 구현했는가 (구체적 파일·모듈명)
2. 어떻게 검증했는가 (테스트 결과 요약)
3. 미해결 이슈·결정 필요사항
4. 다음 Stage로 넘어가도 되는지 사용자 확인 요청

---

**마지막 안내**: 작업 중 입력 산출물(`sre-design-spec.md`, `sre-schema.postgres.sql`, `sre-api.openapi.yml`, `sre-mission-rule-mapping.md` 등)과 충돌하는 결정을 하게 되면 **반드시 사용자에게 먼저 확인**하고 진행한다. 임의로 컬럼 추가/이름 변경/엔드포인트 변경 금지.
