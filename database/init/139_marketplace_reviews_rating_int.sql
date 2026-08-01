-- ================================================================
-- 139_marketplace_reviews_rating_int.sql (MKT-11/DB-10)
-- marketplace_reviews.rating 이 VARCHAR(8) CHECK ('GOOD','BAD') 로 배포됐으나
-- ORM(models.py MarketplaceReview.rating: SmallInteger)과 API(market.py, 1~5 정수)는
-- 처음부터 int 1~5 계약으로 구현돼 있어, 기존 DB에서는 리뷰 작성 시 CHECK 위반으로
-- 100% 실패한다. 088 은 신규 볼륨 기준으로 이미 SMALLINT 로 수정했고, 이 마이그레이션은
-- 이미 VARCHAR 컬럼으로 생성돼 있는 기존 DB를 동일 계약으로 전환한다.
-- ================================================================

DO $$
BEGIN
  IF to_regclass('public.marketplace_reviews') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'marketplace_reviews'
         AND column_name = 'rating' AND data_type = 'character varying'
     ) THEN
    ALTER TABLE marketplace_reviews DROP CONSTRAINT IF EXISTS marketplace_reviews_rating_check;
    ALTER TABLE marketplace_reviews
      ALTER COLUMN rating TYPE SMALLINT
      USING (CASE rating WHEN 'GOOD' THEN 5 WHEN 'BAD' THEN 1 ELSE NULL END);
    ALTER TABLE marketplace_reviews
      ADD CONSTRAINT marketplace_reviews_rating_check CHECK (rating BETWEEN 1 AND 5);
  END IF;
END $$;
