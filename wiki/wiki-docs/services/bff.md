---
sidebar_position: 3
title: BFF (FastAPI)
---

# BFF — Backend-for-Frontend

FastAPI 기반 백엔드. 모바일 앱(프론트엔드)의 API 요청을 처리하고, 내부 Engine과 연동합니다.

## 접속

| 환경 | URL |
|---|---|
| Nginx 경유 | http://localhost:18090/api/ |
| Swagger UI | [../api/docs](../api/docs) |
| ReDoc | [../api/redoc](../api/redoc) |
| 직접 (FastAPI) | http://localhost:8082 |

## 엔드포인트 요약

### Auth
| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/auth/register` | 신규 가입 (phone → passcode 발급) |
| `POST` | `/api/auth/login` | 로그인 (phone + passcode 검증) |
| `GET` | `/api/auth/me` | 유저 조회 |

### Contents
| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/contents/upload` | 이미지 업로드 (multipart) |
| `GET` | `/api/contents/{id}` | 컨텐츠 메타데이터 조회 |

### Profile
| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/profile/avatar` | 프로필 사진 변경 |
| `PUT` | `/api/profile/nickname` | 닉네임 변경 |

### Feed / Quests / Ride
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/feed/` | 피드 목록 |
| `GET` | `/api/quests/` | 퀘스트 목록 |
| `POST` | `/api/ride/start` | 라이드 시작 |
| `POST` | `/api/ride/end` | 라이드 종료 |

### System
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/health` | 헬스체크 |

## Engine 연동

BFF는 SRE Engine에 HTTP 클라이언트로 연결합니다.

```python
# backend/app/engine_client.py
ENGINE_BASE_URL = os.getenv("ENGINE_BASE_URL", "http://engine:8090")
```

인증은 `X-Service-Key` 헤더를 사용합니다 (`.env`의 `ENGINE_SERVICE_KEY`).

## 기동

```bash
docker compose --profile backend up --build -d bff
docker compose logs -f bff
```
