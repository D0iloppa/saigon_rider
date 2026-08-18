-- F-7: 판매자 매물 철회(WITHDRAWN) 상태 추가.
-- 제약명(marketplace_listings_status_check)은 128 이 재정의한 이름 그대로 — 128 패턴 미러링.
-- ⚠️ 2026-08-18: DROP 후 무조건 ADD 하던 것을 "없을 때만 ADD" 로 바꿨다.
--    bff_migrate 는 매 기동마다 모든 마이그레이션을 재실행하는데, 이 파일이 구 6값 제약을
--    다시 못박는 바람에 191(EXPIRED 추가) 이 뒤에서 7값으로 덮어쓰기 전에 먼저 터졌다
--    ("check constraint ... is violated by some row" → bff_migrate exit 3, 부팅 차단).
--    제약의 최종 정의는 **가장 나중 마이그레이션이 소유**한다 — 여기서는 재확인만 한다.
--    신규 DB: 이 블록이 6값으로 생성 → 191 이 DROP 후 7값으로 재정의. 순서 동일하게 성립.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'marketplace_listings_status_check'
          AND conrelid = 'marketplace_listings'::regclass
    ) THEN
        ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_status_check
            CHECK (status IN ('ON_SALE','RESERVED','SOLD','HIDDEN','REMOVED','WITHDRAWN'));
    END IF;
END $$;
