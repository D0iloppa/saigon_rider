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
              └───────────┘ └─────────┘
```

## Nginx 라우팅 테이블

| 경로 | 대상 | 접근 | 설명 |
|---|---|---|---|
| `/` | `frontend:80` | 공개 | React SPA |
| `/api/` | `bff:8080` | 공개 | REST API |
| `/admin/` | `bff:8080` | 앱 인증 | Admin Console |
| `/wiki/` | `wiki:80` | 공개 | 개발자 위키 |
| `/wiki/docs/private/` | `wiki:80` | Basic Auth | 내부 문서 |
| `/img/` | `imgproxy:8080` | 공개 | 이미지 처리 |
| `/engine/` | `engine:8090` | 내부망 전용 | SRE Engine (172.16/12) |

## Docker Compose 프로파일

| 프로파일 | 포함 서비스 | 기동 명령 |
|---|---|---|
| (기본) | nginx, frontend, imgproxy | `docker compose up -d` |
| `backend` | bff, engine, database | `docker compose --profile backend up -d` |
| `wiki` | wiki (Docusaurus) | `docker compose --profile wiki up -d` |
