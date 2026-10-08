# 계획 — FactMind 엔진 이식: 사이공라이더 `fm` 레이어 (two-tier entity publishing) (2026-10-08)

> **계획 문서.** 이번 세션 코드 변경: **없음** (문서만). 티켓 `2026-10-08-fm-engine-port-plan`(doil-context). 구현은 §4 단계별 티켓으로.
> **입력**: FactMind 분석(`/DEVELOP/Blueurban/factmind` HEAD `f6b1772`, d-docs 위키 + 코드 대조)과 사이공라이더 통합면 분석(HEAD `c3bde3c6`). 두 보고의 `path:line`을 그대로 인용한다 — `fm:` 접두는 FactMind 레포, 무접두는 이 레포.
> **대표 결정(2026-10-08)**: 공개 페이지의 주어는 **두 층위 동시** — ① 사이공라이더 플랫폼 자체(브랜드 엔티티 허브) ② 그 하위 업체들의 카탈로그(디렉터리). 서비스 통째 이식이 아니라 **엔진만** 이식한다.
> 표기 규약: **[확인]** = 코드·문서에서 확인 / **[추정]** = 근거는 있으나 확정 아님 / **[확인 필요]** = 실측·대표 확인 필요. 권장안에는 Second-Look(도전 렌즈 Gamma: 경계·계약 안정성 / 재적합 렌즈 Karpathy: 최소 구현) 결과를 붙였다.

---

## 0. 한 장 요약

사이공라이더에는 검색엔진·AI가 읽을 수 있는 **DB 유래 HTML이 한 장도 없다**(앱 도메인은 SPA 셸, 랜딩은 홈 한 페이지군). FactMind에서 "승인된 사실 → 공개 페이지 묶음(HTML + facts.json + JSON-LD + 목록 + 사이트맵 + RSS + IndexNow) → 실제 응답 해시 대조 → 봇 방문 측정" 파이프라인의 **순수 코어(stdlib만, 약 800줄)** 를 떼어 와 새 최상위 폴더 **`factmind-saigon/`**(패키지 `factmind_saigon`, `core`/`saigon` 어댑터 분리 — 대표 결정)에 두고 BFF 프로세스에 in-process로 올려, 사이공라이더의 두 층위를 **하나의 엔티티 계약**(`fm_subject.kind ∈ platform | business`)으로 공개한다. 운영 화면은 기존 `/admin/` 콘솔의 "FactMind" 메뉴(대표 결정).

- **용어**: *two-tier entity publishing* (플랫폼 허브 + 업체 디렉터리). 동의어: hub-and-spoke entity SEO(브랜드 엔티티 = 허브, 업체 LocalBusiness = 스포크), programmatic SEO(지역×업종 목록 페이지 자동 생성), marketplace / directory SEO(업계 통칭).
- **서빙**: 브랜드 도메인 `saigon-rider.com`의 경로 접두(`/b/`, `/l/`, `/sitemap.xml`, `/rss.xml`)만 엣지 nginx가 컨테이너로 프록시 → BFF가 저장된 공개본 바이트를 그대로 서빙(§3.3).
- **측정 v1**: AI 답변 조회기는 **이식하지 않는다**(베트남에서 동작하는 채널이 0개로 봐야 함). v1은 검증된 봇 방문 집계 + 검색 콘솔 색인 수 수기 기록(§3.5).
- **단계**: P0 대표 결정 → P1 서빙 기반 → P2 코어 이식(+역이식 가드레일) → P3 업체·플랫폼 공개/검증 + 어드민 1차 → P4 목록·RSS·IndexNow → P5 측정 + 어드민 2차 → P5+ 첫 역이식 → P6 확장(매물·커뮤니티, P5 데이터가 있을 때만).
- **역이식 가드레일(대표 결정)**: `core`만 동기화. 생성형 출처 매니페스트(`UPSTREAM.json`) + append-only 원장(`BACKPORT.md`, DEP-3식 `Forwarded`/`Verified`) + 골든 픽스처 패리티 스크립트(`tools/fm_parity.py`) + pre-commit 게이트 + CLAUDE.md 규칙(§3.9).
- **기대치**: FactMind 자신도 "등록이 색인·인용·유입을 늘린다"는 효과를 **입증하지 못했다**. 이 레이어의 완료 기준은 효과가 아니라 "정확한 정보 공개 + 자체 진단 + 정직한 측정"이 돌아가는 상태다.

---

## 1. FactMind 정체

| 항목 | 사실 | 근거 |
|---|---|---|
| 서비스 | 한국 소상공인·온라인 서비스가 자기 정보를 항목별 승인 → 공개 프로필·목록·RSS·사이트맵·IndexNow 게시 → 실제 응답 해시 대조로 "등록 완료" 증명. 33,000원 1회. | fm 분석 §1-1·5 |
| "엔진" | 모델이 아니다. **M1 측정 → M2 진단 → M3 생성 → M4 공개·검증 → M5 재측정** 파이프라인. Flask + SQLite 모놀리스(`fm:site/`), 서버 AI 호출 0건. | fm 분석 §1-2, `fm:docs/HANDOVER.md` §1-1 |
| AI 조회(M1/M5) | 별도 Windows PC의 QEMU VM에서 Codex CLI + Chromium으로 소비자 AI 화면을 조작하는 워커(`fm:engine/observer/`). 6채널 중 **네이버 AI 브리핑만 동작**(나머지 Cloudflare·reCAPTCHA 차단). | fm 분석 §1-3·10, §5-1 |
| 규모 | `site/*.py` 7,996줄(시험 제외), 엔진 핵심 9모듈 2,540줄, 조회기 1,285줄, SQLite 테이블 약 65개. | fm 분석 §1-12 |
| **입증됨** | 등록→공개→반영확인 파이프라인 end-to-end 동작(자사 2건). 고객 사이트 진단이 실제 결함을 잡음. Googlebot 프로필 방문 6회. | fm 분석 §1-7·8 |
| **미입증** | 등록이 색인·AI 인용·유입을 늘린다는 증거 **없음**. 네이버 AI 기준값 12응답 중 언급 0·인용 0. **M5 재측정은 한 번도 실행 안 됨**(코드도 없음, G1). 공개 프로필 2건(둘 다 자사), **유료 고객 0명**. | fm 분석 §1-6·9, §6-1 G1 |
| 팀 자체 판정 | JSON-LD·사이트맵·IndexNow는 "위생(필요조건)"이지 인용 "레버"가 아님. 포지셔닝은 "정확한 정보 공개 + 사이트 진단 + 정직한 측정". | fm 분석 §1-11 |

**우리 기대치에 주는 뜻**: 이식해서 얻는 것은 *검증된 공개 파이프라인과 측정 위생*이지 노출 보장이 아니다. 목표를 "효과"로 잡으면 FactMind와 같은 자리에서 멈춘다. 완료 기준은 §4 각 단계의 검증 조건으로만 정의한다.

---

## 2. 이식 범위

등급: `pure` = Flask/SQLite/설정 결합 없이 stdlib만으로 호출 가능 · `adapter` = 결합돼 있으나 seam을 잘라 분리 · `no-port` = 이식 안 함. LOC는 fm 분석 §3 기준.

### 2-1. `pure` — 그대로 가져와 로캘만 분리

| # | 함수/모듈 (`fm:path:line`) | LOC | 역할 | 로캘·현지화 작업 |
|---|---|---|---|---|
| C1 | `public_target`·`PinnedHTTPS`·`fetch_public`·`html_facts`·`visible_text` (`site/public_delivery.py:19-143`) | ~125 | SSRF 방어 안전 수집기(HTTPS 전용, 전 DNS 결과 global IP, IP 고정 연결, 리다이렉트 4회 재검증, 1MiB·20초) | 예외 메시지 7개 → 코드(`code`)로 치환. UA `FactMindReadOnly/1.0` → `SaigonRiderReadOnly/1.0`(env) |
| C2 | `diagnose_site(url, name, reader)`·`SiteRobots`·`compare_reports` (`site/site_report.py:19-224`) | ~195 | 사이트 진단 10항목(robots RFC 9309, soft-404, canonical, 사이트맵, 본문 텍스트 …), 전후 비교 | 항목 제목·fix 문장 약 40개 → `locale` 사전(vi/ko/en). `BOTS`의 Yeti·Daumoa 제거, Googlebot·Bingbot·OAI-SearchBot·PerplexityBot·Claude-SearchBot 유지, Cốc Cốc **[확인 필요]** |
| C3 | `diagnose(method, url, records)`·`site_findings` (`site/public_delivery.py:189-281`) | ~93 | 운영자 접근검사 A01~A07 + "200인데 사실은 앱 셸/소프트404" 오판 탐지 | 사유 문구 → 코드 |
| C4 | `publication_bundle`·`public_schema`·`plain_facts`·`opening_hours`·`menu_items`·`questions`·`list_page`·`directory_page`·`rss_feed`·`discovery_files` (`:284-349`, `:376-521`) | ~290 | 스냅샷 → `{경로: 본문}` 번들(프로필 HTML·facts.json·JSON-LD·목록·디렉터리·RSS·robots·사이트맵) | **강한 KR 결합**: `lang="ko"`, `og:locale=ko_KR`, `addressCountry:'KR'`, `priceCurrency:'KRW'`, 요일 한글 `CLOSED_DAYS`, FAQ 문장·라벨표(`:465`), `PROVINCES`(`self_service.py:20`) → `locale` 모듈로 전부 파라미터화(VN·VND·vi 요일). 템플릿 엔진 도입 금지(문자열 조립 유지) |
| C5 | `verify_publication` 비교부 (`site/self_service.py:176-190`) | ~15 | `200 ∧ final_url==url ∧ noindex 없음 ∧ canonical==[url] ∧ sha256(저장본)==body` | 없음 |
| C6 | `indexnow_send(endpoint, body)` (`site/public_delivery.py:358-365`) | 12 | IndexNow POST | 엔진 목록 `INDEXNOW_ENGINES`(`:354`, Naver·Bing 하드코딩) → env |
| C7 | `classify`·`parse_feed`·`rdns_verify`·`verify`·`client_ip` + `observation_policy.json` (`site/observation_collect.py:48-206`) | ~150 + 6KB | UA+IP → 봇 VERIFIED/UNVERIFIED/UNKNOWN (공식 IP 피드 또는 rDNS+정DNS) | 정책 JSON에서 Yeti·Daum 제거. Cốc Cốc·Zalo 봇 UA/rDNS **[확인 필요]** |
| C10 | `observation_metrics`·`source_map` (`site/registration_server.py:915-946`) | 32 | 관측 지표 집계(분모=유효 응답만) | v1 미사용(M1 채널 없음). 코드만 보관 |

### 2-2. `adapter` — seam을 잘라 재구현

| 원본 | seam | 우리 구현 |
|---|---|---|
| `publish`(`fm:site/self_service.py:116`) — 전제 훅 6개 + SQLite `BEGIN IMMEDIATE` | 입력 `snapshot{api,jsonld,lastmod}` → `publication_bundle` → 저장 | PostgreSQL 트랜잭션 + `SELECT … FOR UPDATE`로 subject 행 잠금, 전제는 §3.1 "승인 사실" 규칙만 |
| `verify_publication`(`:168`) — `reader`가 `app.config['PUBLIC_READER']` | `expected_files{url → body|None}` + `reader` | C5 + C1, dev는 `FM_VERIFY_BASE_URL`로 내부 nginx 읽기 |
| `notify_index`(`:95`) | 검증 최초 1회 + 철회 시 송신, 결과는 "접수"로만 기록 | 동일, 엔진 목록 env |
| `inspect_snapshot`+`SnapshotParser`(`fm:site/registration_server.py:367-395`) | 내부 스냅샷 3산출물 일치 검사(fail-closed) | 공개 HTML을 직접 검사하지 않는다는 점은 그대로(fm 분석 §4-8) — 우리는 `facts.json`↔JSON-LD 값 일치만 검사(단순화) |
| 봇 방문 기록 `record`/`after_request`/`ingest_log`(`fm:site/observation_collect.py:214-391`) | WSGI after_request → FastAPI middleware | §3.5 M5. **nginx 로그 파일 수집은 하지 않는다**(BFF가 fm 경로를 전부 서빙하므로 미들웨어만으로 충분) |
| 조회기 큐 계약 `observer.v1`(`fm:engine/observer/contracts/*.json`, `observer_routes.py:171-274`) | claim/heartbeat/result + lease + 멱등 ACK | **v1 미구현**. 베트남 채널이 실측으로 확인되면 그때 계약만 참고(§3.5) |

### 2-3. `no-port`

| 원본 | 사유 |
|---|---|
| 조회기 워커 일체(`fm:engine/observer/worker.py`·`executor.py`·`browser.py`·`deploy/*`) | Codex CLI+ChatGPT 계정+Windows/QEMU VM 전제, 동작 채널 네이버 1개, 베트남 채널 미지 |
| `observation_subscription.py`(661줄) | 판매 게이트·한글 문구·한국 도로명 정규식 결합, 타이머도 미가동 |
| `condition_evaluator.py` | M1과 무관한 부가기능 |
| `METHODS` 카탈로그·`registration_server.py` 슬롯/수동 관측(`save_observation`) | 운영자 수동 워크플로, 카탈로그↔실제 기능 불일치(G9) |
| `business_check.py`·`site_control.py` | 국세청·인허가 원장·DNS TXT 소유 증명 — 사이공라이더는 업체 `status='APPROVED'`가 곧 승인 |
| 결제(`checkout.py`)·로그인·운영자 앱·배포 파이프라인·`build.py` 사이트맵(도메인 하드코딩 10줄) | 제품 영역, 재작성이 빠름 |
| **구조 참고만**: `screening.py`(S03/S04)·`moderation.py` | 코드는 범용 정규식 엔진이나 정책 JSON이 **한국 의료법·광고규정·한국어 최상급 표현**. 베트남 광고법·vi/ko/en 금칙은 별도 결정(§5-8). 기존 마켓 `banned_keyword`(`backend/app/routers/market.py:885`)와 합칠지 포함 |

---

## 3. fm 레이어 설계 (사이공라이더 맞춤)

### 3.1 엔티티 계약 — 하나의 계약으로 두 층위

```
fm_subject(kind, source_ref) ──adapter──▶ 승인 사실 스냅샷 fm_snapshot{facts, jsonld, source_digest}
                                               │ publish (트랜잭션, 1 published/subject)
                                               ▼
                                   fm_publication{files: {경로: 본문}, artifact_digest}
                                               │ verify (실제 HTTPS 읽기, 해시 대조) → verified_at → IndexNow 1회
                                               ▼
                 공개 GET /b/<slug>/ , /b/<slug>/facts.json  (저장본 바이트 그대로, Cache-Control max-age=300)
                 목록 /l/ , /l/<ward>/ , /l/<ward>/<category>/  (published subject에서 요청 시 생성)
                 /sitemap.xml(index) → /sitemap-fm.xml + /sitemap-site.xml(랜딩 정적)   /rss.xml
```

| 층위 | `kind` | "승인 사실"의 정의 (v1) | 공개 게이트 | JSON-LD |
|---|---|---|---|---|
| 플랫폼 허브 | `platform` (행 1개) | 우리가 큐레이션한 구조화 사실: 이름·설명(vi/ko/en)·`sameAs`(앱스토어·플레이스토어·SNS)·서비스 지역(`wards` 활성 수)·업체 수·FAQ 3~5개. **DB `fm_snapshot.facts`에 저장, 어드민에서 편집**(코드 리터럴 금지) | 운영자 publish | `/l/`에 `Organization` + `CollectionPage{mainEntity: ItemList}` + FAQ `<dl>`. 랜딩 홈의 `WebSite` JSON-LD와 상호 링크(`isPartOf`/`url`) |
| 업체 디렉터리 | `business` (`source_ref = business_profile.id`) | `business_profile`에서 **앱 공개 API(`/api/biz/public/{id}`, `biz.py:1222-1262`)가 이미 내보내는 필드 − 내부 식별자**: `name, category(code→label 3개국어), address, intro, latitude/longitude, photo_content_id(비공개 아닌 것만), phone(§5-1 대표 결정)`, 하위 `business_price`(가격표, VND)·`business_news` 최근 N건(제목만). `owner_user_id`·검증 서류·리뷰 본문 **제외** | `status='APPROVED'`(§5-2 대표 결정: 자동 vs 소유자 opt-in) + 운영자 withdraw | `LocalBusiness{name, description, address{PostalAddress, addressCountry:'VN'}, geo, telephone?, image, hasMenu?(가격표→MenuItem/Offer priceCurrency:'VND'), openingHoursSpecification?(필드 없음 → v1 생략)}`, `isPartOf → /l/`, `mainEntityOfPage` |
| (2차) | `listing`·`community`·`quest` | P6에서 정의 | — | `Product`/`DiscussionForumPosting` 등 — 미정 |

- **URL·canonical**: 업체 `/b/<slug>/`(slug = 이름 vi 발음기호 제거 + `-` + id 앞 8자, **최초 공개 시 고정**, 이름 변경에도 불변), facts `/b/<slug>/facts.json`. 모든 페이지 `<link rel=canonical>` = 자기 절대 URL(`FM_PUBLIC_ORIGIN` 기준), 검증식도 `canonical == [url]`(fm 분석 §4-5). `app.`·`business.` 호스트로 같은 경로가 열리더라도 canonical은 항상 `saigon-rider.com`.
- **hreflang**: 목록·허브는 DB i18n 컬럼이 있으므로 3언어 — `/l/…`(vi), `/ko/l/…`, `/en/l/…` + `x-default`(랜딩 관례 `landing/apps/client/src/lib/locale.ts:1-14`와 동일). 업체 페이지는 **단일 언어 1장**(§3.6), hreflang 없음.
- **404/410**: 없는 slug 404(text/plain), `withdrawn` 410 + 사이트맵·목록 제외 + IndexNow 재통지(fm 분석 §4-5). 빈 목록(항목 0)은 **생성하지 않고 404**(thin page 방지).
- **meta robots**: 기본 없음(색인 허용). canonical 호스트가 아닌 Host로 들어온 요청에는 `X-Robots-Tag: noindex` [추정: 중복 색인 방지, P1에서 확인].

### 3.2 코드 배치와 이름

**배치 — 대표 결정(2026-10-08, 권장안 아님).** 엔진은 레포 최상위의 새 폴더 **`factmind-saigon/`** 에 산다(Python 패키지명 `factmind_saigon`). 폴더 안은 두 층으로 고정한다:

| 층 | 내용 | import 규칙 |
|---|---|---|
| `factmind_saigon/core/` | 이식한 순수 모듈(C1~C7) + 로캘 파라미터. 입출력은 **평문 dict** | **사이공라이더 코드 import 0건** — `app.*`·SQLAlchemy·FastAPI 금지, stdlib만 |
| `factmind_saigon/saigon/` | 사이공라이더 어댑터: 사실 소스(`business_profile`·플랫폼 facts) → 스냅샷, Postgres `fm_*` 저장소(ORM은 `app.models.Base` 공유), 공개·어드민 라우트, APScheduler 잡, 봇 방문 미들웨어 | `app.models/deps/database/utils` 허용, **`app.main` 금지**(순환) |

이 분리가 규칙인 이유: `core`가 호스트를 모르면 **다른 사내 프로젝트(FactMind 본체 포함)가 폴더째 가져가 자기 어댑터만 쓰면 된다.** 강제는 pre-commit 1줄(`core/` 안에서 `from app`/`import app`/`sqlalchemy`/`fastapi`가 나오면 실패). 이름: `fm`은 접두로만(테이블 `fm_`, env `FM_`, 어드민 메뉴 "FactMind"). "fm engine" 호칭 금지(`engine`=SRE, `routing_engine`=Valhalla — sr 분석 §7).

**프로세스 토폴로지 — 설계 판단**
**Recommendation:** (a) **BFF 프로세스 안에서 import하는 패키지**로 v1을 올린다. 라우트·잡·미들웨어는 BFF `main.py`가 등록한다. (b) 별도 compose 서비스(SRE `engine` 방식)로의 승격은 ① 공개 페이지 트래픽이 앱 API p95에 영향을 줄 때 ② 다른 프로젝트가 HTTP 서비스로 쓰길 원할 때 ③ fm 전용 상시 워커(조회기 큐)가 생길 때 중 하나가 **실제로** 생기면 한다 — 그때 `saigon/`이 그대로 서비스의 앱이 된다.
**Why (brief):** v1은 페이지 수백 장과 잡 3개다. 별도 서비스는 Dockerfile·compose·DB 설정·어드민 인증 전달(`X-Service-Key`)·nginx 업스트림까지 배관이 두 배인데 얻는 것은 경계 하나뿐이고, 그 경계는 `core/saigon` 분리가 이미 코드 수준에서 지킨다.
**Second look:** Gamma → "SRE처럼 서비스로 떼야 BFF가 `fm_*`를 직접 못 만지는 하드 경계가 생기고, 아웃바운드 수집기(SSRF 표면·20초 타임아웃)가 앱 프로세스와 격리된다" — 격리 가치는 인정. 단 SRE가 서비스인 이유(자체 Alembic·Redis 워커·RP 머니 경로)가 fm v1엔 없다. 프리모템에서 가장 그럴듯한 사고는 **동기 `http.client` 수집기(C1)가 이벤트 루프를 막는 것** → 모든 C1 호출은 `asyncio.to_thread`, 미들웨어의 rDNS는 스레드+캐시, 잡은 `max_instances=1`. Karpathy → 패키지 1개 + `main.py` 5줄이 최소. **유지(a), `to_thread` 규칙을 구현 조건으로 추가.**

**이미지·compose 변경(정확히).** `backend/Dockerfile`은 `COPY . .`이고 bff의 build context가 `./backend`라 **최상위 폴더는 지금 이미지에 들어오지 않는다** [확인 `backend/Dockerfile:14`, `docker-compose.yml:669-672`]. 선례 `d_modules/WalkieTalkie`는 **별도 GitHub 저장소**라 `requirements.txt`에서 git으로 설치하고(`backend/requirements.txt:24`), dev에서는 `./d_modules/WalkieTalkie/packages/server:/opt/walkie_talkie:ro` 마운트 + `PYTHONPATH=/opt/walkie_talkie`로 이미지 설치본을 가린다(`docker-compose.yml:692,703`). `factmind-saigon/`은 **같은 레포**라 git 설치는 맞지 않는다 → frontend와 같은 방식으로 **build context를 레포 루트로 바꾸고 COPY**한다(루트 `.dockerignore`가 이미 `contents/`·`backups/` 등을 막는다 — `docker-compose.yml:46-50`, `.dockerignore:1-2`). `noti_worker`는 bff 이미지를 재사용하므로 자동 포함.

```yaml
# docker-compose.yml — bff
bff:
  build:
    context: .                        # 기존 ./backend
    dockerfile: backend/Dockerfile
  volumes:
    - ./backend:/app
    - ./factmind-saigon:/opt/factmind_saigon:ro    # dev: 이미지 설치본 shadow (WalkieTalkie와 동일 패턴)
  environment:
    - PYTHONPATH=/opt/factmind_saigon:/opt/walkie_talkie
```
```dockerfile
# backend/Dockerfile (context = 레포 루트)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium
COPY factmind-saigon/ /opt/factmind_saigon/
RUN pip install --no-cache-dir --no-deps /opt/factmind_saigon    # pyproject.toml → 패키지 factmind_saigon
COPY backend/ .
```
prod는 `docker-compose.prod.yml`이 bff `volumes: !override`로 소스 마운트를 제거하므로 **이미지 설치본이 권위**(`docker-compose.prod.yml:38-42`). `factmind-saigon/pyproject.toml`은 WalkieTalkie `packages/server/pyproject.toml` 형식(setuptools, `requires-python >= 3.12`, `core`는 의존 0, fastapi/sqlalchemy는 `[project.optional-dependencies] saigon`). ruff 설정은 `backend/pyproject.toml`을 폴더에 복제 **[구현 시 결정]**.

```
factmind-saigon/
  pyproject.toml   README.md
  factmind_saigon/
    __init__.py
    core/      fetch.py(C1)  site_report.py(C2)  access.py(C3)  bundle.py(C4)  verify.py(C5)  indexnow.py(C6)  bots.py(C7)  bot_policy.json  locale/{vi,ko,en}.py
    saigon/    subjects.py(사실 소스)  storage.py(fm_* ORM·쿼리)  publishing.py(publish/verify/withdraw)  routes_public.py  routes_admin.py  jobs.py  middleware.py
backend/app/main.py                       include_router(public_router)·add_middleware·register_jobs(scheduler) — 5줄
backend/app/routers/admin_api/fm.py       `from factmind_saigon.saigon.routes_admin import router` 재export (admin_api/__init__.py 등록)
admin-frontend/src/pages/fm/FactMind.tsx, src/api/fm.ts   "FactMind" 메뉴
database/init/253_fm_tables.sql           (번호는 구현 시 재확인)
```
공개 라우트(`routes_public.py`, prefix 없음): `/b/…` `/l/…` `/ko/l/…` `/en/l/…` `/sitemap.xml` `/sitemap-fm.xml` `/rss.xml` `/b/<key>.txt`.

### 3.3 공개 페이지 서빙 호스트

**Recommendation:** 브랜드 도메인 `saigon-rider.com`에서 **경로 접두만 컨테이너로 프록시**한다 — 엣지 nginx(`deploy/saigon-rider.conf:44-58` 블록)에 `location ^~ /b/`, `^~ /l/`, `^~ /ko/l/`, `^~ /en/l/`, `= /sitemap.xml`, `~ ^/sitemap-fm`, `= /rss.xml` → `proxy_pass http://127.0.0.1:18090`(app. 블록 `:61-82`와 같은 설정). 컨테이너 nginx(`nginx/conf.d/default.conf`)에 같은 접두를 bff로 보내는 location을 `/`(frontend) 앞에 추가. 랜딩 정적 파일(`/var/www/saigon-rider`)은 건드리지 않는다.
**Why (brief):** 허브(랜딩 홈, hreflang 이미 있음)와 디렉터리가 **같은 호스트**에 있어야 사이트맵·hreflang·내부링크가 한 사이트로 평가된다. 파일을 호스트 디렉터리에 쓰는 방식(A)은 `pnpm build && sudo cp -r`이 같은 폴더를 덮어쓰는 소유권 충돌과 compose 마운트 부재(sr 분석 §1-4 A·Q7) 때문에 깨지기 쉽고, 410·canonical·검증 해시를 nginx 규칙으로 흉내 내야 한다. `app.`(B)은 SPA 라우트·OAuth 오리진·CSP와 얽히고 브랜드 권위가 서브도메인으로 갈라진다.
**Second look:** Gamma → "BFF가 소유하는 경로 집합"이 계약이고 엣지는 그 집합을 프록시만 한다 — 안정적. 단 엣지 conf는 레포 밖 수동 설치(`sudo cp`)라 drift 위험 → 변경을 `deploy/saigon-rider.conf`에 커밋하고 P1 검증을 외부 curl로 한다. Karpathy → location 7개 + 컨테이너 location 1묶음이 최소. **유지.** 프리모템: 운영 서버(한국 호스팅) BFF가 자기 공개 URL을 되읽는 hairpin이 막히면 verify가 전부 FAILED — **[확인 필요]** P1에서 서버 안 `curl https://saigon-rider.com/`로 확인.

| 후보 | 필요한 변경 | 판정 |
|---|---|---|
| **C'. 루트 도메인 경로 프록시(권장)** | 엣지 conf location 7개(`sudo cp` + reload 1회), 컨테이너 nginx location 1묶음, bff 라우터 | 채택 |
| A. `/var/www/saigon-rider`에 파일 쓰기 | compose에 호스트 디렉터리 bind mount(권한 모델 미확인), 랜딩 배포 `cp -r`와 충돌 정책, 410/404는 nginx map | 보류 |
| B. `app.` 신규 location | 컨테이너 nginx만 — 가장 적은 변경이나 호스트 분산·SPA 경로 공존·CSP 적용 | 비채택 |
| D. 새 서브도메인 | certbot `--expand` + DNS + 엣지 server 블록 | 비채택(브랜드 권위 분산) |
| E. 랜딩 빌드 편승 | 빌드 타임 정적만 가능, DB 유래 불가 | 비채택 |

부수 사실(P1에 반영): 컨테이너 nginx가 모든 응답에 CSP·gzip을 붙인다(`default.conf:30-57`) — JSON-LD `<script type="application/ld+json">`은 실행 대상이 아니라 영향 없음, 인라인 `<style>`은 `style-src` 값 **[확인 필요]**(막히면 fm 응답에 한해 헤더 재정의). 레이트리밋 존은 `/api/bff/`에만 적용(`:176-189`) — fm 경로는 크롤러 버스트 허용, 별도 존 불필요 [추정].

### 3.4 데이터 모델 (PostgreSQL, `database/init/253_fm_tables.sql` — 번호는 구현 시 `ls database/init | tail -1`로 재확인)

| 테이블 | 컬럼 (모두 `timestamptz`) | 비고 |
|---|---|---|
| `fm_subject` | `id uuid pk, kind text check in ('platform','business'), source_ref uuid null (business_profile.id), slug text unique, status text ('draft','published','withdrawn'), locale_source text ('vi','ko','en'), ward_id int null (fk wards), category_code text null, created_at, updated_at` | `kind='platform'`은 1행(부분 unique). `ward_id`는 publish 시점 파생값 저장(§5-6) |
| `fm_snapshot` | `id uuid pk, subject_id fk, version int, facts jsonb, jsonld jsonb, source_digest text, created_at` | 불변. `(subject_id, version)` unique. `facts` = FactMind `api` 구조 `{entity_id, name, facts{}, fact_details{}}` 유지 |
| `fm_publication` | `id uuid pk, subject_id fk, snapshot_id fk, status text ('published','superseded','withdrawn'), files jsonb ({경로: 본문}), artifact_digest text, published_at, verified_at null, verification jsonb null, index_notified_at null` | 부분 unique `(subject_id) where status='published'`. 공개 GET은 이 `files`를 그대로 서빙 |
| `fm_event` | `id bigserial, subject_id uuid null, kind text ('publish','verify','withdraw','index_notified','site_report','diagnosis','console_coverage'), body jsonb, created_at` | FactMind `tech_event` 대응. 검색 콘솔 수기 기록도 여기(`console_coverage`) |
| `fm_bot_visit` | `id bigserial, observed_at, bot_id text, verdict text ('VERIFIED','UNVERIFIED','UNKNOWN'), path text, path_kind text ('profile','facts','list','sitemap','rss'), method text null, ip inet null, ua text null, evidence jsonb null` | VERIFIED만 `ip/ua` 저장, 나머지는 null(FactMind 원칙). 보존 30일(§3.7 잡) |
| `fm_bot_feed` | `feed_id text pk, networks jsonb, sha text, refreshed_at` | 공식 IP 피드 캐시 |

- **SQLite → PostgreSQL 치환 목록**(fm 분석 §7): `BEGIN IMMEDIATE`(57회) → 트랜잭션 + `SELECT … FOR UPDATE`(subject 행); `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`; `rowid` 정렬 → `created_at, id`; `json_extract` → `->>`; TEXT JSON → `jsonb`; BLOB 증거 → v1 없음(조회기 미이식); 문자열 ISO 시각 비교 → `timestamptz`.
- 마이그레이션은 **멱등**(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) + compose `bff_migrate.command`에 `-f`/`-c` 쌍 추가(sr 분석 §2, `docker-compose.yml:107-~660`). ORM 모델은 `factmind_saigon/saigon/storage.py`에 두되 `app.models.Base`를 공유한다(§3.2) — `models.py`에는 넣지 않는다.

### 3.5 파이프라인 매핑 M1~M5 → 사이공라이더

| 단계 | FactMind | 사이공라이더 v1 | 범위 밖 |
|---|---|---|---|
| **M2 진단** | 고객 사이트 10항목 + 운영자 A01~A07 | **자사 도메인 자체 진단**: `diagnose_site('https://saigon-rider.com', 'Saigon Rider', reader)` + 공개된 `/b/`·`/l/` 표본에 A01~A07. 결과 `fm_event(site_report)`, 어드민에서 실행·열람 | 업체 고객 사이트 진단(제품 기능, P6 이후) |
| **M3 생성** | 승인 사실 → 번들(ko·KR·KRW) | `saigon/subjects.py`가 `business_profile`(+`business_price`, `business_news`)·플랫폼 facts → 스냅샷 → `core/bundle.py`(로캘 vi/ko/en, `addressCountry:'VN'`, `priceCurrency:'VND'`, 요일 vi) | 기계번역(§3.6) |
| **M4 공개·검증** | publish → 라이브 해시 대조 → IndexNow(Naver·Bing) | publish(트랜잭션) → `/b/<slug>/` 서빙 → verify(C1+C5, prod는 공개 URL, dev는 `FM_VERIFY_BASE_URL` + Host 헤더) → `verified_at` → IndexNow **Bing**(`https://www.bing.com/indexnow`)에 1회. **참여 엔진 목록(Yandex·Seznam 등)은 FactMind 근거가 아니라 일반 지식 — [확인 필요]**, env `FM_INDEXNOW_ENGINES`로 관리. Google은 IndexNow 불참 → `/sitemap.xml`을 Search Console에 1회 수동 제출(대표 계정) | Search Console API 연동 |
| **M1/M5 측정** | 조회기(네이버만) + 봇 방문 + 수동 관측 | **① 봇 방문**: `factmind_saigon/saigon/middleware.py`가 fm 경로 응답마다 C7로 판정·`fm_bot_visit` 기록(rDNS는 스레드+캐시)(신뢰 프록시 `FM_TRUSTED_PROXIES`=컨테이너 nginx·엣지 CIDR, `X-Forwarded-For` 체인). **nginx 로그 볼륨·사이드카 불필요**(fm 경로를 전부 BFF가 서빙; 랜딩 정적 `robots.txt`만 미집계 — 허용). **② 색인 수**: Search Console·Bing Webmaster의 색인/발견 URL 수를 **주 1회 수기 입력**(어드민 폼 → `fm_event(console_coverage)`). **③ 재검증 잡**: 매일 published 전건 라이브 해시 재대조 → 불일치는 `fm_event(verify, ok=false)` | **AI 답변 조회기 — 이식 안 함.** 베트남 후보 채널(Google AI Overviews·ChatGPT·Gemini·Perplexity·Cốc Cốc·Zalo AI)은 **전부 미지**. P5에서 사람이 로그아웃 브라우저로 질문 세트 5개를 1회 수동 조회해 기록(`fm_event`)하고, 자동화 여부는 그 결과로 결정(§5-5) |

"수집(봇 방문) → 색인(콘솔 수) → 언급 → 인용 → 유입"을 **섞지 않고 따로 기록**하는 FactMind 증거 위생 규칙(fm 분석 §4-7 `index_status:'UNKNOWN'` 고정)을 그대로 따른다. v1은 앞 두 칸만 채운다.

### 3.6 i18n·로캘

| 대상 | 원문 | v1 처리 |
|---|---|---|
| 페이지 크롬 문자열(h2·라벨·FAQ 질문·고지문) | FactMind 한국어 하드코딩 | `core/locale/{vi,ko,en}.py` 사전(서버 지역화 선례 `services/push_i18n.py` `TEXTS[key][lang]` 패턴). 3벌 패리티 필수 |
| 목록·허브 | `wards.name_vi/ko/en`, `business_category.label_*`, 플랫폼 facts(3언어 저장) | 3언어 페이지 + hreflang |
| 업체 `name/intro/address` | **단일 언어, 원문 언어 불명**(`models.py:830-879`), `translations` 캐시는 `TRANSLATE_API_KEY` 403으로 폴백 중(sr 분석 §3-3) | **원문 그대로 1장만** 공개. `fm_subject.locale_source` 기본 `vi`(앱 기본 언어), 어드민에서 수정 가능. `<html lang>`은 이 값. **기계번역 결과는 공개하지 않고, "번역됨"을 주장하지 않는다**(번역 복구 후 별도 결정) |
| 업종·지역 라벨(업체 페이지 안) | DB 3언어 | 페이지 언어(`locale_source`)의 라벨 1개만 |
| 서버 오류 | FactMind 한글 문구 | 공개 페이지는 text/plain `Not found`/`Gone`(언어 무관), 어드민 API는 `detail={"code": …}` 관례 |

### 3.7 운영 연계

- **APScheduler(BFF lifespan, `backend/app/main.py:~66-230`, ICT)**: `factmind_saigon/saigon/jobs.py`의 `register_jobs(scheduler)`가 등록 — `fm_refresh_bot_feeds`(일 1회 04:40 — 기존 02:30 백업·03:10~03:30 purge와 겹치지 않는 시각, 주석 관례 준수), `fm_reverify`(일 1회 05:10, published 전건, C1은 `to_thread`), `fm_purge_bot_visits`(30일 경과 행 삭제, purge 시간대에 합류). 잡 함수는 `async def … -> bool`, 예외는 로그·False(`jobs/expire_stale_listings.py:18-44` 패턴), `max_instances=1`.
- **env (`.env.example` → `.env` → `docker-compose.yml bff.environment` 세 곳 동시)**: `FM_PUBLIC_ORIGIN`(prod `https://saigon-rider.com`, dev `http://localhost:18090`), `FM_INDEXNOW_KEY`(비면 송신 생략 — dev 기본), `FM_INDEXNOW_ENGINES`(쉼표 목록, 기본 `bing`), `FM_TRUSTED_PROXIES`(CIDR 목록), `FM_VERIFY_BASE_URL`(dev 전용 `http://nginx:80`; prod 비움 → 공개 URL 사용). 5개. `noti_worker`는 bff 이미지를 공유하므로 bff 변경 시 함께 재시작(agent-guidelines §1 C).
- **어드민 — 대표 결정(별도 도메인 없음, 기존 `/admin/` 콘솔에 "FactMind" 메뉴)**: API는 `factmind_saigon/saigon/routes_admin.py`(`APIRouter(prefix="/fm")`, 핸들러마다 `Depends(verify_admin_api)`, 변경은 `audit()` — `admin_api/cms.py` 패턴)를 `backend/app/routers/admin_api/fm.py`가 재export하고 `admin_api/__init__.py` include 목록에 등록 → `/admin/api/fm/…`, 인증은 기존 `admin_session` JWT 쿠키. 화면은 `admin-frontend/src/pages/fm/FactMind.tsx` 1장 + `src/api/fm.ts`. **v1 화면 범위(최소)**: subject 목록·공개 상태, publish/withdraw 버튼, 자체 진단 실행 + 마지막 보고서, 마지막 verify 결과, 봇 방문 집계, 콘솔 색인 수 수기 입력 폼. 단계 배치: 목록·publish/withdraw·진단·verify는 **P3**, 방문 집계·수기 입력은 **P5**(어드민만의 단계는 두지 않는다). 엔드포인트: `GET /subjects`, `POST /subjects/{id}/publish|verify|withdraw`, `POST /diagnose`, `GET /events?kind=`, `GET /visits?days=`, `POST /console-coverage`, `PUT /platform-facts`. 배포는 `어드민배포` 절차.
- **이미지**: `og:image`·JSON-LD `image`는 `photo_content_id` → `build_imgproxy_url()` 절대 URL(`IMGPROXY_BASE_URL`, prod 값 **[확인 필요]**). `contents.is_private` 이미지는 제외(agent-guidelines §7).
- **재빌드**: `docker compose --env-file .env up --build -d bff bff_migrate noti_worker`(+`admin_frontend`), 엣지 conf는 `sudo cp deploy/saigon-rider.conf …` + `nginx -t && reload`(P1 1회).

### 3.8 제약 준수 체크리스트

| 제약 (출처) | 이 설계의 준수 방법 |
|---|---|
| BFF는 Engine(SRE) DB 테이블 직접 접근 금지, `engine_client` HTTP만 (CLAUDE.md) | fm은 BFF 프로세스 안에서 돌지만(`factmind-saigon/` 패키지, §3.2) `sre_*`·미션 데이터를 쓰지 않는다. P6에서 퀘스트를 다룰 때도 `engine_client` 경유 |
| timezone-aware 강제 (CLAUDE.md) | 모든 컬럼 `timestamptz`, 코드 `datetime.now(UTC)`/`utcnow()` 헬퍼, 일 경계는 ICT 잡 스케줄 |
| 이미지는 `contents` 중개 + `build_imgproxy_url()` (agent-guidelines §7) | `photo_content_id`만 참조, 출력 시 변환, `is_private` 제외 |
| 하드코딩 금지 — 운영상 바뀌는 목록은 DB+API (메모리) | 업종·지역은 `business_category`·`wards`·`districts` 테이블에서 읽음. 플랫폼 facts·FAQ는 `fm_snapshot`(어드민 편집). 봇 정책 JSON·IndexNow 엔진은 기술 설정(파일·env)으로 둔다 — 운영 목록이 아님 |
| 사용자 노출 문자열 ko/en/vi (메모리) | `core/locale/` 3벌 + 어드민 UI는 admin-frontend i18n 관례 |
| 프론트 `<img>` 직접 금지·`native.ts` (CLAUDE.md) | 앱 UI 변경 없음(P6 전까지). 어드민 페이지는 admin-frontend 관례 |
| `.env`/`.env.example` 키 패리티 + compose 배선 (agent-guidelines §4) | §3.7 env 5개를 세 곳에 동시 추가 |
| 마이그레이션 멱등·compose 쌍 추가 (agent-guidelines §10) | §3.4 |
| AI 발명 정책 금지 (메모리) | 공개 범위·phone·게이트·매물 정밀도는 §5에서 대표 결정. 기술 위생(404·canonical·noindex on non-canonical host)만 설계가 정함 |
| 완료 = 통합테스트 1회 (CLAUDE.md) | §4 각 단계의 검증 조건 1개 |
| 코드 변경 후 `index_repository` 재색인, push 전 `/code-review` (CLAUDE.md) | 각 단계 마무리에 포함 |
| 닫아둔 기능 보류 — 쿠폰함 (메모리) | `business_coupon`은 공개 페이지에 싣지 않는다 |

### 3.9 업스트림 역이식 가드레일 (FactMind core 동기화) — 대표 결정(2026-10-08)

**전제**: 두 레포는 합칠 수 없다(서비스 층이 다르다). **동기화 대상은 `core`뿐**이다. `git push`는 정적이라 부족하고, 원하는 것은 **동적**이다 — 베트남에서 통한 튜닝 지식이 원본 엔진에 적용 가능한 산출물로 남고, 역이식이 제대로 됐는지 **검증할 수단**이 있어야 하며, 사용자가 잊어도 작동해야 한다. 참고 패턴: Chromium `README.chromium`("Local Modifications"), Go `vendor/modules.txt`, Debian DEP-3 패치 헤더(`Forwarded`/`Applied-Upstream`). 스크립트 + md + json만 쓴다(봇·CI 매트릭스·두 번째 DB 없음).

| # | 장치 | 위치 | 내용 |
|---|---|---|---|
| G1 | **출처 매니페스트**(생성물, 손으로 쓰지 않음) | `factmind-saigon/UPSTREAM.json` ← `factmind-saigon/tools/fm_upstream.py --upstream /DEVELOP/Blueurban/factmind` | 이식 파일마다 `{local, upstream: [{path, lines}], upstream_commit, upstream_sha256(이식 시점), local_sha256, status ∈ unchanged / local-modified / upstream-ahead / both / unknown-upstream}`. 여러 로컬 파일이 한 업스트림 파일에서 나온다(`fetch.py`·`access.py`·`bundle.py`·`indexnow.py` ← `public_delivery.py`) → 업스트림 파일이 바뀌면 그 4개가 함께 `upstream-ahead`로 뜬다(사람이 본다). **sha256은 CRLF→LF 정규화 후** 계산(업스트림이 CRLF). 업스트림 체크아웃이 없는 머신에서는 `unknown-upstream`으로 **실패하지 않고** 보고 |
| G2 | **역이식 원장**(append-only) | `factmind-saigon/BACKPORT.md` | 항목 헤더(DEP-3식): `Id: BP-NNNN` · `Date` · `Kind ∈ code / learning / no-backport` · `Files`(로컬 함수 → 업스트림 `site/<file>.py:<function>`) · `Why`(증거: 측정 보고 링크 또는 `fm_event` id, before→after 숫자) · `How-to-apply-upstream`(단계 — 업스트림 서비스 층이 다르므로 대상 파일·함수를 지명) · `Forwarded ∈ pending / applied <upstream commit> / not-needed <reason>` · `Verified ∈ no / yes <parity run id>`. `learning`은 패치가 아니라 **증거 달린 권고**(정책 JSON 값, 휴리스틱, 채널 실측). **P5 데이터 전까지는 `code` 항목만 생긴다** |
| G3 | **패리티 검사**(사용자가 요구한 검증 수단 — 레포의 "단위테스트 생략" 규칙은 나머지에 그대로) | `factmind-saigon/tools/fm_parity.py` + 골든 픽스처 `factmind-saigon/golden/{bundle,diagnosis,access,bots,verify}/*.json` | 고정 픽스처(사실 스냅샷 → 기대 번들, URL 응답 레코드 → 기대 진단, UA/IP/피드 → 기대 판정)를 `--target saigon`(import `factmind_saigon.core`) 또는 `--target upstream --path <fm>/site`(sys.path로 `public_delivery`·`site_report`·`observation_collect` 직접 import)에 통과시켜 **결과 다이제스트** 출력. **계약**: ① 번들은 `locale='ko-KR'`·추가 파라미터 기본값으로 돌리면 업스트림 출력과 **바이트 동일**해야 한다(로캘 층이 KR을 정확히 재현한다는 불변식) ② 진단·판정은 로캘 문구 키(`title`·`fix`·`reason_text`)를 뺀 **구조 다이제스트**로 비교. 네트워크를 타는 C1·C6은 제외(픽스처 주입 불가). 두 타깃의 다이제스트가 같으면 verified, run id = `YYYYMMDD-<다이제스트 앞 8자>`. 픽스처는 데이터라 역이식 때 업스트림으로 **함께 복사** |
| G4a | **pre-commit 게이트**(잊어도 작동) | `.pre-commit-config.yaml` local hook → `tools/check_fm_core.py` | 스테이지에 `factmind-saigon/factmind_saigon/core/**` 변경이 있으면 같은 커밋에 `factmind-saigon/BACKPORT.md`도 스테이지돼 있어야 통과(`no-backport` + 사유도 허용). 동시에 `core/`에 `from app`/`import app`/`sqlalchemy`/`fastapi`/`factmind_saigon.saigon`이 있으면 실패(§3.2 규칙과 한 스크립트) |
| G4b | **CLAUDE.md 규칙**(에이전트가 잊지 않게) | `CLAUDE.md` 새 절 "FactMind 코어 동기화 규칙" | 초안 전문은 §8-3(≤15줄). 핵심: core만 동기화 · core 변경마다 원장 항목 · fm 작업 **시작** 시 매니페스트 상태 확인 · fm 작업 보고 **끝**에 `Forwarded: pending` 건수 보고 |
| G4c | **업스트림 런북** | FactMind 레포 `docs/SAIGON-BACKPORT.md` | 초안 전문은 §8-4. 원장 읽기 → `site/*.py`에 적용 → 골든 픽스처 복사 → 패리티 실행 → 원장에 업스트림 커밋 기록 → `Verified: yes`. **적용은 그 레포에서의 별도 작업**(이번 작업은 FactMind read-only) — 대표 go 필요(후속) |

**재적합·도전 결과**: 설계 골격은 감독 초안 그대로(Chromium/DEP-3 참조, 골든 픽스처가 레포 간 안정 계약, core-only seam). 구체 문제 세 가지를 고쳐 넣었다 — ① 번들 출력은 KR(ko·KRW)과 VN(vi·VND)이 바이트 동일할 수 없으므로 패리티 계약을 "`locale='ko-KR'` 재현"으로 못 박음(이것이 로캘 층의 정확성 검증을 겸한다) ② 업스트림 체크아웃이 없는 머신에서 매니페스트 검사가 실패하면 "시작 시 확인" 규칙이 무시되기 시작하므로 `unknown-upstream` 무실패 보고 ③ CRLF 정규화 없이는 모든 파일이 `both`로 뜬다. 프리모템(감독): 업스트림에서 아무도 패리티를 안 돌림 → `Verified`는 다이제스트를 붙여야만 `yes`; 업스트림이 앞서감 → 시작 시 `upstream-ahead`; 배움이 코드화 안 됨 → `learning`은 증거 링크 필수. **유지.**

---

## 4. 단계별 계획

완료 정의(CLAUDE.md): 재빌드된 dev 스택(`:18090`)에서 **통합 시나리오 1회 통과**. 단위·계약 테스트 신규 작성 없음. 구현 작업자는 구현·커밋까지, 테스트는 감독이 1회 실행. 모델 티어: T3=Sonnet(기본), T4=Haiku.

| 단계 | 범위 | 파일/영역 | 검증 조건 (1회) | 규모 | 티어 |
|---|---|---|---|---|---|
| **P0 대표 결정** | §5 항목 1·2·4·6 확정(3·5·7·8은 P5/P6 전까지) | 티켓·이 문서 §5 갱신 | 답변이 §5에 기록됨 | — | 감독 |
| **P1 서빙 기반** | ① 엣지 conf location 7개 + 컨테이너 nginx location ② `routers/fm_public.py` 골격: 미지 slug → 404 text/plain, `/sitemap.xml` sitemapindex(→ `/sitemap-fm.xml` 빈 urlset + `/sitemap-site.xml`), `/rss.xml` 빈 채널 ③ 랜딩: `public/robots.txt`에 `Sitemap:` 줄, `index.html` JSON-LD `__SITE_URL__` 치환(빌드 치환 코드 **없음 — dist에 그대로 남음 [확인]**) + `canonical`/`og:url`/`og:image`, postbuild가 `sitemap-routes.json`에서 `sitemap-site.xml`도 생성 ④ `app.` 호스트 `robots.txt`: `/app_privacy/ /app_support/ /app_qr/`만 Allow, 나머지 Disallow(기술 위생 권장 — 대표 거부 가능) | `deploy/saigon-rider.conf`, `nginx/conf.d/default.conf`, `backend/app/routers/fm_public.py`, `backend/app/main.py`(include_router, prefix 없음), `landing/apps/client/{public/robots.txt,index.html,scripts/postbuild.mjs}`, `frontend/public/robots.txt` 또는 컨테이너 nginx location | dev: `curl -H 'Host: saigon-rider.com' :18090/sitemap.xml` → 200 `application/xml` sitemapindex; `/b/nope/` → 404 text/plain; `/robots.txt`(frontend) → 200 text/plain(HTML 아님). prod 반영 후 외부에서 같은 3건 + 서버 내부 hairpin `curl https://saigon-rider.com/sitemap.xml` 200 | M | nginx·라우터 T3 / 랜딩 3파일 T4 |
| **P2 코어 이식 + 패키지 배선 + 가드레일** | ① `factmind-saigon/` 폴더·`pyproject.toml`·`factmind_saigon/{core,saigon}` 골격, bff build context 루트 전환 + Dockerfile COPY/pip install + dev 마운트·`PYTHONPATH`(§3.2) ② C1·C2·C3·C4·C5·C6·C7을 `core/`로 이식(CRLF 제거, 한글 문구→`locale`·코드, KR→VN/VND, 동기 수집기는 호출부에서 `to_thread`; **`locale='ko-KR'`이면 업스트림 출력을 재현**) ③ 가드레일(§3.9): `tools/fm_upstream.py` + 생성된 `UPSTREAM.json`, `BACKPORT.md`(첫 항목 `BP-0001 Kind: code` = 이식 자체), `tools/fm_parity.py` + 골든 픽스처(번들 2·진단 2·접근검사 2·봇 판정 2·검증 1 [추정]), pre-commit `tools/check_fm_core.py`(원장 동반 + import 금지), CLAUDE.md 절 추가(§8-3) ④ `routes_admin.py`에 `POST /admin/api/fm/diagnose {url}` + `admin_api/fm.py` 재export·등록 | `factmind-saigon/**`, `backend/Dockerfile`, `docker-compose.yml`(bff build·volumes·PYTHONPATH), `backend/app/routers/admin_api/{fm.py,__init__.py}`, `.pre-commit-config.yaml`, `tools/check_fm_core.py`, `CLAUDE.md` | ① 재빌드된 dev bff에서 `python -c "import factmind_saigon.core"` OK ② **패리티**: `fm_parity.py --target saigon`과 `--target upstream --path /DEVELOP/Blueurban/factmind/site`의 다이제스트 동일(이것이 P2의 통합 검증을 겸한다) ③ 어드민 API로 `https://saigon-rider.com` 진단 1회 → 10항목 JSON(`items[10]`, `complete_reads`), `fm_event(site_report)` 1행(외부 HTTPS 1회 실호출) | L | T3 |
| **P3 공개·검증 + 어드민 1차** | 마이그레이션 253(§3.4) + `saigon/storage.py` ORM, `saigon/subjects.py`·`publishing.py`(업체·플랫폼 스냅샷, publish/verify/withdraw 트랜잭션), 공개 라우트 `/b/<slug>/`·`facts.json`·`/l/`(허브, Organization JSON-LD, 플랫폼 FAQ), 404/410, non-canonical Host noindex, `main.py` include_router; 어드민 API publish/verify/withdraw·플랫폼 facts 편집 + **어드민 "FactMind" 메뉴 1차**(subject 목록·공개 상태, publish/withdraw 버튼, 진단 실행 + 마지막 보고서, 마지막 verify 결과) | `database/init/253_*.sql`, `docker-compose.yml`(migrate 쌍), `factmind_saigon/saigon/{storage,subjects,publishing,routes_public,routes_admin}.py`, `backend/app/main.py`, `admin-frontend/src/{pages/fm/FactMind.tsx,api/fm.ts,App.tsx 라우트·메뉴}` | Playwright(어드민): dev DB의 APPROVED 업체 1건을 "FactMind" 메뉴에서 publish → `GET /b/<slug>/` 200, 본문에 `LocalBusiness` JSON-LD·canonical·업체명, `facts.json` 200; verify → 화면에 `verified_at`(`FM_VERIFY_BASE_URL` 경유); withdraw → 410, `/l/`에서 사라짐 | L | T3 |
| **P4 목록·RSS·IndexNow** | `/l/<ward>/`·`/l/<ward>/<category>/`(DB 테이블에서 slug=code, 항목 0이면 404), `/ko/l/…`·`/en/l/…` + hreflang, `/sitemap-fm.xml`(published + 목록, lastmod=published_at), `/rss.xml`, IndexNow 키 파일 `/b/<key>.txt` + 검증 최초 1회 송신(키 비면 생략·이벤트만) | `factmind_saigon/saigon/routes_public.py`, `core/bundle.py`(목록 템플릿), `saigon/publishing.py` | HTTP: P3의 업체가 `/l/<ward>/<category>/`에 나타남(3언어 URL 모두 200, hreflang 3+1), `/sitemap-fm.xml`에 `/b/<slug>/`·목록 URL 포함, `/rss.xml` item 1건, IndexNow는 dev에서 `fm_event(index_notified, skipped=true)` | M | T3 |
| **P5 측정 + 어드민 2차** | `saigon/middleware.py`(C7 판정, VERIFIED만 ip/ua 저장, rDNS 스레드+캐시), `saigon/jobs.py`(`fm_bot_feed` 갱신·재검증·30일 purge) + `main.py` 등록, 어드민 "FactMind" 메뉴 2차 위젯(일별 봇 방문 집계, 콘솔 색인 수 수기 입력), **AI 채널 수동 프로브 1회**(질문 5개 × 후보 채널, 로그아웃 브라우저, 결과를 `fm_event`에 기록) | `factmind_saigon/saigon/{middleware,jobs,routes_admin}.py`, `backend/app/main.py`, `admin-frontend/src/{pages/fm,api/fm.ts}` | HTTP: 신뢰 프록시를 거친 Googlebot UA 요청 2건 → `fm_bot_visit` 2행(rDNS 불가 환경이면 `UNVERIFIED`, ip/ua null) → 어드민 `GET /admin/api/fm/visits` 집계에 반영; 콘솔 수기 입력 1건 저장 | M | T3 |
| **P5+ 첫 역이식** | P5 측정 데이터(봇 방문·콘솔 수·AI 프로브)가 생긴 뒤 **첫 `learning` 항목**(예: VN 봇 정책 값, 크롤러 발견 사항)과 그때까지 쌓인 `code` 항목을 FactMind `site/*.py`에 적용 → 골든 픽스처 복사 → 패리티 → 원장 `Forwarded: applied <commit>`·`Verified: yes <run id>` (§3.9 G4c 런북, §5-9 결정 후) | FactMind 레포(별도 작업·대표 go), `factmind-saigon/BACKPORT.md` | 두 레포에서 `fm_parity.py` 다이제스트 동일 + 원장에 `pending` 0건 | S~M | T3 |
| **P6 확장** | 매물(`marketplace_listings`)·커뮤니티 그룹·퀘스트를 `kind`로 추가. **착수 조건**: P5 이후 4주간 `/b/`·`/l/`에 VERIFIED 봇 방문 > 0 **그리고** §5-3 대표 결정 | 미정 | 미정 | — | — |

각 단계 마무리: 커밋 → `index_repository`(fast) → `current.md` 1줄 → push 전 `/code-review medium`(P3은 공개 범위 변경이라 `high`). **fm 작업 공통**: 시작 시 `tools/fm_upstream.py` 상태 확인, 끝에 원장 `Forwarded: pending` 건수 보고(§3.9 G4b).

---

## 5. 대표 결정 필요 항목

> 아래는 숨김·공개 범위·게이트에 해당하므로 설계가 정하지 않는다(메모리 "AI 발명 정책 금지"). 권장안은 참고용이며, 대표 판정이 권장과 다르면 그대로 따른다.

**1. 크롤 가능한 페이지의 개인정보 — `phone`, `owner_user_id`** (현재 `/api/biz/public/{id}`가 둘 다 무인증 노출 중, `biz.py:1222-1262`)
**Recommendation:** `owner_user_id`는 제외(공개 가치 0인 내부 식별자). `phone`은 **현상 유지**(앱 공개 API가 이미 내보내는 값이므로 `LocalBusiness.telephone`에 그대로 싣는다). 단, "API 응답"과 "검색엔진 색인 페이지"는 노출 범위가 다르므로 대표 확인 후 진행.
**Why (brief):** 전화번호는 로컬 검색 결과의 핵심 필드이고, 새 동의 UI를 만들면 v1에 앱 변경이 들어온다.
**Second look:** Gamma → "승인 사실 = 앱 공개 API가 이미 내보내는 것 − 내부 식별자"는 설명 가능하고 안정적인 규칙. Karpathy → 동의 UI 없음이 최소. **유지**. 거부 시 대안: 업체 소유자 opt-in 체크박스(앱 변경 S, P6 이전엔 어드민 플래그로 대체).

**2. 업체 공개 게이트 — APPROVED 자동 공개 vs 소유자 opt-in**
**Recommendation:** `status='APPROVED'`면 **자동 공개**(관리자 직접 등록 업체 `user_id null` 포함), 운영자 withdraw로 내린다.
**Why (brief):** 디렉터리는 양이 있어야 목록 페이지가 생긴다. FactMind는 opt-in 구조로 공개 2건·고객 0명에서 멈췄다.
**Second look:** Gamma → 철회 경로(410 + 사이트맵 제외 + IndexNow 재통지)가 있으니 자동 공개의 되돌림 비용은 낮다. Karpathy → 앱 변경 0. **유지**. 단, 업체 약관에 "공개 디렉터리 게재" 문구가 있는지 **[확인 필요]**(법무).

**3. 매물·커뮤니티 공개 범위와 좌표 정밀도** — P6 전까지 결정 불필요. 쟁점: 30일 만료·SOLD 잦은 UGC의 색인 가치, ward 블러 규칙(`services/location_privacy.py`) 적용 여부, 작성자 닉네임 노출. 권장 없음(P5 데이터 본 뒤).

**4. 서빙 호스트** — §3.3 권장(루트 도메인 경로 프록시). 엣지 conf 수동 반영(`sudo`) 1회 승인 필요.

**5. 측정 채널에 투자할지**
**Recommendation:** v1은 봇 방문 + 콘솔 수기. AI 답변 조회는 **P5에서 사람이 1회 수동 프로브**(반나절)한 결과로 자동화 여부를 다시 결정. 조회기 VM·계정 구축은 지금 하지 않는다.
**Why (brief):** 한국에서도 6채널 중 1개만 동작했고 베트남 채널은 실측이 없다. 채널이 있는지 모른 채 큐·워커를 만들면 FactMind의 G1~G3를 그대로 상속한다.
**Second look:** Gamma → 큐 계약(`observer.v1`)은 나중에 가져와도 되는 안정된 참고물. Karpathy → "someday"용 큐 금지. **유지**.

**6. 업체 지역 귀속 — `ward_id` 컬럼 신설 vs haversine 파생**
**Recommendation:** 호스트 스키마는 건드리지 않고, publish 시점에 기존 `_nearest_ward`(`biz.py:1042`)로 파생한 값을 `fm_subject.ward_id`에 **고정 저장**(재공개 시 갱신).
**Why (brief):** 목록 멤버십이 재공개 때만 바뀌어 안정적이고, 앱 마이그레이션이 없다.
**Second look:** Gamma → 지역 진실은 업체 엔티티에 있어야 한다 — 맞지만 앱이 `ward_id`를 도입하면 adapter 한 줄만 바꾸면 되는 seam. **유지**.

**7. 플랫폼 facts·FAQ 내용** — 어드민에서 입력할 사실(앱스토어 링크, 서비스 지역 표현, FAQ 3~5개 vi/ko/en)은 대표·마케팅이 제공. P3 착수 전 초안 필요.

**8. 발행 전 심사(S03/S04·악의 표현) 현지화 여부** — FactMind 정책은 한국법. 베트남 광고법·금칙 표현 규칙을 v1에 넣을지, 기존 마켓 `banned_keyword`로 갈음할지. 권장: **v1 미적용**(업체는 이미 운영 승인 절차를 거침), P6 매물 공개 시 재논의.

**9. FactMind 역이식의 적용 주체 — 우리가 직접 적용 vs 원장 항목만 FactMind 담당에게 전달**
**Recommendation:** **우리(같은 엔지니어)가 직접 적용**하고 원장에 업스트림 커밋·패리티 run id를 기록한다.
**Why (brief):** 패리티 스크립트가 "제대로 적용됐는지"를 두 레포에서 같은 다이제스트로 증명하므로, 적용자가 누구든 검증은 같다. 전달만 하면 FactMind 쪽에 `pending`이 쌓이고 아무도 패리티를 돌리지 않는 것이 가장 그럴듯한 실패다(§3.9 프리모템 ①).
**Second look:** Gamma → 레포 간 계약은 골든 픽스처 데이터이므로 적용 주체는 경계와 무관. Karpathy → 인수인계 절차를 하나 더 두지 않는 쪽이 최소. **유지.** FactMind 운영 배포 승인은 그 레포 규칙(대표 직접 승인)을 그대로 따른다.

---

## 6. 리스크·프리모템 (6개월 뒤 "실패했다"면 가장 그럴듯한 이유)

| # | 리스크 | 완화 |
|---|---|---|
| 1 | **효과 미입증은 FactMind에서도 그대로였다** — 페이지를 올렸는데 봇도 색인도 0 | 완료 기준을 효과가 아닌 §4 검증 조건으로 고정. P5 데이터(방문·색인 수) 없이는 P6에 돈을 쓰지 않는다 |
| 2 | **엣지 nginx drift** — 레포 밖 수동 설치본이 커밋본과 달라져 fm 경로가 랜딩 SPA 폴백으로 200 HTML을 돌려줌(소프트 404) | P1 외부 curl 검증 + P5 재검증 잡이 매일 해시 대조(소프트 404는 즉시 `verify ok=false`) + M2 자체 진단의 `missing_404` 항목 |
| 3 | **위키↔코드 drift를 그대로 이식** — fm 위키 줄 번호·갭 서술이 10-06 배포 전 상태(G7은 이미 수정됨, `public_delivery.py`는 494→521줄) | P2 작업자는 **코드만** 기준으로 이식, 위키는 참고. 이 문서의 `fm:path:line`은 코드 기준 |
| 4 | **번역 장애 지속** — `TRANSLATE_API_KEY` 403이라 업체 페이지가 vi 1장뿐, ko/en 검색 유입 없음 | v1은 단일 언어를 명시적 설계로 두고 "번역됨"을 주장하지 않음. 번역 복구 시 `locale_source` + 번역본을 별도 snapshot 버전으로 |
| 5 | **측정 루프의 주인이 없다** — 콘솔 수기 입력·프로브를 아무도 안 해 M5가 다시 "틀만 있는" 상태 | 어드민 페이지에 "마지막 입력일" 표시, P5 완료 조건에 첫 입력 1건 포함, 주 1회 루틴을 대표/운영 담당에게 배정(§5-5) |
| 6 | 운영 서버(한국 IP) hairpin·egress 제한으로 verify/IndexNow 실패 | P1에서 서버 내부 curl 확인, 실패 시 `FM_VERIFY_BASE_URL`을 prod에서도 내부 nginx로 두고 Host 헤더로 대체(검증 의미 약화는 문서화) |

---

## 7. 미확인·검증 필요 (두 보고의 미확인 항목 이관)

- **운영 데이터 규모**: 승인 업체 수, ward·업종별 분포, ON_SALE 매물 수 — 조회 안 함. 목록 페이지가 몇 장 생기는지(thin page 비율)는 P3 전 운영 쿼리 1회로 확인.
- **CSP `style-src`** 값과 인라인 `<style>` 허용 여부(`default.conf:30-57`) — P1.
- **prod `IMGPROXY_BASE_URL`** 실값·`og:image` 절대 URL 형태 — P3.
- **서버 hairpin**(BFF → `https://saigon-rider.com`)과 IndexNow egress — P1.
- **`landing/apps/server`** 가 prod에서 기동 중인지(compose 미연결, `landing/Dockerfile`만 존재) — 기동 중이면 루트 경로 소유가 둘.
- **모델↔SQL 불일치 가능성**: sr 분석은 `models.py` 클래스로 컬럼을 읽었고 `database/init/*.sql` 본문은 미독.
- **랜딩 홈 prerender**: `landing/apps/client/scripts/prerender.mjs`가 홈 라우트를 SSR 1회 렌더한다 **[확인 — 이번에 열람]**. sr 분석의 "SSR/prerender 없음"은 앱(`frontend/`)에 대한 서술로 읽어야 하고, 랜딩 홈은 본문 텍스트가 HTML에 있을 가능성이 있음(dist 본문 미확인).
- **IndexNow 참여 엔진 목록**(Bing 외 Yandex·Seznam·Naver), Bing이 VN 트래픽에 갖는 비중 — 일반 지식, 출처 확인 후 env 기본값 결정.
- **Cốc Cốc·Zalo 크롤러** UA·rDNS·공식 IP 피드 존재 여부 — C7 정책 JSON 추가 전 조사.
- **`dnspython`** 을 FactMind 코어 모듈이 실제 import하는지(C7 rDNS는 stdlib `socket`으로 보임 [추정]).
- FactMind 측 "엔진 완료" 정의(M3/M4까지 vs M1~M5 루프)는 그들 문서에서도 미합의(fm 위키 18) — 우리 범위는 이 문서 §3.5가 독립적으로 정한다.
- 업체 약관의 디렉터리 게재 근거(§5-2).

---

## 8. 부록

### 8-1. 용어

| 용어 | 뜻 |
|---|---|
| M1 측정 | AI 답변·검색 결과에 대상이 나오는지 관측(FactMind: 조회기 워커) |
| M2 진단 | 사이트가 크롤 가능한지 점검(robots·canonical·사이트맵·소프트404·본문 텍스트) |
| M3 생성 | 승인된 사실만으로 공개 페이지 묶음 생성(HTML·facts.json·JSON-LD) |
| M4 공개·검증 | 서빙 + 실제 응답을 저장본 해시와 대조 + 사이트맵·RSS·IndexNow |
| M5 재측정 | 같은 조건으로 M1을 다시 돌려 차이를 기록(FactMind는 구현 없음) |
| AEO | Answer Engine Optimization — AI 답변 엔진(AI Overviews·ChatGPT 등)이 읽고 인용하도록 구조화하는 것 |
| IndexNow | Bing·Naver·Yandex 등이 받는 URL 변경 통지 프로토콜(키 파일로 호스트 소유 증명, 200/202=접수이지 색인 아님). Google 불참 |
| pSEO | programmatic SEO — 구조화 데이터(지역×업종)에서 목록 페이지를 규칙으로 생성 |
| two-tier entity publishing | 이 계획의 모델: 플랫폼 엔티티(허브) + 하위 업체 엔티티(디렉터리)를 하나의 subject 계약으로 공개 |
| hub-and-spoke | 허브(브랜드 페이지) ↔ 스포크(개별 엔티티 페이지) 상호 링크 구조 |

### 8-2. 이식 파일 지도 (FactMind → 사이공라이더)

| FactMind (`fm:`) | 대상 | 단계 |
|---|---|---|
| `site/public_delivery.py:19-143` (C1) | `factmind-saigon/factmind_saigon/core/fetch.py` | P2 |
| `site/site_report.py:19-224` (C2) | `…/core/site_report.py` | P2 |
| `site/public_delivery.py:189-281` (C3) | `…/core/access.py` | P2 |
| `site/public_delivery.py:284-349, 376-521` (C4) | `…/core/bundle.py` + `core/locale/{vi,ko,en}.py` | P2(코어)·P3(업체/플랫폼 템플릿)·P4(목록·RSS) |
| `site/self_service.py:176-190` (C5) | `…/core/verify.py` | P2 |
| `site/public_delivery.py:354-365` (C6) | `…/core/indexnow.py` | P2·P4 |
| `site/observation_collect.py:48-206` + `site/observation_policy.json` (C7) | `…/core/bots.py` + `core/bot_policy.json` | P2·P5 |
| `site/self_service.py:116-209` (publish/verify 흐름, 참고) | `…/saigon/publishing.py` | P3 |
| `site/registration_server.py:367-395` (`inspect_snapshot`, 참고) | `…/saigon/publishing.py` 내 facts↔JSON-LD 일치 검사 | P3 |
| `site/migrations/003,011` (`tech_event`, `obs_*`, 참고) | `database/init/253_fm_tables.sql` | P3·P5 |
| `engine/observer/contracts/*.json` (참고, 미이식) | — | §5-5 결정 후 |

### 8-3. CLAUDE.md 추가 절 초안 (saigon_rider, ≤15줄 — P2에서 적용)

```markdown
## FactMind 코어 동기화 규칙 (`factmind-saigon/`)

`factmind-saigon/factmind_saigon/core/`는 원본 FactMind(`/DEVELOP/Blueurban/factmind` `site/*.py`)에서 이식한 코어다. **동기화 대상은 core뿐**이다(`saigon/` 어댑터·서비스 층은 역이식하지 않는다). 상세: `ai-docs/spec/261008_fm_engine_port_plan.md` §3.9.

- **시작**: fm 관련 작업(`factmind-saigon/` 또는 공개 페이지·진단·측정)을 시작할 때 `python factmind-saigon/tools/fm_upstream.py --upstream /DEVELOP/Blueurban/factmind`를 돌려 `UPSTREAM.json` 상태(`upstream-ahead`/`both`)를 먼저 확인하고 보고에 적는다. 체크아웃이 없으면 `unknown-upstream`으로 적고 진행한다.
- **core 변경마다** `factmind-saigon/BACKPORT.md`에 항목 1개(`Kind: code|learning|no-backport`, `Why` 증거, `How-to-apply-upstream`, `Forwarded: pending`). pre-commit(`tools/check_fm_core.py`)이 원장 없는 core 커밋과 `core/`의 `app`/`sqlalchemy`/`fastapi` import를 막는다.
- **측정에서 배운 것**(정책 값·휴리스틱·채널 실측)은 코드가 안 바뀌어도 `Kind: learning` 항목으로 남긴다. 증거 링크(`fm_event` id 또는 보고서 경로) 없는 learning은 쓰지 않는다.
- **역이식 검증**은 `tools/fm_parity.py`만 쓴다(`--target saigon` vs `--target upstream --path <fm>/site` 다이제스트 동일 = `Verified: yes <run id>`). 그 외 단위테스트는 레포 규칙대로 쓰지 않는다.
- **끝**: fm 작업 보고의 마지막 줄에 원장의 `Forwarded: pending` 건수를 쓴다(0건이어도).
```

### 8-4. FactMind 레포 런북 초안 — `docs/SAIGON-BACKPORT.md` (그 레포에서의 별도 작업, 대표 go 필요; 이번 작업은 FactMind read-only)

```markdown
# Saigon Rider 역이식 런북

Saigon Rider(`/DEVELOP/DOIL/saigon_rider/factmind-saigon/`)는 이 레포의 `site/public_delivery.py`·`site_report.py`·`observation_collect.py`·`self_service.py`(비교부)를 코어로 이식해 베트남에서 운영한다. 그쪽에서 증명된 개선은 `factmind-saigon/BACKPORT.md` 원장으로 돌아온다. 이 문서는 원장 항목을 여기에 적용하는 절차다.

1. 원장에서 `Forwarded: pending` 항목을 읽는다. `Kind: no-backport`는 건너뛴다. `Kind: learning`은 패치가 아니라 증거 달린 권고다 — 채택 여부를 정하고 채택하지 않으면 `Forwarded: not-needed <사유>`로 원장에 적는다(Saigon 쪽 커밋).
2. `How-to-apply-upstream`이 지명한 `site/<file>.py:<function>`에 변경을 적용한다. 이 레포는 `* -text`·CRLF 혼재라 편집 후 `git diff --stat`으로 파일 전체가 바뀌지 않았는지 확인한다. 서비스 층(Flask 라우트·SQLite·결제)은 손대지 않는다.
3. 골든 픽스처를 복사한다: `factmind-saigon/golden/` → 이 레포 `site/golden/`(`.gitignore` 허용목록에 추가 필요).
4. 패리티를 돌린다: `python factmind-saigon/tools/fm_parity.py --target upstream --path <이 레포>/site` 와 `--target saigon` 의 다이제스트가 같아야 한다. 다르면 적용이 불완전한 것이다 — 원장 항목의 `Files`와 대조한다.
5. 커밋 후, Saigon 원장 항목에 `Forwarded: applied <이 레포 커밋>`·`Verified: yes <run id>`를 적는다(Saigon 쪽 커밋).
6. 운영 반영은 이 레포 규칙대로 대표 승인 후 `site/deploy/release.py`로만 한다. 이 런북은 승인이 아니다.
```
