# ADR — 사이공 라이더 아키텍처 결정 기록

> **이 파일이 SoT 다.** `codebase-memory` MCP 의 `manage_adr` 은 **미러**로만 취급한다.
> 이유: 2026-08-01 에 `manage_adr(mode='update')` 로 저장하고 17개 섹션까지 확인했으나, 이후 자동 재색인 뒤 `no_adr` 로 사라졌다. MCP 저장은 영속을 보장하지 않는다.
> MCP 미러 갱신: `manage_adr(mode='update', project='mnt-c-DEV-saigon_rider', content=<이 파일 내용>)`
>
> 출처: 2026-07-31~08-01 출시차단 리메디에이션 세션의 실측·검증 사실 + `CLAUDE.md` + `ai-docs/context/frontend-page-map.md`.
> 이 세션이 다루지 않은 영역(RP 경제 세부·DM·어드민 콘솔 내부)은 얇다 — 해당 영역 작업 시 page-map·코드 그래프를 함께 확인하고 확인한 사실을 여기 보강할 것.
> **대표 결정 항목은 대표 확인 후 확정 처리한다.**

## PURPOSE

호치민시 대상 모바일 하이브리드 앱(Capacitor WebView). 중고거래 마켓 + 동네지도(업체 디렉터리) + 안전정보(침수·날씨·주유소·정비소) + 커뮤니티/DM + 라이딩·RP 경제.

**출시 상태(2026-08-01): NO-GO.** 운영서버(`app.saigon-rider.com`)는 아직 실서비스가 아니며 1차 출시 가능 수준 도달 후 공개된다. 현재 공개 응답 중이나 2026-06-04 스냅샷의 방치된 구버전이다.

판정 SoT 3문서 — 이 순서로 읽는다:
1. [`ai-docs/260801_owner_action_items.md`](../260801_owner_action_items.md) — 대표 권한이 필요한 미결 항목만
2. [`ai-docs/260731_remediation_final_report.md`](../260731_remediation_final_report.md) — 최종 결과보고서(게이트 판정·시크릿 스캔)
3. [`ai-docs/260731_remediation_ledger.md`](../260731_remediation_ledger.md) — 결함별 검증 상세 원장

## STACK

Docker Compose, 단일 Nginx(:18090) 진입.
- `bff`(FastAPI :8080) — 앱 화면 BFF. `/api/bff/*`
- `engine`(FastAPI :8090) — RP·미션·보상 엔진. `/api/sre/*`
- `frontend`(React+Vite → nginx 정적), `admin_frontend`(React SPA, `/admin/`)
- `database`(postgis 15-3.3), `redis`, `imgproxy`, `worker`, `noti_worker`, `mcp_dev`, `wiki`
- `native/android`·`native/ios` — 별도 private GitHub 서브모듈(클론됨)
- `landing/` — 별개 pnpm 워크스페이스, saigon-rider.com root+www+business 정적 SPA

## ARCHITECTURE

### 절대 규약 (어기면 회귀)
- **BFF 는 Engine DB 테이블 직접 접근 금지** — 오직 `backend/app/engine_client.py` HTTP API 만
- **Engine 코드는 naive `datetime.now()` 금지** — timezone-aware 강제
- 모든 이미지는 `contents` 테이블 중개. 엔티티는 `*_content_id UUID` FK 만, 출력 시 `build_imgproxy_url()`. 레거시 `*_url` 은 read-only 폴백
- 프론트 동적 이미지는 `<AppImage>` 래핑(`<img>` 직접 금지). 상단 여백은 `var(--status-bar-height)`(고정 px 금지)
- 프론트 네이티브 기능은 `native.ts`(NativeInterface) 경유 필수 — `navigator.*` 직접 호출은 ESLint error
- 호스트 `npm run build` 직접 실행 금지 — `docker compose --env-file .env up --build -d <service>`

### 시크릿 위치 (2026-07-31 확정)
- OAuth 시크릿은 `.env` 가 **아니라 DB `app_config`(group_name='oauth')** 에 있다. `backend/app/routers/auth.py` `_load_oauth_config()` 가 **요청마다 DB 를 읽으므로 값 교체 시 BFF 재시작 불필요**
- 번역 API 키도 동일 — `app_config`(group_name='translate')
- 새 시크릿을 `database/init/*.sql`(**주석 포함**)·`.env.example`·문서·커밋 메시지에 넣지 말 것. **DB 에만** 둔다
- `.env` 와 `.env.example` 은 항상 동일 키셋
- 과거 사고: `104_oauth_zalo_config.sql` 의 **주석 줄**에 Zalo 실값이 커밋돼 있었다(`INSERT` 는 `CHANGE_ME` 였음). 2026-07-31 제거, 재발급은 대표 소관
- 🔒 **강제 장치**: pre-commit `committed-secrets` 훅(`tools/check_committed_secrets.py`)이 `database/init/*.sql` 의 app_config 계열 `value='...'`(**주석 포함**)과 `.env.example` 의 시크릿성 키에 실값이 들어가면 **커밋을 차단**한다. 범용 엔트로피 스캐너가 아니라 위 사고 패턴만 좁게 겨냥한 것이다(오탐이 늘면 아무도 안 보므로). 차단당했다면 훅을 끄지 말고 **실값을 DB `app_config` 로 옮겨라** — 훅이 그 psql 명령을 안내한다
- 시크릿 전체 스캔 결과(2026-07-31): 유출은 **Zalo app secret 1건뿐**. `.env` 는 이력에 커밋된 적 없고, Apple private key·Google client secret 은 커밋 파일이 placeholder 였다. Apple team_id/key_id/services_id 는 주석에 실값이 있었으나 **식별자이지 자격증명이 아니라** 재발급 불필요

### migration
- `database/init/NNN_*.sql` 번호순. 신규 볼륨은 `docker-entrypoint-initdb.d` 가 전건 실행
- **기존 볼륨은 `docker-compose.yml` 의 `bff_migrate` 에 등록된 것만 적용된다** — `command`(`-f`) + `volumes` **양쪽에 등록 필수**. 등록 누락이 반복 결함이었다(F-20)
- 적용 이력 원장 `schema_migrations`(`160_*.sql`) — `bff_migrate` 가 각 `-f` 뒤에 `-c "INSERT ... VALUES (NNN) ON CONFLICT DO NOTHING"` 을 인터리브. `ON_ERROR_STOP=1` 로 "성공한 파일만 기록"이 자동 보장. fresh-init 은 `-c` 없이 실행되므로 원장이 비는데, 빈 볼륨은 정의상 최신이라 **의도된 범위 한정**
- 현재 최대 번호 **164**. `bff_migrate` 등록 범위 139~164

## PATTERNS

### 화면 → 페이지 매핑
상세는 [`frontend-page-map.md`](./frontend-page-map.md). **화면 동작을 바꾸기 전에 그 문서의 해당 절을 반드시 읽어라** — 대표 결정이 본문 서술로만 기록돼 있어 grep 으로 놓치기 쉽다(§TRADEOFFS 의 N-5 사고 참조).

주요 라우트: `/home`(WorldMapV2) · `/market`(+`/search`·`/new`·`/wishlist`·`/:id`·**`/:id/edit`**·`/ad/:id`) · `/map`(NeighborhoodMap+Canvas, `/map/search`) · `/info/*`(날씨·유가·주유소·정비소·침수) · `/feed`·`/dm` · `/biz/*`(intro·apply·status·manage·news·prices) · `/settings/*`(privacy·terms 는 **공개 라우트**) · `/auth/*`(oauth-login·oauth-result·profile-setup — profile-setup 은 **PrivateRoute 밖**이어야 함)

### 실패 표현 규약 (장애를 콘텐츠 부재로 위장하지 않는다)
- 데이터 없음과 **조회 실패**를 반드시 구분한다. 기존 `unavailable` 패턴(`WorldMapV2`·`InfoFloodMap`)과 `StateBlock(tone="error")` + 재시도를 미러링
- `useInfiniteScroll` 은 `error` 를 노출한다. 소비자(MarketMain·MarketSearch·FeedList·QuestList)는 `items.length === 0 && error` 일 때만 오류를 렌더(과차단 금지)
- 사용자 노출 문구는 `frontend/src/locales/{ko,en,vi}` **3개 언어 모두**에 키 추가(하드코딩 금지)

### 게이트·가드
- 광고 노출 판정은 `backend/app/services/ad_gating.py` 의 `launching_ad_conditions()` 를 **재사용**한다(목록·통계·상세 공통). 게이트 로직 복제 금지
- 민감 content(사업자등록증·간판)는 `contents.is_private` 플래그로 판정한다(업로드 시점 지정). `BusinessProfile` 역참조 방식으로 되돌리지 말 것 — 업로드~제출 전 구간과 반려 후에 공개되는 구멍이 있다
- 공개 `/api/sre/*` 는 **allowlist** 다(`nginx/conf.d/default.conf`) — `POST /api/sre/sreMessage`(모바일 GPS ingest) 하나만 통과, 나머지 404. 프론트에는 `Service='sre'` 호출부가 없다

### 다국어 텍스트·검색 (2026-08-01 조사)
- **번역 SoT 는 `translations` 테이블**(`source_hash` PK / `source_text` / `text_ko` / `text_en` / `text_vi`). Redis → DB → provider 3계층(`services/translate.py`)
- 번역이 배선된 컬럼은 **5개뿐**: `FeedPost.content`, `MarketplaceListing.title`·`description`, `MarketplaceAd.title`·`body`. 그 외(업체 name/address, 소식, 가격표, 리뷰, 댓글, 공지, FAQ)는 **미번역**
- **다국어 데이터의 올바른 선례는 `Poi.name_ko/vi/en`**(`routers/map/poi.py`) — 언어별 컬럼 보유
- **검색은 `search_blob` 정규화 컬럼 + `pg_trgm` GIN 이 표준이다**(2026-08-01 전환, `164_search_blob.sql`). 이전의 "검색어를 3개국어로 번역해 원문에 OR ILIKE" 하던 역방향 방식은 폐기됐다 — 매 검색이 외부 API 에 의존해 API 가 죽으면 검색이 조용히 나빠졌다(실제로 3주간 발견되지 않았다)
  - `services/search_norm.py` `norm()` — NFD 분해로 발음구별기호 제거, `đ/Đ→d`, 소문자, 공백 압축. **정규화는 DB `unaccent()` 가 아니라 Python 쓰기 시점**에 한다(DB 함수를 쓰면 인덱스를 못 탄다)
  - `services/search_index.py` — `immediate_blob()`(원문 즉시) / `build_blob()`(번역분) / `reindex_entity()`(멱등). 비동기 재색인은 `notification_outbox` + `noti_worker` 의 `search.reindex` 핸들러 재사용
  - 🔴 **인덱스는 반드시 표현식 인덱스여야 한다**: `gin ((coalesce(search_blob,'')) gin_trgm_ops)`. 쿼리가 `COALESCE(search_blob,'')` 로 감싸는 이유는 blob 이 비어도 행이 검색에서 사라지지 않게 하는 fail-open 방어인데, 플레인 컬럼 인덱스로 만들면 이 `COALESCE` 와 매칭되지 않아 **Seq Scan 으로 폴백**한다(설계서 초안이 이 함정을 놓쳤고 구현에서 교정했다)
  - 쿼리는 `ILIKE` 가 아니라 **`LIKE`** — blob 이 이미 소문자 정규화돼 있다. 검색어도 같은 `norm()` 을 통과시켜야 한다
  - **쓰기 경로 6곳**(매물 등록·수정, 피드 작성, 업체 신청·수정, 가게소식)에 배선돼 있다. 새 컨텐츠 타입을 추가하면 여기도 배선해야 검색된다
  - 소급 백필: `backend/scripts/backfill_search_blob.py --entity all [--translate] --rps 5`
  - 설계·실측 근거: [`260801_multilingual_search_design.md`](../260801_multilingual_search_design.md)

### 검증 하네스 (호스트 python 3.8 로는 불가)
```
docker run --rm --env-file .env -e PYTHONPATH=/repo/backend \
  -v /mnt/c/DEV/saigon_rider:/repo -w /repo/backend --entrypoint sh saigon_rider-bff \
  -c 'pip install -q pytest pytest-asyncio pytest-mock >/dev/null 2>&1; python -m pytest app/tests -q'
```
engine 은 `-r requirements-dev.txt`. 프론트는 `./node_modules/.bin/{tsc,eslint}` + `node --test $(find src -name "*.test.mjs")`.
DB: `docker exec saigon_db psql -U wellconn -d saigon_rider`.
브라우저 E2E 가 없으므로 프론트 계약은 **`.mjs` 정적 계약 테스트**로 고정한다.
기준선(2026-08-01): backend **289** · engine 66 · tsc 0 error · eslint 0 errors/247 warnings · `.mjs` 18.

## TRADEOFFS

### 대표 결정 — 건드리면 회귀 (반박하지 말고 따를 것)
1. **동네지도 리스트의 지역 선택은 화면 로컬 상태로 유지한다**(2026-07-27, `frontend-page-map.md:128`). `useLocationStore` 전역에 쓰지 않는다 — 리스트가 스토어에 쓰면 주유소·정비소·날씨·홈의 동네까지 함께 바뀌는 정보화면 침습이 생긴다(침수지도 사고와 동일 경로). "지도보기 전환 시 지역이 안 넘어가는 불일치"는 **인지된 트레이드오프**다.
   ⚠️ **2026-07-31 사고**: 출시감사가 이것을 결함(N-5)으로 지목했고, 그 지적을 믿고 전역 수렴으로 바꿨다가 되돌렸다. **감사 문서의 지적도 대표 결정과 충돌할 수 있다** — 무조건 신뢰하지 말고 page-map 을 대조하라.
2. **지도 탭의 지역선택 비활성**(2026-07-25) — `NeighborhoodMapCanvas.tsx` 의 `handleRegionSelect` 는 배선이 끊긴 죽은 코드다. GPS 근처로 대체됐다. 되살리지 말 것
3. **광고 노출은 OFF 유지**(`ADS_ENABLED=false`) — 노출 지면·결제 미구현 상태에서 파는 쪽만 열려 있다. 수집 파이프라인도 미구현
4. **게이미피케이션(가챠·상점·인벤토리·시즌·쿠폰·차고) 진입점 차단 유지** — BFF 라우터 미등록(404) + Engine `verify_service_key` + 프론트 라우트 제거의 3중 구조
5. **OTP dev 우회는 운영 3중 게이트** — `docker-compose.prod.yml` 빈값 강제 + `_DEV_MODE` fail-safe 화이트리스트. 운영에서 플래그를 켜도 뚫리지 않는다
6. **검색 관련**(`frontend-page-map.md` :77·:86·:109·:111): `/map/search` 는 신규 API 없이 `fetchBizMapItems` 재사용 · 검색결과에 거리 미표기(GPS 프롬프트 회피) · 검색어 보존 + 무결과 전용 상태 · 업체소식 "더보기" 없음 · **`WITHDRAWN` 매물은 검색·피드·상세에서 완전 비노출**(이 필터를 건드리지 말 것)

### 재작업 금지 — 적대적 반증에서도 깨지지 않은 영역
- **거래 무결성**: `market.py` `_load_appointment` 의 `FOR UPDATE` 잠금 + `140_*.sql` 의 부분 유니크 `uq_mp_appointment_active_per_listing WHERE status='ACCEPTED'`. 매물 철회(`WITHDRAWN`)는 **ACCEPTED 약속이 있으면 차단(409)** 하고 약속 테이블에 쓰지 않는 방식으로 이 무결성을 우회한다 — 이 조건을 없애면 무결성이 깨진다
- **보상 멱등**: Engine 이 `PolicyActionGrant` 유니크를 BFF 호출 **전에** 선점 + BFF `InternalRewardGrant` 독립 멱등
- **OAuth 3종**: PKCE·CSRF state·JWKS 서명검증, 설정 누락 시 fail-safe
- **지도 성능 설계**: depth3 는 뷰포트 내 동만 로드, 목록우선 진입은 `lightweight`. 자산 5.56MB/74파일이 한꺼번에 내려가지 않는다. **로딩 전략·시그니처를 바꾸지 말 것**(실패 알림 추가는 무해)

### fail-open 이 필요한 곳 (엄격히 지킬 것)
- **강제 업데이트**(F-19): 판정 불가 4케이스(서버 조회 실패·플랫폼 레코드 없음·설치본 `unknown`·버전 파싱 실패) 모두 **차단하지 않는다**. 넓히면 전 사용자가 앱에 못 들어온다. ⚠️ 현재 `@capacitor/app` 미 cap-sync 로 실기기에서 `appVersion='unknown'` → **실기기에서는 발동하지 않는다**
- **동의 미기록 게이트**(F-9): `PrivateRoute` 의 `user?.consentAgreedAt === null` 는 **엄격 비교**여야 한다. `!user?.consentAgreedAt` 로 바꾸면 `undefined`(판정 불가)까지 걸려 전 사용자가 동의 화면에 갇힌다. `privateRouteConsentGate.contract.test.mjs` 가 이 회귀를 감시한다
- **검색**: 번역이 없는 행이 검색 결과에서 사라지면 안 된다(원문은 항상 매칭 대상이어야 함)

### fail-closed 가 필요한 곳
- **안전정보(침수)**: 제공자 실패를 `0.0`(안전)으로 변환 금지. 실패 구역은 삭제하지 않고 `is_stale=TRUE` + `expires_at` 갱신으로 마지막 성공 snapshot 을 보존한다(갱신을 빼면 24h 후 fail-open 이 부활한다). UI 는 stale 을 초록 "안전"과 분리 렌더. **잡은 `pop < _THRESHOLD` 구역에 행을 만들지 않으므로 빈 결과는 맑은 날의 정상 결과다** — 빈 결과를 unavailable 로 렌더하면 오작동한다
- **GPS 궤적 소유자 검사**: `engine_client.lookup_device_map` 조회 실패 시 403

## PHILOSOPHY

- **카파시 4원칙 우선**: Think Before Coding(가정 명시·불확실하면 질문) / Simplicity First(요청을 푸는 최소 코드) / Surgical Changes(시킨 것만, 인접 코드 개선 금지) / Goal-Driven(검증 가능한 목표로 변환)
- **선례 미러링 > 새 발명**: 같은 문제를 이미 푼 코드가 있으면 그 패턴을 그대로 쓴다(실패 상태 표현·게이트·업로드·시트 CSS 재사용 등)
- **감사·문서를 주장으로 취급하고 재검증한다**: 2026-07-31 리메디에이션에서 감사 문서의 **사실오류 5건**(Docker/pytest/submodule 전제, `147` 멱등성, N-5 대표결정)과 **범위 과소 3건**(report 엔드포인트 1→5, `useInfiniteScroll` 소비자 1→4, 100건 천장 1→3곳)을 발견했다
- **수정 전 FAIL 실증**: 각 결함마다 수정 전 테스트가 실제로 실패하는지 확인한 뒤 통과시킨다
- **워커 실행 중 `git stash`/`reset --hard`/`checkout --` 금지**: 동시 작업 파일을 통째로 날린다(2026-07-31 3회 발생). 커밋은 모든 워커 종료 후에만
- **문서 = SoT**: `ai-docs/INDEX.md` → `context/current.md` → `agent-guidelines.md` 순으로 세션을 시작한다. 전체 파일 풀텍스트 검색 금지, 코드 그래프 조회(`codebase-memory` MCP) 우선. 코드 수정 후 같은 세션에서 재인덱싱한다
