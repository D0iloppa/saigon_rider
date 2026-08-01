-- ================================================================
-- 131_banned_keywords.sql
-- T&S 관리자 콘솔 리메이크 — 금칙어 마스터.
--   · banned_keywords : 매물/게시글 등록 시 필터링할 금칙어 목록.
-- 멱등: IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS banned_keywords (
    id         BIGSERIAL PRIMARY KEY,
    keyword    VARCHAR(60) NOT NULL UNIQUE,
    note       VARCHAR(200),
    created_by VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
