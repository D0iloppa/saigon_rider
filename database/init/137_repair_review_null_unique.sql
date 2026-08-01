-- 로그인 사용자는 service_code가 NULL이어도 정비소별 리뷰를 한 번만 작성할 수 있다.
-- 외부 수집 리뷰(reviewer_user_id IS NULL)는 기존처럼 여러 건을 허용한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_repair_review_user_service_nulls_not_distinct
    ON repair_review (shop_id, reviewer_user_id, service_code) NULLS NOT DISTINCT
    WHERE reviewer_user_id IS NOT NULL;
