-- ================================================================
-- 191_listing_state_log.sql
-- 016_PLATFORM_MASTER_SUPPLEMENT.md §4-1 #36 — 매물 상태 기계 + 전이 로그.
--
-- V-5 실측(코드 확인, 016 §4-1 서술과 다름): marketplace_listings.status 는 이미 존재하고
-- 6값(ON_SALE/RESERVED/SOLD/HIDDEN/REMOVED/WITHDRAWN)이 084→128→162 로 확장돼 왔다.
-- "7상태 신규설계"가 아니라 **EXPIRED 1값 추가**뿐이다. 제약명(marketplace_listings_status_check)은
-- 128/162 가 재정의한 이름 그대로 승계.
--
-- D-32=(a) 30일 + 복구 가능 — 자동 만료는 삭제가 아니다. 판매자가 ON_SALE 로 되돌릴 수 있어야
-- 공급이 보존된다(market.py update_status 가 WITHDRAWN 과 동일하게 처리).
--
-- listing_state_log 는 016 §4-1 원안 스키마 그대로: 전이(from/to)·행위자(user/admin/system)·사유·시각.
-- 별도 가격 이력(listing_price_log)은 #37(191 다음 마이그레이션)에서 추가한다 — 여기서는 상태만.
--
-- 멱등: DROP CONSTRAINT IF EXISTS 후 재생성 / CREATE TABLE IF NOT EXISTS.
-- ================================================================

ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_status_check;
ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_status_check
    CHECK (status IN ('ON_SALE','RESERVED','SOLD','HIDDEN','REMOVED','WITHDRAWN','EXPIRED'));

CREATE TABLE IF NOT EXISTS listing_state_log (
    id          BIGSERIAL PRIMARY KEY,
    listing_id  UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    from_state  VARCHAR(12),
    to_state    VARCHAR(12) NOT NULL,
    actor_type  VARCHAR(10) NOT NULL,  -- 'user'|'admin'|'system'
    actor_id    UUID,
    reason      VARCHAR(40),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_state_log_listing ON listing_state_log (listing_id, created_at);
