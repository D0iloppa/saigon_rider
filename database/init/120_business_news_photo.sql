-- ================================================================
-- 120_business_news_photo.sql  (W3-BE T2)
-- 업체 소식 사진 N장 — marketplace_listing_images 패턴 미러
--   (084_marketplace.sql:54-63, contents 테이블 중개)
--
-- dev 시드: 085_marketplace_seed.sql 의 기존 contents 행(c0000000-...-0001~0005)
--   을 재사용해 118 시드 소식 4건 중 3건에 사진 1~3장을 연결.
--   (1건은 사진 0장으로 남겨 무사진 케이스 검증용)
--
-- 멱등성: 118 의 news 행은 고정 UUID가 아니므로 title 매칭 서브쿼리로
--   news_id 를 얻어 INSERT ... SELECT ... WHERE NOT EXISTS 로 삽입.
-- ================================================================

CREATE TABLE IF NOT EXISTS business_news_photo (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    news_id    UUID NOT NULL REFERENCES business_news(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biz_news_photo_news ON business_news_photo (news_id, sort_order);

-- ── dev 시드 (멱등: news_id + content_id 조합 존재 시 skip) ──────

-- '신규 브레이크 패드 입고했어요' → 사진 3장
INSERT INTO business_news_photo (news_id, content_id, sort_order)
SELECT n.id, c.content_id, c.sort_order
FROM business_news n
CROSS JOIN (VALUES
    ('c0000000-0000-4000-8000-000000000001'::uuid, 0),
    ('c0000000-0000-4000-8000-000000000002'::uuid, 1),
    ('c0000000-0000-4000-8000-000000000003'::uuid, 2)
) AS c(content_id, sort_order)
WHERE n.title = '신규 브레이크 패드 입고했어요'
  AND NOT EXISTS (
      SELECT 1 FROM business_news_photo p WHERE p.news_id = n.id AND p.content_id = c.content_id
  );

-- '헬멧·장갑 전 품목 15% 할인 이벤트' → 사진 2장
INSERT INTO business_news_photo (news_id, content_id, sort_order)
SELECT n.id, c.content_id, c.sort_order
FROM business_news n
CROSS JOIN (VALUES
    ('c0000000-0000-4000-8000-000000000004'::uuid, 0),
    ('c0000000-0000-4000-8000-000000000005'::uuid, 1)
) AS c(content_id, sort_order)
WHERE n.title = '헬멧·장갑 전 품목 15% 할인 이벤트'
  AND NOT EXISTS (
      SELECT 1 FROM business_news_photo p WHERE p.news_id = n.id AND p.content_id = c.content_id
  );

-- '여름 시즌 아이스 음료 신메뉴 출시' → 사진 1장
INSERT INTO business_news_photo (news_id, content_id, sort_order)
SELECT n.id, c.content_id, c.sort_order
FROM business_news n
CROSS JOIN (VALUES
    ('c0000000-0000-4000-8000-000000000001'::uuid, 0)
) AS c(content_id, sort_order)
WHERE n.title = '여름 시즌 아이스 음료 신메뉴 출시'
  AND NOT EXISTS (
      SELECT 1 FROM business_news_photo p WHERE p.news_id = n.id AND p.content_id = c.content_id
  );

-- '엔진오일 정기점검 예약 늘어나는 중' → 사진 0장 (무사진 케이스 검증용, 삽입 없음)
