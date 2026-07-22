-- RP→XP 리네임 잔존: tier_definition.min_lifetime_rp 컬럼이 코드(min_lifetime_xp)와 불일치
-- POST /v1/events 가 ORM 매핑 실패로 500 발생, GPS/마일리지 누적 차단.

DO $$
BEGIN
  IF to_regclass('public.tier_definition') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tier_definition' AND column_name = 'min_lifetime_rp'
     ) THEN
    ALTER TABLE tier_definition RENAME COLUMN min_lifetime_rp TO min_lifetime_xp;
  END IF;
END $$;
