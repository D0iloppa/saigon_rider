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
- **BFF 는 Engine DB 테이블 직접 접근 금지** — 오직 `backend/app/engine_client.py` HTTP API 만. 사례(2026-08-02): 탈퇴 파기 배치가 Engine `device_user_map`(FCM 토큰 포함)을 지울 때도 새 Engine 엔드포인트를 만들지 않고 **이미 있던** `DELETE /v1/device-map`(소유자 일치 시만 삭제)을 `engine_client` 로 호출해 해소했다 — 경계를 넘지 않고도 기존 API 재사용으로 충분한 경우가 많다
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

### OAuth 콜백 도메인 — `BFF_PUBLIC_URL` 단일 지점 (2026-08-02)
- `backend/app/routers/auth.py:546 _bff_base_url()` = `os.getenv("BFF_PUBLIC_URL", "https://saigon.doil.me")`. **이 값 하나가 Zalo·Google·Apple 콜백 URL 을 전부 만든다.** 기본값이 dev 도메인이라 **미설정 환경은 조용히 dev 주소를 보낸다**(에러가 아니라 오배송이므로 눈에 안 띈다).
- 운영 콜백: `https://app.saigon-rider.com/api/bff/auth/oauth/{zalo|google|apple}/callback`
- ⚠️ **이 값을 바꾸면 세 콘솔(Zalo·Google Cloud·Apple Services ID)의 리디렉션 URI 를 함께 갱신해야 한다.** 한쪽만 바꾸면 그 provider 로그인이 즉시 깨진다. 콘솔은 URI 를 여러 개 등록할 수 있으니 **옛 것을 지우기 전에 새 것을 먼저 추가**해 무중단으로 넘겨라.
- 2026-08-02 사고: 운영이 옛 도메인 `letantonsheriff.com` 을 보내 Zalo 가 `-14003 Invalid redirect uri` 로 거부했다. 두 도메인이 같은 서버를 가리키고 둘 다 200 을 주고 있어서 오래 드러나지 않았다. **"응답이 200"과 "OAuth 콜백으로 등록된 주소"는 다른 문제다.**
- Zalo 는 추가로 콘솔의 **도메인 인증(`Xác thực domain`)** 과 앱 활성화가 필요하다.

### migration
- `database/init/NNN_*.sql` 번호순. 신규 볼륨은 `docker-entrypoint-initdb.d` 가 전건 실행
- **기존 볼륨은 `docker-compose.yml` 의 `bff_migrate` 에 등록된 것만 적용된다** — `command`(`-f`) + `volumes` **양쪽에 등록 필수**. 등록 누락이 반복 결함이었다(F-20)
- 적용 이력 원장 `schema_migrations`(`160_*.sql`) — `bff_migrate` 가 각 `-f` 뒤에 `-c "INSERT ... VALUES (NNN) ON CONFLICT DO NOTHING"` 을 인터리브. `ON_ERROR_STOP=1` 로 "성공한 파일만 기록"이 자동 보장. fresh-init 은 `-c` 없이 실행되므로 원장이 비는데, 빈 볼륨은 정의상 최신이라 **의도된 범위 한정**
- 현재 최대 번호 **171**. `bff_migrate` 등록 범위 139~171
- 🔴 **fresh-init ≠ 라이브 스키마 사고**(2026-08-02): `database/init/` 전건 실행으로 재현한 스키마가 라이브 dev DB 와 어긋나 있었다(`users.deleted_at` 생성 SQL 부재·`badges.policy_id`(`033_*.sql`) 라이브 미적용·`flood_confirmation.lat/lng` NOT NULL 라이브 미반영). `169_schema_parity_backfill.sql` 로 역보강 + `backend/app/tests/test_schema_parity.py` 로 핵심 컬럼 존재를 정적 고정. **fresh-init 이 ERROR 0건인 것과 스키마가 실제와 일치하는 것은 다른 문제**임을 명심 — 게이트 통과를 스키마 파리티의 증거로 삼지 말 것

## PATTERNS

### 화면 → 페이지 매핑
상세는 [`frontend-page-map.md`](./frontend-page-map.md). **화면 동작을 바꾸기 전에 그 문서의 해당 절을 반드시 읽어라** — 대표 결정이 본문 서술로만 기록돼 있어 grep 으로 놓치기 쉽다(§TRADEOFFS 의 N-5 사고 참조).

주요 라우트: `/home`(HomePage) · `/market`(+`/search`·`/new`·`/wishlist`·`/:id`·**`/:id/edit`**·`/ad/:id`·**`/keyword-alerts`**) · `/map`(NeighborhoodMap+Canvas, `/map/search`) · `/info/*`(날씨·유가·주유소·정비소·침수) · `/feed`·`/dm` · `/biz/*`(intro·apply·status·manage·news·prices) · `/settings/*`(privacy·terms 는 **공개 라우트**) · `/auth/*`(oauth-login·oauth-result·profile-setup — profile-setup 은 **PrivateRoute 밖**이어야 함)
- **스플래시(2026-08-02)**: `/splash`(`Splash.tsx`)의 [시작하기]와 [로그인] 버튼이 둘 다 `/auth/oauth` 로 가는 완전 중복이라 대표 지시로 [로그인]을 제거. 고아가 된 `.loginBtn` CSS(`Splash.module.css`)와 i18n 키 `splash.loginBtn`(ko/en/vi)도 함께 제거.
- **키워드 알림(마켓 saved-search)은 시트→페이지 승격**(2026-08-17, 커밋 `58bb3b9`): 신규 라우트 `/market/keyword-alerts`(`MarketKeywordAlerts.tsx`, PrivateRoute)로 목록·추가·수정·삭제를 다룬다. `MarketMain.tsx` 안의 칩 나열 바텀시트(`.alert*` CSS 12클래스)는 **폐기됐다** — 되살리지 말 것, 키워드 10~30개 규모는 시트로 관리가 안 된다. 선례는 `4762726`(ProfileCard 시트→페이지 승격) — "시트=잎(leaf 액션), 페이지=탐색(browse)" 원칙과 일관. 진입점 4곳: `MarketMain.tsx` 헤더 벨 / 매물 0건 CTA, `NotificationInbox.tsx` TopBar, `NotiSettings.tsx` 캡션 링크화.

### 진입·인증 경로 (2026-08-03, UX 감사 Gate A)
- **딥링크 목적지는 `lib/returnTo.ts` 로 보존한다.** `PrivateRoute` → `Splash` → OAuth → `ProfileSetup` 전 구간, 성공 후 **1회만 소비**. OAuth 가 페이지를 벗어나므로 `sessionStorage`. 로그인 성공 지점에 `/home` 을 **하드코딩하지 말 것** — 이전에 4지점이 하드코딩이라 공유·푸시·업체 홍보 링크 유입이 전부 홈으로 흘렀다. `isSafeReturnPath` 는 앱 내부 경로만 허용하고 외부 URL·`//`·`javascript:`·제어문자와 `/splash`·`/auth`·`/link`(루프 방지)를 거부한다.
- **`AppShell` 폴링은 로그인 상태에 종속된다.** 비로그인 화면에서 DM 을 폴링하면 419 → 세션만료 처리 → **약관·방침(공개 라우트)에서 20초마다 강제 이탈**한다. 실제로 발생했다. 폴링을 다시 무조건 실행으로 되돌리지 말 것.
- **419 는 "세션 없음"과 "세션 만료"를 구분한다**(`api/client.ts` `handleSessionError`). 애초에 세션이 없던 419 는 조용히 무시 — 한 번도 로그인한 적 없는 사용자에게 "세션이 만료되었습니다" 는 거짓말이다.
- **탭바 활성은 경로→탭 매핑(`TabBar.tsx` `TAB_PATH_PREFIXES`)이 SoT.** 서브 라우트를 추가하면 여기 매핑도 추가한다 — 빠지면 그 화면에서 탭 5개가 전부 회색이 된다(30여 화면이 그 상태였다). 미인증 시 탭바·FAB 는 숨긴다.
- **422 detail 은 사용자 문자열에 싣지 않는다.** `sanitizeDetail` 은 **배열을 통과**시키는데 FastAPI 422 detail 은 항상 배열이고 요청 본문(`input`)이 되비쳐 있어, 가입 화면에 `user_id` UUID 가 노출됐다. 오류 detail 을 표시 문자열로 만드는 새 경로를 추가할 때 배열 형태를 반드시 점검할 것.

### 지도 — 엔진이 2벌이다 (혼동 주의)
- `SaigonMapV2`: `pickMode`/`onPointPick` 있음 / **POI 없음** / depth1→2→3 교체식. 종전엔 지역선택 시트에도 쓰였으나 그 시트는 2026-08-06 폐기 — 현재 사용처는 좌표 피커 계열뿐.
- `SaigonMapV5`: **POI 있음** / 연속 줌(L1~L3) / 2026-08-03 에 `pickMode`·`onPointPick` 추가(기본 off). `NeighborhoodMapCanvas`·info 3화면·`BizLocationPicker`.
- **L3+POI 가 함께 보이려면 3조건이 동시에** 맞아야 한다 — `lightweight={false}` · 마운트 즉시 `L3_VBW`(≈1.1km) 안쪽으로 줌인(`initialGps`) · 호출부가 `fetchPoiMapItems`→`buildPoiLayer`→`markers` 합류. POI 는 지도 컴포넌트가 그리지 않는다.
- **`pickMode` 화면은 `polyActive={false}` 여야 한다.** `polyActive=true` 는 L3 를 `selWard` 1개로 제한하는데 `pickMode` 는 ward 탭 판정 앞에서 early-return 하므로 `selWard` 가 영영 갱신되지 않아 초기 ward 밖에 L3 가 안 그려진다. 기록된 "2.4배·7.5초" 비용은 **도시 전역 조망 기준이라 줌인된 피커에는 전이되지 않는다**(뷰포트 630유닛 < ward 평균 1522유닛). `onViewportChange` 가 `polyActive` 와 무관하게 depth3 를 이미 fetch 하므로 네트워크 추가비용 0.
- **"L3+POI 표시 프로파일" 은 세 화면이 공유한다** — `BizLocationPicker`(등록 피커) · `BizPublic`(업체 상세 홈 탭) · 동네지도. 조합은 `lightweight={false}` + `polyActive={false}` + `initialGps` + POI 배선이다. **`lightweight` 하나가 L3 를 원천 차단**하므로(그래서 업체 상세가 L2 까지만 보였다) 새 화면에서 L3 가 안 보이면 여기부터 보라. POI fetch/취소/build 는 `components/maps/usePoiMarkers.ts` 공용 훅이다 — 복제하지 말고 이걸 써라.
- **서비스 지역은 37개 ward**(`saigon-depth1.json`, 중심부 약 14×14km)다. `resolveDistrict` 내부 `inServiceArea` 가드 때문에 **Thủ Đức·Bình Tân·Gò Vấp 업체는 등록 자체가 불가능**하다. 대표 결정(2026-08-03): 이번엔 유지하고 안내 문구만 노출. 폴리곤 확장은 별건.

### 번들·정적 자산 (2026-08-03, UX 감사 Gate B)
- **라우트는 `React.lazy` 로 분할한다.** 초기 로드 gzip 911KB → 247KB(-73%). **eager 로 남기는 것은 스플래시·인증·홈·`Suspended`** 뿐이다 — 부트스트랩 리다이렉트 대상이라 lazy 로 만들면 첫 진입에 왕복이 추가된다. `Suspense` 는 `BackgroundRoutes` 전체에 **하나만** 둔다(라우트마다 감싸면 이동할 때마다 깜빡인다).
- `manualChunks` 는 `vendor-react`·`vendor-map` **둘만**. 무분별한 분할은 요청 수만 늘리고 캐시 효율을 떨어뜨린다.
- 🔴 **빌드 산출물을 git 에 추적하지 마라 — 소스를 가린다.** `vite.config.js`·`vite.config.d.ts`(tsc -b, composite 산출물)가 추적돼 있었는데 **Vite 는 설정파일 탐색에서 `.js` 를 `.ts` 보다 먼저 로드**한다. 스테일한 `.js` 때문에 `vite build` 직접 실행 시 `manualChunks` 가 통째로 무시됐다(운영 Docker 는 `npm run build`=`tsc -b && vite build` 라 매번 재생성돼 무사했다). `.gitignore` 로 정리했다 — `*.tsbuildinfo` 도 같은 부류다.
- **폰트는 자체 호스팅한다**(외부 CDN 0). 근거 3가지: Capacitor 네이티브인데 오프라인 폴백이 없었고, 사용자 IP 가 제3자로 나가며(PDPD 국외이전 고지), 외부 호스트가 느리면 첫 렌더가 늦는다.
  - 🔴 **한글 글리프는 자체 호스팅하지 않는다.** "한국어 UI 를 지원한다" 와 "한글을 번들에 넣는다" 는 다른 명제다 — Android(Noto Sans CJK)·iOS(Apple SD Gothic Neo)가 시스템 폰트로 완전히 커버하고, **CSS 폰트 폴백은 글리프 단위**라 한글만 시스템 폰트로 떨어지고 라틴·베트남어는 Pretendard 로 렌더된다(두부 아님). 한글 포함 시 3.9MB, 제외 시 **304KB**. 타겟이 호치민·기본 언어가 베트남어인데 부차 언어를 위해 3.9MB 를 이력에 넣는 건 비례하지 않는다. **`'Pretendard'` 를 폴백 없이 단독 선언하면 이 전제가 깨진다** — 새 `font-family` 선언에 항상 generic family 를 붙여라.
  - ⚠️ `Instrument Serif` 는 **베트남어 글리프가 없다**(Google Fonts 가 vietnamese 서브셋을 만든 적이 없다). CDN 시절부터의 결손이라 자체호스팅이 만든 문제가 아니다. 사용처 3곳(`splash.subtitle`·`quest.emptyQuote`·`ride.*Epigraph`)이 전부 베트남어 성조를 포함해 **한 문장 안에서 서체가 섞인다.** 제품·디자인 결정 대기.
  - `flag-icons` 는 전체(200개국) import 금지 — `styles/flags.css` 에 실제 쓰는 `vn`/`us`/`kr` 만 둔다. 4KB 미만이라 data-uri 로 인라인돼 추가 요청이 없다.
- **압축**: 컨테이너 nginx conf 에는 gzip 설정이 없지만 **운영은 호스트 nginx 가 이미 gzip 을 적용**한다(응답 헤더 실측). brotli 는 스톡 `nginx:alpine` 에 모듈이 없어 이미지 교체가 필요하다 — 미적용.

### CSS 토큰 — 명명 규칙은 하나다 (2026-08-03, UX 감사 Gate B)
- 실제 토큰은 `styles/tokens.css` 의 `--text`/`--text-2`/`--text-3` · `--line` · `--surface`/`--surface-2` · `--brand-50~900` 이다. **다른 명명 규칙(`--text-primary`·`--border`·`--divider`·`--bg-2`·`--primary`·`--text-1`)으로 쓴 코드가 섞여 들어와 38곳이 미정의 상태로 빈 값 렌더되고 있었다.** 색·배경·테두리가 통째로 사라져도 아무도 몰랐다 — 이 저장소에 **스크린샷 회귀 자동화가 없기 때문**이다.
- 🔒 **강제 장치**: pre-commit `css-tokens` 훅(`tools/check_css_tokens.py`)이 폴백 없는 `var(--x)` 중 정의에 없는 것을 **커밋 차단**한다. 폴백이 있는 `var(--x, ...)` 는 의도된 선택적 참조로 보고 통과시킨다. JS 가 `style` 로 주입하는 토큰(`--status-bar-height`·`--keyboard-height`·`--peek`·`--filter-id`)은 화이트리스트.
- **별칭 토큰을 `tokens.css` 에 추가해 해결하지 마라** — 명명 규칙이 두 벌로 굳는다. 기존 토큰으로 치환한다. 역할별 선례를 먼저 찾아라(예: 이미지 플레이스홀더 썸네일 배경은 `--surface-2` 가 이미 3파일에서 관례다).
- 감사 문서는 이걸 13곳(`--text-1`)으로만 봤다. **검사기를 만들자 25곳이 더 나왔다** — 정적으로 잡을 수 있는 결함은 사람이 세지 말고 스크립트로 세라.

### 실패 표현 규약 (장애를 콘텐츠 부재로 위장하지 않는다)
- 데이터 없음과 **조회 실패**를 반드시 구분한다. 기존 `unavailable` 패턴(`HomePage`·`InfoFloodMap`)과 `StateBlock(tone="error")` + 재시도를 미러링
- `useInfiniteScroll` 은 `error` 를 노출한다. 소비자(MarketMain·MarketSearch·FeedList·QuestList)는 `items.length === 0 && error` 일 때만 오류를 렌더(과차단 금지)
- 사용자 노출 문구는 `frontend/src/locales/{ko,en,vi}` **3개 언어 모두**에 키 추가(하드코딩 금지)

### 게이트·가드
- 광고 노출 판정은 `backend/app/services/ad_gating.py` 의 `launching_ad_conditions()` 를 **재사용**한다(목록·통계·상세 공통). 게이트 로직 복제 금지
- 민감 content(사업자등록증·간판)는 `contents.is_private` 플래그로 판정한다(업로드 시점 지정). `BusinessProfile` 역참조 방식으로 되돌리지 말 것 — 업로드~제출 전 구간과 반려 후에 공개되는 구멍이 있다
- 공개 `/api/sre/*` 는 **allowlist** 다(`nginx/conf.d/default.conf`) — `POST /api/sre/sreMessage`(모바일 GPS ingest) 하나만 통과, 나머지 404. 프론트에는 `Service='sre'` 호출부가 없다
- **서비스 경계 안내(2026-08-02)**: 위치가 서비스 지역 밖일 때 안내 문구는 `market.outOfService`/`market.outOfServiceDetail`(ko/en/vi) — `LocationPickerSheet.tsx`·`MarkerLocationPicker.tsx` 가 노출한다. 가드는 `const outOfArea = !!picked && !inServiceArea(...)` — **`!!picked &&` 가 필수**다(위치 미확정인 첫 화면에서 경고가 뜨면 안 됨). 공용 문구 `map.outsideArea` 는 7곳이 공유하는 SoT. 계약 테스트 `frontend/src/pages/market/outOfServiceGuidance.contract.test.mjs`.

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
  - blob 구성 필드(2026-08-01): listing `[title, description]` · **biz `[name, address, intro]`** · news `[title, body]` · feed `[content]` · ad `[title, body]`
  - 번역 배선 범위(대표 결정 2026-08-01, **업체 정보까지만**): 피드 본문 · 매물 title/description · 광고 title/body · 업체 name/address/intro · 가게소식 title/body · 가격표 name. **리뷰·댓글·공지·FAQ 는 호출량 때문에 의도적으로 제외**
  - 소급 백필: `backend/scripts/backfill_search_blob.py --entity all [--translate] --rps 5`
  - 설계·실측 근거: [`260801_multilingual_search_design.md`](../260801_multilingual_search_design.md)
- ✅ **2026-08-02 교차언어 검색 완성** — 백필 1패스(원문 258건)+2패스(번역) 실행, 번역 캐시 144→239. 실측: `"자전거"` 로 베트남어 `Xe đạp thể thao Giant` 가, 무성조 `"xe may"` 로 `Phụ tùng xe máy chính hãng` 가 검색된다. `search_blob` 채움률 207/207

### 키워드 알림 — 정규화 재사용·매칭 불변식 (2026-08-17, 커밋 `58bb3b9`)
마켓 saved-search 구독(`/market/keyword-alerts`) 완성. 정규화·매칭 규약 3건은 되돌리면 회귀다.
- **정규화 함수는 코드베이스에 단 1개** — 위 검색 절의 `search_norm.py` `norm()` 을 그대로 재사용한다(NFD 분해로 성조 제거, `đ/Đ` 는 NFD 로 안 풀려서 명시 치환). **SQL 로 translate/unaccent 재구현 금지** — 정규화가 두 벌로 갈라지면 검색과 알림 매칭 결과가 어긋난다.
- **매칭은 SQL `strpos()`**(`noti_worker/__main__.py`) — **`LIKE` 금지**: 위 검색 blob 의 `LIKE` 와 달리 여기선 사용자가 입력한 keyword 원문이 패턴 쪽에 들어가므로, `%`/`_` 가 섞이면 의도치 않은 와일드카드로 오작동한다. 빈 문자열 방어 필수 — `strpos(x,'')` 는 1(항상 매치)이라 빈 keyword 가 전체매물에 알림을 쏜다.
- **`keyword_norm` NULL 폴백**: 마이그레이션(`180_marketplace_keyword_alerts_norm.sql`·`181_keyword_alert_max_count.sql`)은 `bff_migrate` 로 자동 적용되지만 백필(`backend/scripts/backfill_keyword_alert_norm.py`)은 수동이다. 그 사이 `keyword_norm` 이 NULL 인 행은 원본 `keyword` 로 폴백 매칭해 기존 구독이 조용히 죽지 않게 한다. **운영 배포 시 백필 1회 실행 필수**(안 하면 동작은 하나 성조 정규화 이점이 없다) — `bff_migrate` 는 psql 전용 postgis 이미지라 마이그레이션 안에서 백필을 겸할 수 없다. dev 는 15/15 백필 완료.
- 부수 규약: UNIQUE 는 `(user_id, keyword_norm)` / 상한은 `app_config('market','keyword_alert_max_count')`(기본 20, 어드민 1~100), 프론트는 `GET /api/bff/app-config` 로 조회 / POST·PATCH 는 `pg_advisory_xact_lock(hashtext('kw_alert:{user_id}'))` 로 유저 단위 직렬화하고 **중복판정을 상한검사보다 먼저** 수행(상한 도달 유저의 기존 키워드 재등록이 부당하게 막히지 않게) / 에러 계약 `keyword_too_short`(422)·`banned_keyword`(400)·`keyword_alert_limit`(422), 중복은 에러가 아니라 기존 row 를 idempotent 반환.

#### 번역 API 403 진단 — 원인은 결제였다 (2026-08-02 해소)
- 3주간 모든 번역이 `403 userRateLimitExceeded` 였다. 원인은 **Google Cloud 결제 계정이 전부 "종료됨"** 이었던 것 — 결제가 끊기면 프로젝트 quota 가 0으로 떨어지고 이 에러가 난다. 키 폐기도, API 비활성도 아니었다.
- 🔎 **판별법(다음에 같은 증상이면 이것부터)**: `GET /language/translate/v2/languages` 는 **200** 인데 `POST /language/translate/v2` 만 403 이면 → **키·API 활성화 문제가 아니라 과금/quota 문제**다. 무료 엔드포인트는 살아 있고 과금 엔드포인트만 죽기 때문이다. `accessNotConfigured` 면 API 비활성, `API_KEY_SERVICE_BLOCKED` 면 키 제한 — 셋을 구분하라.
- 결제 계정을 다시 열 수 없으면 **새 계정 생성 후 프로젝트를 재연결**해야 한다(계정만 살려도 프로젝트 연결이 끊겨 있으면 그대로 실패). 재연결 후 전파 지연 없이 즉시 복구됐다.
- 같은 계정에 프로젝트 4종(`saigon-rider-af3c9`·`gen-lang-client-0854283450`·`dev-doil`·`doil-dev`)이 묶여 있다. Translate 키 소속 프로젝트가 불확실하면 전부 옮기는 게 빠르다.
- 🔴 **이 장애는 3주간 발견되지 않았다.** 번역 실패가 조용히 삼켜져 "검색이 좀 안 되네" 로만 체감됐기 때문이다. 외부 API 의존 경로는 실패를 관측 가능하게 만들어야 한다.

### 검증 하네스 (호스트 python 3.8 로는 불가)
```
docker run --rm --env-file .env -e PYTHONPATH=/repo/backend \
  -v /mnt/c/DEV/saigon_rider:/repo -w /repo/backend --entrypoint sh saigon_rider-bff \
  -c 'pip install -q pytest pytest-asyncio pytest-mock >/dev/null 2>&1; python -m pytest app/tests -q'
```
engine 은 `-r requirements-dev.txt`. 프론트는 `./node_modules/.bin/{tsc,eslint}` + `node --test $(find src -name "*.test.mjs")`.
DB: `docker exec saigon_db psql -U wellconn -d saigon_rider`.
프론트 계약은 **`.mjs` 정적 계약 테스트**(회귀 감시)와 **Playwright E2E**(실화면 검증) 두 층으로 고정한다 — 정적 테스트는 지우지 말 것, 둘의 역할이 다르다.
- **CI**: `.github/workflows/ci.yml` — `guard-scripts`(seed safety·migration prefix·**committed-secrets**) / `backend-tests` / `engine-tests` / `frontend-checks`. **`.env` 없이 더미 env 2개(`ADMIN_JWT_SECRET`·`ADMIN_PASS_HASH`)만으로 동작**한다(`admin_auth.py` 가 import 단계에서 `RuntimeError` 를 던지는 유일한 키가 `ADMIN_JWT_SECRET`). engine 은 `conftest.py` 가 env 를 자체 주입해 추가 키 불필요
- **E2E**: `frontend/e2e/*.spec.ts` + `playwright.config.ts`(baseURL `http://localhost:18090`). **구동 중인 dev 스택을 대상으로** 돈다. 세션은 `dev-login` 후 `sr_session` 쿠키를 `addCookies` 로 심어 앱의 실제 부트스트랩 경로를 태운다. `data-testid` 는 쓰지 않는다(프로덕션 코드 무침습 — 플레이스홀더·role·텍스트 셀렉터로 커버). 각 spec 의 `afterEach` 가 `DELETE FROM users` 한 줄로 CASCADE 정리
  - 🔴 **E2E 는 "배포본이 소스와 다르다"를 잡는 유일한 층이다.** 도입 첫 실행에서 구동 중이던 `saigon_frontend` 컨테이너가 소스보다 오래된 빌드라 **동의 게이트가 dev 에서 아예 동작하지 않던 것**을 발견했다. 프론트 변경 후에는 `docker compose --env-file .env up --build -d frontend` 를 잊지 말 것
  - 📌 **교훈(2026-08-02, 같은 사고 두 번째)**: 탈퇴 계정 로그인 시 토스트에 409 `restore_token` 이 원문 노출된 실기기 사고를 조사한 결과, 근본 원인은 코드가 아니라 **배포**였다 — 실행 중이던 `saigon_frontend` 번들이 409 인터셉트 커밋보다 **먼저 빌드된 구버전**이었다(배포 번들에 `account_deleted` 0건 실측). **이 저장소에서 "코드가 맞는데 동작이 다르면 배포 번들부터 의심하라."** 프론트 동작 검증은 반드시 **재빌드 후** 할 것
  - 브라우저에서는 `native.platform === 'web'` 이라 강제 업데이트 판정 경로가 **원천적으로 실행되지 않는다** — E2E 로 검증 불가(실기기 필요, B-1)
  - 📌 **교훈(2026-08-03, 세 번째 — 이번엔 "빌드가 낡은 것"이 아니라 "소스에 파일이 없는 것")**: 운영 스플래시에서만 히어로 영상이 안 나왔다. 원인은 `frontend/public/assets/videos/saigon-hero.mp4` 가 **git 미추적**이었던 것 — `Splash.tsx` 의 참조 코드는 운영에도 배포돼 있었고(운영 번들에서 문자열 실측) **파일만 없었다.** `.gitignore` 대상도 아니고 그냥 `add` 가 안 된 상태였다.
    - **dev 는 로컬 작업 트리에서 빌드하므로 미추적 파일도 번들에 들어간다. 운영은 git 에서 받아 빌드하므로 없다.** 그래서 "dev 는 되는데 운영만 안 된다" 가 된다 — 환경 차이로 오해하기 쉽다.
    - 증상이 404 가 아니라 **SPA 폴백**이라 더 헷갈린다: 파일이 없으면 nginx 가 `index.html` 을 내주고 라우터가 `/splash` 로 보낸다. "동영상 URL 인데 스플래시로 리다이렉트" 가 이 신호다. 정상이면 Range 요청에 **206 + `video/mp4`** 가 온다.
    - 🔎 **점검법**: 프론트 코드가 참조하는 `/assets/*` 경로를 뽑아 `frontend/public` 실파일과 `git ls-files` 를 대조하라. 2026-08-03 전수 점검에서 미추적은 이 1건뿐이었다.
    - ⚠️ **가드 없음**: `tools/check_landing_public_assets.py` 는 *내용*(dev 문자열 노출)만 보는 훅이라 이 사고를 못 잡는다. "참조되는데 추적 안 됨"을 막는 훅은 **아직 없다** — 재발하면 그때 추가를 검토할 것.
    - 이 영상이 저장소 최초의 추적 동영상(4.3MB)이다. 교체가 잦아지면 이력 누적이 부담되니 용량 축소·별도 저장을 먼저 검토할 것.
기준선(2026-08-02): backend **366** · engine 66 · tsc 0 error · eslint 0 errors/**249** warnings · `.mjs` **17**(전건 통과). ruff check/format 통과. **fresh DB(`database/init` 전건) ↔ dev 라이브 schema diff: fresh-only 0건, live-only는 전부 Engine/Alembic 소유(고아 0건)**, `withdrawn_member_archive` 양측 8컬럼 일치.
- **CI e2e job**: `.github/workflows/ci.yml` 에 `e2e` job 추가(**`pull_request` 에서만** 동작 — push 시엔 안 돈다). Playwright 스펙은 `frontend/e2e/*.spec.ts`(위 baseURL/세션 방식과 동일).

## TRADEOFFS

### 대표 결정 — 건드리면 회귀 (반박하지 말고 따를 것)
1. **위치 컨텍스트는 GPS 기준 앱 전역 단일 SoT 다** (2026-08-06 대표 지시 — *"기본을 다 gps로 / 안잡히면 전체지역으로 / 2개로만해 / 모든화면에서 / 지도 다나오게"*). 표시 범위는 `'gps'`(내 좌표 반경 3km) ↔ `'all'` **2개뿐**이고, **지역 선택 기능 자체가 폐기**됐다. 규칙 전문은 [`service-rules.md` GPS 절](service-rules.md), 설계도는 [`260806_gps_scope_unification_design.md`](../260806_gps_scope_unification_design.md).
   - 화면별 독자 위치 상태를 만들지 말 것. 측위는 `useLocationStore.ensureLocation()` 하나로(세션당 1회) — 화면이 `native.getLocation()` 을 직접 부르면 화면 수만큼 권한창이 뜬다.
   - ⚠️ **이 항목은 종전 결정 2건을 대체한다**: ① "동네지도 리스트의 지역 선택은 화면 로컬 상태로 유지"(2026-07-27) ② "전체↔선택지역 2모드, 지도 탐색에 GPS 미사용"(2026-07-25). 두 결정이 만든 SoT 3벌 분기가 바로 2026-08-06 대표 캡처의 원인이었다(GPS 는 `Thạnh Mỹ Tây` 인데 화면은 `Bến Thành`).
   - ⚠️ **2026-07-31 사고 교훈은 유효**: 감사 문서의 지적도 대표 결정과 충돌할 수 있다 — 무조건 신뢰하지 말고 대조하라. (단 이번 건은 감사가 아니라 대표 지시다.)
2. **지도 탭의 지역선택은 폐기됐다**(2026-07-25 비활성 → 2026-08-06 제거). `NeighborhoodMapCanvas.tsx` 의 `handleRegionSelect` 는 스토어 API(`selectRegion`)와 함께 삭제됐다. 되살리지 말 것
3. **광고 노출은 OFF 유지**(`ADS_ENABLED=false`) — 노출 지면·결제 미구현 상태에서 파는 쪽만 열려 있다. 수집 파이프라인도 미구현
4. **게이미피케이션(가챠·상점·인벤토리·시즌·쿠폰·차고) 진입점 차단 유지** — BFF 라우터 미등록(404) + Engine `verify_service_key` + 프론트 라우트 제거의 3중 구조
5. **OTP dev 우회는 운영 3중 게이트** — `docker-compose.prod.yml` 빈값 강제 + `_DEV_MODE` fail-safe 화이트리스트. 운영에서 플래그를 켜도 뚫리지 않는다
6. **검색 관련**(`frontend-page-map.md` :77·:86·:109·:111): `/map/search` 는 신규 API 없이 `fetchBizMapItems` 재사용 · 검색결과에 거리 미표기(GPS 프롬프트 회피) · 검색어 보존 + 무결과 전용 상태 · 업체소식 "더보기" 없음 · **`WITHDRAWN` 매물은 검색·피드·상세에서 완전 비노출**(이 필터를 건드리지 말 것)
7. **탈퇴회원 식별자는 해시로만 1년 보관**(2026-08-02) — 부정이용(재가입·제재회피) 방지 추적 목적. 전화번호·OAuth 식별자의 **원본은 보관하지 않는다.** `withdrawn_member_archive`(`170_withdrawn_member_archive.sql`).

### 탈퇴 계정 복구(restore) — 회귀 금지 보안 불변식 (2026-08-02)
`pages/auth/AccountRestore.tsx`(`/auth/restore`). 탈퇴 후 30일 유예기간 내 같은 OAuth 계정 재로그인 시, OAuth 인증은 **정상적으로 끝까지** 수행하고(본인 확인 전제) 세션 대신 409 `{code:"account_deleted", restore_token, ...}`을 반환한다. 사용자가 명시적으로 [복구하기]를 눌러야 `POST /auth/account/restore` 호출(자동 복구 없음, 대표 요구).
1. 🔴 **`restore_token`을 리다이렉트 URL에 실으면 안 된다.** OAuth 콜백 3경로(google/apple/zalo)는 soft-delete 여부와 무관하게 성공 경로와 **완전히 동일하게** `_redirect_with_exchange()`로 1회용 교환코드만 URL에 싣는다. 토큰은 **`POST /auth/oauth/exchange`의 409 응답 본문**에서만 발급된다. 회귀 방지 테스트가 `Location` 헤더에 토큰·user id가 없고 콜백 단계에서 `passcode_hash`가 발급되지 않음을 고정한다.
2. 🔴 **복구 허용 판정은 `_issue_restore_grant` 한 곳에만 존재한다.** 콜백에 판정을 두지 않는다 — 두 곳이 되면 한쪽만 고쳐 구멍이 난다.
- 토큰은 새 저장소 없이 기존 `passcode_hash` + `session_expires_at`(TTL 10분)을 재사용한다. `deps.py`의 세션 검증이 `deleted_at is not None`을 거부하므로 이 토큰은 일반 세션으로 통하지 않는다(테스트로 증명).
- BANNED 계정은 복구 대상에서 배제하되 밴 사실을 노출하지 않고 기존 404를 유지(정보 노출 최소).

### 재작업 금지 — 적대적 반증에서도 깨지지 않은 영역
- **거래 무결성**: `market.py` `_load_appointment` 의 `FOR UPDATE` 잠금 + `140_*.sql` 의 부분 유니크 `uq_mp_appointment_active_per_listing WHERE status='ACCEPTED'`. 매물 철회(`WITHDRAWN`)는 **ACCEPTED 약속이 있으면 차단(409)** 하고 약속 테이블에 쓰지 않는 방식으로 이 무결성을 우회한다 — 이 조건을 없애면 무결성이 깨진다
- **보상 멱등**: Engine 이 `PolicyActionGrant` 유니크를 BFF 호출 **전에** 선점 + BFF `InternalRewardGrant` 독립 멱등
- **OAuth 3종**: PKCE·CSRF state·JWKS 서명검증, 설정 누락 시 fail-safe
- **지도 성능 설계**: depth3 는 뷰포트 내 동만 로드, 목록우선 진입은 `lightweight`. 자산 5.56MB/74파일이 한꺼번에 내려가지 않는다. **로딩 전략·시그니처를 바꾸지 말 것**(실패 알림 추가는 무해)

### fail-open 이 필요한 곳 (엄격히 지킬 것)
- **강제 업데이트**(F-19): 판정 불가 4케이스(서버 조회 실패·플랫폼 레코드 없음·설치본 `unknown`·버전 파싱 실패) 모두 **차단하지 않는다**. 넓히면 전 사용자가 앱에 못 들어온다. 🔴 **판정 자체은 유지, 버전 취득 경로는 교체됨(2026-08-02)**: `@capacitor/app` 은 `package.json`·`native.ts` 에 있었으나 **양 네이티브 브리지에 모두 없었다**(Android `MainActivity.java` 미등록, iOS `Podfile` 엔 `@capacitor/app`·`@capacitor/browser` **[제거됨]** 주석 — `@capacitor/browser` 의 `SFSafariViewController` 가 커스텀 스킴 OAuth 콜백을 못 받아 둘 다 제거하고 커스텀 `WebAuthPlugin` 을 씀). 그 결과 `App.getInfo()` 가 throw → catch 삼킴 → `appVersion='unknown'` → fail-open 으로 **F-19 가 실기기에서 영영 발동하지 않았다.** 조치: 이미 등록돼 동작 중인 커스텀 `Device` 플러그인에 `getAppVersion()` 추가(Android `DevicePlugin.java`, iOS `DevicePlugin.swift`), `native.ts` 가 그걸 쓰도록 교체, 유령 의존성 `@capacitor/app` 은 `package.json` 에서 제거. fail-open 불변식은 무변경(`appVersionForceUpdateFailOpen.contract.test.mjs` 6건). ⚠️ **잔여**: 네이티브 코드가 미컴파일(Android SDK·Xcode 없음)이라 실기기 발동 확인 못 함. `npx cap sync` 는 Capacitor CLI 8 이 Node ≥22 를 요구해 이 환경(Node 20)에선 실행 불가(이 vendoring 구조에선 어차피 대부분 무의미). **`native/android`·`native/ios` 서브모듈이 dirty 상태로 커밋되지 않았다.**
- **동의 미기록 게이트**(F-9): `PrivateRoute` 의 `user?.consentAgreedAt === null` 는 **엄격 비교**여야 한다. `!user?.consentAgreedAt` 로 바꾸면 `undefined`(판정 불가)까지 걸려 전 사용자가 동의 화면에 갇힌다. `privateRouteConsentGate.contract.test.mjs` 가 이 회귀를 감시한다. 연령 확인 체크박스(위 개인정보 파기 절 참조)를 `ProfileSetup` 에 얹으면서도 **`PrivateRoute` 자체는 무변경** — 이 엄격 `=== null` 불변식을 그대로 유지했다(재확인, 2026-08-02)
- **오프사이트 백업 미설정**(2026-08-02): `backup_offsite.py` 는 env 미설정 시 완전 무동작(fail-open) — 로컬 백업은 정상 성공하고 업로드만 건너뛴다. 업로드 실패도 경보만 하고 백업 잡을 실패시키지 않는다(`ZALO_API_PROXY`·`WITHDRAWN_HASH_PEPPER` 와 같은 관례). 아래 백업·복원 절 참조
- **검색**: 번역이 없는 행이 검색 결과에서 사라지면 안 된다(원문은 항상 매칭 대상이어야 함)

### 업체 데이터 유입 (2026-08-02 대표 결정)
- 어드민에 **업체 직접 등록**(`POST /admin/api/biz/accounts`)을 신설했다. 이전엔 유저 자가신청이 유일한 유입이라 동네지도가 빈 채로 시작하는 문제(S-2)가 있었다
- 관리자 생성 업체는 **`APPROVED` 즉시 생성**한다 — 관리자가 이미 승인권자라 `PENDING` 후 자기승인은 의미가 없다. 심사 이력 대신 `BIZ_ACCOUNT_CREATE` 감사 로그가 남는다
- 🔴 **`business_profile.user_id` 가 nullable 이다**(`168_*.sql`) — 관리자 등록 시점엔 사업자의 앱 계정이 없을 수 있다. **어드민 조회 쿼리는 반드시 outer join 이어야 한다**(`isouter=True`). INNER JOIN 으로 되돌리면 소유자 없는 업체가 목록에서 통째로 사라진다. `suspend` 알림도 `user_id is not None` 가드가 필요하다
- 미구현(대표 판단 대기): 소유자 연결 수단 · 관리자 생성 업체의 검증서류 강제 여부
- **CSV 일괄 등록**(2026-08-02): `backend/scripts/import_business_csv.py` — 영업으로 확보한 업체를 대량으로 넣는 경로. `--dry-run` 기본(파괴적 기본값 금지), `--commit` 으로만 실제 반영. `create_biz_account()` 와 동일한 부수효과(status=APPROVED·user_id=NULL·reviewed_at·`immediate_blob` 즉시 적재·`search.reindex` outbox·`warm_translations`)를 재현한다. 검증 실패(필수필드·미등록 category·호치민 범위 밖 위경도 10.4~11.1/106.4~107.0)·중복(name+address)은 해당 행만 건너뛰고 사유를 출력(전체 중단 안 함). **서비스지역(37개 동, `service_area.py`) 밖 좌표는 경고만 하고 등록은 막지 않는다**(대표가 나중에 경계를 넓힐 수 있음, `districts.py` 주석과 동일 원칙)
- **관리자 폼 사진 업로드**(2026-08-02, 위 미구현 항목 해소): 어드민은 `/admin/api/*` 밖(앱 전용 `POST /contents/upload`, `verify_user_session` 요구)을 호출할 수 없어 `POST /admin/api/biz/upload` 프록시를 신설했다. `routers/contents.py` 의 매직넘버 검증(`_sniff_mime`)을 그대로 재사용, `owner_type='system'`·`is_private=False`(`admin_legacy.py` `_save_uploaded_image` 관례와 동일). 프론트는 새 디자인시스템 없이 기존 antd 패턴 그대로 `Upload`(picture-card, `customRequest`)를 `BizAccountListPage.tsx` 생성 모달에 추가 — 사진은 선택 사항

### 개인정보 파기 (2026-08-02 대표 결정으로 확정)
- 탈퇴 30일 경과 시 **삭제**: 라이딩·퀘스트·배지 + 순수 개인데이터 15종 + **피드글·댓글**(대표 결정)
- **보존**: `users` 행(익명화 유지) · 거래(매물/약속/가격제안) · 리뷰 · **제재 이력** · **CS 문의** · **보상 지급 원장** · DM · 업체프로필 · 크라우드소싱 제보
- 🔴 **신고(`reports`)는 detach 로 보존한다.** `reports.post_id`/`comment_id` FK 를 **`ON DELETE SET NULL`**(`167_*.sql`)로 바꿔, 글·댓글이 지워져도 신고 사유·대상유저·처리결과가 남는다. **이걸 CASCADE 로 되돌리거나 "고아 FK"라며 정리하면 상습 위반자 추적 근거가 사라진다** — 제재 이력을 보존하기로 한 결정과 짝이다
  - 부수 효과(의도된 것): 관리자 모더레이션 삭제(`admin_api/feed.py`)·작성자 자진 삭제(`feed.py`)에서도 신고가 보존된다. **이전에는 이 두 경로에서도 신고가 조용히 사라지고 있었다**
  - `POST`/`COMMENT` 용 CHECK 제약은 삭제 후 NULL 을 허용해야 해서 제거했다. `LISTING`/`DM` 은 CASCADE 유지(파기 대상이 아니라 실질 영향 없음)
- 공표 문구(`legal.privacyHtml` ko/en/vi)는 이 실제 동작에 맞춰 개정됐다. **법무 검토 전 초안** 표시가 붙어 있고, 근거 조문·보존기간은 비어 있다
- **탈퇴 시 익명화 값 UNIQUE 충돌 버그 수정(2026-08-02)**: `users.py delete_account`가 `phone`·`nickname`을 `del_<초단위 timestamp hex>`로 덮어썼는데, `users.phone`·`users.nickname`이 **UNIQUE**라 같은 초에 두 명이 탈퇴하면 500이 났다. `del_<uuid4 hex 16자>`로 변경(20자 — `phone String(20)`/`nickname String(30)` 한도 내). `del_` 접두는 파기 배치 `_is_purge_eligible`의 익명화 흔적 판정에 쓰이므로 유지.
- **탈퇴회원 식별자 해시 아카이브(2026-08-02, 대표 결정)**: 부정이용(재가입·제재회피) 방지 추적 목적으로, 탈퇴 시 전화번호·OAuth 식별자를 **해시로만 1년 보관**한다(원본·개인 데이터 미보관). 마이그레이션 `170_withdrawn_member_archive.sql`, 테이블 `withdrawn_member_archive`(`bff_migrate`의 `command`/`volumes` 양쪽 등록).
  - 🔴 **HMAC-SHA256 + pepper(env `WITHDRAWN_HASH_PEPPER`) 필수.** 평문 SHA256 금지 — 전화번호는 키스페이스가 작아 전수 대입으로 즉시 역산된다. **pepper가 바뀌면 기존 해시가 전부 무효**가 된다.
  - pepper 미설정 시 **fail-open**: 아카이브만 건너뛰고 탈퇴는 정상 진행 + `log.error` + ops alert. 근거 — 아카이브는 부가 추적 장치일 뿐이고, 그 실패가 이용자의 탈퇴권 행사를 막으면 안 된다.
  - **캡처 시점은 탈퇴 시**(`delete_account`) — 전화번호는 탈퇴 즉시 파기, OAuth 신원 행은 30일 뒤 파기라 그때는 이미 늦다. **이미 익명화된 값(`del_*`)은 해시하지 않는다** — 복구 후 재인증 없이 재탈퇴하면 phone이 아직 `del_*`인데 그걸 남기면 영원히 매칭되지 않는 행만 쌓인다. **복구 성공 시 해당 user의 아카이브 행을 같은 트랜잭션에서 삭제**한다 — 복구한 회원이 영구히 "탈퇴 이력 있음"으로 남으면 안 된다.
  - 1년 경과분 파기는 `purge_deleted_accounts.py`의 **별도 단계**(기존 30일 개인데이터 파기와 미혼합, 반환 dict에 `archive_purged_count` 별도 키).
  - 운영 조회: `GET /admin/api/users/withdrawn-check` — 해시만 저장돼 운영자가 직접 SQL로 못 찾으므로 서버가 해시해 매칭한다. 전화번호는 `_normalize_vn_phone`으로 E.164 정규화 후 해시(저장 형식과 일치). pepper 미설정 시 503.
  - **개인정보처리방침 §4 개정 필요** — 현재 공표 문안은 "식별 정보 즉시 비식별화 / 30일 내 파기 / 보존분은 식별정보 제거 형태"이고 **탈퇴회원 보관기간 명시가 없다.** ko/en/vi 3개 로케일에 `[법무 검토 전 초안]` 표기로 문장을 추가했으며 **법무 검토(C-1) 대상**이다.
- **파기 범위 확대 — 방침 문안과 코드 일치(2026-08-02)**: 공표 방침 §4 는 파기를 약속하는데 실제 배치(`backend/app/jobs/purge_deleted_accounts.py`)에 빠져 있던 두 가지를 채웠다.
  - **FCM 토큰은 BFF DB 에 없다.** Engine DB `device_user_map.fcm_token` 에만 있어 "FCM 토큰"과 "Engine 기기 매핑"은 같은 행 하나다. 이미 있던 `DELETE /v1/device-map`(소유자 일치 시만 삭제)을 `engine_client` 로 호출해 해소했다(위 BFF↔Engine 경계 규약대로 새 Engine 엔드포인트는 만들지 않았다). 실패 시 로그만 남기고 계속 진행 — 그 유저는 `users` 행이 남아 다음 실행에서 다시 후보가 되므로 재시도로 자가 치유된다.
  - **`contents` 이미지 파기 범위는 "본인 업로드 전부"가 아니라 방침 §4 문언과 정확히 일치**시켰다: 프로필 사진(`users.avatar_content_id`)과 피드 게시물 사진(`feed_posts.image_content_id`, `feed_post_images`)**만**. 매물·DM·업체 서류/사진·리뷰 사진은 방침이 **보존을 공표**한 엔티티에 귀속돼 지우지 않는다 — 전부 지우면 오히려 새 불일치가 생긴다. 가드는 `owner_type='user' AND owner_id=:uid` 이중.
  - 🔴 **순서 주의(회귀 금지)**: content_id 수집 SELECT 를 **`feed_posts` DELETE 보다 먼저** 실행해야 한다 — `feed_post_images` 가 CASCADE 로 먼저 사라지면 참조를 잃는다. 파일 unlink 는 커밋 후 best-effort(`missing_ok=True`) — 실패해도 `contents` 행 파기를 우선한다.
- **연령 확인(2026-08-02, 대표 결정: 가입 시 체크박스)**: 약관 §1 "만 14세 이상"에 실제 절차가 없던 것을 F-9 동의 캡처(`ProfileSetup` + `POST /profile/consent` + `PrivateRoute` 게이트)에 항목 하나를 얹어 해소했다. 새 화면을 만들지 않았다.
  - 약관·개인정보 동의와 **별개 체크박스**(`ageConfirmed`) — 묶으면 개별 동의로 인정받기 어렵다.
  - 서버측 강제: `ConsentSaveRequest.age_confirmed` 필수 bool(미포함 422), `false` 면 **400** 으로 거부하고 어떤 동의 필드도 기록·commit 전에 중단한다. 프론트 가드만으로는 부족하다는 판단.
  - 기록: `consent_age_confirmed_at`(시각) + `consent_age_version`(연령 문구가 약관 §1 이므로 `terms_version` 기준). 마이그레이션 `database/init/171_age_consent_capture.sql`.
  - 🔴 **소급 backfill 없음** — 증빙 없는 동의 위조 금지(F-9 과 같은 근거). 171 은 nullable ADD COLUMN 만이고 UPDATE 가 없다. 기존 계정은 다음 로그인 시 이 화면을 거쳐 자연히 수집된다.

### 백업·복원 (게이트 9 / B-5, 2026-08-02)
- 격리 임시 컨테이너(`saigon_db_restore_drill`, 신규 볼륨)에 실제 복원 리허설 수행, **`saigon_db` 무접촉**(덤프는 `docker exec` stdout 읽기, 쓰기는 임시 컨테이너에만). 검증 기준은 "ERROR 0건"에서 멈추지 않고 **schema diff 0(1266컬럼) + 행수 diff 0(139테이블)** 양방향 대조까지 — 과거 `users.deleted_at` 드리프트 사고 재발 방지 기준
- 실측(dev 780K 덤프): 덤프 0.99초 · 복원 4.07초. **RPO = 최대 24시간**(백업 주기 일 1회, 02:30 ICT — 트래픽 낮은 새벽, `purge_deleted_accounts` 03:10 보다 앞). **RTO ≈ 10초**(dev 규모, 다운로드 불요·로컬 컨테이너 대 로컬 컨테이너). ⚠️ **dev 규모 실측이라 운영 규모(더 큰 행수·인덱스·큰 오브젝트, 오프사이트일 경우 네트워크 전송)로 외삽 금지**
- 신규: `tools/restore_db.sh`(기본 dry-run, `--commit` 필요, `saigon_db`·`*prod*` 컨테이너명 **거부** 가드), `backend/app/jobs/backup_db.py`(기존 APScheduler 에 등록 — 새 cron 인프라 도입 안 함), `backend/Dockerfile` 에 `postgresql-client`, `docker-compose.yml` 의 `bff` 에 PG 환경변수 + `./backups` 볼륨(`.gitignore` 대상이라 덤프 미커밋)
- **대표 결정 대기**: 오프사이트 저장 위치, 백업 주기, 운영 규모 리허설
- **오프사이트 암호화 백업(2026-08-02, 게이트 9 잔여 해소)**: `backend/app/services/backup_offsite.py` — `openssl enc -aes-256-cbc -pbkdf2` 로 **로컬 암호화 후** S3 호환 업로드(boto3). 벤더 중립이라 AWS S3·R2·MinIO 어디든 코드 변경 없이 붙는다.
  - 키는 `-pass env:` 로 전달 — 커맨드라인·`ps aux` 에 노출되지 않는다.
  - 미설정 시 완전 무동작(fail-open) — 위 "fail-open 이 필요한 곳" 절 참조. 업로드 실패는 경보만 하고 백업 잡을 실패시키지 않는다
  - env 6종(`BACKUP_ENCRYPTION_KEY`·`BACKUP_S3_*`)을 `.env`/`.env.example` 양쪽에 **빈 값**으로 추가(키셋 동일 규약)
  - 🔴 **`BACKUP_ENCRYPTION_KEY` 분실 = 오프사이트 백업 영구 복구 불가.** `.env` 와 별도 보관 필요
  - 검증: MinIO 임시 컨테이너로 암호화→업로드→다운로드→복호화 후 **SHA-256 바이트 동일** 실증(컨테이너 제거 확인). 원격 삭제 코드는 위험해서 넣지 않았다 — 원격 보존은 버킷 lifecycle

### fail-closed 가 필요한 곳
- **OpenAPI 무인증 공개 차단**(게이트 6, 2026-08-02): `docs_url`/`redoc_url=None` 은 이미 설정돼 있었지만 **커스텀 라우트(`/api/docs`·`/api/redoc`)와 `openapi_url` 이 무조건 등록**돼 있어 무력화된 채 운영 `app.saigon-rider.com` 이 무인증 200 으로 전체 API 표면을 공개하고 있었다. 조치: `backend/app/main.py` 에 `_DOCS_ENABLED` 게이트 — **fail-safe 화이트리스트**(`APP_ENV` 가 `{development, dev, local, test}` 에 없으면, 즉 미설정·오타 포함 **닫힌다**). ⚠️ **이 저장소엔 `APP_ENV` 판정이 여러 벌 있고 의미가 다르다**: `sms_client.py:24`·`routers/app_version.py:27` 은 **fail-open**("production 아니면 dev" — 오타 하나로 운영에서 열린다), `routers/auth.py`(AUTH-10)와 `main.py` 는 **fail-safe 화이트리스트**다. **보안 게이트는 반드시 후자를 쓸 것.** 판정 통합은 미완(별건). 회귀 테스트 `backend/app/tests/test_openapi_exposure.py` 4건(수정 전 3건 — 운영·미설정·오타 — 실패 실증).
- **안전정보(침수) — 상태가 3개다**: ① 정상 ② `is_stale`(예보 갱신 실패, 이전 snapshot) ③ **`never_confirmed`(그 구역 예측이 한 번도 성공한 적 없음)**. ②③ 은 초록 "안전"과 분리 렌더한다(`flood_prediction_status(district_code, last_success_at)`, `166_*.sql`).
  - 🔴 **판정 기준은 "행이 있느냐"가 아니라 "그 구역 예측이 성공한 적 있느냐"다.** 잡이 `pop < _THRESHOLD` 구역에 행을 만들지 않으므로 **빈 결과는 맑은 날의 정상·다수 결과**다. 빈 결과를 장애로 렌더하면 맑은 날마다 오작동한다(2026-08-01 에 감독이 이 방향을 지시했다가 워커 지적으로 철회한 이력이 있다)
  - `166_*.sql` 이 **기존 성공 이력이 확인되는 구역을 시드**한다. 이 시드를 빼면 배포 직후 **전 구역이 "확인 불가"** 로 뜬다
  - UI 판정은 `=== true` 엄격 비교 + `hasStaleRisk` 와 **동일한 필터 스코프 가드**(필터가 '신고'/'핫스팟'일 때 오판정 방지)
- **안전정보(침수) 기본 원칙**: 제공자 실패를 `0.0`(안전)으로 변환 금지. 실패 구역은 삭제하지 않고 `is_stale=TRUE` + `expires_at` 갱신으로 마지막 성공 snapshot 을 보존한다(갱신을 빼면 24h 후 fail-open 이 부활한다). UI 는 stale 을 초록 "안전"과 분리 렌더. **잡은 `pop < _THRESHOLD` 구역에 행을 만들지 않으므로 빈 결과는 맑은 날의 정상 결과다** — 빈 결과를 unavailable 로 렌더하면 오작동한다
- **GPS 궤적 소유자 검사**: `engine_client.lookup_device_map` 조회 실패 시 403

## PHILOSOPHY

- **카파시 4원칙 우선**: Think Before Coding(가정 명시·불확실하면 질문) / Simplicity First(요청을 푸는 최소 코드) / Surgical Changes(시킨 것만, 인접 코드 개선 금지) / Goal-Driven(검증 가능한 목표로 변환)
- **선례 미러링 > 새 발명**: 같은 문제를 이미 푼 코드가 있으면 그 패턴을 그대로 쓴다(실패 상태 표현·게이트·업로드·시트 CSS 재사용 등)
- **감사·문서를 주장으로 취급하고 재검증한다**: 2026-07-31 리메디에이션에서 감사 문서의 **사실오류 5건**(Docker/pytest/submodule 전제, `147` 멱등성, N-5 대표결정)과 **범위 과소 3건**(report 엔드포인트 1→5, `useInfiniteScroll` 소비자 1→4, 100건 천장 1→3곳)을 발견했다
- **수정 전 FAIL 실증**: 각 결함마다 수정 전 테스트가 실제로 실패하는지 확인한 뒤 통과시킨다
- **워커 실행 중 `git stash`/`reset --hard`/`checkout --` 금지**: 동시 작업 파일을 통째로 날린다(2026-07-31 3회 발생). 커밋은 모든 워커 종료 후에만
  - 🔴 **`git commit` 과 `pre-commit` 자체가 이 금지에 걸린다**(2026-08-03 재발). pre-commit 은 훅 실행 전 **미스테이징 파일을 stash 했다가 복원**한다 — 워커가 파일을 쓰는 중에 커밋하거나 워커가 직접 `pre-commit` 을 돌리면 그 창에 편집이 끼어든다. 게다가 그 찰나에 `git status` 를 보면 **"수정 0건"** 으로 나와 전량 유실로 오판하게 된다(이번엔 실제 손실 없었다). **워커 프롬프트에 "git add/commit 금지"뿐 아니라 "`pre-commit` 실행 금지"도 명시할 것.**
  - `ruff format` 훅이 신규 파이썬 파일을 1회 재정렬해 커밋이 실패하는 것은 정상 동작이다 — re-add 후 재커밋하면 된다
- **문서 = SoT**: `ai-docs/INDEX.md` → `context/current.md` → `agent-guidelines.md` 순으로 세션을 시작한다. 전체 파일 풀텍스트 검색 금지, 코드 그래프 조회(`codebase-memory` MCP) 우선. 코드 수정 후 같은 세션에서 재인덱싱한다
