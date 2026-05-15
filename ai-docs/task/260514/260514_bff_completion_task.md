# 260514 · BFF 미구현 기능 완수 Task

> 작성일: 2026-05-14
> 목적: `backend_todo.md` 및 `TEST/CHECKLIST_v1_260514.md` §4.7 미구현/Mock 잔여 항목을 완수하여 BFF 기능 커버리지를 100% 로 끌어올린다.
> 기준 문서: [`backend_todo.md`](../../spec/backend_features.md) · [`TEST/CHECKLIST_v1_260514.md`](../../TEST/checklist/README.md) · [`engine_intg_v2.md`](../../context/architecture.md)

---

## 1. 배경 / 현황 점검

### 1.1 이미 구현된 것 (문서 미반영)

`backend_todo.md` 에는 P0~P1 이 미구현으로 표기되어 있으나, **Engine Phase 5 (260514) 에서 실제로는 모두 구현 완료**된 상태이다 (`_tasklog.md` 참조).

| 라우터 파일 | 구현된 엔드포인트 | 대응 TODO |
|---|---|---|
| `backend/app/routers/profile.py` | `GET /check-nickname`, `PUT /`, `GET /{user_id}/rp-balance` 외 기존 4건 | A-1, A-2, RP 잔액 |
| `backend/app/routers/quests.py` | list / pins / recommended / detail / accept / bookmark / participants | Q-1 ~ Q-7 |
| `backend/app/routers/ride.py` | submit / streak / history / safety-grade | R-1 ~ R-4 |
| `backend/app/routers/feed.py` | feed / stories / create / like / comments(GET·POST) | F-1 ~ F-6 |

→ **본 task의 첫 작업으로 `backend_todo.md` 의 P0~P1 항목을 ✅ 로 갱신**해야 함 (Task 5에서 일괄 처리).

### 1.2 실제로 미구현인 항목 (본 task 범위)

| 도메인 | TODO ID | 엔드포인트 | 우선순위 |
|---|---|---|---|
| Notification | N-1 | `GET /api/notifications` | P2 |
| Notification | N-2 | `GET /api/notifications/settings` | P2 |
| Notification | N-3 | `PUT /api/notifications/settings` | P2 |
| User Stats | U-1 | `GET /api/users/me/stats` | P3 |
| Badge | U-2 | `GET /api/badges/{id}` | P3 |
| Badge | U-3 | `GET /api/users/me/badges` | P3 |
| Account | A-3 | `DELETE /api/users/me` | P3 |
| Account | A-4 | `POST /api/users/export` | P3 |
| Admin | Admin-2 | `POST /admin/login` + 세션/JWT | — |
| Admin | Admin-3 | 대시보드 (유저/퀘스트/통계 조회) | — |

→ 합계 **10개 엔드포인트** + 문서 현행화.

---

## 2. Sub-Task 리스트

### Task 1 · Notification 라우터 신설 (P2, N-1~N-3)

**목표**: 알림 목록 / 알림 설정 조회·저장 BFF API 구현.

**영향 파일**:
- 신규: `backend/app/routers/notifications.py`
- 신규: `backend/app/schemas/notification.py` (또는 기존 schemas 디렉터리 컨벤션 확인)
- 수정: `backend/app/main.py` (라우터 include)
- 활용 DB: `notifications`, `notification_settings` (이미 존재)

**Plan**:
1. `database/init/001_init_schema.sql` 의 `notifications`, `notification_settings` 컬럼 구조 확인 → SQLAlchemy 모델 추가 (필요 시 `models/` 생성)
2. Pydantic 스키마 작성: `NotificationOut`, `NotificationListResponse`(`{items, unread_count}`), `NotificationSettingsOut`, `NotificationSettingsUpdate`
3. 라우터 작성:
   - `GET /notifications?user_id=…&page=&limit=` → 페이지네이션 + `unread_count` 동시 반환
   - `GET /notifications/settings?user_id=…` → 없으면 기본값 INSERT 후 반환 (upsert 시드)
   - `PUT /notifications/settings` body `{user_id, push, marketing, quiet_hours, ...}` → upsert
4. `main.py` 에 `notifications.router` include (prefix `/api`)
5. 검증: `curl -i http://localhost:18090/api/bff/notifications?user_id=…` 200, DB 행 확인

**비고**: `unread_count` 는 `SELECT COUNT(*) WHERE read_at IS NULL` 로 동일 트랜잭션 계산.

---

### Task 2 · User Stats 라우터 신설 (P3, U-1)

**목표**: 이번 달 누적 통계(거리·퀘스트·평균 안전도) 제공.

**영향 파일**:
- 신규: `backend/app/routers/users.py` (이후 Task 3·U-3 와 통합)
- 활용 DB: `ride_sessions`, `user_quests`

**Plan**:
1. 월(UTC+7, VN 시간) 경계 계산 헬퍼 작성 (`engine` 의 datetime 유틸 참고 가능)
2. SQL aggregate:
   - `total_km = SUM(distance_km) FROM ride_sessions WHERE user_id=? AND started_at >= month_start`
   - `quest_count = COUNT(*) FROM user_quests WHERE user_id=? AND completed_at >= month_start AND status='COMPLETED'`
   - `avg_safety_grade` = ride_sessions.safety_grade 평균(A=3/B=2/C=1 매핑 후 다시 등급화)
3. `GET /users/me/stats?user_id=…` → `{month, total_km, quest_count, avg_safety_grade}`
4. 검증: 임의 데이터 INSERT 후 응답값과 SQL 일치 확인

---

### Task 3 · Badge + User Badge 라우터 신설 (P3, U-2·U-3)

**목표**: 배지 상세 단건 조회 + 내 배지 목록.

**영향 파일**:
- 신규: `backend/app/routers/badges.py` *또는* `users.py` 에 통합 (TODO 권고는 통합)
- 활용 DB: `badges`, `user_badges`

**Plan**:
1. 스키마: `BadgeOut`(id, code, name, description, icon_url, criteria), `UserBadgeOut`(badge + acquired_at)
2. `GET /badges/{badge_id}` → 단건 조회 (404 분기)
3. `GET /users/me/badges?user_id=…` → JOIN badges + 최신 acquired_at desc
4. 검증: badges 시드 데이터 1건 INSERT 후 두 엔드포인트 응답 확인

---

### Task 4 · Account 관리 (P3, A-3·A-4)

**목표**: 계정 탈퇴 (CASCADE 삭제) 및 데이터 내보내기 요청.

**영향 파일**:
- 수정: `backend/app/routers/users.py` (Task 2·3 와 동일 파일)
- 활용 DB: `users` + 모든 FK CASCADE 행

**Plan**:
1. **A-3** `DELETE /users/me?user_id=…`:
   - 트랜잭션 내에서 `DELETE FROM users WHERE id=?` (FK CASCADE 확인 필수)
   - Engine 측 `sre_user` 도 동기 삭제 필요 여부 확인 — 정책은 "익명화 후 보존" 또는 "동기 삭제" 중 선택. 보수적으로 **익명화** 권장 (lifetime_earned 통계 보존). 본 task 에서는 stub: BFF 만 hard delete, engine은 후속 과제로 분리.
   - 응답 204
2. **A-4** `POST /users/export?user_id=…`:
   - stub 가능 — `{request_id, status: "QUEUED", estimated_ready_at}` 형태 반환
   - 실제 백그라운드 작업은 후속 (Celery/RQ 미도입 시 기록만 남김)
3. 검증: A-3 후 `SELECT * FROM users WHERE id=…` 0행, 관련 ride_sessions / feed_posts / notifications 도 CASCADE 확인

**리스크**: CASCADE 미설정 컬럼이 있을 수 있음 → `database/init/001_init_schema.sql` 의 FK ON DELETE 정책을 사전 검토.

---

### Task 5 · Admin 인증 + 대시보드 (Admin-2·Admin-3)

**목표**: 관리자 콘솔 로그인 POST + 세션, 기본 대시보드 1페이지.

**영향 파일**:
- 수정: `backend/app/routers/admin.py`
- 신규: `backend/app/templates/admin/dashboard.html` (간단 HTML)
- 환경변수: `.env` 에 `ADMIN_USER`, `ADMIN_PASS_HASH`, `ADMIN_JWT_SECRET` 추가 (engine 의 `ENGINE_ADMIN_JWT_SECRET` 과 분리 vs 통합 결정 필요)

**Plan**:
1. `POST /admin/login` (form-data) → bcrypt 검증 → JWT HS256 발급 → HttpOnly 쿠키 `admin_session` set → redirect `/admin/dashboard`
2. 의존성: `verify_admin_session()` (쿠키 디코드 → 만료/시그니처 검증), 실패 시 `/admin/login` 리다이렉트
3. `GET /admin/dashboard` (HTML):
   - 총 유저 수, 신규 가입 (7일), 활성 퀘스트 수, 오늘 라이딩 수, 최근 RP 트랜잭션 5건 (engine API 호출)
4. `POST /admin/logout` → 쿠키 삭제
5. 검증: 잘못된 패스워드 401, 정상 로그인 후 대시보드 진입, 세션 만료 후 재로그인 요구

**비고**: engine의 admin API(`/v1/admin/users/{id}`, `/v1/admin/audit-logs`) 호출은 `engine_client` 에 admin JWT 지원 메서드 추가 필요할 수 있음 → 본 task 범위 내에서 최소 호출만 추가.

---

### Task 6 · 문서 현행화

**목표**: 구현 완료 후 모든 트래킹 문서를 일관되게 갱신.

**대상 파일**:
1. `docs/backend_todo.md`
   - P0~P1 항목 ✅ 갱신 (Phase 5 에서 이미 완료된 부분)
   - P2~P3 신규 구현 항목 ✅ 갱신
   - 전체 진행 현황 표 재집계 (잔여 27 → 신규 잔여 갱신)
2. `docs/TEST/CHECKLIST_v1_260514.md`
   - §4.7 미구현/Mock 잔여 목록에서 구현 완료 항목 제거 (또는 ✅ 처리)
   - §5.2 ⛔ 항목 → ✅/잔여로 분류 재정리
   - §2.5 F-04-4, §2.11 F-10-4·F-10-8, §2.13 F-11-5, §2.15 F-11-9·F-11-10 의 `[MOCK]` 표시를 `[BFF]` 로 갱신
3. `docs/_tasklog.md` — 본 task 색인 추가
4. `docs/index.md` — (필요 시) 변경 사항 반영
5. `README.md` / `docs/spec.md` — 구현 완료된 API 목록 갱신 (GUIDELINE 2번 항목 준수)
6. `wiki/wiki-docs/` 의 BFF 문서가 있다면 동기화 → `./wikidoc_publish.sh` 실행 검토

**Plan**:
- 각 sub-task 종료마다 부분 갱신하지 말고 **Task 1~5 모두 검증 통과 후 일괄 갱신** (PR 단위 일관성).

---

## 3. 작업 순서 / 의존성

```
Task 1 (Notification)  ─┐
Task 2 (User Stats)     ├─→  Task 6 (문서 현행화)
Task 3 (Badge)          │
Task 4 (Account)        │
Task 5 (Admin)         ─┘
```

- Task 1~5 는 서로 독립적이므로 순서는 자유 (P2 → P3 → Admin 권장).
- Task 2·3·4 는 동일 파일(`users.py`) 을 공유하므로 **순차 진행** 권장 (충돌 방지).
- Task 6 은 1~5 가 모두 ✅ 검증된 후에만 진행.

---

## 4. 공통 점검 사항

- 모든 신규 엔드포인트는 `/api` prefix → Nginx `/api/bff/*` 로 노출되는지 `curl` 로 확인
- Pydantic 스키마 / response_model 일관 (snake_case 응답)
- SQLAlchemy 비동기 세션 (`AsyncSession`) 사용, 트랜잭션 명시
- DB 스키마 변경이 필요한 경우 → 본 task 에서는 **변경 없음 (이미 정의됨)** 가정. 차이 발견 시 별도 마이그레이션 task 로 분리.
- OpenAPI 자동 노출: `http://localhost:18090/api/bff/docs` 에서 신규 라우트 확인

---

## 5. 완료 조건 (DoD)

- [ ] Task 1 — Notification 3개 엔드포인트 200 / DB 사이드이펙트 확인
- [ ] Task 2 — `GET /users/me/stats` 응답 SQL 검증
- [ ] Task 3 — `GET /badges/{id}`, `GET /users/me/badges` 응답 확인
- [ ] Task 4 — `DELETE /users/me` CASCADE 확인, `POST /users/export` stub 응답
- [ ] Task 5 — Admin 로그인/대시보드/로그아웃 E2E 동작
- [ ] Task 6 — `backend_todo.md`, `CHECKLIST_v1_260514.md`, `_tasklog.md`, `README.md`, `spec.md` 모두 현행화

---

(작성: 2026-05-14)
