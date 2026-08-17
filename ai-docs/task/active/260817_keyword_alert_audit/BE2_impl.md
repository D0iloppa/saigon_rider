# BE-2 구현 보고 — 키워드 알림 사용자당 상한(관리자 설정 가능)

## ① 변경 파일
- `backend/app/routers/admin_api/settings.py` — `ServiceConfigRow`/`ServiceConfigRequest`에 `keyword_alert_max_count: str` 추가. `get_service_config`: `app_config(group_name='market', key='keyword_alert_max_count')` 조회, 없으면 `"20"`. `update_service_config`: `1 <= int(x) <= 100` 검증(위반 시 400, `dm_val` 검증과 동일 형태로 나란히 추가), upsert, `audit(...)` 호출의 detail dict에 `keyword_alert_max_count` 포함(action/entity는 기존 `SETTINGS_SERVICE_CONFIG_UPDATE` / `app_config` / `dm.unread_poll_interval` 그대로 — 복합 설정이라 엔티티 키를 분리하지 않음).
- `backend/app/routers/app_version.py` — 공개 `GET /app-config` 화이트리스트에 `"keyword_alert_max_count": int(cfg.get("market.keyword_alert_max_count", "20"))` 한 줄 추가. 기존 키 이름 변경/제거 없음.
- `database/init/180_keyword_alert_max_count.sql` (신규) — `031_dm_poll_interval.sql`과 동일 패턴 시드: `INSERT INTO app_config (group_name, key, value, description) VALUES ('market', 'keyword_alert_max_count', '20', '...') ON CONFLICT (group_name, key) DO NOTHING;`
- `admin-frontend/src/api/settings.ts` — `ServiceConfig` 인터페이스에 `keyword_alert_max_count: string` 추가.
- `admin-frontend/src/pages/system/SettingsPage.tsx` — `ServiceConfigTab`에 DM 폴링 주기 입력 바로 아래 동일 마크업(`InputNumber` + `저장` `Button`, `min=1 max=100`)으로 필드 1개 추가. 프론트 검증도 DM 필드와 동일 수준(`1~100` 범위 체크 후 `message.warning`)만 미러링.

## ② 시드 여부 판단 근거
`dm.unread_poll_interval`은 **코드 기본값에만 의존하지 않고 실제로 시드 마이그레이션이 존재**함 — `database/init/031_dm_poll_interval.sql`이 `INSERT ... ON CONFLICT DO NOTHING`으로 `app_config`에 `('dm','unread_poll_interval','30',...)` 행을 심는다(`030_app_config_seed.sql`은 비어있는 플레이스홀더 — quest 관련 시드가 SGR-206에서 제거된 흔적만 남음). 이 선례를 따라 `keyword_alert_max_count`도 동일 패턴으로 시드 마이그레이션을 추가했다(코드 기본값 20과 시드값 20을 일치시켜 두 경로 모두 일관).

## ③ 마이그레이션 번호
`180_keyword_alert_max_count.sql`. 확인 시점 기준 `database/init/` 최대 파일은 `179_appointment_completion_request.sql`이었고 `git status --porcelain database/init/`가 비어있어(신규 미커밋 파일 없음) 180이 비어있음을 확인 후 사용. BE-1 워커가 동시에 180을 잡았을 가능성이 있으니 **머지/커밋 전 재확인 필요** — 충돌 시 이 파일을 181로 리네임할 것.

## ④ docker-compose.yml 에 필요한 조치
**필요함, 직접 수정 안 함(BE-1과 충돌 방지 지시에 따름).** `bff_migrate` 서비스(`docker-compose.yml:99` 부근)가 `database/init/*.sql`을 통짜로 마운트하는 게 아니라 파일 하나하나를 개별 volume mount + command 라인으로 등록하는 구조(`179_appointment_completion_request.sql`까지 등록된 것 확인, `docker-compose.yml:274-312` 근방 각 파일마다 2줄: `/migrations/NNN_x.sql` mount + `INSERT INTO schema_migrations...` command). **`180_keyword_alert_max_count.sql`을 이 목록에 volume + command 두 줄로 추가해야 실제 DB에 시드가 적용된다.** 이 조치 없이는 시드 행이 없고, 코드 기본값(20) 폴백으로만 동작한다(검증 결과 실제로 그렇게 확인됨 — ⑤ 참조).

## ⑤ 검증 실측 결과
1. **빌드**: `docker compose --env-file .env up --build -d bff admin_frontend` 실행 — bff, admin_frontend 모두 정상 빌드·기동. `docker compose ps bff` → `Up ... (healthy)`. `docker logs saigon_bff --tail 50 | grep -i error` → 출력 없음(임포트/기동 오류 없음).
2. **공개 앱 설정 엔드포인트** (실측):
   ```
   $ curl -s http://localhost:18090/api/bff/app-config
   {"dm_poll_interval":30,"keyword_alert_max_count":20,"google_client_id":"...","is_dev":true,"otp_dev_bypass":true}
   ```
   `keyword_alert_max_count: 20` 확인. 기존 키(`dm_poll_interval`, `google_client_id`, `is_dev`, `otp_dev_bypass`) 그대로 유지 — breaking change 없음.
3. **어드민 service-config GET/PUT — 미실측**. 사유: `verify_root_api`는 admin_session JWT 쿠키 필요, 로그인은 bcrypt 해시(`.env`의 `ADMIN_PASS_HASH`) 대조 방식이라 평문 비밀번호를 코드/문서 어디서도 찾을 수 없었음(`.env.example`엔 `change_me_admin_pass_hash` 플레이스홀더만 있음). 인증 없이 직접 호출한 결과는 `curl -s -o /dev/null -w "%{http_code}" http://localhost:18090/admin/api/settings/service-config` → `401`(라우트는 정상 마운트됨, 인증만 차단 — 404가 아니므로 라우팅 자체는 문제 없음을 간접 확인). 실제 유저 세션이 있는 세션에서 재검증 필요.
4. **범위 밖 값 400 — 코드 검증 로직만 오프라인 재현, API 레벨 미실측**(3번과 동일 사유로 인증 필요). Python으로 동일 검증식(`1 <= int(v) <= 100`)을 독립 재현: `0`→400 상당, `1`→ok, `100`→ok, `101`→400 상당, `20`→ok. 실제 라우터 코드(`update_service_config`)의 `try: kw_val = int(...); if not 1 <= kw_val <= 100: raise ValueError`와 완전히 동일한 로직임을 코드 대조로 확인.
5. **DB 시드 행 실측**: `docker exec saigon_db psql -U wellconn -d saigon_rider -c "SELECT * FROM app_config WHERE group_name IN ('market','dm');"` → `market.keyword_alert_max_count` 행 **없음**(예상대로, ④의 docker-compose.yml 미등록 때문). `dm.unread_poll_interval` 행은 존재(`30`, 기존 운영 데이터). `app-config` 응답이 20을 반환한 것은 코드 기본값 폴백 경로가 정확히 동작함을 실측으로 확인한 것.

## ⑥ 미완 항목
- 어드민 `service-config` GET/PUT 실제 API 호출 검증 — root 로그인 자격증명 부재로 미실행(위 ⑤-3,4).
- `180_keyword_alert_max_count.sql`을 `docker-compose.yml`의 `bff_migrate` 서비스에 등록하는 작업 — 담당 파일 범위 밖이라 미수행, 조치 필요(④ 참조). 등록 전까지는 시드 행이 DB에 없고 코드 기본값(20) 폴백으로만 동작(현재 상태로도 기능은 정상 — 어드민이 값을 바꾸면 그 시점에 upsert되어 row가 생김).
- 마이그레이션 번호(180) BE-1과 충돌 여부 최종 확인 — 병합 시점에 재확인 필요.
