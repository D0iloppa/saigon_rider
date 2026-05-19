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
| `GET` | `/api/bff/contents/{id}/img` | imgproxy → 302 redirect (w/h 파라미터 지원) |
| `GET` | `/api/bff/contents/mock-img` | mock 풀에서 랜덤 이미지 → 302 redirect |
| `GET` | `/api/bff/contents/profile-mock-img?seed=&w=&h=` | seed(user_id) 기반 결정론적 프로필 기본 이미지 → 302 redirect |

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
| `GET` | `/api/bff/quests/` | 퀘스트 목록 (필터·페이지네이션 지원) |
| `GET` | `/api/bff/quests/completed-ids` | 현재 주기 완료 퀘스트 ID 목록 |
| `GET` | `/api/bff/quests/{id}` | 퀘스트 상세 |
| `POST` | `/api/bff/quests/{id}/accept` | 퀘스트 수락 (중복 완료 시 409) |
| `POST` | `/api/bff/quests/{id}/complete` | 퀘스트 완료 처리 |
| `POST` | `/api/bff/quests/{id}/bookmark` | 북마크 토글 |
| `GET` | `/api/bff/quests/{id}/participants` | 참여자 목록 |

#### `GET /quests/` 쿼리 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `period` | string | — | `DAILY` / `WEEKLY` / `EVENT` |
| `district_id` | int | — | 구 필터 |
| `rider_type_id` | int | — | 라이더 타입 필터 |
| `safety_grade_id` | int | — | 안전 등급 필터 |
| `user_id` | UUID | — | `exclude_completed` 와 함께 사용 |
| `exclude_completed` | bool | `false` | true = 해당 user_id의 현재 주기 완료 퀘스트 제외 |
| `page` | int | 1 | 페이지 번호 |
| `size` | int | 20 | 페이지당 항목 수 (max 100) |

응답: `Page[QuestOut]` `{ items, total, page, size }`

:::info 퀘스트 중복 방지 & 페이지네이션
- `/accept` 호출 시 `period_key` 자동 계산 → `user_quests` 저장. 동일 기간 중복 완료 시 **409 Conflict**.
- `exclude_completed=true` 사용 시 서버 측에서 완료된 퀘스트를 제외 후 `total` 도 정확하게 계산 → 프론트 무한스크롤에서 활용.
- `thumbnail_url` : `thumbnail_content_id` → `district.image_content_id` → mock-img 순서로 폴백.
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
| `GET` | `/api/bff/feed/` | 피드 목록 (페이지네이션·필터 지원) |
| `POST` | `/api/bff/feed/` | 피드 게시글 생성 |
| `POST` | `/api/bff/feed/{id}/like` | 좋아요 토글 |
| `GET` | `/api/bff/feed/{id}/comments` | 댓글 목록 |
| `POST` | `/api/bff/feed/{id}/comments` | 댓글 작성 |
| `POST` | `/api/bff/feed/{id}/comments/{comment_id}/like` | 댓글 좋아요 토글 |

#### `GET /feed/` 쿼리 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `filter` | string | `all` | `all` / `neighborhood` / `friends` / `hot` |
| `user_id` | UUID | — | `friends` 필터 시 팔로잉 기준, `neighborhood` 필터 시 선택적 |
| `lat` / `lng` | float | — | `neighborhood` 필터 시 기준 좌표 |
| `radius_m` | int | 5000 | 근방 반경 (m) |
| `page` | int | 1 | 페이지 번호 |
| `size` | int | 20 | 페이지당 항목 수 |

응답: `Page[FeedPostEnrichedOut]` `{ items, total, page, size }`

:::info 피드 필터
- `neighborhood` : PostGIS `ST_DWithin` 으로 반경 5km 내 게시글 필터
- `friends` : `user_follows` 테이블의 팔로잉 목록 기준 필터
- `hot` : `like_count` 내림차순 정렬
:::

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
| `GET` | `/api/bff/users/{user_id}/profile` | 타유저 공개 프로필 (nickname, avatar, level, riderStyle, follower/following count, isFollowing) |
| `GET` | `/api/bff/users/{user_id}/followers` | 팔로워 목록 |
| `GET` | `/api/bff/users/{user_id}/following` | 팔로잉 목록 |
| `GET` | `/api/bff/users/{user_id}/follow-counts` | 팔로워·팔로잉 수 `{ followers, following }` |

### Follows
| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/bff/follows/{user_id}` | 팔로우 (이미 팔로우 시 409) |
| `DELETE` | `/api/bff/follows/{user_id}` | 언팔로우 |

### DM
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/dm/conversations` | 내 DM 대화 목록 |
| `POST` | `/api/bff/dm/conversations` | 대화 시작 (상대방 user_id 전달, 기존 방 있으면 재사용) |
| `GET` | `/api/bff/dm/conversations/{id}/messages` | 대화 메시지 목록 (page/after 지원) |
| `POST` | `/api/bff/dm/conversations/{id}/messages` | 메시지 전송 |
| `POST` | `/api/bff/dm/conversations/{id}/read` | 읽음 처리 |

### Badges
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/badges/{id}` | 배지 상세 조회 |

### Gacha (Engine 프록시)
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/gacha/list` | 활성 가챠 목록 |
| `POST` | `/api/bff/gacha/pull` | 가챠 뽑기 (1회/10연, query: gacha_code, is_10_pull) |
| `GET` | `/api/bff/gacha/log` | 뽑기 이력 (limit/offset 페이징) |
| `GET` | `/api/bff/gacha/pity/{gacha_code}` | 천장 카운트 조회 |
| `GET` | `/api/bff/gacha/eligibility/{gacha_code}` | 응모 자격 확인 |

### Shop (Engine 프록시)
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/shop/items` | 상점 아이템 목록 (collection/rarity/slot 필터, limit) |
| `GET` | `/api/bff/shop/daily-featured` | 오늘의 추천 아이템 |
| `POST` | `/api/bff/shop/purchase` | 아이템 구매 (item_code, currency query param) |

### Inventory (Engine 프록시)
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/inventory/items` | 보유 아이템 목록 + 통계 (장착 여부, 컬렉션 진행도 포함) |
| `GET` | `/api/bff/inventory/equipment` | 현재 장착 슬롯별 아이템 조회 |
| `PUT` | `/api/bff/inventory/equip` | 아이템 장착 (item_code query param) |
| `DELETE` | `/api/bff/inventory/equip/{slot}` | 특정 슬롯 장착 해제 |
| `GET` | `/api/bff/inventory/collection-progress` | 컬렉션별 진행도 |

### Wallet
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/wallet/me` | GP/GC 잔액 조회 |

### Season (Engine 프록시)
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/season/current` | 현재 활성 시즌 정보 |
| `GET` | `/api/bff/season/pass` | 내 시즌패스 상태 |
| `GET` | `/api/bff/season/levels/{season_code}` | 레벨별 보상 목록 |
| `POST` | `/api/bff/season/claim` | 시즌패스 보상 수령 (level, track: FREE|PREMIUM) |

### Master
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/master/districts` | 구역 목록 |
| `GET` | `/api/bff/master/rider-types` | 라이더 타입 목록 |
| `GET` | `/api/bff/master/safety-grades` | 안전등급 목록 |

### App Version / Config
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/app-config` | 프론트엔드용 앱 설정값 |
| `GET` | `/api/bff/app-version/current` | 플랫폼별 현재 활성 버전 |
| `GET` | `/api/bff/app-version/releases` | 릴리즈 목록 |
| `GET` | `/api/bff/app-version/{version_id}` | 특정 버전 상세 (자식 플랫폼 포함) |

### DEV Context (내부 개발 전용)
| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/dev/summary` | 위키·대시보드용 통합 요약 |
| `GET/PUT/DELETE` | `/api/bff/dev/context` | Context KV 조회·수정·삭제 |
| `GET/POST/PATCH/DELETE` | `/api/bff/dev/features` | Feature CRUD |
| `GET/POST/PATCH/DELETE` | `/api/bff/dev/todos` | Todo CRUD |

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
