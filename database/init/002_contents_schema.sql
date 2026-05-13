-- =============================================================
-- Saigon Rider — Contents Schema
-- =============================================================

CREATE TYPE content_owner_type AS ENUM (
    'system',   -- 시스템 정적 리소스 (직접 업로드)
    'user'      -- 사용자 업로드 컨텐츠
);

-- =============================================================
-- CONTENTS — 이미지 컨텐츠 레지스트리
-- =============================================================

CREATE TABLE contents (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type       content_owner_type NOT NULL,
    owner_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
    file_path        TEXT         NOT NULL,          -- imgproxy 볼륨(/data) 기준 상대경로
    mime_type        VARCHAR(100),
    original_filename VARCHAR(255),
    file_size        INTEGER,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- owner_id는 user 타입일 때만 설정 (system은 NULL)
CREATE INDEX idx_contents_owner ON contents (owner_type, owner_id);
