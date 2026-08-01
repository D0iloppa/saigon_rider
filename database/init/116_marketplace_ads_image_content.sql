-- ================================================================
-- 116_marketplace_ads_image_content.sql  (SGR-312 BP-4)
-- 파트너 광고 소재 이미지 — contents 테이블 중개 규약 적용.
--   · 신규 광고(파트너 등록)는 image_content_id 사용.
--   · 기존 image_url 은 read-only 레거시 폴백 (095 seed 광고 호환).
-- ================================================================

ALTER TABLE marketplace_ads
    ADD COLUMN IF NOT EXISTS image_content_id UUID REFERENCES contents(id) ON DELETE SET NULL;
