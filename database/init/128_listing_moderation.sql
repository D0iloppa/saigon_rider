-- ================================================================
-- 128_listing_moderation.sql
-- T&S 관리자 콘솔 리메이크 — 매물 모더레이션 상태 확장.
--   · marketplace_listings.status 에 HIDDEN(관리자 비공개)/REMOVED(관리자 삭제) 추가.
--   · moderated_at : 관리자 조치 시각 기록.
-- 제약명(marketplace_listings_status_check)은 084 정의 그대로 (unnamed CHECK 의 PG 기본 네이밍) — psql \d 로 확인 완료.
-- 멱등: DROP CONSTRAINT IF EXISTS 후 재생성 / ADD COLUMN IF NOT EXISTS.
-- ================================================================

ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_status_check;
ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_status_check
    CHECK (status IN ('ON_SALE','RESERVED','SOLD','HIDDEN','REMOVED'));
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
