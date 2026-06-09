-- =====================================================
-- 080: repair_review 출처 구분 컬럼 (Google 사전입력 리뷰용)
--   source: 'USER'(플랫폼 작성) | 'GOOGLE'(Google Places 사전수집). author_name: 외부 작성자명.
--   081 seed(Google 리뷰)의 전제.
-- =====================================================

ALTER TABLE repair_review ADD COLUMN IF NOT EXISTS source varchar(20) DEFAULT 'USER';
ALTER TABLE repair_review ADD COLUMN IF NOT EXISTS author_name varchar(120);
