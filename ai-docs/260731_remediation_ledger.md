# 출시 차단 결함 리메디에이션 원장 (Remediation Ledger)

> 개설: 2026-07-31 · 최종 갱신: 2026-07-31 (0단계 완료)
> **이 문서는 단일 원장(SoT)이다.** 세션이 끊겨도 이 파일만 읽고 이어받을 수 있게 유지한다.
> 대상 감사 문서 (수정 대상 결함의 출처):
> - [`260731_prelaunch_go_no_go_audit.md`](./260731_prelaunch_go_no_go_audit.md) — 실배포면·시크릿·실행검증 기준 (P0-1~6, F-01~F-06)
> - [`260731_launch_readiness_verdict.md`](./260731_launch_readiness_verdict.md) — 저장소 코드 기준 (F-1~F-21, S-1~S-7, N-1~N-6)
>
> 지시 출처: 이재훈 대표 (2026-07-31 19:21/19:24 카톡) — "2개 다 완벽히 끝내"
> 기준 커밋: `c8bc67c` → 작업 브랜치 `feat/info-map-poi-l3`
> 실행 환경: **개발서버** (WSL2, Docker 스택 구동 중). 운영서버는 별도 리눅스 — 이 원장의 작업은 개발서버 기준이며 운영 반영은 별도 배포 게이트.

## 운용 규칙

1. 각 항목의 체크박스는 **구현 완료 + 검증 통과**가 모두 끝났을 때만 체크한다. 구현만 된 상태는 `[~]`.
2. 항목을 닫을 때 **검증 방법과 결과**를 그 줄 밑 `검증:` 에 남긴다.
3. 코드로 닫을 수 없는 항목은 `⛔블로커` 로 표시하고 **누가 닫아야 하는지**를 명시한다. 임의로 체크하지 않는다.
4. 최종 결과보고서는 이 원장에서 파생 생성한다.
5. 상태 기호: `[ ]` 미착수 · `[~]` 구현완료/미검증 · `[x]` 완료+검증 · `[⛔]` 블로커(개발 범위 밖) · `[–]` 대표 결정 대기

---

## 0단계 · 검증 환경 실측 — 완료 (2026-07-31)

### 감사 문서의 환경 전제 정정 (3건이 사실과 다름)

| 감사 문서 주장 | 실측 결과 | 영향 |
|---|---|---|
| "Docker 및 WSL 배포판 부재로 fresh/existing-volume E2E 미실행" ([audit §4](./260731_prelaunch_go_no_go_audit.md)) | **오류.** Docker 28.1.1 + Compose v2.35.1 가용, saigon 스택 13개 컨테이너 구동 중 (`saigon_bff` healthy, `saigon_engine` healthy, `saigon_db`, `saigon_redis`, `saigon_nginx`, `saigon_worker`, `saigon_noti_worker`, `saigon_imgproxy`, `saigon_frontend`, `saigon_admin_frontend` 등) | migration·E2E 검증 **수행 가능** |
| "호스트 Python 의존성과 pytest 환경 부재로 backend·engine 전체 테스트 미실행" | **부분 오류.** 호스트 python은 3.8.10(사용 불가)이나, **컨테이너 이미지에 레포를 마운트하는 하네스로 실행 가능** (아래 검증 커맨드) | backend 199건·engine 62건 **실행 완료** |
| "native submodule 미초기화로 구성 검증 불가" ([verdict §9](./260731_launch_readiness_verdict.md)) | **오류.** 두 서브모듈 모두 클론됨 — `native/android`(`7043661`, heads/main), `native/ios`(`14acdcb`, heads/main) | 코드/구성 검증 가능. **단 서명빌드·실기기 E2E는 여전히 불가**(SDK·기기 부재 — 블로커 B-1) |

### 확정된 검증 커맨드 (이후 모든 단계에서 이것을 사용한다)

```bash
# backend 테스트 (레포를 컨테이너에 마운트 — /database/init·docker-compose.yml 참조 테스트 때문에 필수)
docker run --rm --env-file .env -e PYTHONPATH=/repo/backend \
  -v /mnt/c/DEV/saigon_rider:/repo -w /repo/backend --entrypoint sh saigon_rider-bff \
  -c 'pip install -q pytest pytest-asyncio pytest-mock >/dev/null 2>&1; python -m pytest app/tests -q -p no:warnings'

# engine 테스트
docker run --rm --env-file .env -e PYTHONPATH=/repo/engine \
  -v /mnt/c/DEV/saigon_rider:/repo -w /repo/engine --entrypoint sh saigon_rider-engine \
  -c 'pip install -q -r requirements-dev.txt >/dev/null 2>&1; python -m pytest -q -p no:warnings'

# 프론트
cd frontend && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
cd frontend && ./node_modules/.bin/eslint src/
node --test src/api/requestPolicy.test.mjs src/pages/shop/couponLaunchGate.contract.test.mjs \
  src/pages/info/infoLaunchSafety.contract.test.mjs src/pages/auth/oauthExchange.contract.test.mjs

# 재빌드 (호스트 npm 직접 실행 금지 — CLAUDE.md §1 C)
docker compose --env-file .env up --build -d <service>
```

### 0단계 기준선 (baseline, 수정 전)

- [x] Docker/Compose 가용성 확인 — **가용**
- [x] backend pytest 실행 — **198 passed / 1 failed / 1 collection error** (199건)
- [x] engine pytest 실행 — **62 passed / 0 failed**
- [x] frontend `tsc --noEmit` — **PASS (0 error)**
- [x] frontend `eslint src/` — **FAIL: 2 errors / 243 warnings**
- [x] frontend `.mjs` 계약 테스트 4종 — **4/4 PASS** (감사 문서의 "`requestPolicy.test.mjs` 미실행"은 해소됨 — `node --test` 로 실행되며 esbuild 불필요)
- [x] native 서브모듈 상태 — **클론됨**

### 0단계에서 새로 발견한 결함 (감사 문서에 없음)

| ID | 결함 | 근거 | 상태 |
|---|---|---|---|
| **X-1** | `/info/gas/stations/nearby-v2` 엔드포인트 부재 + 그것을 참조하는 stale 테스트 2건 | `backend/app/tests/test_gas_cached_distances.py:6`, `test_info_coordinates.py:76` | **[x] 해소 — 회귀 아님, stale 테스트였다.** 판별 근거: 제거 커밋 `5c52e54`(2026-07-22) 메시지가 *"데드코드 정리 — 미사용 엔드포인트(...gas...) 제거"* 로 **의도적 제거를 명시**(qm-reviewer SAFE 판정 기재). 호출자 전수 확인 결과 프론트·네이티브·백엔드 **전부 0건**(프론트 gas 호출은 `/info/gas/nearby` v1 뿐 — `api/info.ts:373`), 대체 경로 존재(`get_nearby_gas_stations`·`get_station_with_price`). 조치: `get_nearby_v2` import 와 v2 전용 테스트 1건 제거, `test_info_coordinates` 의 endpoints 목록에서 해당 경로 제거. **커버리지 손실 없음** — 삭제한 v2 테스트가 검증하던 "캐시 히트 시 거리 재계산·재정렬"은 같은 파일의 `test_v1_cache_hit_recomputes_distance_and_order` 가 동일 헬퍼로 이미 커버(제거 전부터 존재한 중복 테스트) |
| **X-2** | ESLint 2 errors 의 실체는 `.mjs` 테스트 파일용 globals 미설정(`no-undef`: `AbortController`·`setTimeout`) — 프로덕션 코드 결함 아님 | `frontend/eslint.config.js` | **[x] 해소** — `eslint.config.js` 에 `files: ['**/*.test.mjs']` 블록을 추가하고 이미 설치돼 있던 `globals` 패키지의 `globals.node` 를 `languageOptions.globals` 로 선언(9줄). **금지 방식 미사용** — 개별 파일 `eslint-disable`·규칙 전역 off·`no-undef` off 전부 안 씀. 결과 **0 errors** |
| **X-3** | **migration 적용 이력 원장 테이블 부재** — `saigon_db` 에 `schema_migrations`/`alembic_version` 류 테이블이 없어, 기존 볼륨에 어느 SQL이 적용됐는지 **코드로 확정할 수 없다** | `docker exec saigon_db psql -c "\dt"` 결과 무매치 | 미착수 — F-20/P0-4 해소의 선행 조건 |
| **X-4** | `bff_migrate` 실행 목록에 **157** 이 이미 추가돼 있음(감사 문서는 156까지로 기재). 단 **139~144, 147 공백은 그대로** | [`docker-compose.yml`](../docker-compose.yml) `bff_migrate.command` | F-20 항목에 병합 |

---

## 블로커 (개발이 닫을 수 없는 항목 — 소관 명시)

| ID | 블로커 | 막힌 이유 | 소관 |
|---|---|---|---|
| **B-1** | 서명된 Android/iOS 빌드 + 실기기 E2E (GPS 권한·백그라운드 이동·FCM 등록/회전/딥링크·OAuth 3종 복귀·오프라인) — [F-03](./260731_prelaunch_go_no_go_audit.md), [verdict §9](./260731_launch_readiness_verdict.md) | 개발서버에 Android SDK·Xcode 없음, 실기기·서명키 없음 | 대표/모바일 담당 |
| **B-2** | Zalo app secret 폐기·재발급 — [P0-2](./260731_prelaunch_go_no_go_audit.md) | Zalo 개발자 콘솔 자격 필요 | 대표 |
| | ↳ **2026-07-31 확정**: 전체 스캔 완료 → **재발급 대상은 Zalo 1건뿐**(`.env` 미커밋, Apple private key·Google secret 은 placeholder, 자격증명 파일 미추적). 유출 위치는 `104_*.sql` 의 **주석 줄**(커밋 `cc11743` 부터). **현재 트리의 실값 5건은 제거 완료**(`103`·`104` 주석 → `<RUNTIME_ONLY>`, dev DB 무영향 실측). Git 이력의 옛 값은 남지만 재발급하면 무해. 상세는 [최종보고서 §8](./260731_remediation_final_report.md) | |
| | ↳ **레포가 PUBLIC** 상태(fork 0건) — private 전환 필요. 단 전환은 B-2 를 **대체하지 않는다**(공개 기간 clone 회수 불가) | 대표 |
| **B-3** | `ENGINE_SERVICE_KEY` 회전 + 모바일/BFF identity 분리 후 **신규 앱 빌드 배포** — [P0-1](./260731_prelaunch_go_no_go_audit.md) | 키 회전은 운영 자격, 앱 재배포는 스토어 절차 동반 | 대표 |
| **B-4** | 운영서버 실배포 drift 해소 + readiness 200·strict CORS·보안헤더·운영 endpoint 비공개 **외부 재검증** — [P0-3](./260731_prelaunch_go_no_go_audit.md) | 운영 리눅스 접근 + 배포 승인 필요. 운영은 2026-06-04 스냅샷([S-6](./260731_launch_readiness_verdict.md))이라 배포 자체가 고위험 이벤트 | 대표 |
| | ↳ **2026-07-31 심각도 하향(대표 지적)**: 운영서버는 **아직 실서비스가 아니며** 1차 출시 가능 수준 도달 후 공개된다 → "구버전이 실사용자를 노출"은 과한 프레이밍. **긴급 사고가 아니라 출시 전 체크리스트**로 이동. 단 `app.saigon-rider.com` 이 **지금도 공개 응답**하므로(방치된 구버전 빌드) 출시 전까지 **내리거나 인증 게이트를 거는 것**이 배포보다 싸고 안전 | |
| **B-5** | 외부 암호화 백업·restore drill·RPO/RTO 측정·경보·온콜 — [P0-6](./260731_prelaunch_go_no_go_audit.md), [F-16](./260731_launch_readiness_verdict.md) | 운영서버·스토리지·모니터링 인프라 결정 필요 (스크립트 작성은 개발 가능, 실행·측정은 운영) | 대표 |
| **B-6** | 약관·개인정보처리방침 **문안 확정** — [P0-5](./260731_prelaunch_go_no_go_audit.md), [F-9/F-10](./260731_launch_readiness_verdict.md) | 법무 검토 필요. 구현(동의 캡처·purge)은 문안 확정 전에도 선행 가능 | 대표/법무 |
| **B-7** | 운영 `.env` 실값 확인 — 특히 `SMS_PROVIDER_API_KEY` 미설정 시 가입·판매 **전면 차단**([S-7](./260731_launch_readiness_verdict.md)) | 운영서버 실측 | 대표 |
| **B-8** | 운영 DB의 실제 migration 적용 상태 (X-3로 코드 확정 불가) | 운영 DB 접속 필요 | 대표 |
| **B-9** | 제품·경영 결정 6건 — 서비스 경계(S-3) / 행정구역 삼중체계(S-4) / 업체 시딩 방식(S-2·N-1) / RP sink(S-1) / 광고 노출·결제(N-3·N-4) / 약관 문안(B-6) | 개발이 정할 수 없음 — [verdict §8.3](./260731_launch_readiness_verdict.md) | 대표 |

---

## 1단계 · 즉시 차단 (보안·안전 P0)

- [x] **F-1** `GET /api/users/search` — 세션 의존성 추가, `phone` 부분일치(`ilike '%q%'`) 제거, `deleted_at` 필터 추가 · `backend/app/routers/users.py:355-374`
  변경: `Depends(verify_user_session)` 추가 / `User.phone.ilike('%q%')` → `User.phone == query` 정확일치 / `User.deleted_at.is_(None)` 추가. 닉네임 부분일치는 유지(검색 기능 자체는 보존).
  검증: `backend/app/tests/test_idor_p0_fixes.py::F1SearchUsersTest::test_rejects_without_session_headers`, `F1SearchUsersQueryTest::test_phone_match_is_exact_and_excludes_deleted`. **수정 전 FAIL 실증** — 라우터를 `git stash` 후 재실행해 419 미반환·SQL 에 phone `ILIKE` 잔존·`deleted_at` 필터 부재를 재현 확인.
- [x] **F-2** `GET /api/quests/ride-trail` — 세션 + 소유자 검사 (원본 GPS 궤적 500점 무인증 노출) · `backend/app/routers/quests.py:285-320`
  변경: `verify_user_session` + `engine_client.lookup_device_map(session_uid)` 의 `device_uuid` 와 요청 `device_uuid` 대조 → 불일치 또는 **조회 실패 시 403(fail-closed)**. BFF는 Engine DB 직접 접근 금지 규약을 지켜 `engine_client` 경유.
  검증: `F2RideTrailTest::test_rejects_without_session_headers`, `F2RideTrailOwnershipTest::test_rejects_device_not_owned_by_session_user`, `test_lookup_failure_fails_closed`. 수정 전 FAIL 확인(200 반환).
- [x] **F-3** `GET /api/quests/active-card` — db·세션 의존성 자체가 없음, 추가 + 소유자 검사 · `backend/app/routers/quests.py:276-291`
  변경: `db` + `verify_user_session` 의존성 신규 추가, `db.get(UserQuest, user_quest_id)` 후 `uq.user_id != session_uid` → 404.
  검증: `F3ActiveCardTest::test_rejects_without_session_headers`, `F3ActiveCardOwnershipTest::test_rejects_non_owner_user_quest`, `test_rejects_missing_user_quest`. 수정 전 FAIL 확인.
- [x] **F-4** `follows.py` GET 4종 무인증 + 헤더 `x_user_id` 원시 신뢰 제거 (같은 파일 POST/DELETE는 이미 세션 요구 — 비대칭 해소) · `backend/app/routers/follows.py`
  변경: `get_followers`/`get_following`/`get_follow_counts`/`get_friends` 4종에 POST/DELETE 와 동일한 `verify_user_session` 적용. `x_user_id: Header(None)` 파라미터와 그 유일한 소비자였던 `_parse_viewer_id()` 헬퍼 제거(내 변경으로 발생한 고아), `is_following` 뷰어를 세션 uid 에서 도출.
  검증: `F4FollowsGetEndpointsTest` 5건 — 4개 엔드포인트 + **위조 `X-User-Id` 헤더만으로는(유효 세션 토큰 없이) 거부됨을 증명하는 테스트 1건**. 수정 전 전부 200 반환 확인.
- [x] **F-5** `GET /api/users/{id}/profile` — 세션 필수화 + `requester_id` 쿼리 신뢰 제거 + `deleted_at` 필터 · `backend/app/routers/users.py:315-341`
  변경: `requester_id: uuid.UUID | None` 쿼리 파라미터 **삭제** → `viewer_id: uuid.UUID = Depends(verify_user_session)` (**세션 필수** — 1차 작업의 `optional_user_session` 은 감독 지적으로 교체) / `User.deleted_at.is_(None)` 추가 → 익명화 `del_<hex>` 계정 200 반환 차단.
  **세션 필수화 전 호출부 전수 감사(감독이 조건으로 요구)**: `fetchUserProfile` 의 유일한 소비자는 `frontend/src/components/ProfileCard.tsx:130`, 이는 `FeedList`/`FeedDetail`/`FollowerList`/`FollowingList` 에서만 렌더되고 해당 라우트 4개(`/feed`, `/feed/post/:postId`, `/followers/:userId`, `/following/:userId`) 전부 `<PrivateRoute>` 로 감싸져 미인증 시 `/splash` 리다이렉트. 딥링크 진입점 `LinkRouter.tsx` 도 미인증자를 무조건 `/splash` 로 보내며 지원 `action` 목록에 **공개 프로필 공유가 없다** → 로그인 전 도달 경로 0건 확인 후 적용. **제품 결정 사안 아님으로 판정.**
  고아 정리(이 변경이 유발): `frontend/src/api/profile.ts:58` 의 `requesterId` 파라미터·`requester_id` 쿼리 조립 제거, `ProfileCard.tsx:130` 호출부 `fetchUserProfile(userId)` 로 수정, `optional_user_session` import 제거.
  검증: `F5UserProfileTest::test_rejects_without_session_headers`(헤더 없이 → 419), `test_excludes_soft_deleted_users`, `test_requester_id_query_param_no_longer_accepted`, `test_viewer_is_mandatory_session_not_optional`(어노테이션이 `uuid.UUID` 이고 `| None` 이 아님을 단정 = optional 회귀 방지). **수정 전 FAIL 실증** — `git stash` 로 되돌려 4건 전부 실패(419 대신 200 등) 재현.
- [x] **F-11 / F-01** 침수 예측 fail-open — 해소 (잔여 갭 1건은 대표 판단 대상, 아래 ⚠️) · `backend/app/jobs/predict_flood_risk.py:27-137`, `backend/app/routers/info_flood.py:424`, `frontend/src/pages/info/InfoFloodMap.tsx`
  변경(완료분): `_max_pop_24h` 가 비200/예외 시 `0.0` → **`None`** 반환("실패"와 "정상 조회했으나 강수확률 0%"를 구분). `run_flood_risk_prediction` 이 구역을 성공/실패로 분리 → 무조건 `DELETE FROM flood_risk_daily` 제거, **성공 구역만** `WHERE district_code IN (...)` 삭제·재삽입하고 **실패 구역은 손대지 않고** `is_stale = TRUE` 마킹으로 마지막 성공 snapshot 보존. 반환 dict 에 `status: "degraded"` / `failed_districts` 추가. `get_map_data` 는 `is_stale` 를 additive 필드로 통과(기존 스키마 무파괴). 프론트는 `hasStaleRisk` 파생 + 개별 엔트리 stale 시 주황 위험배지 → 중립 아이콘·`riskStaleBadge` 로 분리, `WorldMapV2` 의 `unavailable` 패턴 미러링. i18n `info.flood.unavailableTitle`·`riskStaleBadge` ko/en/vi 3종 추가. 신규 SQL `database/init/158_flood_risk_daily_stale_flag.sql`(`ADD COLUMN IF NOT EXISTS is_stale`).
  검증(완료분): `backend/app/tests/test_predict_flood_risk.py` 3건 — `test_provider_failure_is_not_recorded_as_zero_risk`(전체 DELETE 부재·성공구역만 삭제·실패구역 `is_stale` UPDATE·실패구역 INSERT 제외), `test_all_districts_succeed_is_ok_status`, `test_stale_risk_row_surfaces_is_stale_flag`. **수정 전 FAIL 실증** — 구버전이 `None` 을 다룰 수 없어 `TypeError` 로 버그 재현.
  ✅ **배선 누락 해소(감독 실측으로 적발 → 수정 완료)**: 최초 작업에서 `158` 이 `bff_migrate` 에 미등록이고 dev DB 에 `is_stale` 컬럼이 없는데 `info_flood.py:424` 가 그것을 SELECT 해 **침수 map-data API 가 UndefinedColumn 으로 실패하는 상태**였다(워커의 "레포에 마이그레이션 러너 없음" 보고는 사실과 달랐음 — `bff_migrate` 존재). 조치: `docker-compose.yml` 의 `bff_migrate` `command` + `volumes` 양쪽에 158 등록(157 형식 미러링, 2줄만 수정) / dev DB 에 직접 적용 / `bff` 재빌드 후 `bff_migrate` 재실행이 `already exists, skipping` 으로 멱등 확인.
  검증(감독 재실측): `\d flood_risk_daily` → `is_stale | boolean | not null | false` **존재 확인** · `grep -c "158_flood" docker-compose.yml` → **2**(command+volumes) · 실제 API `GET /api/bff/info/flood/map-data?lat=10.7756&lng=106.7019&radius_km=30` (세션 헤더 포함) → **200**, `hotspots`/`reports`/`risks` 정상 JSON.
  ✅ **fail-open 24시간 후 재발 — 원인 규명 후 해소**: 보존된 stale 행의 `expires_at` 이 **원래 성공 시점** 기준으로 고정돼 있어, `get_map_data` 의 `WHERE expires_at > NOW()` 필터가 첫 실패로부터 24시간 뒤 그 행을 조용히 탈락시켜 "안전" 착시가 부활하는 구조였다. 조치: 실패 구역 `UPDATE` 가 `is_stale = TRUE` 와 함께 **`expires_at` 을 이번 실행의 24h 창으로 갱신** → 잡이 계속 도는 동안 장애가 길어져도 stale snapshot 이 계속 노출된다.
  📌 **감독의 지시가 틀렸고 워커가 반박해 정정된 지점**: 감독은 "빈 결과 = 성공한 예측 없음 → unavailable 렌더"를 지시했으나, 잡은 `if pop < _THRESHOLD: continue` 로 **저위험 구역에 애초에 행을 만들지 않는다**. 즉 **빈 결과는 성공한 실행의 정상·다수 결과(맑은 날)** 이며, 지시대로 했으면 맑은 날마다 오작동했다. 워커 판단이 옳아 미적용.
  ⚠️ **잔여 갭(2단계 판단 대상)**: **한 번도 성공한 적 없는** 구역/핫스팟(신규 생성 직후 즉시 장애)은 보존할 이전 행이 없어 부재로 표시되고, 이는 "정상적으로 저위험"과 구별되지 않는다. 구분하려면 **마지막 성공 실행 시각/상태의 영속화**(추가 schema 변경)가 필요 — 감사 문서는 이 경우 대안으로 *"출시 전 완료 불가 시 예측 위험도 노출 비활성화"* 를 제시한다. 대표 판단 필요.
  📌 별건 관찰(미조치): 공용 `dev-login`(phone 없는 `__dev_test__` 변형)이 `user_oauth_identities` 고아 행 때문에 `UniqueViolationError` 로 깨져 있다 — 기존 dev 데이터 오염 이슈로 이번 범위 밖.
- [x] **F-06** 사업자 검증 문서 content **소유권 미검사** + 공개 contents 체계 사용 → 소유권 검사 + private ACL **완료** (아래 1단계 조치 후 2단계에서 잔여 갭까지 해소 — [F-06 잔여](#) 항목 참조, `contents.is_private` 플래그 전환) · `backend/app/routers/biz.py:121-129,262-263`, `backend/app/routers/contents.py:189-224`
  변경 ①: `_require_owned_content(db, content_id, user_id)` 신규 — 존재 여부만 보던 것을 `owner_type == "user" and owner_id == session_uid` 대조로 강화. `submit_verification` 의 `biz_license_content_id`·`signboard_content_id` 양쪽에 배선.
  변경 ②: `GET /contents/{id}` 에 `_is_sensitive_content()` 게이트 추가 — 민감 문서는 소유자(`optional_user_session`) 또는 관리자(`admin_session` 쿠키) 만 조회 가능, 그 외 404. 비민감 content 는 기존대로 완전 공개(과차단 없음을 회귀 테스트로 고정).
  검증: `test_biz_verification_content_ownership.py::test_foreign_content_id_is_rejected`(타인 content UUID → 400, 수정 전 FAIL 실증) + `test_own_content_id_is_accepted`(회귀 가드) / `test_contents_sensitive_gate.py` 3건 — 타인·익명 → 404(수정 전 FAIL), 소유자 → 200, 비민감 → 200.
  ✅ **감독 검증에서 발견했던 잔여 갭 → 2단계에서 해소 완료**: 민감 판정이 `contents` 자체의 속성이 아니라 **`BusinessProfile.biz_license_content_id`/`signboard_content_id` 역참조**(`contents.py:189-199`)다. 따라서 ⓐ 업로드 직후 `submit_verification` 전까지는 **공개 상태**, ⓑ 검증 반려로 참조가 끊기면 **다시 공개**, ⓒ 모든 공개 content GET 마다 추가 쿼리 1회(핫패스 비용). 감사 문서가 요구한 것은 "private ACL" 이므로 **`contents` 에 비공개 플래그를 두고 업로드 시점에 지정하는 방식이 정본** — migration 이 필요해 2단계로 이관한다.
  📌 미구현(지시대로 보고만): 관리자용 **단기 서명 URL** 미설계. 현재 어드민 문서심사는 `admin_api/biz.py` 가 `BusinessProfile` 직접 조인 + `build_imgproxy_url()` 로 처리해 `GET /contents/{id}` 를 경유하지 않으므로 이 게이트에 영향 없음.
  📌 손대지 않은 인접 문제: `apply`/`update_profile` 의 `photo_content_id` 는 여전히 존재만 확인(`_require_content`). 동일한 UUID 재사용 패턴이나 비민감 공개 사진이고 감사 범위 밖.
- [x] **F-05** 미검증 업체 광고의 **상세 조회 게이트 우회** — 목록은 `verification_status='verified'` 요구, 상세는 `is_active`+`APPROVED`만 검사 · `backend/app/modules/ads/application.py:232-241`
  변경: 임시 필터(`is_active == True, review_status == "APPROVED"`)를 제거하고 **`*launching_ad_conditions(datetime.now(UTC))` 재사용** — 목록/통계 경로와 동일한 게이트(`ad_gating.py`)를 공유. 게이트 로직 복제 없음(`profile_public_ads` 의 기존 패턴 미러링).
  검증: `test_ad_detail_gate.py::test_public_ad_query_reuses_verified_owner_gate` — 컴파일된 SQL 에 `verification_status` / `owner_business_profile_id IS NULL` EXISTS 게이트 포함을 단정. 수정 전 FAIL(SQL 에 `verification_status` 부재) 실증.
  동반 수정: `frontend/src/pages/market/AdDetail.tsx` — 게이트로 404 가 늘어나는데 기존 코드는 실패 시 `ad=null, loading=false` 로 **영구 스켈레톤**을 렌더했다. `toast.error` + `navigate(-1)` 로 교체(`BizPublic.tsx` not-found 패턴 미러링). 문구는 `t(..., {defaultValue})` 인라인 — 같은 파일의 기존 광고 문구 방식과 동일.
- [x] **P0-1 (코드 범위)** 공개 `/api/sre/*` 에서 특권·경제 변경 경로 nginx allowlist 차단 · [`nginx/conf.d/default.conf`](../nginx/conf.d/default.conf) `:113-141`
  변경: prefix 전체 프록시(`location /api/sre/`) → **`location = /api/sre/sreMessage` 정확매치 1건만 통과 + 그 외 `return 404` 기본거부**. allowlist 근거는 추측이 아니라 호출부 전수 확인 — 공개 `/api/sre/*` 실제 호출자는 모바일 GPS ingest 하나뿐(`native/android/.../AppConfig.java:13`, `native/ios/Shared/AppConfig.swift:28`). BFF→Engine 은 `backend/app/engine_client.py:9` 로 `http://engine:8090` 직결이라 nginx 미경유 → 영향 없음.
  검증: `docker exec saigon_nginx nginx -t` PASS + reload. curl 실측 — 허용 `/api/sre/sreMessage` POST **401**(Engine 도달, 키 없음)·GET **405**(라우트 도달) / 차단 `openapi.json`·`metrics`·`docs`·`users/{id}/credit-rp`·`admin/action-definitions`·`gacha/pull`·`shop/purchase`·`device-map`·`season/current`·`inventory/{id}/equip` **전부 404** / 회귀 `/api/bff/health` **200**. 변경요청(POST/PATCH/DELETE) 실발송 없음(비파괴).
  감독 교차검증: 프론트에 `Service='sre'` 를 넘기는 호출부 **0건**(`frontend/src/api/client.ts:20` 타입 정의만 존재) — 워커 주장 확인. dev/prod 모두 `docker-compose.yml` 의 `./nginx/conf.d` 마운트를 공유하므로 conf 1개로 양쪽 동일 적용(`docker-compose.prod.yml` 은 `ports` 만 override).
  ⚠️ **닫히지 않은 부분**: `sreMessage` 자체는 여전히 전역 `ENGINE_SERVICE_KEY` 단일 비교(`engine/app/deps.py:12`, `engine/app/routers/message.py:25`)에 의존한다. 앱에서 키가 추출되면 **임의 GPS/이벤트 스트림 주입은 여전히 가능**하다(특권·경제 변경은 차단됨). 근본 해소는 키 회전 + 사용자·기기·만료 결속 단기 토큰 = **B-3**.
  📌 신규 관찰(범위 밖, 미조치): `/engine/` 내부전용 location(`default.conf:202`, `allow 172.16.0.0/12; deny all;`)이 호스트 curl 시 403이 아니라 404 JSON 을 반환 — 기존 동작이며 원인 미조사.
- [⛔] **P0-1 (운영 범위)** 키 회전 + identity 분리 + 신규 앱 배포 → **B-3**
- [⛔] **P0-2** Zalo secret 폐기·재발급 + Git 이력 감사 → **B-2**

### 1단계 종료 상태 (2026-07-31)

**닫힌 것**: F-1 · F-2 · F-3 · F-4 · F-5 · F-05 · F-11/F-01 · P0-1(코드 범위)
**부분 해소로 2단계 이관**: F-06(private ACL 을 역참조 → `contents` 비공개 플래그로 전환, migration 필요)
**대표 판단 대상 신규 1건**: F-11 잔여 갭 — 한 번도 성공한 적 없는 구역의 unavailable 구분(추가 schema vs 예측 노출 비활성화)
**테스트 증가**: backend 199 → **226건** (신규 11건: `test_idor_p0_fixes.py` 14 assertions 상당, `test_predict_flood_risk.py` 3, `test_ad_detail_gate.py` 1, `test_biz_verification_content_ownership.py` 2, `test_contents_sensitive_gate.py` 3)
**최종 검증**: backend **224 passed / 신규 실패 0** (기존 예외 2건 = X-1 유지) · `tsc --noEmit` **0 error** · 침수 map-data API **200 실측** · nginx allowlist **curl 13경로 실측**

**커밋**: `826d7b5` — 27 files, +1,526/-56. `feat/info-map-poi-l3` 브랜치.
- locales 3종은 이 세션 이전의 미커밋 변경(biz `editPhoto` 키)이 같은 파일에 섞여 있어, **침수 키 hunk 만 필터링해 스테이징**했다(무관 변경 유입 없음 — 스테이징된 JSON 을 파싱해 `info.flood.unavailableTitle` 존재·`biz.editPhoto` 부재로 검증).
- pre-commit(ruff) 이 신규 테스트에서 `B017`(blind `Exception` assert → `AdsError`), `B905`(`zip(strict=)`) 를 잡아 수정 후 통과. ruff-format 자동정리분도 포함해 재검증(224 passed 동일).
- 세션 이전 미커밋 작업(`auth.py`·`App.tsx`·`Splash`·`BizManage`·`.env.example`·`docker-compose.prod.yml`·`frontend-page-map.md` 등)은 **커밋에 포함하지 않았고 stash/pop 으로 온전히 복원 확인**.

**📌 ADR 부재 발견**: `manage_adr(get, project=mnt-c-DEV-saigon_rider)` 조회 결과 **ADR 이 아예 없다**(`status: no_adr`, sections 0개). CLAUDE.md 는 "프론트 화면 관련 질문을 받으면 ADR 을 먼저 조회 — 메뉴 구조·SoT 위치·알려진 갭이 여기 있다"고 규정하지만 그 전제가 성립하지 않는다. 이번 1단계 변경은 라우트 추가/삭제·메뉴 구조 변경이 없어 `frontend-page-map.md` 동기화는 불필요하나, **ADR 신규 작성 자체는 이 리메디에이션 범위 밖의 별건 과업**이므로 감독이 임의 작성하지 않고 기록만 남긴다.

---

## 2단계 · 계약·데이터 정합

- [x] **F-06 잔여(1단계에서 이관)** 민감 content 판정을 `BusinessProfile` 역참조 → **`contents.is_private` 플래그**로 전환 · `backend/app/routers/contents.py`, 신규 `database/init/161_contents_is_private_flag.sql`
  검증문서 업로드 구분 수단: 기존엔 없었다(프로필 사진·소식 사진·검증문서가 전부 동일 경로, `owner_type='user'` 만 존재). `/contents/upload` 에 **`is_private: bool = Form(False)`** 추가(하위호환 기본값 false, additive) + 유일한 검증문서 업로더 `frontend/src/pages/biz/BizVerification.tsx:86-91`(사업자등록증·간판 공용 핸들러)가 `is_private='true'` 전송.
  migration: `ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE` + 기존 `business_profile` 참조 content 백필. dev DB 적용 실측 성공(감독 재확인: `\d contents` → `is_private | boolean | not null | false`). **백필 대상 0건** — dev DB 에 검증 제출된 프로필 자체가 0건이라 **백필 SQL 은 실데이터로 검증되지 않았다**(운영 DB 적용 시 결과 확인 필요).
  검증: `test_contents_sensitive_gate.py` 재작성 — 기존 계약 3건(타인/익명 404, 소유자 200, 비민감 200)을 플래그 기반으로 유지 + 신규 `test_private_content_blocked_before_profile_link` (ⓐ **업로드 직후 프로필 미연결 상태에서도 차단**됨을 단정하고, `db.execute` 호출이 1회뿐임을 확인해 역참조 쿼리 소멸 = ⓒ 해소도 증명). backend **233 passed / 신규 실패 0**.
  ⓐⓑⓒ 해소 상태: ⓐ 해소(플래그가 업로드 시점에 설정) · ⓑ 해소(참조와 무관) · ⓒ 해소(추가 쿼리 제거).
  ⚠️ **잔여 약점**: 민감 여부를 **클라이언트가 보내는 플래그로 판정**한다. 서버가 업로드 용도를 독립적으로 알 방법이 없어서인데, 결과적으로 ① 클라이언트가 `is_private` 를 빼먹고 검증문서를 올리면 공개가 되고 ② 향후 다른 화면이 범용 업로드로 민감문서를 올리면 같은 사고가 난다. 현재는 업로더가 자기 문서의 소유자이고 타인 문서 첨부는 1단계 소유권 검사로 막혀 있어 즉각적 유출 경로는 아니다. 서버측 용도 판정(전용 업로드 엔드포인트 등)은 API 계약 변경이라 별건.
  📌 revert 기반 "수정 전 FAIL" 은 미실증 — 구버전 코드엔 `is_private` 필드가 없어 구조적으로 통과 불가(`AttributeError`)라는 근거로 대체. 1단계 워커들이 한 실증 수준보다는 약하다.
- [–] **F-11 잔여(1단계에서 이관, 대표 판단 선행)** 한 번도 성공한 적 없는 구역의 "정상적 저위험"과 "확인 불가" 구분 — 마지막 성공 실행 시각/상태 영속화(schema 변경) vs 감사 문서의 대안인 예측 위험도 노출 비활성화. **B-9 결정 대기**
- [x] **F-9** 가입 시 약관·개인정보 **동의 캡처 0건** 해소 · `backend/app/models.py`(User.consent_agreed_at/consent_terms_version/consent_privacy_version), `backend/app/routers/profile.py`(`POST /profile/consent`), `frontend/src/pages/auth/ProfileSetup.tsx`, `frontend/src/pages/auth/OAuthLogin.tsx:307-313`, `database/init/163_user_consent_capture.sql`
  설계: 단일 체크박스가 두 문서에 동시 동의하는 현 UI를 반영해 `agreed_at` 은 1개, 문서별 버전(`terms_version`/`privacy_version`)은 분리(향후 한쪽만 개정될 수 있어 근거를 남김). 버전값은 새 문안을 짓지 않고 이미 존재하는 `legal.privacyHtml`/`termsHtml`(양쪽 "시행일: 2026년 6월 1일")의 시행일을 그대로 사용(`2026-06-01`) — B-6 문안 확정과 무관하게 이미 배포된 문서.
  정책 화면: `PrivacyPolicy.tsx`/`TermsOfService.tsx`(`/settings/privacy`/`/settings/terms`)가 **이미 존재**(신규 작성 없음) — 다만 `PrivateRoute`로 로그인 후에만 열람 가능했다. `OAuthLogin.tsx`(로그인 전)에서 실제로 열람 가능해야 하므로 두 라우트의 `PrivateRoute` 래퍼를 제거(App.tsx). 두 화면은 정적 텍스트만 렌더해 공개해도 안전.
  가입 차단 지점: OAuth 콜백(Zalo/Google/Apple 네이티브, dev-login 포함 5경로)이 서버측에서 계정을 즉시 생성해 로그인 버튼 클릭 시점엔 체크박스로 계정생성 자체를 막을 수 없는 구조 — 대신 신규 유저가 반드시 통과하는 `/auth/profile-setup`(제출·건너뛰기 두 경로 모두)에 동의 체크박스를 두고 미체크 시 두 버튼 모두 비활성화, 체크 후에도 `POST /profile/consent` 가 성공해야 진행.
  placeholder i18n 키(문안 아닌 UI 라벨, B-6 무관): `profileSetup.consentPrefix`/`consentTermsLink`/`consentMid`/`consentPrivacyLink`/`consentSuffix`/`errorConsentRequired` (ko/en/vi 3종).
  테스트: `backend/app/tests/test_profile_consent.py` 3건(세션 없이 419, 타인 user_id 403, 정상 기록 시 agreed_at/버전 저장+commit) — **수정 전 FAIL**: `save_consent`/`ConsentSaveRequest` 자체가 부재해 `ImportError`(신규 코드, revert 불필요). 라이브 실측: dev-login → `POST /profile/consent` → DB `consent_agreed_at`/`consent_terms_version`/`consent_privacy_version` 실제 기록 확인, 세션 헤더 없이 호출 시 **419** 확인.
  ⚠️ **감독 적발 우회 구멍 → 해소 (2026-07-31)**: `/auth/profile-setup` 진입이 "최초 로그인 직후 1회"뿐이라(`OAuthLogin.tsx:60,72,232`, `OAuthResult.tsx:46` 전부 `is_new ? profile-setup : /home`), 체크박스를 누르지 않고 앱을 닫거나 URL로 `/home` 직행 후 재실행하면 세션 유효+`is_new=false`로 동의 없이 서비스에 도달할 수 있었다(`consent_agreed_at` 영구 NULL, 막는 게이트 없음). 조치: **판정 근거를 서버 값으로 이동** — `UserOut`(→`LoginResponse`/`OAuthLoginResponse`, 즉 `/auth/me`·`/auth/session/verify`·`/auth/oauth/*`·`/auth/dev-login*` 전부)에 `consent_agreed_at` 필드 추가. 프론트 `PrivateRoute.tsx`(모든 서비스 화면의 단일 진입점)에 F-19(강제업데이트) 와 동일한 "부팅 후 조건부 대체 렌더" 패턴을 미러링해 `user?.consentAgreedAt === null` 이면 `/auth/profile-setup`(기존 화면 재사용, 신규 화면 없음)으로 리다이렉트. **fail-open**: 필드 자체가 없는(undefined) 판정 불가 상태는 엄격한 `=== null` 비교라 통과 — 넓은 falsy 체크(`!user?.consentAgreedAt`)로 회귀하면 전원이 갇히는 사고이므로 계약테스트로 그 회귀 자체를 고정. ProfileSetup 이 `POST /profile/consent` 응답을 store 에 즉시 반영(`markConsentAgreed`)하지 않으면 `navigate('/home')` 직후 PrivateRoute 가 곧바로 되돌려보내는 bounce가 나서 이것도 함께 배선.
  **기존 계정 영향(대표 공지 필요)**: 이 게이트는 과거(이번 조치 이전)에 가입해 `consent_agreed_at` 이 NULL 인 **모든 기존 계정**에도 적용된다 — 다음 로그인부터 `/auth/profile-setup` 으로 1회 우회되어 체크박스 동의를 완료해야 서비스 화면에 들어갈 수 있다. 마이그레이션으로 기존 계정에 동의를 소급 기록하지 않았다(증빙 없는 동의를 위조하는 것이므로 금지 지시 준수). 현재 dev DB 는 실사용자가 없어(테스트 계정뿐) 영향 없음.
  추가 테스트: `backend/app/tests/test_session_verify_consent_payload.py` 2건(`/auth/session/verify` 응답이 미동의=null/동의=timestamp 를 그대로 실어나름) · `frontend/src/components/auth/privateRouteConsentGate.contract.test.mjs` 4건(게이트 존재·엄격 null 비교(넓은 falsy 회귀 감시)·profile-setup 라우트가 PrivateRoute 밖에 있어 무한루프 없음·ProfileSetup 의 store 동기화). **수정 전 FAIL 실증**: PrivateRoute 의 게이트 두 줄을 임시 제거(Edit 로만, git 미사용) 후 재실행 → 게이트 존재·엄격비교 두 테스트가 즉시 FAIL 확인, 이후 원복. 라이브 실측: dev-login(consent_agreed_at=null) → `/auth/session/verify` 응답에 `"consent_agreed_at":null` 확인 → `POST /profile/consent` 후 재검증 → 응답이 실제 타임스탬프로 바뀜 확인. 테스트 계정 정리 완료.
- [~] **F-10** 공표 정책("30일 내 영구삭제") ↔ 실제 동작 불일치 — **구현을 크게 당겨왔으나 완전히 닫히지 않았다(감독 판정, 워커는 `[x]` 로 보고했으나 하향)** · `backend/app/jobs/purge_deleted_accounts.py`(신규), `backend/app/main.py`(스케줄 등록), `backend/app/tests/test_purge_deleted_accounts.py`
  🔴 **닫히지 않은 이유**: 파기 잡이 자식 테이블 17종을 실제 DELETE 하게 됐지만 **`users` 행 자체와 거래·리뷰·DM·신고·CS·업체프로필·제보는 보존**된다. 보존 근거는 타당하다(상대방 권리·법정 보존 의무). 그러나 공표 문구가 **"30일 내 영구삭제"** 인 이상 **문구가 실제보다 여전히 과하다** — 감사가 지적한 "공표 정책과 실제 동작 불일치"의 남은 간극은 **코드로 닫을 수 없고 문안 조정(B-6)으로만 닫힌다.** 아래 대표 판단 4건과 함께 처리해야 `[x]` 가 된다.
  **데이터 분류(표)** — 전 상세는 아래 최종보고 참조. 요지: `users` 행 자체·거래(marketplace_listings/appointments/price_offers)·리뷰(marketplace_reviews/business_review)·신고/제재(reports/user_sanctions)·DM·CS(support_tickets)·업체 프로필·크라우드소싱 제보(flood_report 등)는 **삭제하지 않음**(타인 권리·법적 보존 의무·공공성 데이터). `ride_sessions`/`user_quests`/`user_badges`(원장이 지목한 3종) + 순수 개인데이터 15종(user_otp, user_oauth_identities, ride_streaks, bookmarks, marketplace_listing_likes, marketplace_keyword_alerts, user_favorite_business, business_follow, post_likes, post_comment_likes, notifications, notification_settings, user_favorite_location, user_follows 양방향, user_blocks 는 `blocker_id`만)는 탈퇴 30일 경과 시 **실제 DELETE**.
  안전장치: `_is_purge_eligible()` 이 ①탈퇴 후 30일 미경과 ②미탈퇴(살아있는 계정) 를 코드로 배제, 방어적으로 `phone LIKE 'del_%'`(익명화 흔적) 아닌 행도 제외. `dry_run` 모드, `limit` 상한(기본 500). 스케줄 매일 03:10 ICT(저트래픽).
  테스트: `PurgeEligibilityTest` 5건(살아있는 계정/30일 미경과/경계값/비익명화 제외, 대상 포함) + `PurgeBatchExecutionTest` 3건(혼합 후보에서 적격자만 DELETE, dry_run 시 DELETE 미실행, 후보 0건 시 무해). **수정 전 FAIL**: 잡 자체가 부재한 신규 코드(ImportError, revert 불필요).
  **dev DB 실측(테스트 계정 3개로 검증, 운영 데이터 아님)**: LIVE(미탈퇴)·RECENT(5일 전 탈퇴+익명화)·OLD(40일 전 탈퇴+익명화) 각각에 user_quests/user_badges 삽입 후 배치 실행 → dry_run 과 실행 결과 일치, **OLD만 purged_count 에 포함**되고 LIVE/RECENT 의 user_quests/user_badges 는 그대로(count 1 유지), OLD 는 0(실제 삭제) 확인, `users` 행 자체는 OLD 도 그대로 존재(anonymize 유지). 검증 후 테스트 계정 전량 정리.
  export 범위 점검: `GET /users/me/export`(`routers/users.py`)는 이미 phone/rides/quests/badges 를 포함해 공표("내 데이터 다운로드")와 일치 — 변경 없음.
  공표 문구는 변경하지 않음 — 구현을 문구에 맞췄다(과업 지시 원칙).
  ⚠️ **판단이 갈려 삭제하지 않고 보고만 하는 항목(대표 판단 필요)**: `feed_posts`/`post_comments`(유저가 쓴 커뮤니티 콘텐츠 — 본인 것이지만 다른 유저의 댓글/좋아요가 얽혀 있어 삭제 시 타인 참여 흔적도 사라짐), `user_sanctions`(제재 이력 — 상습 위반자 추적용 운영 감사기록일 수 있음), `support_tickets`(CS 이력 — 컴플라이언스 보존 필요 여부 불명), `internal_reward_grants`(내부 보상 지급 원장 — 회계 대사 대상일 수 있음). 넷 다 이번 배치에서 **건드리지 않았다** — 원한다면 후속 판단으로 삭제 목록에 추가 가능.
- [x] **F-20 / P0-4 / X-4** `bff_migrate` **139~144, 147 공백** 해소 · [`docker-compose.yml`](../docker-compose.yml)
  멱등성 판정(7건 전부 멱등 확인, **기존 SQL 파일은 무수정**): 139 `data_type` 가드로 재실행 시 skip / 140 `ADD COLUMN IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS` 재생성 + `CREATE UNIQUE INDEX IF NOT EXISTS` / 141 `CREATE UNIQUE INDEX IF NOT EXISTS` / 142 `ALTER TYPE ... ADD VALUE IF NOT EXISTS` / 143 `ADD COLUMN`+`CREATE INDEX` IF NOT EXISTS / 144 동일 패턴 / **147 은 감사 문서가 "멱등성 미확인 보류"로 남긴 항목이나 실제로는 `ADD COLUMN IF NOT EXISTS` + `pg_constraint` 존재체크로 멱등** — 보류 근거가 사실과 달랐다.
  검증(감독 실측): `grep -c "migrations/{139,140,141,142,143,144,147}_"` 전부 **2**(command+volumes 쌍) · 실행순서 `160 → 139~158` 번호순 정렬 확인 · dev DB 에 `docker compose --profile backend run --rm bff_migrate` 실제 실행 → 대상 컬럼·인덱스·제약이 이미 존재해 전부 `NOTICE: already exists, skipping`(무해), 2차 재실행 `INSERT 0 0` 으로 **완전 멱등** 확인.
- [x] **X-3** migration 적용 이력 원장 도입 · 신규 `database/init/160_schema_migrations.sql`
  방식(최소안): psql 이 `-f`/`-c` 를 명령줄 순서대로 처리하는 특성을 이용해 `bff_migrate` command 에서 각 `-f .../NNN.sql` 뒤에 `-c "INSERT INTO schema_migrations(version) VALUES (NNN) ON CONFLICT DO NOTHING;"` 를 인터리브. **기존 SQL 15개를 고치지 않았고 별도 러너·Alembic 도입도 하지 않았다.** `ON_ERROR_STOP=1` 이 실패 이후 INSERT 를 차단하므로 "성공한 파일만 기록"이 자연히 보장된다.
  범위 한정(의도된 것): fresh-init 은 `docker-entrypoint-initdb.d` 가 `-c` 없이 SQL 만 실행하므로 원장이 채워지지 않는다 — 빈 볼륨은 001~N 을 통째로 실행해 정의상 최신이고, X-3 의 실제 문제는 existing-volume 경로라 그쪽만 대상으로 삼음.
  검증(감독 실측): `select count(*), min(version), max(version) from schema_migrations` → **21건 / 139 / 160**.
- [x] **P0-4 (readiness)** BFF readiness 가 147~158 광고·사업자·관리자 스키마를 검증하도록 확장 · `backend/app/readiness.py`
  추가 체크 9종: `admin_accounts.role`(147) · `ad_tiers` 존재(149/156) · `marketplace_ads.tier_id`(149/156 — `exposure_tier` 는 156에서 drop 되므로 최종 상태 기준) · `business_profile.verification_status`(151) · `business_follow`(152) · `ad_events`(153) · `ad_daily_stats`(154) · `business_price`(156) · `flood_risk_daily.is_stale`(158).
  검증: `test_readiness.py::ReadinessTest::test_missing_ads_biz_admin_schema_is_not_ready` — 9개 중 **하나만 빠져도** `RuntimeError` 발생을 단정. 기존 테스트 2건은 튜플 15컬럼으로 갱신. 스코프 한정 실행 8 passed.
  참고: 실배포 readiness 404 는 별건(**B-4**, 운영 소관) — 손대지 않음.
- [x] **F-15** DB fresh-init 순차실행 **실행 검증** (SGR-227) · `database/init/010`, `014`
  검증: 격리 컨테이너 `saigon_db_freshtest`(별도 볼륨, `postgis/postgis:15-3.3`)로 `database/init/` **165개 SQL 전건 부트스트랩** → 로그 **ERROR 0건**(FATAL 1건은 initdb 2단계 재시작 시퀀스의 정상 출력). `users.rider_type_id` 컬럼 존재 확인 → **감사 문서가 "미검증"으로 남긴 SGR-227 정적 분석이 실행으로 확인됨**. 운영 `saigon_db` 볼륨은 불가침 유지. 감독 실측: `docker ps -a | grep -c freshtest` → **0**(잔존물 없음).
  📌 미조치(언급만): `database/init/144_*.sql` 내부 주석 헤더가 `"141_reports_feed.sql"` 로 스테일 — 무관 변경이라 미수정.
  📌 `docker-compose.prod.yml` 에 `bff_migrate` 오버라이드가 없어 base 를 그대로 상속 — dev/prod 동일 적용, 별도 반영 불필요.
- [x] **N-1** `wards` 시드 SQL 신규 · `database/init/159_wards_seed.sql`
  조치: dev DB 의 `wards` 실측 데이터(**37행**, 전부 `is_active=true`)를 `INSERT ... ON CONFLICT (code) DO NOTHING` 으로 덤프. `ward_import.py` 는 Overpass API 소싱 수동 스크립트(사전조건 `migrate_wards.sql`)라 재실행 대신 실측 데이터를 시드로 고정하는 편이 단순하다는 판단.
  검증: 재실행 → `INSERT 0 0`(멱등, count 37 유지) · `test_migration_prefix_lint.py`(번호중복) 통과 · 신규 `backend/app/tests/test_wards_seed.py` 3건, **파일을 임시 리네임해 3건 전부 FileNotFoundError 로 실패 실증 후 복원**.
  ⚠️ 37행은 지도 폴리곤 37동 기준이다 — `ward_import.py:16` 의 **168동 목표와 여전히 불일치**(S-4 행정구역 삼중체계). 이번엔 손대지 않았고 **B-9 대표 결정 대기** 유지.
- [x] **N-2** 업체 **100건 천장** 해소 · `frontend/src/pages/map/NeighborhoodMap.tsx:47`, `MapSearch.tsx:22`, `NeighborhoodMapCanvas.tsx:427`
  실체 규명: 백엔드 `size<=100` 은 **페이지 크기일 뿐**이고 `fetchBizMapItems`(`frontend/src/api/biz.ts:392-423`)는 이미 `has_more` 로 여러 페이지를 순회한다. 진짜 절단점은 **프론트 상수 `BIZ_MAX_ITEMS=100` 이 그 순회를 조기 중단**시키는 것이었다 — 감사 문서가 지목한 백엔드 `size` 는 원인이 아니다.
  조치: `NeighborhoodMap.tsx` 100 → **1000**(선례 `c822831` "침수 map-data LIMIT 50 → 상향, 조용한 절단 제거" 와 동일한 결 — 절단선이 아니라 안전판). `:286` 에 상한 도달 시 안내가 이미 있어 조용한 절단이 아니다.
  **감독 추가 조치**: 워커는 원장이 지목한 파일만 고쳤으나 감독 실측에서 **동일 결함이 2곳 더** 발견됨 — `MapSearch.tsx:22`(가게 검색), `NeighborhoodMapCanvas.tsx:427`(캔버스 검색) 의 리터럴 100. 한 뷰만 고치면 결함이 남으므로 둘 다 1000 으로 상향.
  검증: 신규 `frontend/src/pages/map/neighborhoodMapBizCap.contract.test.mjs` — 정적 소스 정규식으로 100 회귀 감시. **값을 100 으로 되돌려 FAIL 실증 후 복원.** `.mjs` 계약 **12/12 PASS**.
- [–] **N-5** — **결함이 아님. 대표가 이미 "현행 유지"로 결정한 사항이었고, 잘못 변경했다가 되돌렸다.** · `frontend/src/pages/map/NeighborhoodMap.tsx`
  최종 상태: 리스트뷰는 화면 로컬 상태(`regionMode`/`selectedRegion`)를 쓰고 전역 `useLocationStore` 에 쓰지 않는다 = **대표 결정 상태로 복귀 완료**. 되돌린 범위는 import 3줄·상태 훅 5줄→로컬 `useState` 2줄·`applyLocation` 의 store setter→로컬 setter 3곳. 같은 파일의 W6 변경(N-2 `BIZ_MAX_ITEMS=1000`, S-5 `lat`/`lng` 배선 + `userPos` dep)은 **보존 확인**(감독 grep 실측: `:48`, `:112`, `:128`).
  주석도 정정 — "전역 건드리면 회귀"라는 모호한 표현 대신 대표 결정 출처(`frontend-page-map.md:128`)·이유(정보 화면 침습 방지)·트레이드오프 인지를 명시.
  검증: `tsc --noEmit` 0 error, `neighborhoodMapBizCap.contract.test.mjs` 1 pass.
  ⚠️ **남는 사실**: "지도보기 전환 시 지역이 안 넘어가는 불일치"는 **의도된 트레이드오프로 유지**된다. 감사 문서의 N-5 지적은 이 결정을 몰라서 나온 것이므로 **감사 문서 쪽이 틀렸다**. 해소를 원하면 대표가 결정을 바꿔야 하고, 그때는 page-map 이 제시한 `Canvas` 에 `initialRegion?: SelectedRegion` prop 추가 방식(정보 화면을 침습하지 않는 안)이 후보다.
  ~~아래는 되돌리기 전 기록(추적용)~~:
  **감사 문서의 전제가 반박됨(조사 결과)**: 감사는 "지도에서 동을 고르면 홈·날씨·주유소·정비소까지 몰래 바뀐다"고 적었으나, `NeighborhoodMapCanvas` 의 지역선택 쓰기 경로는 **죽은 코드**다 — `onRegionSelect={handleRegionSelect}` 가 `:1141` 에서 주석 처리돼 있고(대표 지시 2026-07-25 "지도 탭 지역선택 비활성 — GPS 근처로 대체"), Canvas 는 전역을 **읽기만** 한다. 감독 실측으로 확인. 즉 살아있는 전역 쓰기 경로는 Info 화면의 `LocationContextBar` 드롭다운뿐이었다.
  **`:32-34` 주석("전역 건드리면 회귀")의 실체**: 사실과 반대. `useLocationStore` 는 `19c5755`("위치 SoT 단일화 + 진입 GPS 센터링") 에서 Info 4화면·홈·Canvas 가 공유하는 **의도된 전역 SoT** 로 이미 설계됐고, 그 이후 커밋 `70c20ab` 로 추가된 리스트뷰만 opt-in 하지 않고 로컬 state 로 이탈한 것이 진짜 결함이었다. 주석은 그 이탈을 정당화한 사후 추측.
  전역 SoT 소비자 전수: `components/info/LocationContextBar.tsx:17-29`(읽기+쓰기) · `hooks/useServiceLocation.ts:15`(파생) · `pages/home/WorldMapV2.tsx:160,212`(읽기) · `pages/map/NeighborhoodProfile.tsx:38`(읽기) · `pages/map/NeighborhoodMapCanvas.tsx:184-186`(읽기, 쓰기는 `selectAll` 만 생존).
  조치: 리스트뷰의 로컬 `regionMode`/`selectedRegion` 제거 → `useLocationStore`/`useSelectedRegion` 으로 교체(Canvas·LocationContextBar 와 동일 소스), `applyLocation` 이 `selectRegion`/`selectAll` 호출. 오해를 유발한 구주석 정정. 방향 1(캔버스도 로컬화)은 이미 정착된 크로스스크린 기능을 되돌리는 더 큰 변경이라 기각.
  검증: `tsc --noEmit` 0 error. 스토어 로직은 기존 소비자 3곳에서 검증된 패턴 재사용(브라우저 E2E 미보유).
  🔴 **정정 — 이 변경은 대표 결정을 뒤집은 것이었고 되돌린다.** `ai-docs/context/frontend-page-map.md:128` 에 2026-07-27 자 대표 결정이 명문으로 있다: *"**⚠️ 알려진 갭 (대표 결정: 현행 유지)** … 통합안 3가지를 검토했고 대표가 현행 유지를 택했다 — 이유: 리스트가 스토어에 쓰면 주유소·정비소·날씨·홈의 동네까지 함께 바뀌기 때문(정보 화면 침습, **침수지도 사고와 동일 경로**). … **이 불일치는 인지된 트레이드오프다.**"*
  → 즉 `:32-34` 주석은 워커가 판정한 "사후 추측"이 **아니라 대표 결정의 인코딩**이었고, 전역 전파는 대표가 **명시적으로 거부한 동작**이다. 감사 문서가 N-5 를 결함으로 적은 것도 이 결정을 몰랐기 때문이다.
  **감독 검증 실패 지점**: 워커의 커밋 히스토리 추론(`19c5755`, `70c20ab`)과 죽은 코드 실측만 확인하고 **`frontend-page-map.md` 의 해당 화면 절을 대조하지 않았다.** CLAUDE.md 가 "프론트 화면 관련은 ADR → page-map 순으로 확인"을 규정하는데 ADR 이 부재(no_adr)해 page-map 확인을 건너뛴 것이 원인. **이미 `9a79cd7` 로 커밋된 상태에서 발견** → W7 에 N-5 한정 되돌리기 지시(W6 의 `BIZ_MAX_ITEMS=1000`·`lat`/`lng` 배선은 같은 파일이지만 보존 필수).
  📌 재발 방지: 화면 **동작**을 바꾸는 작업은 워커 프롬프트에 `frontend-page-map.md` 해당 절 확인을 명시 조건으로 넣는다. 감사 문서의 지적도 대표 결정과 충돌할 수 있으므로 무조건 신뢰하지 않는다.
  📌 미조치: `NeighborhoodMapCanvas.tsx:682-691` 의 `handleRegionSelect` 는 대표가 의도적으로 배선을 끊은 죽은 코드 — 되살리지 않았고 삭제도 하지 않았다(재활성 여부는 별건 UX 결정).
- [x] **S-5** 거리 정렬 도입 · `backend/app/routers/biz.py` `get_public_map`, `frontend/src/api/biz.ts`, `NeighborhoodMap.tsx`
  조치: `get_public_map` 에 optional `lat`/`lng`(조회자 위치) 추가 → 주어지면 `ST_Distance(business_profile.geom, ...::geography)` 로 정렬(143 migration 의 GENERATED GEOGRAPHY 컬럼 사용, `info_gas`/`info_repair` 의 기존 `ST_Distance` 패턴 미러링), **없으면 기존 `id.asc()` 폴백**(위치 거부·실패 시 결정론 유지 + `test_map_bbox_pagination.py` 계약 공존). 프론트는 `NeighborhoodMap` 이 이미 갖고 있던 `userPos`(GPS 1회)를 전달하고 `useEffect` deps 에 추가해 GPS 해상 후 재조회.
  검증: 신규 `backend/app/tests/test_biz_map_distance_sort.py` 2건 — order_clause 를 `id.asc()` 로 임시 고정해 `ST_Distance` 미검출 **FAIL 실증** 후 복원. **감독 실측(라이브 API)**: `GET /biz/public/map?min_lat=..&max_lat=..&min_lng=..&max_lng=..` 에 `lat=10.75&lng=106.70` 유/무로 각각 200, **순서가 실제로 바뀜** — 좌표 있음 `Dev Test 업체 | [DEV] Quận 1 | [DEV] Quận 7` / 좌표 없음 `[DEV] Quận 7 | [DEV] Quận 1 | Dev Test 업체`(최근접이 최상단으로 이동).
- [x] **N-6** 가게소식 등록에 `APPROVED` 검사 추가 · `backend/app/routers/biz.py` `create_news`
  조치: `create_ad`(`:319-321`)와 동일한 게이트 `if profile.status != "APPROVED": raise HTTPException(409, ...)` 적용. 기존 docstring 이 "검증 status 와 무관"이라 명시한 부분은 이 변경으로 사실이 아니게 되어 함께 정정(내 변경이 만든 모순 주석).
  검증: 신규 `backend/app/tests/test_biz_news_approved_gate.py` 2건 — 게이트를 임시 제거해 PENDING 프로필 소식 등록이 예외 없이 통과하는 **FAIL 실증** 후 복원.

## 3단계 · 사용자 자기서비스 + 운영 안전망

- [x] **F-6** 매물 본문 수정 API + 편집 화면 · `backend/app/routers/market.py:573-604`, `backend/app/schemas.py:255-267`, 신규 `frontend/src/pages/market/MarketEdit.tsx`, `frontend/src/api/market.ts`, `MarketDetail.tsx`
  변경: `PATCH /market/listings/{listing_id}` 신규. 소유권 검사(`listing.seller_id != session_uid`)는 기존 `/status`·`/price` PATCH 패턴 미러링. `SOLD`/`WITHDRAWN`/`HIDDEN`/`REMOVED` 는 수정 불가(409 `not_editable`, MKT-7 `/price` 가드 미러링). `MarketplaceListingDetail.image_content_ids` additive 추가(사진 재업로드 없이 기존 사진 유지 목적). 편집 화면은 `MarketCreate.tsx` 업로드 패턴·CSS 모듈 재사용. **App.tsx 신규 라우트 `/market/:id/edit`(`PrivateRoute`)**.
  검증: `backend/app/tests/test_market_listing_edit_withdraw.py::UpdateListingOwnershipTest` 4건. **수정 전 FAIL 실증** — `git stash` 로 되돌리면 `MarketplaceListingUpdateRequest` 부재로 `ImportError`(컬렉션 실패). **라이브 실측**: 매물 생성→수정→상세 반영 확인, 철회 후 수정 시도 409 `not_editable`. 테스트 데이터 정리 완료.
- [x] **F-7** 매물 철회(`WITHDRAWN`) 도입 · `backend/app/routers/market.py:610-651`, 신규 `database/init/162_marketplace_listing_withdrawn_status.sql`, `MarketDetail.tsx`
  변경: 신규 status `WITHDRAWN` 을 `_VALID_STATUSES` 에 편입해 **기존 `/status` PATCH 재사용**(신규 엔드포인트 미생성). 피드·검색·상세(`get_listings`/`get_listing`) 양쪽 필터에 추가해 완전 비노출.
  **철회 가능 조건(감독이 필수 조건으로 지정한 부분)**: 판매자 소유 확인 + **해당 매물에 `status='ACCEPTED'` 약속이 없을 때만** 허용 → 있으면 409 `active_appointment`(구매자가 먼저 약속을 취소해야 함). 철회 시 약속 테이블에 **쓰지 않으므로** `uq_mp_appointment_active_per_listing` 부분 유니크와 `FOR UPDATE` 잠금 기반 거래무결성(감사가 "재작업 금지"로 지목한 영역)을 건드리지 않는다. `WITHDRAWN` 은 영구(재전이 400 `moderated`) — 되돌리기 없음.
  migration: CHECK 제약 재정의(128 패턴 미러링, `DROP IF EXISTS` + 재생성으로 멱등). **`docker-compose.yml` `bff_migrate` command+volumes 양쪽 등록 완료** — 감독 실측 `grep -c "162_marketplace" docker-compose.yml` → **2**, dev DB `pg_constraint` 에 `WITHDRAWN` 포함 확인.
  검증: `WithdrawListingTest` 3건(차단/성공/재전이불가), 수정 전 `_VALID_STATUSES` 에 부재해 400 invalid status 로 **FAIL 실증**(`git stash`). **라이브 실측**: ACCEPTED 약속 걸린 매물 철회 시도 **409 `active_appointment`** → 약속을 CANCELLED 로 바꾸면 **200 철회 성공** → 상세 조회 404.
- [x] **F-8** 사진 교체 — F-6 의 `update_listing` 이 `image_content_ids` 를 전체 대체(`delete` + 재삽입)로 처리해 별도 엔드포인트 없이 해소.
- [x] **F-17** 신고 접수 시 운영자 알림 배선 · `backend/app/models.py`, `backend/app/services/ops_alerts.py`(신규), `backend/app/noti_worker/__main__.py:337,355`
  **report 엔드포인트 전수 5개** (감사 문서는 `users.py` 한 곳만 지목했으나 실제로는 5개): `users.py:391 report_user`(USER) · `dm.py:484 report_conversation`(DM) · `feed.py:536 report_post`(POST) · `feed.py:581 report_comment`(COMMENT) · `market.py:674 report_listing`(LISTING). 모두 통합 `Report` 테이블에 INSERT.
  배선 방식: 라우터 5곳을 개별 수정하지 않고 `Report` 모델에 SQLAlchemy `after_insert` 매퍼 이벤트를 걸어 **5개 전부 자동 커버**. (`market.py` 가 동시 작업 워커 소관이라 직접 배선이 불가능했던 것이 이 방식을 택한 계기 — 결과적으로 신규 신고 경로가 추가돼도 자동 적용된다.) `after_insert` 는 Core `connection` 만 주므로 `NotificationOutbox.__table__.insert()` 를 같은 트랜잭션에서 실행해 **Report 커밋과 outbox 적재의 원자성 유지**(기존 `noti_events.enqueue()` 의 outbox 패턴 재사용).
  운영자 수신 채널: 인앱 `Notification` 은 `user_id` 수신자 스키마라 운영자에 부적합 → **웹훅**(`send_ops_alert()`) 신설, F-18 과 채널 공유. `noti_worker` 에 `report.submitted` 핸들러 추가.
  검증: `backend/app/tests/test_report_ops_alerts.py` 8건. **라이브 실측** — dev-login 2계정 생성 후 `POST /api/bff/users/{id}/report` 실제 호출 → `saigon_noti_worker` 로그에 `[신고 접수] target_type=USER reason=FRAUD report_id=...` 출력 확인(웹훅 URL 미설정 상태라 로그 전용 = 문서화된 정상 동작).
- [x] **F-18** 최소 에러 알림 도입 (Sentry 미도입) · `backend/app/main.py`, `engine/app/main.py`, `backend/app/services/ops_alerts.py`
  감사 문서의 수용 기준이 "운영자 채널 웹훅 수준이면 충분"(§8.2 ⑦)이라 **Sentry SDK 도입 없이** BFF·Engine 양쪽에 전역 `@app.exception_handler(Exception)` 추가 — 500 응답은 유지하고 `send_ops_alert()` 로 발송, 같은 `(예외타입, path)` 조합은 **60초 쓰로틀**. 샘플링·태깅·릴리즈 트래킹 미도입(과설계 회피).
  신규 키: `.env` / `.env.example` 양쪽에 **`OPS_ALERT_WEBHOOK_URL`** (값은 커밋 파일에 없음). 키셋 대칭 확인.
  검증: `engine/app/tests/test_ops_alerts_and_dlq.py` 4건 → engine **66 passed**(62 기준선 +4). 쓰로틀 구현에서 **실제 버그를 테스트가 잡았다** — `_last_sent.get(key, 0.0)` 기본값 때문에 `time.monotonic()` 이 작을 때 첫 호출부터 오탐 억제되는 결함을 발견해 `None` 센티널로 수정.
  📌 미조치(기존 드리프트): `.env.example` 에 `DEV_HOST=` 키 누락 — 내 변경이 만든 것이 아니어서 보고만. **CLAUDE.md 보안 최소 룰(키셋 동일) 위반 상태이므로 별건으로 처리 필요.**
- [x] **F-12** 목록·검색 실패를 "결과 없음"으로 위장하던 것 분리 · `frontend/src/hooks/useInfiniteScroll.ts`
  변경: 훅 반환값에 `error: boolean` 추가(로드 실패 true, 성공/reset false) — **기존 시그니처 유지**(additive, breaking 없음).
  **소비자 전수 확인 후 전부 갱신**: `MarketMain.tsx` · `MarketSearch.tsx` · `FeedList.tsx` · `QuestList.tsx` 4곳(실제 훅 사용). `PostPanel.tsx` 는 주석에서만 언급하고 실제 호출이 없어 수정 불필요(확인만). → 감사 문서는 마켓만 지목했으나 **피드·퀘스트 목록도 같은 결함**이었다.
  각 소비자는 `items.length === 0 && error` 일 때만 `StateBlock(tone="error")` + 재시도(`reset()`) 를 렌더하고, 그 외에는 기존 "결과 없음"을 유지해 **과차단이 없다**.
  i18n: `feed.loadError`·`quest.loadError` ko/en/vi 3종 추가(`market.loadError` 는 기존 키 재사용).
- [x] **F-13** 홈 위젯의 실패 삼킴 해소 · `frontend/src/pages/home/WorldMapV2.tsx`
  전수 확인: 위젯 **9개** 중 날씨(`weatherUnavailable`)·침수(`floodStatus`) **2개만** 이미 `unavailable` 을 구분하고 있었고, 나머지 **6개**(내주변상품·최근상품·업체소식·주유소·정비소·커뮤니티)가 실패를 빈 배열/0 으로 삼켰다 — **한 파일 안에서 기준이 갈렸던 것**. 6종에 `nearbyStatus`/`recentStatus`/`bizNewsStatus`/`gasStatus`/`repairStatus`/`communityStatus` 추가, 실패 시 안내문구 + 재시도(`loadHomeData` 재호출).
  범위 밖 판단(보고만): XP·누적거리·거래수·알림뱃지 등 **단일 숫자 배지 3개**는 "빈 배열" 개념이 없어 이 결함 패턴에 해당하지 않음.
  검증: 신규 `frontend/src/pages/home/worldMapV2FailureState.contract.test.mjs`(위젯 6종의 상태 선언 + `unavailable` 세팅을 정적 검증, 구버전 naked-catch 회귀 감시). **수정 전 FAIL 실증** — `git show HEAD:<file>` 로 수정 전 소스를 임시 파일에 떠서 동일 assertion 실행 → `AssertionError` 확인 후 임시파일 폐기(원본 무접촉).
- [x] **F-14** 지도 자산 로드 실패 무음 해소 · `frontend/src/components/maps/SaigonMapV5.tsx`, `.module.css`
  실패 지점 3곳(`:363` cityOutline · `:551` depth2.json · `:568` depth3.json)이 전부 `.catch(() => {})` 였다. depth2/depth3 는 `assetLoadFailed` state 로 추적해 지도 상단 배너(안내 + 재시도) 신설. **전체/부분 실패 구분** — 기존 `wardData` 캐시가 비어 있으면 전체 실패(`map.loadError`), 하나라도 로드됐으면 부분 실패(`map.assetPartialFail`). 새 상태 추가 없이 기존 캐시만 재사용.
  **로딩 전략 불변 보장**(감사가 "재작업 금지"로 지목한 성능 설계 — depth3 뷰포트 로딩·`lightweight` 진입·5.56MB/74파일 분할): `loadWardData`/`onViewportChange`/뷰포트 트리거 함수의 **시그니처·호출부 무변경**, 재시도는 기존 `onViewportChange(true)` 재호출만(신규 캐시·러너 없음 — 실패한 슬러그는 `entry.d2/d3` 가 비어 자연 재시도).
  의도적 미조치: `:363` cityOutline 은 기존 주석이 "표시용… 실패 시 조용히 생략"이라 **장식적 배경**임을 명시하고 있어 알림을 넣는 것이 오히려 과설계라 판단(대표 확인 권장).
  검증: 신규 `frontend/src/components/maps/saigonMapV5AssetFailure.contract.test.mjs`. **수정 전 FAIL 실증**(위와 동일 방식). i18n `map.assetPartialFail`·`home.v2.sectionUnavailable`(+Desc) ko/en/vi 3종, JSON 파싱 검증 OK.
- [~] **F-19** 강제 업데이트 배선 — **코드는 완성, 실기기에서는 아직 작동하지 않음** · `frontend/src/App.tsx`, `frontend/src/api/appVersion.ts`, `frontend/src/lib/native.ts`
  변경: `compareVersions`(파싱 불가 시 null) + `shouldForceUpdate(installed, info)` + `pickPlatformVersion`(웹 제외, ios/android 만) 추가. `App.tsx` 가 부팅 완료 후 1회 `native.getDeviceInfo()` + `fetchCurrentVersion()` 을 병렬 조회해 판정, true 면 라우트 전체를 렌더하지 않고 전체화면 차단만 렌더. `native.ts` 의 `getDeviceInfo().appVersion` 을 `@capacitor/app` 의 `App.getInfo()` 로 채움(try/catch fail-open). i18n `forceUpdate.title`·`forceUpdate.body` ko/en/vi.
  **"강제 업데이트가 아닐 때 절대 차단되지 않음" 보장(감독이 필수 조건으로 지정)**: `shouldForceUpdate` 가 ① `info === null`(서버 조회 실패/해당 플랫폼 레코드 없음) ② `!info.isForceUpdate` ③ `installedVersion === 'unknown'` ④ 버전 파싱 실패 — **네 경우 모두 false** 를 반환하도록 코드로 고정. 부팅 이펙트도 try/catch 로 감싸 조회 실패 시 상태를 건드리지 않음(초깃값 false).
  🔴 **완료로 볼 수 없는 이유(감독 판정)**: `@capacitor/app` 이 npm 의존성으로만 존재하고 `native/android`·`native/ios` 서브모듈에 **cap sync 되지 않았다.** 따라서 실기기에서 `appVersion` 이 `'unknown'` 으로 남고, 위 안전망 ③에 걸려 **강제 업데이트가 절대 발동하지 않는다.** 즉 감사 문서가 지적한 "치명 버그 배포 후 구버전 차단 불가"는 **실제 앱에서 여전히 미해소**다. 웹 경로의 로직·안전망은 완성됐으므로 남은 것은 네이티브 sync 작업 = **B-1 의존**.
  📌 대표 결정 필요: 네이티브 앱스토어 업데이트 URL 이 코드베이스에 없어 차단 화면에 "스토어로 이동" CTA 를 넣지 못했다(안내 문구만). 링크 확정 시 버튼 추가는 사소한 후속.
  검증: `tsc --noEmit` 0 error. `.mjs` 계약 11/11. **실기기 검증 불가(B-1)**.
- [x] **F-21** DLQ 조회 경로 신설 · `engine/app/routers/admin.py`, `backend/app/engine_client.py`, `backend/app/routers/admin_api/stream.py`
  Engine: `GET /v1/admin/stream/dlq-messages`(`_svc` 게이트) — `sre:messages:dlq` XREVRANGE. BFF: `engine_client.admin_stream_dlq_messages()` 로 **HTTP 경유만** 사용 → CLAUDE.md 핵심 제약(BFF 는 Engine DB 직접 접근 금지) 준수 확인. 어드민 API 2종 추가(`verify_root_api` 게이트): `GET /admin/api/stream/dlq`(Engine 경유) · `GET /admin/api/stream/noti-dlq`(BFF 자신의 `noti:events:dlq` — Engine 소유가 아니므로 직접 조회 정당).
  검증: `backend/app/tests/test_admin_dlq_endpoints.py` 3건 + engine 테스트. 라이브: 미인증 호출 시 **401**(라우트 존재·게이트 동작 확인). 어드민 프론트 화면은 지시대로 미구현(API 로 확인 가능하면 충분).
- [x] **F-16 (코드 범위)** 백업 스크립트 신설 · `tools/backup_db.sh`
  `pg_dump` + 보존정책(`RETENTION_DAYS` 기본 14일). **dev 실제 실행 확인**: `backups/backup_20260731_214226.sql.gz` 744K 생성, 유효 pg_dump 헤더 확인. `.gitignore` 에 `backups/` 추가해 덤프가 커밋되지 않음을 `git status` 로 확인. 복원 절차는 스크립트 출력·주석에 명시.
  ⛔ 실행 스케줄링·오프사이트 암호화 저장·restore drill·RPO/RTO 측정은 **B-5(운영 소관)** — 미착수.

## 4단계 · 회귀 게이트 (게이트 8)

- [x] **X-1** `nearby-v2` 판별 완료 — **회귀 아님, stale 테스트였다.** 상세는 0단계 결함표 X-1 항목 참조. 커밋 `9144ed2`.
- [x] **X-2** ESLint errors **0** — `eslint.config.js` 에 `**/*.test.mjs` 용 `globals.node` 선언. 상세는 0단계 결함표 X-2 항목 참조. 커밋 `9144ed2`.
- [x] backend pytest **전건 PASS** — 기준선 198 passed/1F/1E → **270 passed / 0 failed / 0 collection error**(`--continue-on-collection-errors` **없이** 실행). 감독 실측.
- [x] engine pytest — 기준선 62 → **66 passed / 0 failed**. 감독 실측.
- [x] `tsc --noEmit` — **0 error** 유지(전 단계 매 커밋 전 확인).
- [x] `.mjs` 계약 — 4종 → **8파일 / 18 subtest 전건 PASS**. 신규 4종: `neighborhoodMapBizCap`(N-2 천장 회귀 감시) · `worldMapV2FailureState`(F-13) · `saigonMapV5AssetFailure`(F-14) · `privateRouteConsentGate`(F-9 게이트 + 넓은 falsy 회귀 감시).
- [x] migration **fresh 볼륨 적용 E2E** — 격리 컨테이너 `saigon_db_freshtest`(별도 볼륨)로 `database/init/` **165개 SQL 전건 부트스트랩, ERROR 0건** + `users.rider_type_id` 확인(F-15/SGR-227). **기존 볼륨** — dev DB 에 `bff_migrate` 실전 실행, 139~163 전건 적용 + 2차 재실행 `INSERT 0 0`(완전 멱등), `schema_migrations` **26건**. 운영 백업 복제본 검증은 **B-8**.
  🔴 **근거 정정(2026-08-02)**: 위 "ERROR 0건"만으로 스키마 파리티를 주장한 것은 불충분했다 — 실제로 fresh 재현 스키마가 라이브와 어긋나 있었다(`users.deleted_at` 라이브 전용, `badges.policy_id` fresh 전용, `flood_confirmation.lat/lng` NOT NULL 여부 불일치). `169_schema_parity_backfill.sql` 로 역보강 + `backend/app/tests/test_schema_parity.py` 로 회귀 고정, 격리 프로브로 라이브와 재대조해 **fresh-only 0건**(live-only 47테이블은 전부 Engine/Alembic 소유) 확인. 앞으로 fresh-init 검증 기준은 **"라이브와 schema diff 0건"**이다.
- [–] ESLint warnings **247건** — 게이트 기준은 "0 error"이며 warning 0 은 요구되지 않는다(현재 **0 errors**). 감축 목표 설정은 대표 결정 대기.

## 5단계 · 대표 결정 대기 (개발 착수 불가)

- [–] **S-1** RP 경제 sink 0개 — 재화 UI를 내릴지, sink 를 열지 (B-9)
- [–] **S-2** 업체 0건 + 유입 수단 부재 — 어드민 생성 기능 vs 영업 자가가입 유치 (B-9)
- [–] **S-3** 서비스 경계 14.4×14.5km(37동) 유지 vs HCMC 전역 (지도 자산 재생성 동반) (B-9)
- [–] **S-4** 행정구역 삼중 체계(37동 폴리곤 / 168동 wards / 레거시 districts) 통일 기준 (B-9)
- [–] **N-3 / N-4** 광고 노출 지면 OFF + 결제 미구현 — 파는 쪽만 열려 있음 (B-9)
- [–] **F-10 문안 / P0-5** 약관·개인정보 문안 확정 (B-6)

---

## 6단계 · 2026-08-02 라운드

- [x] **스키마 파리티** `database/init/` fresh-init 과 라이브 dev DB(`saigon_db`) 사이 드리프트 해소 — `users.deleted_at`(라이브 전용, 코드 10곳 사용, 새 배포 시 로그인 붕괴 상태였음) · `badges.policy_id`(fresh 전용, 라이브가 pre-139 `033` 파일 누락) · `flood_confirmation.lat/lng` NOT NULL 불일치. `database/init/169_schema_parity_backfill.sql`(멱등) 추가 + `bff_migrate` command/volumes 양쪽 등록 + 라이브 적용(`schema_migrations` version 169).
  검증: 격리 프로브 컨테이너로 fresh 재현 후 라이브와 `information_schema.columns` 양방향 diff → **fresh-only 0건**, live-only 47테이블은 전부 Engine/Alembic 소유(+`alembic_version`). 회귀 방지 `backend/app/tests/test_schema_parity.py`(DB 불필요, 정적 스캔).
  📌 **교훈**: 기존 "fresh-init 전건 부트스트랩 ERROR 0건"을 검증 근거로 삼았던 것은 불충분했다 — SQL 이 에러 없이 끝나는 것과 결과 스키마가 라이브와 같은 것은 별개. 위 최종 게이트 판정 표의 게이트 5, 4단계 checklist 의 "migration fresh 볼륨 적용 E2E" 항목 근거를 이 라운드에서 "schema diff 0건"으로 교체(게이트 자체는 재개방이 아니라 근거 교체).
- [x] **서비스 경계 안내** 위치가 서비스 지역 밖일 때 `market.outOfService`/`market.outOfServiceDetail`(ko/en/vi) 안내 — `LocationPickerSheet.tsx`·`MarkerLocationPicker.tsx`. 가드 `!!picked && !inServiceArea(...)`. 계약 테스트 `frontend/src/pages/market/outOfServiceGuidance.contract.test.mjs`.
- [x] **스플래시 로그인 버튼 제거** `Splash.tsx` 의 [시작하기]/[로그인]이 둘 다 `/auth/oauth` 로 가는 완전 중복이라 대표 지시로 [로그인] 제거. 고아 CSS(`.loginBtn`)·i18n 키(`splash.loginBtn`) 함께 제거.
- [x] **어드민 업체 등록/사진/CSV 임포트** `POST /admin/api/biz/accounts`(즉시 APPROVED, `user_id=None`) · `GET /admin/api/biz/categories` · `POST /admin/api/biz/upload`(앱 전용 `/contents/upload` 프록시) 신설. `business_profile.user_id` nullable(168) 전환에 따라 어드민 조회 조인 3곳 **outer join 필수**(INNER JOIN 복귀 시 소유자 없는 업체가 목록에서 사라짐). `backend/scripts/import_business_csv.py`(기본 dry-run, `--commit` 필수) 로 대량 등록.
- [x] **CI e2e job** `.github/workflows/ci.yml` 에 `e2e` job 추가(`pull_request` 에서만 동작). `frontend/e2e/*.spec.ts`.

### 6단계 종료 상태 (2026-08-02)

**닫힌 것**: 스키마 파리티(근거 교체 포함) · 서비스 경계 안내 · 스플래시 로그인 버튼 제거 · 어드민 업체 등록/사진/CSV 임포트 · CI e2e job — 5건 전부 `[x]`.

---

## 최종 게이트 판정 — 감사 문서의 9개 출시 게이트 대조

출처: [`260731_prelaunch_go_no_go_audit.md` §5](./260731_prelaunch_go_no_go_audit.md). 감사 시점 판정은 9개 전부 **FAIL** 이었다.

| 순서 | 게이트 | 감사 시점 | 현재 | 근거 / 남은 것 |
|---:|---|---|---|---|
| 1 | Engine 긴급 차단 | FAIL | **부분** | 공개 `/api/sre/*` 를 allowlist 1건으로 축소 완료(curl 13경로 실측). **키 회전·모바일 identity 분리·앱 재배포는 미완 = B-3.** `sreMessage` 는 여전히 전역 키 단일 비교라 키 유출 시 GPS/이벤트 주입 가능 |
| 2 | Secret 대응 | FAIL | **FAIL** | 코드 범위 조치 없음 — Zalo secret 폐기·재발급·Git 이력 감사는 전부 **B-2**(대표 소관) |
| 3 | 안전정보 | FAIL | **PASS(조건부)** | 침수 fail-open 해소 — 실패를 0.0 으로 삼키지 않고 snapshot 보존 + `expires_at` 갱신으로 24h 재발까지 차단, UI 분리. **잔여**: 한 번도 성공한 적 없는 구역의 "저위험"과 "확인 불가" 미구분(대표 판단) |
| 4 | 개인정보·검증문서 계약 | FAIL | **부분** | 로그인 전 약관 열람·명시 동의·버전/시각 기록·미동의 세션 게이트 완료. 사업자 문서 소유권 검사 + `contents.is_private` ACL 완료. 30일 파기 배치 완료. **남은 것**: 공표 문구("영구삭제")가 실제 보존 범위보다 과함 → 문안 조정 **B-6**, 삭제 보류 4종 대표 판단 |
| 5 | DB upgrade | FAIL | **PASS(dev 기준)** | 139~144·147 공백 해소(147 은 "멱등성 미확인"이 사실과 달랐음), `schema_migrations` 원장 도입(23→26건), readiness 9종 확장. **검증 근거 교체(2026-08-02)**: fresh-init 165 SQL 격리 부트스트랩 "ERROR 0건"은 SQL 이 에러 없이 끝난다는 것과 결과 스키마가 라이브와 같다는 것은 별개라 **불충분했다** — 실제로 `users.deleted_at`(라이브에만 존재, fresh 부재) 등 스키마 드리프트가 있었다(아래 신규 항목 참조). 게이트는 정당하게 닫힌 상태이나 근거는 **"라이브와 schema diff 0건"**(fresh-only 0건, live-only 는 전부 Engine/Alembic 소유)으로 교체. **운영 백업 복제본 검증은 B-8** |
| 6 | 정확한 배포 | FAIL | **FAIL** | 코드 범위 밖 — 운영 drift 해소·readiness 200·strict CORS·보안헤더·운영 endpoint 비공개 재검증은 **B-4** |
| 7 | Native·외부 연동 | FAIL | **FAIL** | 서명 빌드·실기기 GPS/FCM/OAuth/딥링크 검증 불가 = **B-1**. F-19 강제업데이트도 `@capacitor/app` 미 cap-sync 로 실기기 미작동 |
| 8 | 자동 회귀 | FAIL | **PASS(CI 미구성 단서)** | X-1·X-2 해소로 확정 — backend **270 passed / 0 failed / 0 collection error**(관용 플래그 없이), engine **66 passed**, `tsc` **0 error**, `eslint` **0 errors**(247 warnings — 게이트 기준은 error 0), `.mjs` **18/18**. 테스트 199→270건. **단서**: 감사 게이트 원문은 "**CI 에서** 통과"를 요구하는데 이 레포에 CI 파이프라인이 없어 **로컬(개발서버 docker 하네스) 실행 증적**이다. 브라우저 E2E·시각 회귀는 여전히 부재 |
| 9 | 운영 복구 | FAIL | **부분** | `tools/backup_db.sh` 작성 + dev 실행 확인. **실행 스케줄·오프사이트 암호화 저장·restore drill·RPO/RTO·경보·온콜은 B-5** |

**요약**: 9개 게이트 중 코드로 닫을 수 있는 범위는 전부 처리했고, **PASS 3 · 부분 3 · FAIL 3** 이다. FAIL 3건(게이트 2 Secret · 6 배포 · 7 Native)은 **코드 작업으로는 절대 닫히지 않는다** — 각각 B-2 / B-4 / B-1 이며 대표·운영 소관이다.

**따라서 출시 판정은 여전히 NO-GO 다.** 감사 문서의 재판정 완료 정의(§8: P0 미해결 0건 + 9개 게이트 전부 PASS + 실기기·배포·복원 로그 확보)를 만족하지 못한다. 이번 리메디에이션이 바꾼 것은 "**코드가 원인인 차단 사유가 남아 있다**"에서 "**남은 차단 사유가 전부 운영·법무·실기기 영역이다**"로 성질이 이동한 것이다.

### 회귀 점검 — 감사가 "재작업 금지"로 지목한 견고한 영역 (전부 무손상 실측)

[`260731_launch_readiness_verdict.md` §7](./260731_launch_readiness_verdict.md) 이 "적대적 반증에서도 깨지지 않음 / 재작업 금지"로 명시한 항목들이 이번 97파일 변경으로 깨지지 않았는지 직접 확인했다. **리메디에이션이 이걸 깼다면 그게 가장 큰 사고이기 때문이다.**

| 영역 | 확인 방법 | 결과 |
|---|---|---|
| 거래 무결성 — `FOR UPDATE` 잠금 | `market.py` 의 `with_for_update` 잔존 | **1건 유지** (F-7 철회가 약속 테이블에 쓰지 않도록 설계한 것이 유효) |
| 거래 무결성 — DB 레벨 backstop | dev DB `pg_indexes` 의 `uq_mp_appointment_active_per_listing` 에 `ACCEPTED` 조건 | **유지** |
| 보상 멱등 — Engine 선점 | `engine/app/services/policy_engine.py` 의 `PolicyActionGrant` | **유지** |
| 보상 멱등 — BFF 독립 멱등 | `backend/app/routers/internal.py` 의 `InternalRewardGrant` | **유지** |
| 게이미피케이션 게이트 | `backend/app/main.py` 의 shop/gacha/inventory/season 라우터 주석 처리 | **4건 유지**(BFF 미등록 = 404) |
| Engine 특권 가드 | `engine/app/routers/gacha.py` 의 `verify_service_key` | **6건 유지** |
| OTP 운영 3중 게이트 | `auth.py` 의 `_DEV_MODE` + `docker-compose.prod.yml` 의 `OTP_DEV_BYPASS` 빈값 강제 | **auth.py 8건 / prod.yml 1건 유지** |

### 리메디에이션 산출 규모 (`4ee499c..HEAD`, 5커밋)

- **97 files changed, +4,384 / -194**
- 신규 테스트 **19파일** (backend 14 · engine 1 · frontend `.mjs` 4)
- 신규 migration **6개** (158 `is_stale` · 159 wards seed · 160 `schema_migrations` · 161 `contents.is_private` · 162 `WITHDRAWN` · 163 동의 캡처) — **전부 `bff_migrate` 등록 + dev DB 적용 실측**
- 테스트 증가: backend 199 → **266** · engine 62 → **66** · frontend `.mjs` 4 → **18**

---

## 감독 절차 실수 기록 (재발 방지)

**2026-07-31 · 2단계 커밋 중 `git stash` 로 동시 실행 워커의 변경을 되돌림.**
2단계 커밋 시 세션 이전 미커밋 작업을 격리하려고 `git stash push --keep-index` 를 썼는데, 이 명령은 **인덱스 밖의 모든 작업트리 변경을 stash 한다** — 그 시점에 3단계 워커(W9)가 추적 파일을 편집 중이었고, 그 변경이 함께 stash 로 빨려 들어갔다. W9 는 작업 도중 자기 변경이 사라지는 것을 3회 겪고 전량 재적용해야 했다(신규 미추적 파일은 무사). 추가로 `git stash pop` 이 `biz.py` 에서 충돌해 수동 해소가 필요했다.

- **원인**: 워커가 실행 중인 상태에서 커밋을 시도한 것. `--keep-index` 의 의미를 "스테이징된 것만 남기고 나머지는 되돌린다"로 정확히 인지하지 못한 것.
- **규칙**: **단계의 모든 워커가 종료된 뒤에만 커밋한다.** 워커 실행 중에는 `git stash`/`git checkout -- <path>`/`git reset --hard` 를 쓰지 않는다.
- 3단계 커밋은 W8·W9·W10 **전원 종료 확인 후** 수행한다.

---

## 진행 로그

| 시각 | 단계 | 내용 | 담당 |
|---|---|---|---|
| 2026-07-31 | 0 | 검증 환경 실측 완료. 감사 문서 환경 전제 3건 정정(Docker·pytest·submodule). 기준선 확보. 신규 결함 X-1~X-4 발견. 블로커 B-1~B-9 확정 | 감독(인라인) |
| 2026-07-31 | 1 | 워커 4개 병렬 착수 — W1 IDOR(F-1~F-5) / W2 침수 fail-open(F-11) / W3 사업자문서·광고게이트(F-06,F-05) / W4 nginx allowlist(P0-1) | T3 서브에이전트 ×4 |
| 2026-07-31 | 1 | **W4 완료** — P0-1 코드범위 `[x]`. 감독이 프론트 `sre` 호출부 0건·nginx diff 교차검증 | W4 + 감독 |
| 2026-07-31 | 1 | **W3 완료** — F-05 `[x]`, F-06 `[~]`(소유권 검사 완료, private ACL 이 역참조 방식이라 잔여 갭 → 2단계 이관). 신규 테스트 6건 | W3 + 감독 |
| 2026-07-31 | 1 | **W2 1차 완료** — 감독 실측으로 **2건 적발**: ① `158` migration 미배선 + dev DB `is_stale` 부재 → 침수 map-data API 실패 상태 ② `expires_at` 24h 만료 후 빈 결과가 다시 초록 "안전" 렌더 = fail-open 재발. W2 재가동 | W2 + 감독 |
| 2026-07-31 | 1 | **W1 1차 완료** — F-1~F-4 `[x]`. 감독 교차검증에서 **F-5 부분 해소** 적발(익명 조회 잔존) → 세션 필수화 + 프론트 고아 파라미터 정리 후속 지시, W1 재가동. backend 테스트 222P / 신규 실패 0 (기존 예외 2건 유지) | W1 + 감독 |
| 2026-07-31 | 1 | **W2 최종 완료** — F-11 `[x]`. 158 배선+dev DB 적용 후 map-data **200 실측**, 실패구역 `expires_at` 갱신으로 24h fail-open 재발 차단. **감독 지시(빈 결과=unavailable)가 틀렸음을 워커가 반박해 정정** — 저위험 구역은 애초에 행이 없어 빈 결과가 정상 | W2 + 감독 |
| 2026-07-31 | 2 | 워커 3개 병렬 착수 — W5 migration/readiness/fresh-init / W6 업체지도(N-1,N-2,S-5,N-6) / W7 위치SoT+contents ACL | T3 서브에이전트 ×3 |
| 2026-07-31 | 2 | **W5 완료** — F-20·X-3·X-4·P0-4(readiness)·F-15 `[x]`. 147 "멱등성 미확인 보류"는 실제로 멱등이었음. fresh-init 165 SQL 격리 부트스트랩 ERROR 0건으로 SGR-227 실행 검증 | W5 + 감독 |
| 2026-07-31 | 2 | **W7 완료** — N-5·F-06잔여 `[x]`. **감사 문서의 N-5 전제(지도 선택이 홈까지 변경)가 반박됨** — Canvas 쓰기 경로는 대표 지시로 끊긴 죽은 코드. 다만 이번 수정으로 리스트뷰 선택이 전역에 전파되므로 **대표 확인 필요** | W7 + 감독 |
| 2026-07-31 | 2 | **W6 완료** — N-1·N-2·S-5·N-6 `[x]`. N-2 의 진짜 원인이 백엔드 `size` 가 아니라 프론트 상수였음을 규명 | W6 + 감독 |
| 2026-07-31 | 2 | **감독 직접 조치 3건**: ① `159`·`161` 을 `bff_migrate` command+volumes 에 등록(안 하면 F-20 을 닫자마자 같은 공백을 새로 만드는 셈) → 원장 **23건(139~161)** ② `MapSearch.tsx:22` ③ `NeighborhoodMapCanvas.tsx:427` 의 남은 100 천장 상향 — W6 이 원장 지목 파일만 고쳐 동일 결함이 2곳 잔존했음 | 감독 |
| 2026-07-31 | 2 | **2단계 검증 완료** — backend 233P·engine 62P·tsc 0E·mjs 12/12·침수 map-data 200·업체지도 거리정렬 200 실측. eslint 2E 는 X-2(테스트 globals, 4단계 대상) | 감독 |
| 2026-07-31 | 3 | 워커 3개 병렬 착수 — W8 마켓자기서비스(F-6~F-8)+F-12+F-19 / W9 운영안전망(F-17,F-18,F-21,F-16) / W10 오류vs빈상태(F-13,F-14) | T3 서브에이전트 ×3 |
| 2026-07-31 | 3 | **W9 완료** — F-17·F-18·F-21·F-16 `[x]`. report 엔드포인트가 감사 문서의 1개가 아니라 **5개**임을 규명하고 모델 `after_insert` 로 전부 커버. 감독 실측으로 산출물 6개 파일·추적변경 전부 무사 확인, backend **253P**/engine 66P | W9 + 감독 |
| 2026-07-31 | 3 | 🔴 **N-5 정정** — `frontend-page-map.md:128` 에서 **대표가 2026-07-27 에 "현행 유지"로 결정한 사항**임을 발견(전역 전파는 명시적으로 거부됨). 2단계에서 뒤집은 것을 W7 에 지시해 되돌림 완료, W6 변경 보존 확인. **감독 검증 실패** — 워커의 커밋 히스토리 추론만 믿고 page-map 을 대조하지 않음 | 감독 + W7 |
| 2026-07-31 | 3 | **W8 완료** — F-6·F-7·F-8·F-12 `[x]`, **F-19 `[~]`**(코드 완성이나 `@capacitor/app` 미 cap-sync 로 실기기에서 발동 불가 = B-1 의존). F-12 는 감사가 지목한 마켓 외에 **피드·퀘스트 목록도 동일 결함**이었음. 철회는 ACCEPTED 약속 보호 + 거래무결성 무접촉으로 라이브 실측 | W8 + 감독 |
| 2026-07-31 | 3 | ⚠️ **감독 절차 실수 발각** — 2단계 커밋의 `git stash` 가 실행 중이던 W9 변경을 3회 되돌림. 위 "감독 절차 실수 기록" 절 참조. 3단계 커밋은 워커 전원 종료 후로 변경 | 감독 |
| 2026-07-31 | 1 | **1단계 종료.** 8개 항목 `[x]`, 2건 2단계 이관, 1건 대표 판단. 커밋은 미실시(지시 없음) | 감독 |
| 2026-07-31 | 1 | **W1 최종 완료** — F-5 `[x]`. 호출부 전수 감사(`PrivateRoute` 4라우트 + `LinkRouter` 공개프로필 action 부재)로 로그인 전 도달 0건 확인 후 세션 필수화. backend **224P** / 신규 실패 0. **1단계 남은 것은 W2 재작업뿐** | W1 + 감독 |
