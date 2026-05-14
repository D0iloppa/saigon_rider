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
| 서비스 형태 | React SPA + Capacitor 네이티브 앱 |
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
| **Swagger UI** | http://localhost:18090/api/docs |
| **Admin Console** | http://localhost:18090/admin/login |

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
    └── database.md       ← DB 스키마
```

:::info Private 섹션 접근
`/wiki/docs/private/` 하위 문서는 **Nginx HTTP Basic Auth**로 보호됩니다.  
`.env`의 `WIKI_AUTH_USER` / `WIKI_AUTH_PASS` 값으로 인증하세요.
:::
