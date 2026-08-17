# 키워드 알림 — dev 실측 검증 (2026-08-17)

배경: `58bb3b9` 완료 후 미실측이던 2건을 dev 스택(`http://localhost:18090`)에서 실측했다.
애플리케이션 코드/마이그레이션/docker-compose 수정 없음. 커밋 없음.

## 접근 방법 요약

- **성공한 방법**: 지시된 순서 그대로 — `admin_accounts` 에 임시 계정을 직접 INSERT(`role='admin'`, `verify_root_api`가 요구하는 `is_privileged` 통과)하고, bcrypt 해시는 `docker exec saigon_bff python -c "from app.admin_auth import hash_password; ..."` 로 앱과 동일한 함수로 생성. `.env` 는 전혀 건드리지 않았다.
- **실패했던 중간 단계(수정해서 성공)**: 처음에 bcrypt 해시 문자열(`$2b$12$...`)을 `docker exec ... bash -c "... '$HASH' ..."` 형태로 셸 변수 치환해 psql INSERT 했더니 `$` 뒤 문자들이 중첩 셸 파싱 중 유실되어(`$2b$12$8R8bope...` → `b2R8bope...`) 해시가 깨졌다. 로그인 401로 발현. 원인 격리 후 `docker exec saigon_bff python -c "..."` 내부에서 SQLAlchemy로 직접 UPDATE(셸 변수 치환 없이)하는 방식으로 전환해 해결. **교훈**: bcrypt 해시처럼 `$`를 포함한 문자열은 중첩 `bash -c` 문자열 치환 경로에 절대 태우지 말 것 — 컨테이너 안에서 Python이 직접 문자열을 다루게 해야 안전하다.
- 사용자 세션은 `POST /api/bff/auth/dev-login` (dev 전용, `backend/app/routers/auth.py:968-1014`, `_DEV_MODE` + `OTP_DEV_BYPASS` 게이트) 로 발급받았고, 이후 요청은 `X-User-Id`/`X-Session-Token` 헤더(`backend/app/deps.py:82` `verify_user_session`)로 인증했다.

## 검증 1 — 어드민 service-config GET/PUT

인증 경로 근거: `backend/app/admin_auth.py` — `authenticate()`(86행)이 `.env` root 계정 우선 매칭 후 `admin_accounts` 폴백, `verify_root_api`(122행)는 `role in (root, admin)`만 통과(`manager` 차단). `backend/app/routers/admin_api/settings.py` 351-447행이 `service-config` GET/PUT, `backend/app/routers/app_version.py` 15-25행이 공개 `GET /api/bff/app-config`.

| # | 항목 | 명령 | 결과 | 판정 |
|---|---|---|---|---|
| 1 | 로그인 | `POST /admin/api/auth/login` (임시 계정 `_live_verify_260817`/role=admin) | `200 {"username":"_live_verify_260817","role":"admin"}` + `admin_session` 쿠키 | 통과 |
| 2 | GET service-config (초기) | `GET /admin/api/settings/service-config` | `200 {"dm_poll_interval":"30","keyword_alert_max_count":"20"}` | 통과 |
| 3 | PUT → 3 | `PUT .../service-config {"dm_poll_interval":"30","keyword_alert_max_count":"3"}` | `200 {"dm_poll_interval":"30","keyword_alert_max_count":"3"}` | 통과 |
| 4 | DB 반영 | `psql ... select * from app_config where group_name='market'` | `market \| keyword_alert_max_count \| 3` | 통과 |
| 5 | 공개 전파 | `GET /api/bff/app-config` | `{"dm_poll_interval":30,"keyword_alert_max_count":3,...}` | 통과 |
| 6 | 하한 위반 | `PUT ... keyword_alert_max_count=0` | `400` | 통과 |
| 7 | 상한 위반 | `PUT ... keyword_alert_max_count=101` | `400` | 통과 |
| 8 | 복합설정 무결성 | 400 실패 후 `GET service-config` | `{"dm_poll_interval":"30","keyword_alert_max_count":"3"}` — `dm_poll_interval` 훼손 없음 (코드상 두 값 모두 검증 통과해야 커밋되는 구조, `settings.py:390-402`) | 통과 |
| 9 | 원복 | `PUT ... keyword_alert_max_count=20` | `200 {"dm_poll_interval":"30","keyword_alert_max_count":"20"}` | 통과(원복) |

결론: 어드민이 `keyword_alert_max_count` 를 실제로 조회·변경 가능하고, 범위 밖 값은 400으로 막히며, 변경이 `app_config` → 공개 `GET /api/bff/app-config` 로 정상 전파됨을 실측 확인. 검증 1의 5개 항목(조회/변경/상한강제 전파/범위밖 400/복합설정 무결성) 모두 통과.

## 검증 2 — 사용자 API 왕복 실측

테스트 유저: `dev-login(phone="livever260817")` → `user_id = b3626af6-1658-42e3-8293-0f9239c3fdc0` (dev 전용 테스트 계정, phone=`__dev_livever260817`).

| # | 항목 | 명령 | 결과 | 판정 |
|---|---|---|---|---|
| 1 | 목록 조회(초기) | `GET /api/bff/market/keyword-alerts?user_id=…` | `200 []` | 통과 |
| 2 | 등록 "Mũ bảo hiểm" | `POST /api/bff/market/keyword-alerts {"keyword":"Mũ bảo hiểm"}` | `201 {"id":"a680a038-...","keyword":"Mũ bảo hiểm"}`; DB `keyword_norm = "mu bao hiem"` | 통과 |
| 3 | 성조 다른 재등록 "mu bao hiem" | 동일 POST, keyword="mu bao hiem" | `201`(동일 id 반환, idempotent) + DB row count = 1 (신규 row 미생성) | 통과 (단, 상태코드가 idempotent 반환인데도 201 — 아래 발견사항 참조) |
| 4 | 1자 키워드 | `POST ... {"keyword":"a"}` | `422 {"detail":{"code":"keyword_too_short","min_length":2}}` | 통과 |
| 5 | `%` 리터럴 취급 | `POST ... {"keyword":"xe%"}` → `201`, `keyword_norm="xe%"`. 매칭 로직(`backend/app/noti_worker/__main__.py:182-217`)은 LIKE 대신 `strpos()` 사용 — SQL로 `strpos('xe may ban gia re', 'xe%')` 직접 실행 → `0` (매칭 안 됨, `%`가 와일드카드로 해석되지 않음) | 통과 |
| 6 | PATCH 수정 | `PATCH .../{id} {"keyword":"áo mưa"}` | `200 {"id":"a680a038-...","keyword":"áo mưa"}` | 통과 |
| 7 | 상한 도달 후 신규 등록 | 어드민 PUT으로 cap=3 임시 설정 → 사용자 보유 2개 상태에서 3번째("balo") `201`, 4번째("giay") `422 {"detail":{"code":"keyword_alert_limit","max_count":3}}` | 통과 |
| 8 | DELETE | `DELETE .../{balo_id}` | `204` | 통과 |
| 9 | 정리 | 남은 테스트 행("xe%", "áo mưa") 각각 `DELETE` → `204`×2. 이 유저의 최종 row count = 0. 테이블 전체 row count 15(원본과 동일) 확인 | 통과 |

결론: 검증 2의 8개 항목(GET/POST/dedup/422 too_short/`%`리터럴/PATCH/상한 422/DELETE) 모두 실측 통과.

## 발견한 결함 (고치지 않음, 기록만)

1. **idempotent 재등록이 201을 반환**: `POST /market/keyword-alerts` 에서 기존 row와 동일한 `keyword_norm` 이면 신규 row 대신 기존 row를 그대로 반환하는데, 이때 HTTP 상태 코드가 `201 Created`다(`backend/app/routers/market.py:1257-1266`, FastAPI 라우트 데코레이터 `status_code=201`이 idempotent 경로에도 그대로 적용됨). 의미상 200이 더 정확하나, 클라이언트가 응답 바디의 `id`로 신규/기존을 구분하지 않는다면 실사용 영향은 낮다.

## 원상복구 최종 확인

- `admin_accounts`: 임시 계정 `_live_verify_260817` 삭제 완료. 잔존 계정 3개(`kdi3939`/admin, `saigon`/manager, `wellconn`/manager) — 원래 상태와 동일. 삭제 후 해당 계정으로 로그인 시도 → `401` 확인.
- `app_config` (market.keyword_alert_max_count): `20`으로 원복, `GET /api/bff/app-config` 로 재확인.
- `app_config` (dm.unread_poll_interval): `30`으로 변경 없음 확인(원래도 30).
- `marketplace_keyword_alerts`: 테스트로 만든 4개 행(Mũ bảo hiểm→áo mưa, xe%, balo, 그리고 dedup으로 새로 생기지 않은 것) 전부 삭제, 테이블 총 row count 15 (검증 전과 동일).
- `.env`: 무변경 (검증 1은 방법 2로 진행해 `.env` 를 건드릴 필요가 없었음).
- 애플리케이션 코드/마이그레이션/docker-compose: 무변경.

## 불가 판정 항목

없음 — 모든 항목을 계획된 방법(우선순위 2: `admin_accounts` 직접 INSERT)으로 실측했다. `.env` 교체(방법 3)는 필요하지 않았다.
