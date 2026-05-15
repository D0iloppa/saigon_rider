# ERD — Saigon Rider DB 스키마

> **파일 위치**: `database/init/001_init_schema.sql`  
> **DBMS**: PostgreSQL 15 + PostGIS 3.3 (Docker: `postgis/postgis:15-3.3`)

---

## 테이블 목록

| 테이블 | 설명 | 관련 기능 |
|---|---|---|
| `users` | 라이더 계정 및 재화(EXP/XP/Gold/SkillPt) | F-03, F-10 |
| `user_otp` | 휴대폰 OTP 인증 이력 | F-02 |
| `quests` | 퀘스트 마스터 (일/주간/이벤트) | F-05, F-06 |
| `quest_pins` | 퀘스트 지도 핀 위치 (PostGIS POINT) | F-04-6 |
| `user_quests` | 유저별 퀘스트 수행 이력 및 상태 | F-06-5 |
| `ride_sessions` | 라이딩 결과 (거리/시간/보상/안전등급) | F-07, F-08 |
| `ride_gps_points` | GPS 트랙 좌표 이력 (PostGIS POINT) | F-07-1 |
| `ride_streaks` | 연속 라이딩 스트릭 | F-07-8 |
| `bookmarks` | 퀘스트 북마크 | F-06-2 |
| `feed_posts` | 소셜 피드 포스트 (스토리 포함) | F-09 |
| `post_likes` | 피드 좋아요 | F-09-4 |
| `post_comments` | 댓글 & 대댓글 (자기 참조) | F-09-6, F-09-7 |
| `badges` | 배지 마스터 | F-10-8 |
| `user_badges` | 유저 배지 획득 이력 | F-10-8 |
| `notifications` | 알림 메시지 | F-04-4 |
| `notification_settings` | 알림 수신 설정 (5종) | F-11-5 |

---

## ERD (Mermaid)

```mermaid
erDiagram

    users {
        UUID id PK
        VARCHAR phone UK
        VARCHAR nickname UK
        rider_type rider_type
        SMALLINT level
        INTEGER exp
        INTEGER xp
        INTEGER gold
        INTEGER skill_pt
        TEXT avatar_url
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    user_otp {
        BIGSERIAL id PK
        VARCHAR phone
        VARCHAR otp_code
        TIMESTAMPTZ expires_at
        TIMESTAMPTZ verified_at
        TIMESTAMPTZ created_at
    }

    quests {
        UUID id PK
        VARCHAR title
        TEXT description
        TEXT hero_image_url
        VARCHAR district
        quest_period period
        quest_badge_type badge
        SMALLINT required_level
        NUMERIC target_distance_km
        safety_grade min_safety_grade
        INTEGER reward_exp
        INTEGER reward_gold
        VARCHAR reward_item
        BOOLEAN is_active
        TIMESTAMPTZ starts_at
        TIMESTAMPTZ ends_at
    }

    quest_pins {
        BIGSERIAL id PK
        UUID quest_id FK
        GEOMETRY location
        TIMESTAMPTZ created_at
    }

    user_quests {
        UUID id PK
        UUID user_id FK
        UUID quest_id FK
        quest_status status
        BOOLEAN is_first_clear
        TIMESTAMPTZ accepted_at
        TIMESTAMPTZ completed_at
    }

    ride_sessions {
        UUID id PK
        UUID user_quest_id FK
        UUID user_id FK
        UUID quest_id FK
        NUMERIC distance_km
        INTEGER duration_sec
        NUMERIC avg_speed_kmh
        safety_grade safety_grade
        INTEGER reward_exp
        INTEGER reward_gold
        VARCHAR reward_item
        BOOLEAN is_success
        TEXT fail_reason
        TIMESTAMPTZ created_at
    }

    ride_gps_points {
        BIGSERIAL id PK
        UUID ride_session_id FK
        GEOMETRY location
        NUMERIC accuracy_m
        TIMESTAMPTZ recorded_at
    }

    ride_streaks {
        UUID user_id PK FK
        INTEGER current_streak
        INTEGER longest_streak
        DATE last_ride_date
        TIMESTAMPTZ updated_at
    }

    bookmarks {
        UUID user_id PK FK
        UUID quest_id PK FK
        TIMESTAMPTZ created_at
    }

    feed_posts {
        UUID id PK
        UUID user_id FK
        UUID ride_session_id FK
        TEXT content
        TEXT image_url
        INTEGER like_count
        INTEGER comment_count
        BOOLEAN is_story
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    post_likes {
        UUID post_id PK FK
        UUID user_id PK FK
        TIMESTAMPTZ created_at
    }

    post_comments {
        UUID id PK
        UUID post_id FK
        UUID user_id FK
        UUID parent_id FK
        TEXT content
        TEXT image_url
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    badges {
        UUID id PK
        VARCHAR name
        TEXT description
        TEXT icon_url
        badge_condition_type condition_type
        INTEGER condition_value
        TIMESTAMPTZ created_at
    }

    user_badges {
        UUID user_id PK FK
        UUID badge_id PK FK
        TIMESTAMPTZ acquired_at
    }

    notifications {
        BIGSERIAL id PK
        UUID user_id FK
        notification_type type
        VARCHAR title
        TEXT body
        BOOLEAN is_read
        TIMESTAMPTZ created_at
    }

    notification_settings {
        UUID user_id PK FK
        BOOLEAN quest_recommend
        BOOLEAN quest_expire
        BOOLEAN event
        BOOLEAN ride_result
        BOOLEAN social
        TIMESTAMPTZ updated_at
    }

    users ||--o{ user_quests : "수행"
    users ||--o{ ride_sessions : "주행"
    users ||--o{ bookmarks : "북마크"
    users ||--o{ feed_posts : "게시"
    users ||--o{ post_likes : "좋아요"
    users ||--o{ post_comments : "댓글"
    users ||--o{ user_badges : "획득"
    users ||--o{ notifications : "수신"
    users ||--o| notification_settings : "설정"
    users ||--o| ride_streaks : "스트릭"

    quests ||--o{ quest_pins : "핀"
    quests ||--o{ user_quests : "수행됨"
    quests ||--o{ ride_sessions : "포함"
    quests ||--o{ bookmarks : "저장됨"

    user_quests ||--|| ride_sessions : "결과"

    ride_sessions ||--o{ ride_gps_points : "GPS 트랙"
    ride_sessions ||--o| feed_posts : "공유됨"

    feed_posts ||--o{ post_likes : "좋아요"
    feed_posts ||--o{ post_comments : "댓글"

    post_comments ||--o{ post_comments : "대댓글"

    badges ||--o{ user_badges : "획득됨"
```

---

## ENUM 타입 정의

| ENUM | 값 | 설명 |
|---|---|---|
| `rider_type` | COMMUTER, CAFE_HUNTER, NIGHT_RIDER | 라이더 유형 |
| `quest_period` | DAILY, WEEKLY, EVENT | 퀘스트 기간 분류 |
| `quest_badge_type` | HOT, NEW, LIMITED | 퀘스트 뱃지 |
| `safety_grade` | A, B, C | 안전 등급 |
| `quest_status` | ACCEPTED, ACTIVE, COMPLETED, FAILED, ABANDONED | 퀘스트 진행 상태 |
| `notification_type` | QUEST_RECOMMEND, QUEST_EXPIRE, EVENT, RIDE_RESULT, SOCIAL | 알림 종류 |
| `badge_condition_type` | QUEST_CLEAR_COUNT, DISTANCE_TOTAL_KM, STREAK_DAYS, SAFETY_GRADE_A_COUNT | 배지 획득 조건 |

---

## PostGIS 컬럼

| 테이블 | 컬럼 | 타입 | 용도 |
|---|---|---|---|
| `quest_pins` | `location` | `GEOMETRY(POINT, 4326)` | 퀘스트 지도 핀 좌표 |
| `ride_gps_points` | `location` | `GEOMETRY(POINT, 4326)` | GPS 주행 트랙 |

두 컬럼 모두 `GiST` 인덱스 적용 (`idx_quest_pins_location`, `idx_ride_gps_location`)

---

## Docker 연동 방식

`database/init/` 디렉터리는 Docker Compose의 `database` 서비스에 마운트됩니다.

```yaml
volumes:
  - ./database/init:/docker-entrypoint-initdb.d:ro
```

`postgis/postgis` 이미지는 컨테이너 최초 기동 시 `/docker-entrypoint-initdb.d/` 내 `.sql` 파일을 **파일명 사전순**으로 자동 실행합니다.  
`001_init_schema.sql` 네이밍은 이 순서를 보장하기 위한 prefix입니다.

> **주의**: 볼륨(`./database/data`)이 이미 존재하면 init 스크립트는 재실행되지 않습니다.  
> 스키마를 재적용하려면 `docker compose down -v` 후 재기동하세요.

---

## 기동 명령어

```bash
# backend profile로 DB 포함 전체 기동
docker compose --profile backend up --build -d

# DB 로그 확인
docker compose logs -f database

# psql 접속 (호스트에서)
psql -h localhost -p 5435 -U saigon -d saigon_rider
```
