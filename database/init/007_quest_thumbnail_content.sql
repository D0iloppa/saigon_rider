-- 퀘스트 이미지를 contents 테이블과 연동
-- owner_type='system', owner_id=NULL (시스템 공통 콘텐츠)
-- 기존 hero_image_url은 폴백용으로 유지

ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS thumbnail_content_id UUID
    REFERENCES contents(id) ON DELETE SET NULL;
