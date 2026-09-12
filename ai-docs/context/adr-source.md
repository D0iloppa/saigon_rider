# ADR 원본 (codebase-memory `manage_adr` 복원용)

> **이 파일의 존재 이유**: `index_repository` 재인덱싱이 `manage_adr` 내용을 초기화시키는 알려진 버그가 있다
> ([`agent-guidelines.md`](../agent-guidelines.md) §9 경고). 재인덱싱 직후 `manage_adr(mode='get')` 이 비어 있으면
> **이 파일의 `##` 이하 전문을 그대로** `manage_adr(mode='update', project='mnt-c-DEV-saigon_rider', content=...)` 로 밀어넣어 복원한다.
>
> ADR 내용을 고칠 일이 생기면 **이 파일과 MCP 를 항상 함께** 갱신한다. 이 파일이 SoT 다.
>
> 최종 갱신: 2026-09-12

---

## PURPOSE

호치민의 오토바이 세대를 위한 **동네 중고거래 앱**. 거래는 대면 직거래가 기본이고, 앱은 "만나서 주고받는 과정"을 오토바이 동선에 맞춰 돕는다. 수익은 **지역 업체 광고**. (SoT: `ai-docs/spec/service-concept-260726.md:13-19` — 이 문서가 피벗 전 `spec/overview.md` 보다 우선한다)

**범위 가드레일 (대표 확정 — 설계 판단의 최종 근거)**
- 제3자 라이더 대행·자체 배달망 **없음**. 가게 거점을 "무인 보관함" 같은 책임 구조로 확장하지 않는다. (`service-concept-260726.md:170,228`)
- 돈·보험·분쟁에 개입하지 않는다. 당사자 돕기까지. **에스크로·소비자 결제·안전 보증 없음.** (`:170,190`)
- 예외: 결제 레일(토스페이먼츠, 2026-09-07 채택)은 **광고 계약금 수납 전용** — 거래 에스크로가 아니다.

이 가드레일이 당근 비교 장부에서 F013·F034~F036·F052 를 SKIP/BLOCK 으로 처분한 근거다.

---

## STACK

Capacitor WebView 하이브리드 앱. Docker Compose, **단일 nginx(:18090) 진입**.

| 서비스 | 역할 | 포트 | 비고 |
|---|---|---|---|
| `saigon_nginx` | 단일 진입점 | 18090(앱), 81(비즈랜딩) | 변수+resolver 프록시 — 재빌드 후 재시작 불요. **`imgproxy` 만 리터럴**(502 나면 `docker restart saigon_nginx`) |
| `saigon_frontend` | 앱 SPA | 80 | React + Vite |
| `saigon_admin_frontend` | 관리자 SPA | 내부 | React + antd |
| `saigon_bff` | 앱 화면 BFF | 8080 | FastAPI |
| `saigon_engine` | RP·미션·보상 엔진(SRE) | 8090 | FastAPI |
| `saigon_worker` | Redis Streams consumer | — | GpsAgent / EventAgent |
| `noti_worker` | 알림 발송(FCM/APNs) | — | **BFF 코드 변경 시 함께 재빌드 필요** |
| `saigon_db` | PostgreSQL 15 + PostGIS | — | |
| `saigon_redis` | 스트림 `sre:messages` | — | `maxmemory-policy noeviction` |
| `saigon_routing_engine` | 자체호스팅 Valhalla | — | BFF 내부 전용, nginx 미노출 |
| `saigon_imgproxy` | 이미지 파이프라인 | — | `contents` 볼륨 read-only |
| `saigon_bff_migrate` | DB 마이그레이션 | — | **매 배포 재실행되는 멱등 스크립트** |

**nginx 경로 매핑**: `/`→frontend · `/api/bff/*`→bff · `/api/sre/*`→engine · `/admin/api/`→bff(JSON) · `/admin-legacy/`→bff(Jinja) · `/admin/`→admin_frontend(SPA) · `/img/*`→imgproxy · `/engine/`→engine(내부망만) · `/wiki/`→wiki

**재빌드**: `docker compose --env-file .env up --build -d <service>` — 호스트에서 `npm run build` 직접 실행 금지.

---

## ARCHITECTURE

### BFF ↔ Engine 경계 (v1 모놀리식 폐기 후 v2 분리)

- 통신은 **HTTP REST + `X-Service-Key`** 뿐. BFF→Engine 단일 진입점은 `engine_client.py`(httpx.AsyncClient 래핑, 키 자동주입).
- **BFF 는 Engine DB 테이블에 직접 접근하지 않는다.** 이 선이 무너지면 v1 회귀다.
- 앱→BFF 는 쿠키 세션 / 앱·BFF→Engine 은 `X-Service-Key` / Engine↔Redis 는 XADD·XREADGROUP / Worker·Engine→DB 는 asyncpg 직접.
- 광고는 BFF 프로세스 내 **modular monolith**(`backend/app/modules/ads/`) — 라우터가 광고 테이블을 직접 조회하지 않고 `AdsApplication` 만 경유.
- 워키토키는 호스트 스키마 **불투명 참조**(`user_ref`) + `MembershipPort` 위임 + 저장소 주입으로 재사용 가능하게 격리.

### 어드민 2종 병행

신 `/admin/` React SPA(`admin_frontend`, JSON API `/admin/api/*`) + 구 `/admin-legacy/`(BFF Jinja 서버렌더). 2차 이식 완료까지 병행, JWT 쿠키 `admin_session` SSO 공유.

### Zalo 인증 프록시 VPS (SPOF)

Zalo Graph API `/v2.0/me` 가 **베트남 밖 IP 를 error -501 로 차단**한다. BFF 는 한국 호스팅이라 Zalo OAuth 호출만 VN VPS(GreenCloudVPS 호치민, `103.186.65.169`, tinyproxy:8888 BasicAuth) 를 경유시킨다. 일반 앱 트래픽은 직접 통신. 연동은 `backend/app/services/oauth.py` `exchange_zalo_code()` 의 env `ZALO_API_PROXY` — **미설정 시 직접 호출(fail-open)**. 이 VPS 가 죽으면 **Zalo 로그인 전면 차단**.

### 프론트 메뉴 구조 (한글 메뉴명 → 라우트 → 컴포넌트)

하단 탭바 **6탭** (`components/layout/TabBar.tsx`; 2026-08-12 D-6 결정으로 5탭 안 대신 홈 유지 + 채팅 추가). 첫 화면은 로그인 시 `/home`, 비로그인 둘러보기는 `/market`(2026-08-13 결정, `marketFirstValue.contract.test.mjs` 로 고정). 탭 노출은 `AppShell.tsx` `HIDE_TABBAR_PATHS` + `TabBar.tsx` `TAB_PATH_PREFIXES`.

| 한글 메뉴 | 라우트 | 컴포넌트 |
|---|---|---|
| **홈** | `/home` | `pages/home/HomePage.tsx` — 유가·날씨·침수·주유소·정비소 진입점 |
| **마켓(동네마켓)** | `/market` | `pages/market/MarketMain.tsx` — list/map 토글, 익명 공개 |
| ├ 검색 / 상세 | `/market/search`, `/market/:id` | `MarketSearch.tsx`, `MarketDetail.tsx` |
| ├ 등록 | `/market/new` | `MarketCreate.tsx` — `SellerComposeRoute` 게이트(로그인만), 폰인증은 게시 직전 |
| ├ 업체 매물 등록 | `/biz/listings/new` | `MarketCreate.tsx` 재사용 — `PrivateRoute`(업체 승인이 폰인증 대체) |
| ├ 찜 / 키워드알림 | `/market/wishlist`, `/market/keyword-alerts` | |
| └ 업체 공개 상세 | `/biz/:id` | `BizPublic.tsx` — 홈·소식·가격·매물·후기 5탭 |
| **동네지도** | `/map` | `NeighborhoodMap.tsx`(목록 우선) → `NeighborhoodMapCanvas.tsx`(온디맨드, `SaigonMapV5` SVG) |
| ├ 카테고리 / 관심 / 단골 | `/map/categories`, `/map/favorites`, `/map/follows` | `NeighborhoodCategories.tsx`, `MapFavorites.tsx`, `MapFollows.tsx` |
| ├ 동네 프로필 | `/map/profile` | `NeighborhoodProfile.tsx` |
| └ 정보(유가·날씨·침수·주유소·정비소) | `/info/*` | `<LocationContextBar>` 로 GPS/전체 2옵션 통일(2026-08-06) |
| **채팅** | `/dm` | `DmList.tsx` — direct·group·open 3종 |
| ├ 대화방 / 그룹생성 | `/dm/:conversationId`, `/dm/group/new` | `DmDetail.tsx`, `DmGroupCreate.tsx` |
| └ 게시판 | `/dm/:id/board*` | `DmBoard*.tsx` |
| **커뮤니티(피드)** | `/feed`, `/feed/new` | `FeedList.tsx`, `FeedCreate.tsx` |
| └ 그룹 | `/community/groups`, `/group/:slug` | `GroupList.tsx`, `GroupDetail.tsx` |
| **프로필** | `/profile`, `/profile/:userId` | `ProfileMain.tsx`, `UserProfile.tsx` |
| └ 설정 → 공지·FAQ | `/notices`, `/faq` | `Settings.tsx` 경유 |
| (탭 밖) 라이딩 안내 | `/ride-nav` | `RideNav.tsx` — DM·주유소·정비소 "경로" 버튼, 퀘스트 상세에서 진입 |
| (탭 밖) 퀘스트 | `/quests` | `QuestList.tsx` — **상시 진입 버튼 없음**(딥링크·라이딩결과뿐) |

세부 나열이 더 필요하면 [`frontend-page-map.md`](frontend-page-map.md). 실제 호출관계는 `search_graph`/`trace_path`.

---

## PATTERNS

### 불변식 — 어기면 회귀한다

| 규칙 | 근거 |
|---|---|
| Engine 코드에 `datetime.now()`(naive) 금지 — **timezone-aware 강제** | `architecture.md` §11-2, ruff pre-commit |
| 모든 이미지는 `contents` 테이블 중개. 엔티티는 `*_content_id` UUID FK 만, 출력 시 `build_imgproxy_url()`. 레거시 `*_url` 은 read-only 폴백 | `agent-guidelines.md` §7 |
| 프론트 동적 이미지는 `<AppImage>` 래핑 — `<img>` 직접 금지 | `components/ui/AppImage.tsx`, `frontend.md` §3.0 |
| 상단 여백은 `var(--status-bar-height)` — 고정 px 금지. 플랫폼 분기는 `[data-platform="ios"\|"android"]` | `styles/tokens.css` |
| 네이티브 기능은 `native.ts`(NativeInterface) 경유 — `navigator.*` 직접 호출 **ESLint error** | `frontend/eslint.config.js:43,46` |
| `.env` 와 `.env.example` 은 항상 동일 키셋. 비밀 하드코딩 금지, fail-fast(`${VAR:?...}`) | `agent-guidelines.md` §4 |
| DB 마이그레이션은 **매 배포 재실행되는 멱등 스크립트** | `agent-guidelines.md` §10 — 위반 시 실배포 장애 이력(2026-08-19 `63a4733`) |
| `/api/bff/*` 는 nginx 가 `bff/` 세그먼트를 벗겨 전달 — 라우터 경로에 `bff` 중복 넣으면 404 | 실사고 `routers/ad_contract.py`, 2026-09-07 |
| CSP `worker-src 'self' blob:` 필수 — 빠지면 maplibre-gl 지도가 빈 화면 | 실사고 2026-08-05 |
| GPS: 표시범위는 `'gps'`/`'all'` 2개뿐, 측위는 `useLocationStore` 단일 스토어, 좌표 미영속, 전역 워처 1개(`App.tsx` 에서만 `startWatching()`) | `service-rules.md` §GPS |
| 마켓 매물 `status` 는 DB enum 제약이 없는 자유문자열 — **쿼리마다 상태 필터를 수동 적용**해야 한다 | `service-rules.md` — 누락 사례(홈 "내 주변 인기상품") 존재 |

### 경로(routing) 정책 — D-ROUTE-1 (대표 결정 2026-09-10)

운영 경로 제공자는 **자체 호스팅 Valhalla 단독**. Google Routes 는 폴백으로도 쓰지 않는다. 사용자 모드 enum `motorcycle`(기본)/`car`/`walking` → Valhalla `motorcycle`/`auto`/`pedestrian`. 모드 선택 UI 는 `pages/ride/RideNav.tsx:780-792`(`role="radiogroup"`, 안내 시작 후 `disabled`), 정의는 `:38`.
※ 같은 파일 `:68-69` 주석이 아직 "Google Routes 과금" 을 근거로 재탐색을 제한 — **D-ROUTE-1 과 어긋남, 정정 대상**(장부 C15).

### 작업 규약

- 세션 시작: `ai-docs/INDEX.md` → `ai-docs/context/current.md` → `ai-docs/agent-guidelines.md`. **전체 파일 풀텍스트 검색 금지** — `search_graph`/`query_graph`/`trace_path`/`get_architecture` 우선.
- 코드 수정 세션은 마무리 전 `index_repository` 재인덱싱. **재인덱싱 직후 `manage_adr(mode='get')` 으로 ADR 이 비었는지 확인하고, 비었으면 이 파일로 복원한다.**
- `git push`/PR open 직전 `/code-review` 1회(기본 effort `medium`, 머니 경로는 `high`+). 건너뛰면 이유를 남긴다.

---

## SOT MAP

| 알고 싶은 것 | 문서 |
|---|---|
| 이게 무슨 서비스인가 | `ai-docs/spec/service-concept-260726.md` |
| 직전 세션 상태·다음 우선순위 | `ai-docs/context/current.md` |
| 산출물 전체 지도 | `ai-docs/INDEX.md` |
| 운용 규칙(재빌드 §1-C, SoT §2, 보안 §4, 린트 §5, __DEV §6, 컨텐츠 §7, 네이티브 §8, MCP §9, 마이그레이션 §10) | `ai-docs/agent-guidelines.md` |
| 시스템 아키텍처(BFF/Engine 상세) | `ai-docs/context/architecture.md` |
| 프론트엔드 패턴 | `ai-docs/context/frontend.md` |
| 한글 메뉴명 → 페이지 상세 | 이 ADR 먼저 → `ai-docs/context/frontend-page-map.md` |
| 키보드 UX | `ai-docs/context/keyboard-ux.md` |
| 도메인 불변식(GPS·위치) | `ai-docs/context/service-rules.md` |
| ERD / 인증 | `ai-docs/schema/erd.md`, `ai-docs/schema/auth.md` |
| 엔진 내부 설계(SRE) | `ai-docs/engine/sre-design-spec.md` 외 |
| 당근 89항목 구현 대조 | `ai-docs/task/active/260911_daangn_feature_comparison_master_ledger.md` |

---

## TRADEOFFS

- **BFF/Engine 을 쪼갠 대가**: 네트워크 홉·서비스키 관리·배포 단위 증가를 감수하고 v1 모놀리식의 결합을 끊었다. 대신 경계를 코드로 강제하지 않고 **규약으로만** 지킨다 — `engine_client.py` 우회가 물리적으로 막혀 있지는 않다.
- **Valhalla 자체호스팅**: 호출당 과금을 없앤 대신 라우팅 품질·운영 부담을 떠안았다. 오토바이 경로는 베타로 명시 고지(`rideNav.twoWheelerWarning`).
- **Zalo 프록시 VPS**: 월 ~$6 짜리 단일 VPS 가 로그인 SPOF 다. 비용 정리 대상으로 지목돼 있으나 대체 수단은 아직 없다.
- **어드민 2종 병행**: 이식 완료 전까지 같은 기능이 두 곳에 존재하는 중복을 감수한다.
- **업체 등록의 폰인증 면제**: 사업자 계정 승인(APPROVED)이 개인 폰인증을 대체한다. 서류검증(`verification_status=verified`)까지는 요구하지 않는다 — **초기 도입기 한정, 파일럿 이후 재검토**(대표 결정 2026-08-11, `backend/app/routers/market.py:800-803`).
- **매물 `status` 자유문자열**: 스키마 제약 대신 쿼리별 수동 필터를 택한 결과, 필터 누락 버그가 반복 발생한다.

---

## KNOWN GAPS

### 대표 결정 대기
- **D-31 파일럿 유동성 목표선** — `backend/app/routers/admin_api/liquidity.py:31-34` 에 제안값(L-1 40% / L-2 15% / L-3 20% / L-4 72h)이 "확정 전" 주석과 함께 하드코딩돼 있다.
- **광고 전자계약·결제 레일 D-1~D-3** + 세무/법무 Q-1~Q-4 — `ai-docs/260907_biz_ad_payment_contract_adr.md`
- **토스페이먼츠 결제 레일 D-F~D-J** + 법무 L-1~L-3 — `ai-docs/260907_toss_payment_rail_design.md`
- 업체 서류검증 강화 여부(위 TRADEOFFS 참조)

### 최대 잔여 리스크
- **어드민 콘솔 화면 전면 미구축** — 백엔드 API 7종(#25·#26·#32·#34·#39·#40·#21)이 화면 없이 존재. 특히 #27 은 광고주 제출 UI 만 있고 **어드민 처리 화면이 없다**. (플랫폼 보강 016, 27개 중 25 완료 / 2 착수불가)

### 외부 의존 대기
Capacitor 네이티브 빌드 검증(Mac 측) · OpenWeather 키 활성화(mock 폴백 중) · `TRANSLATE_API_KEY` 403(원문 폴백 중) · Google Maps Directions 키 SGR-269(코드 완료·휴면) · 마켓 키워드 알림 운영 마이그레이션 180·181 + 백필 미실행

### 프론트 갭
- 퀘스트: 기능은 살아있으나 **상시 진입점 없음**(딥링크뿐)
- 게임 허브 FAB: `AppShell` 마운트 제거(2026-08-03) — `/info`(InfoHub) 집계 화면 진입점 상실(하위 기능은 홈 카드로 접근 가능)
- 그룹채팅: 초대·강퇴·mute 관리 UI 없음(나가기만)
- 커뮤니티 그룹: `join_policy='approval'` 가입 승인 UI 불가(백엔드 API 부재)
- 2026-07-26 IA 개편 구상(4탭, 홈 폐기)은 **미착수** — 현재 6탭이 SoT

### 당근 대조 장부(89항목) 잔여
검증 89건 전부 NOT-RUN. 후속 큐: F030~F033 실기기 증거 · F051 금칙어 사전 경고 UI · F014/F048 재판정 · F028 워키토키 실기기 PTT · C14(네이티브 서브모듈 3개 커버리지 공백) · C15(위 RideNav 주석 정정).

---

## PHILOSOPHY

- **카파시 4원칙이 모든 규칙보다 우선한다** — ①가정하지 말고 헷갈림을 숨기지 말 것(해석이 둘이면 둘 다 제시하고 사용자가 고르게) ②요청을 푸는 최소한의 코드(1회용에 추상화 금지, 일어날 수 없는 시나리오에 에러 처리 금지) ③시킨 것만 건드릴 것(인접 코드·주석·포맷 "개선" 금지, 무관한 dead code 는 언급만) ④검증 가능한 목표로 변환할 것.
- **모델 라우팅은 AI 몫** — 실행 전 작업별 모델을 스스로 정하고 **근거를 제시**한다. 탐색·기계적 수정 → Sonnet/Haiku 서브에이전트 / 복잡 로직·설계·머니 경로·UI 고퀄 → Fable. 디자인은 "Sonnet 이 레퍼런스 리서치 → Fable 이 구현" 패턴.
- **탐지 ≠ 차단** — 위험 점수(`listing_risk.py`)는 검수 큐 정렬용이고 사용자에게 노출하지 않는다.
- **Stop-the-line** — BLOCK ID 승인 없이 선행조건으로 유입 금지 / 탐색용 폴백 좌표를 길안내 출발점에 넣지 않음 / 서버 정밀도 정책(`none`/`approx`/`exact`) 우회 금지.
- **증거 없는 완료 없음** — 정적 코드 재확인은 Verify 를 바꾸지 못한다. 실행 일시·명령·관찰값·증거 경로가 있어야 PASS 다.
