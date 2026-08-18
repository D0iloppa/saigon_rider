-- ================================================================
-- 192_listing_price_log.sql
-- 016_PLATFORM_MASTER_SUPPLEMENT.md §4-2 #37 — 가격 변동 이력.
-- 191(#36 상태 로그)과 동일한 성격의 이력 테이블. 용도는 016 §4-2: ① 가격 인하 알림
-- ② 미끼가(B-BAIT-PRICE) 탐지 원료(#39) ③ 시세 산출 기준선(#39). 이 마이그레이션은 ①만
-- 코드로 배선하고 ②③은 표만 채워둔다(M3: 원료 먼저, 판정은 나중).
-- 멱등: CREATE TABLE IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS listing_price_log (
    id            BIGSERIAL PRIMARY KEY,
    listing_id    UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    old_price_vnd BIGINT NOT NULL,
    new_price_vnd BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_price_log_listing ON listing_price_log (listing_id, created_at);
