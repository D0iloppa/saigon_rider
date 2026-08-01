-- 업체소개 필드 신설 (대표 결정, 260801_multilingual_search_design.md §7-②). 멱등(기존 볼륨 재적용 안전).
ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS intro text;
