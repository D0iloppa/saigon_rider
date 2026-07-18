-- ================================================================
-- 130_notices_faqs.sql
-- T&S 관리자 콘솔 리메이크 — 공지사항/FAQ 마스터 데이터.
--   · notices : 3개국어 공지, 고정/발행 플래그.
--   · faqs    : 3개국어 FAQ, 카테고리·정렬순서·발행 플래그.
-- 멱등: IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS notices (
    id           BIGSERIAL PRIMARY KEY,
    title_vi     VARCHAR(200) NOT NULL, title_ko VARCHAR(200), title_en VARCHAR(200),
    body_vi      TEXT NOT NULL,         body_ko  TEXT,         body_en  TEXT,
    is_pinned    BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notices_pub ON notices (is_published, is_pinned DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS faqs (
    id           BIGSERIAL PRIMARY KEY,
    category     VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    question_vi  VARCHAR(300) NOT NULL, question_ko VARCHAR(300), question_en VARCHAR(300),
    answer_vi    TEXT NOT NULL,         answer_ko   TEXT,         answer_en   TEXT,
    sort_order   SMALLINT NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faqs_pub ON faqs (is_published, category, sort_order);
