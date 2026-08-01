-- F-7: 판매자 매물 철회(WITHDRAWN) 상태 추가.
-- 제약명(marketplace_listings_status_check)은 128 이 재정의한 이름 그대로 — 128 패턴 미러링.
ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_status_check;
ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_status_check
    CHECK (status IN ('ON_SALE','RESERVED','SOLD','HIDDEN','REMOVED','WITHDRAWN'));
