-- ── category 미할당 업체 백필 (등록 시 category 필수화 후속, 대표 보고 6건) ──────
UPDATE business_profile SET category = 'etc' WHERE category IS NULL OR trim(category) = '';
