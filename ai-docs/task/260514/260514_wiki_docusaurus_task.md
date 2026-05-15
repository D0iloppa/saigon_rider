# Wiki — Docusaurus 개발자 포털 구축

> 작업일: 2026-05-14  
> 상태: ✅ 완료

---

## 작업 범위

Docusaurus 3 기반 개발자 위키를 Docker/Nginx 환경에 통합한다.  
baseUrl `/wiki/`, Public/Private 권한 분리, 서비스 통합 인덱스 구현.

---

## 산출물

### 신규 파일

| 파일 | 설명 |
|---|---|
| `wiki/package.json` | Docusaurus 3.6.3 의존성 |
| `wiki/docusaurus.config.ts` | baseUrl: '/wiki/', Navbar 서비스 링크, 다크 테마 |
| `wiki/sidebars.ts` | Public(intro, services) / Private 섹션 구성 |
| `wiki/babel.config.js` | Docusaurus 필수 Babel 설정 |
| `wiki/tsconfig.json` | @docusaurus/tsconfig 확장 |
| `wiki/src/css/custom.css` | Saigon Rider 브랜드 컬러, 서비스 카드 그리드 |
| `wiki/src/pages/index.tsx` | 서비스 통합 인덱스 (상대경로 카드 6종) |
| `wiki/src/pages/index.module.css` | 인덱스 페이지 CSS 모듈 |
| `wiki/wiki-docs/intro.md` | 시작하기 — 프로젝트 개요, 빠른 시작 |
| `wiki/wiki-docs/services/overview.md` | 전체 서비스 맵, 라우팅 테이블 |
| `wiki/wiki-docs/services/frontend.md` | React + Vite (BFE) |
| `wiki/wiki-docs/services/bff.md` | FastAPI BFF — 엔드포인트 요약, Engine 연동 |
| `wiki/wiki-docs/services/engine.md` | SRE Engine — 기능, API, 비즈니스 룰 |
| `wiki/wiki-docs/private/architecture.md` | 🔒 전체 아키텍처, 보안 레이어, 흐름도 |
| `wiki/wiki-docs/private/database.md` | 🔒 DB 스키마, 연결 정보, 마이그레이션 |
| `wiki/static/img/logo.svg` | 브랜드 로고 SVG |
| `wiki/nginx.conf` | 위키 컨테이너 내부 nginx (`/wiki/` try_files) |
| `wiki/Dockerfile` | multi-stage (node:20 build → nginx:alpine serve) |
| `wiki/.dockerignore` | node_modules, build, .cache 제외 |
| `nginx/docker-entrypoint.d/10-gen-htpasswd.sh` | nginx 기동 시 htpasswd 자동 생성 (openssl apr1) |

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `nginx/conf.d/default.conf` | `/wiki/docs/private/` Basic Auth, `/wiki/` 프록시 추가 |
| `docker-compose.yml` | wiki 서비스 추가 (profile: wiki), nginx entrypoint.d 볼륨·env 추가 |
| `.env.example` | `WIKI_AUTH_USER` / `WIKI_AUTH_PASS` 추가 |
| `README.md` | 최상단 wiki 배너, 포트 표, 접속 URL, 위키 기동 명령 추가 |

---

## 아키텍처 결정

### baseUrl 처리 전략
Docusaurus를 `baseUrl: '/wiki/'`로 빌드 → build/ 산출물을 컨테이너 nginx의  
`/usr/share/nginx/html/wiki/`에 배치.  
메인 nginx가 `/wiki/` 경로를 full-path 보존 프록시(`proxy_pass http://wiki:80`)로 전달.  
에셋 참조(`/wiki/assets/...`)가 컨테이너 내부 경로와 일치하므로 rewrite 불필요.

### htpasswd 생성 전략
nginx:alpine에 포함된 `openssl`을 활용, `docker-entrypoint.d/` 훅으로 컨테이너 기동 시  
`/etc/nginx/.htpasswd` 자동 생성. 별도 이미지 빌드 없이 환경변수만으로 관리.

### Private 권한 분리
Nginx `location /wiki/docs/private/` 블록이 일반 `/wiki/` 보다 구체적이므로  
우선 매칭 → `auth_basic` 적용. SPA 특성 상 정적 HTML 요청 단위로 인증이 이루어짐.

---

## 기동 방법

```bash
# wiki만 추가
docker compose --profile wiki up --build -d

# 전체 (backend + wiki)
docker compose --profile backend --profile wiki up --build -d

# 접속
open http://localhost:18090/wiki/
```

Private 문서 접속 시 브라우저 Basic Auth 대화상자 → `.env`의 WIKI_AUTH_USER/PASS 입력.
