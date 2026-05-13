-- =============================================================
-- Saigon Rider — Initial Schema
-- PostgreSQL 15 + PostGIS 3.3
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- ENUM Types
-- =============================================================

CREATE TYPE rider_type AS ENUM (
    'COMMUTER',       -- 출퇴근러
    'CAFE_HUNTER',    -- 카페 헌터
    'NIGHT_RIDER'     -- 나이트 라이더
);

CREATE TYPE quest_period AS ENUM (
    'DAILY',    -- 오늘
    'WEEKLY',   -- 주간
    'EVENT'     -- 이벤트
);

CREATE TYPE quest_badge_type AS ENUM (
    'HOT',
    'NEW',
    'LIMITED'
);

CREATE TYPE safety_grade AS ENUM ('A', 'B', 'C');

CREATE TYPE quest_status AS ENUM (
    'ACCEPTED',    -- 수락됨
    'ACTIVE',      -- 주행 중
    'COMPLETED',   -- 성공
    'FAILED',      -- 실패
    'ABANDONED'    -- 중도 포기
);

CREATE TYPE notification_type AS ENUM (
    'QUEST_RECOMMEND',  -- 추천 퀘스트
    'QUEST_EXPIRE',     -- 만료 임박
    'EVENT',            -- 이벤트
    'RIDE_RESULT',      -- 라이딩 결과
    'SOCIAL'            -- 소셜 (좋아요·댓글)
);

CREATE TYPE badge_condition_type AS ENUM (
    'QUEST_CLEAR_COUNT',  -- 누적 퀘스트 클리어 수
    'DISTANCE_TOTAL_KM',  -- 누적 주행 거리(km)
    'STREAK_DAYS',        -- 연속 라이딩 일수
    'SAFETY_GRADE_A_COUNT' -- 안전등급 A 횟수
);

-- =============================================================
-- USERS — 라이더 계정
-- =============================================================

CREATE TABLE users (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone       VARCHAR(20)  NOT NULL UNIQUE,
    nickname    VARCHAR(30)  UNIQUE,
    rider_type  rider_type,
    level       SMALLINT     NOT NULL DEFAULT 1 CHECK (level >= 1),
    exp         INTEGER      NOT NULL DEFAULT 0 CHECK (exp >= 0),
    xp          INTEGER      NOT NULL DEFAULT 0 CHECK (xp >= 0),
    gold        INTEGER      NOT NULL DEFAULT 0 CHECK (gold >= 0),
    skill_pt    INTEGER      NOT NULL DEFAULT 0 CHECK (skill_pt >= 0),
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================
-- USER_OTP — 휴대폰 인증 (F-02)
-- =============================================================

CREATE TABLE user_otp (
    id          BIGSERIAL    PRIMARY KEY,
    phone       VARCHAR(20)  NOT NULL,
    otp_code    VARCHAR(6)   NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================
-- QUESTS — 퀘스트 마스터 (F-05, F-06)
-- =============================================================

CREATE TABLE quests (
    id                 UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
    title              VARCHAR(100)     NOT NULL,
    description        TEXT,
    hero_image_url     TEXT,
    district           VARCHAR(100),
    period             quest_period     NOT NULL DEFAULT 'DAILY',
    badge              quest_badge_type,
    required_level     SMALLINT         NOT NULL DEFAULT 1 CHECK (required_level >= 1),
    target_distance_km NUMERIC(6,2)     NOT NULL CHECK (target_distance_km > 0),
    min_safety_grade   safety_grade,
    reward_exp         INTEGER          NOT NULL DEFAULT 0 CHECK (reward_exp >= 0),
    reward_gold        INTEGER          NOT NULL DEFAULT 0 CHECK (reward_gold >= 0),
    reward_item        VARCHAR(100),
    is_active          BOOLEAN          NOT NULL DEFAULT TRUE,
    starts_at          TIMESTAMPTZ,
    ends_at            TIMESTAMPTZ,
    created_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- 퀘스트 지도 핀 (PostGIS — F-04-6)
CREATE TABLE quest_pins (
    id         BIGSERIAL               PRIMARY KEY,
    quest_id   UUID                    NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    location   GEOMETRY(POINT, 4326)   NOT NULL,
    created_at TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- =============================================================
-- USER_QUESTS — 유저별 퀘스트 수행 이력 (F-06-5)
-- =============================================================

CREATE TABLE user_quests (
    id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id       UUID         NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    status         quest_status NOT NULL DEFAULT 'ACCEPTED',
    is_first_clear BOOLEAN      NOT NULL DEFAULT FALSE,
    accepted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMPTZ
);

-- =============================================================
-- RIDE_SESSIONS — 라이딩 결과 (F-07, F-08)
-- =============================================================

CREATE TABLE ride_sessions (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_quest_id   UUID         NOT NULL REFERENCES user_quests(id) ON DELETE CASCADE,
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id        UUID         NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    distance_km     NUMERIC(7,3) NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
    duration_sec    INTEGER      NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
    avg_speed_kmh   NUMERIC(5,2),
    safety_grade    safety_grade,
    reward_exp      INTEGER      NOT NULL DEFAULT 0,
    reward_gold     INTEGER      NOT NULL DEFAULT 0,
    reward_item     VARCHAR(100),
    is_success      BOOLEAN      NOT NULL DEFAULT FALSE,
    fail_reason     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- GPS 트랙 포인트 (PostGIS — F-07-1, F-07-2)
CREATE TABLE ride_gps_points (
    id              BIGSERIAL               PRIMARY KEY,
    ride_session_id UUID                    NOT NULL REFERENCES ride_sessions(id) ON DELETE CASCADE,
    location        GEOMETRY(POINT, 4326)   NOT NULL,
    accuracy_m      NUMERIC(6,2),
    recorded_at     TIMESTAMPTZ             NOT NULL
);

-- =============================================================
-- RIDE_STREAKS — 연속 라이딩 스트릭 (F-07-8)
-- =============================================================

CREATE TABLE ride_streaks (
    user_id         UUID     PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_streak  INTEGER  NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
    longest_streak  INTEGER  NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
    last_ride_date  DATE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- BOOKMARKS — 퀘스트 북마크 (F-06-2)
-- =============================================================

CREATE TABLE bookmarks (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id   UUID        NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, quest_id)
);

-- =============================================================
-- FEED_POSTS — 소셜 피드 (F-09)
-- =============================================================

CREATE TABLE feed_posts (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ride_session_id UUID        REFERENCES ride_sessions(id) ON DELETE SET NULL,
    content         TEXT,
    image_url       TEXT,
    like_count      INTEGER     NOT NULL DEFAULT 0 CHECK (like_count >= 0),
    comment_count   INTEGER     NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    is_story        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- POST_LIKES — 피드 좋아요 (F-09-4)
-- =============================================================

CREATE TABLE post_likes (
    post_id    UUID        NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

-- =============================================================
-- POST_COMMENTS — 댓글 & 대댓글 (F-09-6, F-09-7)
-- =============================================================

CREATE TABLE post_comments (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id    UUID        NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  UUID        REFERENCES post_comments(id) ON DELETE CASCADE,
    content    TEXT,
    image_url  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comment_has_content CHECK (content IS NOT NULL OR image_url IS NOT NULL)
);

-- =============================================================
-- BADGES — 배지 마스터 (F-10-8)
-- =============================================================

CREATE TABLE badges (
    id               UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(100)         NOT NULL,
    description      TEXT,
    icon_url         TEXT,
    condition_type   badge_condition_type,
    condition_value  INTEGER,
    created_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE TABLE user_badges (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id    UUID        NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, badge_id)
);

-- =============================================================
-- NOTIFICATIONS — 알림 (F-04-4, F-11-5)
-- =============================================================

CREATE TABLE notifications (
    id         BIGSERIAL         PRIMARY KEY,
    user_id    UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       notification_type NOT NULL,
    title      VARCHAR(200)      NOT NULL,
    body       TEXT,
    is_read    BOOLEAN           NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_settings (
    user_id          UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    quest_recommend  BOOLEAN     NOT NULL DEFAULT TRUE,
    quest_expire     BOOLEAN     NOT NULL DEFAULT TRUE,
    event            BOOLEAN     NOT NULL DEFAULT TRUE,
    ride_result      BOOLEAN     NOT NULL DEFAULT TRUE,
    social           BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================

-- users
CREATE INDEX idx_users_phone     ON users(phone);
CREATE INDEX idx_users_nickname  ON users(nickname);

-- user_otp
CREATE INDEX idx_user_otp_phone      ON user_otp(phone);
CREATE INDEX idx_user_otp_expires_at ON user_otp(expires_at);

-- quests
CREATE INDEX idx_quests_period   ON quests(period);
CREATE INDEX idx_quests_active   ON quests(is_active);
CREATE INDEX idx_quests_ends_at  ON quests(ends_at);

-- quest_pins (GiST for spatial queries)
CREATE INDEX idx_quest_pins_location ON quest_pins USING GIST(location);

-- user_quests
CREATE INDEX idx_user_quests_user_id  ON user_quests(user_id);
CREATE INDEX idx_user_quests_quest_id ON user_quests(quest_id);
CREATE INDEX idx_user_quests_status   ON user_quests(status);

-- ride_sessions
CREATE INDEX idx_ride_sessions_user_id   ON ride_sessions(user_id);
CREATE INDEX idx_ride_sessions_quest_id  ON ride_sessions(quest_id);
CREATE INDEX idx_ride_sessions_created_at ON ride_sessions(created_at DESC);

-- ride_gps_points (GiST for spatial queries)
CREATE INDEX idx_ride_gps_session_id ON ride_gps_points(ride_session_id);
CREATE INDEX idx_ride_gps_location   ON ride_gps_points USING GIST(location);

-- feed_posts
CREATE INDEX idx_feed_posts_user_id    ON feed_posts(user_id);
CREATE INDEX idx_feed_posts_created_at ON feed_posts(created_at DESC);
CREATE INDEX idx_feed_posts_story      ON feed_posts(is_story) WHERE is_story = TRUE;

-- post_comments
CREATE INDEX idx_post_comments_post_id   ON post_comments(post_id);
CREATE INDEX idx_post_comments_parent_id ON post_comments(parent_id);

-- notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = FALSE;
