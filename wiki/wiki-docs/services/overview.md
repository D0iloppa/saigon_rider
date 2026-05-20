---
sidebar_position: 1
title: 서비스 맵
---

# 서비스 맵

## 전체 아키텍처 다이어그램

```
                        ┌─────────────────────────────────┐
                        │       Nginx (port 18090)        │
                        │    리버스 프록시 / 보안 게이트웨이    │
                        └────┬──────┬──────┬──────┬───────┘
                             │      │      │      │
              ┌──────────────┘      │      │      └──────────────┐
              │                     │      │                     │
        ┌─────▼─────┐        ┌──────▼──┐ ┌▼──────────┐  ┌──────▼──────┐
        │ Frontend  │        │   BFF   │ │  Imgproxy │  │    Wiki     │
        │  React    │        │FastAPI  │ │  (images) │  │ Docusaurus  │
        │  :5174    │        │  :8082  │ │   :8080   │  │   :3001     │
        └───────────┘        └────┬────┘ └───────────┘  └─────────────┘
                                  │
                    ┌─────────────┤
                    │             │
              ┌─────▼─────┐ ┌────▼────┐
              │  Engine   │ │   DB    │
              │  FastAPI  │ │Postgres │
              │   :8090   │ │  :5435  │
              └─────┬─────┘ └────▲────┘
                    │            │
              ┌─────▼─────┐     │
              │   Redis   │     │
              │  Streams  │     │
              └─────┬─────┘     │
                    │            │
              ┌─────▼─────┐     │
              │  Worker   ├─────┘
              │ (Agents)  │
              └───────────┘
```

## Nginx 라우팅 테이블

| 경로 | 대상 | 접근 | 설명 |
|---|---|---|---|
| `/` | `frontend:80` | 공개 | React SPA |
| `/api/bff/*` | `bff:8080/api/*` | 공개 (앱 인증) | BFF REST API |
| `/api/sre/*` | `engine:8090/v1/*` | 공개 (앱 인증) | SRE Engine API |
| `/admin/*` | `bff:8080/admin/*` | 앱 인증 | Admin Console |
| `/wiki/` | `wiki:80` | 공개 | 개발자 위키 |
| `/wiki/docs/private/` | `wiki:80` | Basic Auth | 내부 문서 |
| `/img/` | `imgproxy:8080` | 공개 | 이미지 처리 |
| `/engine/` | `engine:8090` | 내부망 전용 | 172.16.0.0/12 only |

:::info API 네임스페이스 분리
모바일 앱은 BFF(`/api/bff/*`)만 직접 호출합니다.  
BFF 내부에서 `engine_client` 를 통해 Engine(`/api/sre/*`)으로 연동하며,  
앱이 Engine을 직접 호출하는 경로는 없습니다.
:::

## Docker Compose 프로파일

| 프로파일 | 포함 서비스 | 기동 명령 |
|---|---|---|
| (기본) | nginx, frontend, imgproxy | `docker compose up -d` |
| `backend` | bff, engine, worker, redis, database | `docker compose --profile backend up -d` |
| `wiki` | wiki (Docusaurus) | `docker compose --profile wiki up -d` |

## 포트 구성

| 서비스 | 호스트 포트 | 컨테이너 포트 |
|---|---|---|
| Nginx | `18090` | `80` |
| Frontend | `5174` | `80` |
| BFF | `8082` | `8080` |
| Engine | `8091` | `8090` |
| Worker | — | — |
| Redis | — | `6379` |
| Database | `35435` | `5432` |
| Wiki | `18090/wiki/` | — |
