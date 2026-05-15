# Engine Phase 5 — BFF Engine 클라이언트 연동

> 작업일: 2026-05-14  
> 상태: ✅ 완료  
> 연관 문서: [SRE 엔진 통합 지침서 v2](../../context/architecture.md)

---

## 목표

BFF(`saigon_bff`)가 Engine HTTP API를 호출하는 클라이언트를 구현하고, `ride.py` / `feed.py`에서 SRE 이벤트를 발행한다. 동시에 `backend_todo.md` P0~P1 엔드포인트를 병행 구현한다.

---

## 구현 내용

### engine_client.py

- `httpx.AsyncClient` 래핑, `X-Service-Key` 헤더 자동 주입
- `post_event(user_uuid, action_code, occurred_at, payload, idem_key)` → `/v1/events`
- `get_balance(user_uuid)` → `/v1/users/{id}/balance`
- `close()` — lifespan 종료 시 연결 정리

### requirements.txt

- `httpx>=0.27` 추가

### main.py

- `lifespan` 추가 → shutdown 시 `engine_client.close()` 호출
- 신규 라우터 등록: `quests`, `ride`, `feed`

### models.py 추가 모델 (8종)

| 모델 | 테이블 |
|---|---|
| `Quest` | `quests` |
| `UserQuest` | `user_quests` |
| `RideSession` | `ride_sessions` |
| `RideStreak` | `ride_streaks` |
| `Bookmark` | `bookmarks` |
| `FeedPost` | `feed_posts` |
| `PostLike` | `post_likes` |
| `PostComment` | `post_comments` |

### 라우터별 구현 (P0~P1, Feed)

#### `routers/profile.py` 추가 (A-1, A-2)

| # | 엔드포인트 | 설명 |
|---|---|---|
| A-1 | `GET /api/profile/check-nickname` | 닉네임 중복 확인 |
| A-2 | `PUT /api/profile` | 닉네임 + rider_type 동시 저장 |
| — | `GET /api/profile/{user_id}/rp-balance` | Engine balance API 중계 |

#### `routers/quests.py` 신규 (Q-1~Q-7)

| # | 엔드포인트 | 설명 |
|---|---|---|
| Q-1 | `GET /api/quests` | 필터 목록 (period, district, badge, safety_grade) |
| Q-2 | `GET /api/quests/pins` | PostGIS `ST_X/ST_Y` raw SQL 핀 목록 |
| Q-3 | `GET /api/quests/recommended` | Tonight's Pick (reward 합계 DESC 최상위) |
| Q-4 | `GET /api/quests/{id}` | 퀘스트 상세 |
| Q-5 | `POST /api/quests/{id}/accept` | `user_quests` INSERT → session_id 반환 |
| Q-6 | `POST /api/quests/{id}/bookmark` | `bookmarks` 토글 |
| Q-7 | `GET /api/quests/{id}/participants` | ACCEPTED/ACTIVE 유저 아바타 목록 |

#### `routers/ride.py` 신규 (R-1~R-4)

| # | 엔드포인트 | 설명 |
|---|---|---|
| R-1 | `POST /api/ride/submit` | 라이딩 결과 저장 + exp/gold 정산 + 스트릭 갱신 + Engine 이벤트 |
| R-2 | `GET /api/ride/streak` | `ride_streaks` 조회 |
| R-3 | `GET /api/ride/history` | 페이지네이션 이력 |
| R-4 | `POST /api/ride/safety-grade` | 평균속도·급감속 횟수 기반 A/B/C 계산 |

**Engine 이벤트 발행 (R-1):**
- `RIDE_KM`: `{distance_km, ride_id}`, idem_key `ride-{id}-km`
- `QUEST_COMPLETE` (is_success=True): `{quest_id, ride_id}`, idem_key `ride-{id}-quest-{quest_id}`
- httpx 오류 발생 시 WARNING 로그 후 ride 기록 보존 (fire-and-forget)

#### `routers/feed.py` 신규 (F-1~F-6)

| # | 엔드포인트 | 설명 |
|---|---|---|
| F-1 | `GET /api/feed` | 전체 피드 (filter: all/hot) 페이지네이션 |
| F-2 | `GET /api/feed/stories` | is_story=true 최근 50건 |
| F-3 | `POST /api/feed` | 피드 게시 + `SHARE_SNS` Engine 이벤트 |
| F-4 | `POST /api/feed/{id}/like` | 좋아요 토글 + like_count 갱신 |
| F-5 | `GET /api/feed/{id}/comments` | 댓글 목록 (대댓글 포함) |
| F-6 | `POST /api/feed/{id}/comments` | 댓글 작성 + comment_count 갱신 |

---

## 검증 결과

```
Route count: 34
/api/auth/login, /api/auth/me, /api/auth/register
/api/contents/upload, /api/contents/{content_id}
/api/profile, /api/profile/avatar, /api/profile/check-nickname
/api/profile/nickname, /api/profile/{user_id}/rp-balance
/api/quests, /api/quests/pins, /api/quests/recommended
/api/quests/{quest_id}, /api/quests/{quest_id}/accept
/api/quests/{quest_id}/bookmark, /api/quests/{quest_id}/participants
/api/ride/history, /api/ride/safety-grade, /api/ride/streak, /api/ride/submit
/api/feed, /api/feed, /api/feed/stories
/api/feed/{post_id}/comments, /api/feed/{post_id}/comments
/api/feed/{post_id}/like
/admin/, /admin/login
```

`docker compose run --rm --no-deps bff python -c "..."` 컨테이너 내부 import + 라우트 등록 검증 완료.

---

## 산출 파일 목록

```
backend/requirements.txt              (httpx>=0.27 추가)
backend/app/engine_client.py          (신규)
backend/app/models.py                 (Quest, UserQuest, RideSession, RideStreak,
                                       Bookmark, FeedPost, PostLike, PostComment 추가)
backend/app/schemas.py                (Quest, Ride, Feed 스키마 추가)
backend/app/routers/profile.py        (A-1, A-2, /rp-balance 추가)
backend/app/routers/quests.py         (신규, Q-1~Q-7)
backend/app/routers/ride.py           (신규, R-1~R-4)
backend/app/routers/feed.py           (신규, F-1~F-6)
backend/app/main.py                   (lifespan + 신규 라우터 등록)
```
