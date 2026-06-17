-- ================================================================
-- 092_translation_cache.sql
-- 실시간 번역 캐시 — API 호출 비용 절약(원문 해시로 재활용)
--   source_hash = sha256(trim(원문))  → PK (언어별 해시 불필요: 항상 원문으로만 조회)
--   text_ko/en/vi = 대상 언어별 번역 (요청된 언어만 lazy 채움)
-- ================================================================

CREATE TABLE IF NOT EXISTS translations (
    source_hash  CHAR(64) PRIMARY KEY,          -- sha256(trim(source_text)) hex
    source_lang  VARCHAR(8),                     -- 'ko'|'en'|'vi'|null(자동감지)
    source_text  TEXT NOT NULL,
    text_ko      TEXT,
    text_en      TEXT,
    text_vi      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
