---
slug: /intro
sidebar_position: 1
title: 시작하기
---

# Saigon Rider — 개발자 위키

모바일 하이브리드 앱 **Saigon Rider**의 개발자 내부 문서 포털입니다.

## 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 서비스 형태 | React SPA (iOS / Android WebView 하이브리드 앱) |
| 백엔드 구조 | BFF (FastAPI) + SRE Engine 분리 아키텍처 |
| 데이터베이스 | PostgreSQL 15 + PostGIS |
| 인프라 | Docker Compose + Nginx 리버스 프록시 |

## 빠른 시작

```bash
# 환경 설정
cp .env.example .env

# 기본 서비스 기동 (frontend + nginx + imgproxy)
docker compose up --build -d

# 전체 스택 (backend + database + engine 포함)
docker compose --profile backend up --build -d

# 개발자 위키 포함
docker compose --profile wiki up --build -d
```

## 접속 URL 요약

| 서비스 | URL |
|---|---|
| **메인 앱** | http://localhost:18090 |
| **개발자 위키** | http://localhost:18090/wiki/ |
| **BFF Swagger UI** | http://localhost:18090/api/bff/docs |
| **BFF ReDoc** | http://localhost:18090/api/bff/redoc |
| **SRE Engine Swagger UI** | http://localhost:18090/api/sre/docs |
| **SRE Engine ReDoc** | http://localhost:18090/api/sre/redoc |
| **Admin Console** | http://localhost:18090/admin/login |

:::note BFF 와 SRE Engine API 분리
백엔드는 두 컨테이너(`saigon_bff` :8080, `saigon_engine` :8090)로 분리되어 있으며 nginx 에서 namespace 로 구분합니다.

- `/api/bff/*` → BFF (앱 화면 API: 인증·퀘스트·라이드·피드·프로필)
- `/api/sre/*` → SRE Engine (XP·미션·보상·어뷰징)

모바일 앱은 BFF 만 호출하며, Engine 직접 호출은 차단되어 있습니다.
:::

## 문서 구조

```
wiki-docs/
├── intro.md              ← 현재 문서
├── services/
│   ├── overview.md       ← 전체 서비스 맵
│   ├── frontend.md       ← React + Vite 프론트엔드
│   ├── bff.md            ← BFF FastAPI
│   └── engine.md         ← SRE Engine
└── private/              ← 🔒 Nginx Basic Auth 필요
    ├── architecture.md   ← 전체 아키텍처
    ├── database.md       ← DB 스키마
    └── test/             ← Test / QA (관리자 전용)
        └── checklist-*   ← 기능 점검 체크리스트
```

## 🔒 관리자 전용 (Private) 섹션

`.env` 의 `WIKI_AUTH_USER` / `WIKI_AUTH_PASS` 자격증명으로 인증해야 접근할 수 있습니다.

| 항목 | 링크 | 설명 |
|---|---|---|
| 전체 아키텍처 | [/wiki/docs/private/architecture](/wiki/docs/private/architecture) | 컨테이너 구성, 네트워크, 보안 레이어 |
| DB 스키마 | [/wiki/docs/private/database](/wiki/docs/private/database) | PostgreSQL + PostGIS 스키마 정의 |
| **진척도 트래커** | [/wiki/docs/private/test/progress](/wiki/docs/private/test/progress) | 그룹별 진척도 / 체크리스트 현황 |
| **이슈 로그** | [/wiki/docs/private/test/issues](/wiki/docs/private/test/issues) | 발견된 결함 + 미구현 잔여 |

:::info Private 섹션 접근 방법
1. **직접 URL 입력**: 위 링크 클릭 시 브라우저가 **HTTP Basic Auth 다이얼로그**를 띄웁니다. `.env` 의 자격증명을 입력하면 접근됩니다.
2. **자격증명**: 기본값은 `WIKI_AUTH_USER=admin`, `WIKI_AUTH_PASS=saigon2026` (`.env`에서 변경 가능).
3. **인증 동작**: Nginx 컨테이너 기동 시 `.htpasswd` 가 자동 생성되어 `location /wiki/docs/private/` 에 적용됩니다.
:::

:::danger ⚠️ 현재 보호 수준 — Docusaurus 정적 SPA 한계
**직접 URL 진입**(`/wiki/docs/private/...` HTML)은 **Basic Auth 401 차단** ✅  
그러나 Docusaurus는 모든 문서 콘텐츠를 정적 JS 청크(`/wiki/assets/js/*.js`)에 임베드하므로, 공개 메인 페이지에서 SPA 라우팅으로 사이드바 링크를 클릭하면 청크가 인증 없이 로드되어 콘텐츠가 노출될 수 있습니다.

진정한 관리자 전용 보호를 원할 경우 다음 중 하나를 적용하세요:
- **Option A**: `wiki/` 전체에 Basic Auth 적용 (nginx `location /wiki/` 에 `auth_basic` 추가)
- **Option B**: Private 문서를 별도 Docusaurus 인스턴스(`saigon_wiki_private` 컨테이너)로 분리 발행
- **Option C**: Docusaurus password-protected-content 플러그인 도입 (빌드 시 콘텐츠 암호화)

현 상태(2026-05-14)는 *Option C 적용 전*이며, 추가 강화 작업이 필요합니다.
:::
