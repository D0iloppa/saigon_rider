-- quests.title, description 제거 (언어별 컬럼 title_ko/vi/en, description_ko/vi/en으로 대체)
ALTER TABLE quests
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS description;
