---
sidebar_position: 3
title: BFF (FastAPI)
---

# BFF — Backend-for-Frontend

FastAPI 기반 백엔드. 모바일 앱(프론트엔드)의 API 요청을 처리하고, 내부 Engine과 연동합니다.

## 접속

| 환경 | URL |
|---|---|
| Nginx 경유 | http://localhost:18090/api/bff/ |
| Swagger UI | http://localhost:18090/api/bff/docs |
| ReDoc | http://localhost:18090/api/bff/redoc |
| 직접 (FastAPI) | http://localhost:8082 |

## 엔드포인트 요약

> 전체 명세는 **Swagger UI** (`/api/bff/docs`) 에서 직접 확인 및 실행할 수 있습니다.

### Auth
| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/bff/auth/register` | 신규 가입 (phone → passcode 발급, `is_new=false`면 재발급) |
| `POST` | `/api/bff/auth/login` | 로그인 (phone + passcode 검증) |
| `GET` | `/api/bff/auth/me?phone=` | 유저 조회 |

### Contents
| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/bff/contents/upload` | 이미지 업로드 (multipart) → imgproxy URL 반환 |
| `GET` | `/api/bff/contents/{id}` | 컨텐츠 메타데이터 + imgproxy URL 조회 |

### Profile
| Method | Path | 설명 |
|---|---|---|
| `PUT` | `/api/bff/profile` | 프로필 저장 (닉네임, rider_type) |
| `POST` | `/api/bff/profile/avatar` | 프로필 사진 업로드 및 변경 |
| `PUT` | `/api/bff/profile/nickname` | 닉네임 변경 |
| `GET` | `/api/bff/profile/check-nickname` | 닉네임 중복 확인 |
| `GET` | `/api/bff/profile/{user_id}/rp-balance` | RP 잔액 조회 `{current_balance, lifetime_earned, expiring_in_30d, tier}` |

### Quests
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/quests/pins` | 퀘스트 핀 목록 |
| `GET` | `/api/bff/quests/recommended` | 추천 퀘스트 (Tonight's Pick) |
| `GET` | `/api/bff/quests/` | 퀘스트 목록 (필터 지원) |
| `GET` | `/api/bff/quests/{id}` | 퀘스트 상세 |
| `POST` | `/api/bff/quests/{id}/accept` | 퀘스트 수락 (중복 완료 시 409) |
| `POST` | `/api/bff/quests/{id}/bookmark` | 북마크 토글 |
| `GET` | `/api/bff/quests/{id}/participants` | 참여자 목록 |

:::info 퀘스트 중복 방지
`/accept` 호출 시 `period_key` 를 자동 계산하여 `user_quests` 에 저장합니다. 동일 기간 내 이미 COMPLETED 레코드가 있으면 **409 Conflict** 를 반환합니다.  
`GET /quests/` 응답에 `thumbnail_url` 필드 추가 (imgproxy 경유, 없으면 `hero_image_url` 폴백).
:::

### Ride
| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/bff/ride/submit` | 라이딩 결과 제출 → Engine 이벤트 발행 |
| `GET` | `/api/bff/ride/streak` | 연속 라이딩 스트릭 조회 |
| `GET` | `/api/bff/ride/history` | 라이딩 기록 목록 |
| `POST` | `/api/bff/ride/safety-grade` | 안전 등급 계산 |

### Feed
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/feed/stories` | 스토리 목록 |
| `GET` | `/api/bff/feed/` | 피드 목록 |
| `POST` | `/api/bff/feed/` | 피드 게시글 생성 |
| `POST` | `/api/bff/feed/{id}/like` | 좋아요 토글 |
| `GET` | `/api/bff/feed/{id}/comments` | 댓글 목록 |
| `POST` | `/api/bff/feed/{id}/comments` | 댓글 작성 |
| `POST` | `/api/bff/feed/{id}/comments/{comment_id}/like` | 댓글 좋아요 토글 |

### Notifications
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/notifications` | 알림 목록 (unread_count 포함) |
| `GET` | `/api/bff/notifications/settings` | 알림 설정 조회 |
| `PUT` | `/api/bff/notifications/settings` | 알림 설정 변경 |

### Users
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/users/me/stats` | 내 통계 (월별 거리·퀘스트 수 등) |
| `GET` | `/api/bff/users/me/badges` | 보유 배지 목록 |
| `DELETE` | `/api/bff/users/me` | 계정 탈퇴 |
| `POST` | `/api/bff/users/me/export` | 개인정보 내보내기 요청 |

### Badges
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/badges/{id}` | 배지 상세 조회 |

### Admin
| Method | Path | 설명 |
|---|---|---|
| `POST` | `/admin/login` | Admin JWT 발급 |
| `GET` | `/admin/dashboard` | 대시보드 데이터 |
| `POST` | `/admin/logout` | 로그아웃 |

### System
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/health` | 헬스체크 |

## Engine 연동

BFF는 `engine_client.py` 를 통해 SRE Engine에 HTTP 클라이언트로 연결합니다.  
인증은 `X-Service-Key` 헤더를 사용합니다 (`.env`의 `ENGINE_SERVICE_KEY`).

```python
# backend/app/engine_client.py
# ride.py 등 라우터에서 post_event() 호출 시 Engine으로 이벤트 발행
engine_client.post_event(user_id, "RIDE_KM", {"km": 5.2})
```

주요 이벤트 타입: `RIDE_KM`, `QUEST_COMPLETE`, `SHARE_SNS`

## 기동

```bash
docker compose --profile backend up --build -d bff
docker compose logs -f bff
```
