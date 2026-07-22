-- quests.title, description 제거 (언어별 컬럼 title_ko/vi/en, description_ko/vi/en으로 대체)
ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS title_ko VARCHAR(100),
  ADD COLUMN IF NOT EXISTS title_vi VARCHAR(100),
  ADD COLUMN IF NOT EXISTS title_en VARCHAR(100),
  ADD COLUMN IF NOT EXISTS description_ko TEXT,
  ADD COLUMN IF NOT EXISTS description_vi TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quests' AND column_name = 'title'
  ) THEN
    EXECUTE $sql$
      UPDATE quests
      SET title_ko = COALESCE(title_ko, title),
          title_vi = COALESCE(title_vi, title),
          title_en = COALESCE(title_en, title),
          description_ko = COALESCE(description_ko, description),
          description_vi = COALESCE(description_vi, description),
          description_en = COALESCE(description_en, description)
      WHERE title IS NOT NULL OR description IS NOT NULL
    $sql$;
  END IF;
END $$;

ALTER TABLE quests
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS description;
