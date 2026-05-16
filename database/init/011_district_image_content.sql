-- ================================================================
-- 011_district_image_content.sql
-- districts 테이블에 image_content_id FK 추가
-- image_url(TEXT)은 폴백으로 유지, image_content_id가 우선
-- ================================================================

ALTER TABLE districts
    ADD COLUMN IF NOT EXISTS image_content_id UUID
        REFERENCES contents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_districts_image_content ON districts (image_content_id);
