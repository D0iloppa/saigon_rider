# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 핵심 행동 원칙 — 카파시 지침 (Karpathy's Guidelines)

> Andrej Karpathy 의 agentic coding 안티패턴 4원칙. 본 파일과 [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) 의 모든 규칙보다 **우선**한다.

### 1. Think Before Coding — 가정하지 말고, 헷갈림을 숨기지 말 것
- 구현 전에 **가정을 명시**한다. 불확실하면 묻는다.
- 해석이 둘 이상이면 **모두 제시**하고 사용자가 고르게 한다. 임의 선택 금지.
- 더 단순한 길이 있으면 **반박**한다. 필요할 땐 push back.
- 헷갈리면 멈춘다. 무엇이 헷갈리는지 이름 붙여 묻는다.

### 2. Simplicity First — 요청을 풀 수 있는 최소한의 코드
- 요청 이상 기능 추가 금지.
- 1회용 코드에 추상화 금지.
- 요청되지 않은 "유연성·설정 가능성" 금지.
- 일어날 수 없는 시나리오에 대한 에러 처리 금지.
- 200줄 짠 게 50줄로 가능하면 다시 쓴다.
- 자문: "시니어 엔지니어가 이걸 보고 과설계라고 할까?" → 그렇다면 단순화.

### 3. Surgical Changes — 시킨 것만 건드릴 것
- 기존 코드 수정 시 **인접 코드·주석·포맷팅을 "개선"하지 않는다**.
- 망가지지 않은 것을 리팩토링하지 않는다.
- 마음에 안 들어도 **기존 스타일을 따른다**.
- 무관한 dead code 발견 시 **언급만** 하고 삭제하지 않는다.
- 내 변경으로 발생한 고아(import, 변수, 함수)만 정리한다. 기존 dead code는 요청 시에만.
- 테스트: **모든 변경 라인이 사용자 요청과 직접 연결돼야 한다.**

### 4. Goal-Driven Execution — 검증 가능한 목표로 변환할 것
- 작업을 검증 가능한 형태로 다시 정의한다:
  - "validation 추가" → "잘못된 입력에 대한 테스트 작성 후 통과시키기"
  - "버그 고치기" → "버그 재현 테스트 작성 후 통과시키기"
  - "X 리팩토링" → "리팩토링 전후 테스트가 동일하게 통과하는지 확인"
- 다단계 작업은 사전에 짧은 계획 명시:
  ```
  1. [단계] → 검증: [확인 방법]
  2. [단계] → 검증: [확인 방법]
  ```
- 강한 성공 기준이 있으면 모델이 독립적으로 루프 돌 수 있다. 약한 기준("동작하게 해줘")은 매번 재확인을 요구하게 만든다.

**작동 신호:** diff 안의 불필요한 변경이 줄어들고, 과설계로 인한 재작업이 줄어들며, **실수 후가 아니라 구현 전에** 명확화 질문이 나온다.

### 5. 모델 라우팅 — 작업별 모델을 스스로 결정할 것

**작업을 실행하기 전, 해당 작업 task에 적절한 모델을 직접 결정하여 서브에이전트로 진행한다. 이때 모델설정의 근거를 반드시 제시하여야 한다.** (사용자가 모델을 수동 지정하지 않는다 — 판단은 AI 몫)

- 기본 배분: 검색/탐색·문서 정리·기계적 수정(i18n, 패턴 미러링, 단순 제거) → **Sonnet/Haiku** 서브에이전트 / 복잡 로직·설계·머니 경로·**UI/디자인 고퀄 작업** → **Fable** (메인 또는 서브에이전트).
- 디자인 개선 패턴: Sonnet 으로 외부 최고 앱 레퍼런스 리서치 → Fable 이 구현.
- 근거 제시 예: "코드 위치 탐색은 커버리지가 관건인 기계적 작업 — Sonnet", "신뢰 체계 네이밍·시각 설계는 품질 판단 필요 — Fable".

---

## Session Start Protocol

새 스레드는 다음 순서로 시작한다. **전체 파일 풀텍스트 검색 금지.**

1. [`ai-docs/INDEX.md`](ai-docs/INDEX.md) — 산출물 지도
2. [`ai-docs/context/current.md`](ai-docs/context/current.md) — 직전 작업 상태 / 다음 우선순위
3. [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) — 운용 규칙 (SoT, 보안, __DEV Context, 린트, 워크플로우)

위 세 파일에서 필요한 문서만 선택적으로 추가 로드한다.

## 코드베이스 인덱싱 (codebase-memory MCP)

이 워크스페이스(`mnt-c-DEV-saigon_rider`)는 `codebase-memory` MCP 로 코드 그래프가 인덱싱되어 있다. 상세 사용 규칙은 [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §9.

- 구조/의존관계/호출관계 파악이 필요할 땐 전체 파일 풀텍스트 검색보다 `search_graph`, `query_graph`, `trace_path`, `get_architecture` 등 MCP 조회를 우선 사용한다.
- **코드를 수정했으면 그 세션 안에서 `index_repository` 로 재인덱싱해 그래프를 최신 상태로 반영한다.** (`repo_path: /mnt/c/DEV/saigon_rider`, 소규모 변경은 `mode: fast`/`moderate`, 구조 변경이 크면 `full`)
- 재인덱싱을 누락하면 이후 세션의 그래프 조회 결과가 과거 코드 기준으로 나오므로, 커밋/작업 마무리 전에 반영 여부를 확인한다.
- **`codebase-memory` MCP 도구가 안 보이면(다른 유저 프로필 등, 글로벌 MCP 설정이 없는 환경)** 억지로 흉내내지 말고, 유저에게 MCP 서버 추가를 권고한 뒤 그 세션에서는 기존 방식(Explore 서브에이전트 / `grep`·`find`)으로 대체한다.

## 프로젝트 골격 (요약)

모바일 하이브리드 앱 (Capacitor WebView). Docker Compose 4종 서비스, 단일 Nginx(:18090) 진입.

```
:18090 → /api/bff/* → saigon_bff      (FastAPI :8080)    앱 화면 BFF
        /api/sre/* → saigon_engine   (FastAPI :8090)    RP·미션·보상 엔진
        /img/*    → imgproxy
        /admin/*  → saigon_bff
```

**핵심 제약 (어기면 회귀 발생):**
- BFF 는 Engine DB 테이블에 **직접 접근 금지** — 오직 `engine_client.py` HTTP API 만.
- Engine 코드는 `datetime.now()` (naive) 사용 금지 — **timezone-aware 강제**.
- 모든 이미지는 `contents` 테이블 중개 — 엔티티는 `*_content_id UUID` FK 만. 출력 시 `build_imgproxy_url()` 변환. 레거시 `*_url` 컬럼은 read-only 폴백.
- 프론트 동적 이미지는 `<AppImage>` 컴포넌트 래핑 (`<img>` 직접 사용 금지).
- 상단 여백은 `var(--status-bar-height)` 변수 사용 (고정 px 금지). 플랫폼 분기는 `[data-platform="ios"]` / `[data-platform="android"]`.
- 프론트 네이티브 기능(`navigator.*`)은 `native.ts`(NativeInterface) 경유 필수 — 브라우저 API 직접 호출 금지 (ESLint error 강제).

**상세 설계 문서는** `ai-docs/context/architecture.md`, `ai-docs/context/frontend.md`, `ai-docs/engine/sre-design-spec.md` 참조.

**프론트 화면(한글 메뉴명) 관련 질문**("○○ 메뉴에 어떤 기능개선/부재가 있어?" 등)을 받으면 순서대로: (1) `mcp__codebase-memory__manage_adr`(mode: `get`, project: `mnt-c-DEV-saigon_rider`)로 압축 요약 ADR을 먼저 조회 — 메뉴 구조·SoT 위치·알려진 갭이 여기 있다. (2) 서브라우트/컴포넌트 세부 나열이 더 필요할 때만 [`ai-docs/context/frontend-page-map.md`](ai-docs/context/frontend-page-map.md)를 읽는다. (3) 실제 호출관계는 `search_graph`/`trace_path`로 조회한다. ADR과 md 파일은 항상 함께 갱신한다.

## 빠른 참조 포인터

| 알고 싶은 것 | 어디에 |
|---|---|
| **재빌드 명령 (프론트/백)** | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §1 C — `docker compose --env-file .env up --build -d <service>` (`npm run build` 직접 실행 금지) |
| 기본 작업 워크플로우 (Feature/Todo 등록) | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §1 |
| 파일 작성 위치 (SoT) | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §2 |
| `.env` 보안 규약 | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §4 |
| 린터 규칙·명령 | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §5 |
| __DEV Context 운용 | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §6 |
| 컨텐츠(이미지) 관리 규칙 | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §7 |
| 네이티브 브리지 규칙 (navigator.* 금지) | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §8 |
| 코드베이스 그래프 (codebase-memory MCP) 사용/재인덱싱/폴백 | [`ai-docs/agent-guidelines.md`](ai-docs/agent-guidelines.md) §9 |
| 시스템 아키텍처 (BFF/Engine 상세) | [`ai-docs/context/architecture.md`](ai-docs/context/architecture.md) |
| 프론트엔드 패턴 | [`ai-docs/context/frontend.md`](ai-docs/context/frontend.md) |
| 프론트 한글 메뉴명 → 페이지/컴포넌트 매핑 (예: "동네지도 기능개선?") | `manage_adr(get)` 압축요약 먼저 → 상세는 [`ai-docs/context/frontend-page-map.md`](ai-docs/context/frontend-page-map.md) |
| 네이티브 키보드 연계 규칙 (키보드 여백·애니메이션·max-height) | [`ai-docs/context/keyboard-ux.md`](ai-docs/context/keyboard-ux.md) |
| 서비스 규칙 (GPS·위치 등 도메인 불변식) | [`ai-docs/context/service-rules.md`](ai-docs/context/service-rules.md) |

## 랜딩페이지 배포 — `랜딩배포`

`landing/` (saigon-rider.com root+www 정적 SPA, 컨테이너 앱과 별개의 pnpm 워크스페이스) 수정 후 반영하는 절차. "랜딩배포"라고 하면 아래를 그대로 실행한다.

- **수정 대상**: 일반 사용자 랜딩(saigon-rider.com root+www)은 `landing/apps/client/src/pages/home/Index.tsx` + `content.ts`(vi/ko/en). 비즈니스 랜딩(business.saigon-rider.com)은 `landing/apps/client/src/pages/business/Index.tsx` + `content.ts`. 두 페이지는 **같은 dist 하나**로 빌드되고, `App.tsx`가 `window.location.hostname`이 `business.`로 시작하는지 보고 어느 페이지를 렌더링할지 client-side로 분기한다 (호스트별 별도 빌드 아님). "랜딩페이지 수정"이라고 하면 어느 도메인 얘기인지 확인 후 해당 파일을 본다.
- **빌드 + 배포** (일반/비즈니스 공통, dist 하나가 두 도메인 다 서빙):
  ```bash
  cd landing
  pnpm run build                                          # apps/client/dist 생성 (홈+비즈니스 둘 다 포함)
  sudo cp -r apps/client/dist/* /var/www/saigon-rider/     # 정적 배포 (root 필요) — 도메인별로 따로 배포할 필요 없음
  ```
  - nginx reload 불필요 (정적 파일 직접 서빙 — `deploy/saigon-rider.conf` 참조).
  - `pnpm` 은 corepack shim(`~/.local/bin/pnpm`)으로 설치돼 있어 별도 PATH 설정 불필요.
  - `node_modules` 가 빌드머신의 pnpm 가상 store 경로(`/opt/pnpm-vstore/...`)를 참조해 깨져 있으면 (`Cannot find module .../vite/bin/vite.js` 등) `pnpm install` 먼저 실행.
  - esbuild 빌드 스크립트는 `landing/pnpm-workspace.yaml` 의 `onlyBuiltDependencies` 로 이미 승인돼 있음 — 재승인 불필요.
- **i18n**: 공통 로케일 유틸은 `landing/apps/client/src/lib/locale.ts` (vi 기본, `/ko` `/en` 경로). 페이지별 텍스트는 각 페이지 폴더의 `content.ts`.
- **라우팅**: root+www+business → `/var/www/saigon-rider` 정적 서빙 (React가 도메인별 분기), `app.saigon-rider.com` → 컨테이너 앱(:18090). 설정: `deploy/saigon-rider.conf`. 인증서는 saigon-rider.com 하나에 SAN 으로 root/www/app/business 전부 포함.

## 관리자 콘솔 배포 — `어드민배포`

`admin-frontend/` (React SPA 관리자 콘솔, `:18090/admin/`)는 landing 과 달리 **정적 배포 스크립트가 없다** — docker compose 서비스(`admin_frontend`)라서 재빌드가 곧 배포다. "어드민배포"라고 하면 아래를 실행한다.

- **빌드 + 배포**:
  ```bash
  docker compose --env-file .env up --build -d admin_frontend   # Dockerfile 2-stage 가 npm build 수행 (호스트 npm 불필요)
  ```
  - admin API(백엔드) 변경이 같이 있으면 `bff` 도 함께: `... up --build -d bff admin_frontend`
  - `/admin/`·`/`(frontend)·`bff`·`engine` 모두 nginx 가 **변수+resolver 프록시**라 재빌드 후 **nginx 재시작 불필요**. (`frontend` 는 2026-08-03 커밋 `ab8941f` 에서 리터럴 → 변수로 전환 — 그 전에는 재빌드마다 구 IP 캐시로 502 가 났다.) **아직 리터럴로 남은 것은 `imgproxy` 하나** — 이것만 재빌드 후 502 가 나면 `docker restart saigon_nginx`.
- **접속**: dev `http://<호스트>:18090/admin/`, 운영 `https://app.saigon-rider.com/admin/`. 로그인은 root(.env `ADMIN_USER`) 또는 `admin_accounts` 계정 (JWT 쿠키 `admin_session`, 구 어드민과 SSO).
- **구 어드민(레거시)**: `/admin-legacy/` 로 병행 서빙 (서버렌더, bff 소유). 2차 이식 완료 전까지 유지.
- **라우팅** (`nginx/conf.d/default.conf`): `/admin/api/` → bff:8080 (JSON API), `/admin-legacy/` → bff:8080, `/admin/` → admin_frontend:80 (SPA), `= /admin` → 301.

## Zalo 인증 프록시 VPS (베트남 egress)

**왜 있나:** Zalo Graph API(`/v2.0/me`)는 **베트남 밖 IP를 error -501 로 차단**한다(개인정보 제한). BFF 는 한국 호스팅이라, Zalo OAuth 인증 호출만 **베트남 IP VPS 를 프록시 경유**시켜 우회한다. (일반 앱 트래픽은 직접 통신 — 프록시는 Zalo 로그인 경로에만 적용.)

- **프로바이더/구축**: GreenCloudVPS (`greencloudvps.com`, Budget KVM `SSDKVM-1`, 호치민 리전), **개인 계정(doil qwon)**, 구축 **2026-07-21**. 월 ~$6 — 비용 정리 대상(대표 지시).
- **서버**: IP `103.186.65.169`, Ho Chi Minh City, `AS151858 INTERDIGI JOINT STOCK COMPANY`(VN 등록 AS), Ubuntu 22.04.
- **SSH 접속 전략**: `ssh root@103.186.65.169` — ed25519 키(`~/.ssh/id_ed25519`, comment `zalo-proxy`)로 인증. 키 미인식 시 `ssh -i ~/.ssh/id_ed25519 root@103.186.65.169`. (하드닝 TODO: 키 등록 완료됐으니 `sshd` `PasswordAuthentication no` 권장.)
- **프록시**: tinyproxy(HTTP 포워드), 포트 `8888`, **BasicAuth** 로 접근제어(user `zaloproxy`, IP 화이트리스트 대신 인증 — dev/prod BFF egress IP 가변 대응). 방화벽 ufw 22/8888.
- **코드 연동**: `backend/app/services/oauth.py` 의 `exchange_zalo_code()` 가 env `ZALO_API_PROXY` 로 Zalo 두 호출(access_token 교환·`/me` 프로필)만 프록시 경유. **미설정 시 직접 호출**(무변화). httpx 0.27 `proxy=`(HTTP 프록시만 — socks5 미지원).
- **시크릿(커밋 금지)**: BasicAuth 비밀번호는 `.env` `ZALO_API_PROXY` 에만 — `ZALO_API_PROXY=http://zaloproxy:<pw>@103.186.65.169:8888`. SSH 개인키·비번은 어떤 커밋 파일에도 남기지 않는다.
- **운영 주의**: 이 VPS 는 **Zalo 로그인의 단일 장애점(SPOF)** — 죽으면 로그인 차단. 업타임 모니터링 권장.
- **검증**: 프록시 egress 가 VN 인지 — `curl -x http://zaloproxy:<pw>@103.186.65.169:8888 -s https://ipinfo.io/json` → `country: VN`. 최종 확인은 실제 Zalo 로그인(-501 미발생).

## 보안 최소 룰 (전문은 agent-guidelines §4)

- `.env` 와 `.env.example` 은 항상 동일한 키셋. 한쪽에 키 추가/삭제/이름변경 시 **즉시** 반대쪽도 갱신.

## Push 전 코드 리뷰 게이트

`git push` 직전(또는 PR open 직전)에 **`/code-review`** 를 한 번 실행해 diff 를 검토한다. 린트(pre-commit)와 별개 층위로 *로직 버그·중복·단순화 여지·비효율*을 잡는다.

- **트리거**: push 또는 PR open 직전. 매 commit 마다 돌리지 않는다(토큰 낭비).
- **기본 effort**: `medium`. RP·보상·결제·인증 등 고위험 영역 변경이 포함됐을 때만 `high` 이상.
- **diff 가 크면**(파일 10개+ 또는 500줄+) 영역별(BFF/Engine/Frontend) PR 로 쪼개고 각각 리뷰. 한 번에 1000줄+ 리뷰는 품질·비용 모두 손해.
- 발견된 지적은 push 전에 처리한다. 무시할 거면 *이유를* 커밋 메시지나 PR 본문에 남긴다.
