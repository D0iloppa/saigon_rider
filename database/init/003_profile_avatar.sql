-- =============================================================
-- Saigon Rider — Profile Avatar
-- users 테이블에 프로필 사진 컨텐츠 참조 컬럼 추가
-- =============================================================

ALTER TABLE users
    ADD COLUMN avatar_content_id UUID REFERENCES contents(id) ON DELETE SET NULL;
