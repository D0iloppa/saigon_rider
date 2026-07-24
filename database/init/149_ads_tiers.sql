-- 관리자 정의 광고 티어와 신청 당시 월 가격 snapshot.
CREATE TABLE IF NOT EXISTS ad_tiers (
  id UUID PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  monthly_price_vnd INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price_vnd >= 0),
  exposure_weight INTEGER NOT NULL DEFAULT 1 CHECK (exposure_weight > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ad_tiers (id, name, monthly_price_vnd, exposure_weight, display_order)
VALUES
  ('00000000-0000-4000-8000-000000000001', '프리미엄', 0, 3, 10),
  ('00000000-0000-4000-8000-000000000002', '일반', 0, 1, 20)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS tier_id UUID;
ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS monthly_price_snapshot_vnd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS ad_fee INTEGER NOT NULL DEFAULT 1;

-- 구 3-tier seed의 Bronze UUID가 남아 있을 때만 기본 seed를 한 번 변환한다.
-- Bronze 제거 이후의 재실행은 관리자가 편집한 UUID 1/2 값을 보존한다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ad_tiers
    WHERE id = '00000000-0000-4000-8000-000000000003'::uuid
  ) THEN
    UPDATE ad_tiers
    SET name = '프리미엄',
        monthly_price_vnd = 0,
        exposure_weight = 3,
        display_order = 10,
        updated_at = NOW()
    WHERE id = '00000000-0000-4000-8000-000000000001'::uuid;

    UPDATE ad_tiers
    SET name = '일반',
        monthly_price_vnd = 0,
        exposure_weight = 1,
        display_order = 20,
        updated_at = NOW()
    WHERE id = '00000000-0000-4000-8000-000000000002'::uuid;

    UPDATE marketplace_ads
    SET tier_id = '00000000-0000-4000-8000-000000000002'::uuid
    WHERE tier_id = '00000000-0000-4000-8000-000000000003'::uuid;

    DELETE FROM ad_tiers
    WHERE id = '00000000-0000-4000-8000-000000000003'::uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'marketplace_ads'
      AND column_name = 'exposure_tier'
  ) THEN
    EXECUTE $sql$
      UPDATE marketplace_ads
      SET tier_id = CASE exposure_tier
        WHEN 'GOLD' THEN '00000000-0000-4000-8000-000000000001'::uuid
        ELSE '00000000-0000-4000-8000-000000000002'::uuid
      END
      WHERE tier_id IS NULL
    $sql$;
  ELSE
    UPDATE marketplace_ads
    SET tier_id = '00000000-0000-4000-8000-000000000002'::uuid
    WHERE tier_id IS NULL;
  END IF;
END $$;

UPDATE marketplace_ads SET ad_fee = 1 WHERE ad_fee IS DISTINCT FROM 1;
ALTER TABLE marketplace_ads ALTER COLUMN ad_fee SET DEFAULT 1;
ALTER TABLE marketplace_ads ALTER COLUMN tier_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'marketplace_ads_tier_id_fkey'
      AND n.nspname = current_schema()
      AND t.relname = 'marketplace_ads'
  ) THEN
    ALTER TABLE marketplace_ads
      ADD CONSTRAINT marketplace_ads_tier_id_fkey
      FOREIGN KEY (tier_id) REFERENCES ad_tiers(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE marketplace_ads DROP CONSTRAINT IF EXISTS marketplace_ads_exposure_tier_check;
ALTER TABLE marketplace_ads DROP COLUMN IF EXISTS exposure_tier;
