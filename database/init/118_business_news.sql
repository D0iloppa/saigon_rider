-- ================================================================
-- 118_business_news.sql  (SGR-326 T1)
-- 업체 소식 (당근 비즈프로필 '소식' 모델 미러) — 읽기 경로 선행 인출
--   광고(marketplace_ads/BusinessAd)와 별개 엔티티. 업체측 등록 UI 는 후속.
--
-- dev 시드: 117 에서 좌표·category 배정된 5개 업체 중 3개에만 소식 부여
--   (나머지 2개는 소식 없음 상태로 남겨 폴백 검증용)
--   [DEV] Bình Thạnh Moto Care (repair) → 부품 입고 소식 2건
--   [DEV] Quận 1 Parts & Gear   (parts)  → 이벤트 할인 소식 1건
--   [DEV] Saigon Rider Shop     (cafe)   → 신메뉴 소식 1건
--   [DEV] Thủ Đức Tire & Oil    (wash)   → 소식 없음
--   [DEV] Quận 7 Scooter Mart   (food)   → 소식 없음
--
-- 멱등성: 시드 INSERT 전 대상 profile 의 title 기준 존재 여부 확인
--   (NOT EXISTS — business_news 는 자체 자연키가 없으므로 title+profile_id 조합 사용).
-- ================================================================

CREATE TABLE IF NOT EXISTS business_news (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    title      VARCHAR(120) NOT NULL,
    body       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biz_news_profile_created
    ON business_news (profile_id, created_at DESC);

-- ── dev 시드 (멱등: title 기준 존재 시 skip) ─────────────────────

DO $dev_seed$
BEGIN
IF current_setting('app.seed_profile', true) IN ('development', 'dev', 'local', 'test') THEN
INSERT INTO business_news (profile_id, title, body, created_at)
SELECT p.id, '신규 브레이크 패드 입고했어요', '순정 브레이크 패드 재입고 완료, 오늘 방문 시 즉시 장착 가능합니다.', now() - interval '2 hours'
FROM business_profile p
WHERE p.name LIKE '[DEV] Bình Thạnh%'
  AND NOT EXISTS (
      SELECT 1 FROM business_news n WHERE n.profile_id = p.id AND n.title = '신규 브레이크 패드 입고했어요'
  );

INSERT INTO business_news (profile_id, title, body, created_at)
SELECT p.id, '엔진오일 정기점검 예약 늘어나는 중', '봄맞이 정기점검 문의가 많아 예약제로 전환했습니다. 방문 전 연락 부탁드려요.', now() - interval '1 day'
FROM business_profile p
WHERE p.name LIKE '[DEV] Bình Thạnh%'
  AND NOT EXISTS (
      SELECT 1 FROM business_news n WHERE n.profile_id = p.id AND n.title = '엔진오일 정기점검 예약 늘어나는 중'
  );

INSERT INTO business_news (profile_id, title, body, created_at)
SELECT p.id, '헬멧·장갑 전 품목 15% 할인 이벤트', '이번 주말까지 매장 내 헬멧·장갑 전 품목 15% 할인합니다.', now() - interval '5 hours'
FROM business_profile p
WHERE p.name LIKE '[DEV] Quận 1%'
  AND NOT EXISTS (
      SELECT 1 FROM business_news n WHERE n.profile_id = p.id AND n.title = '헬멧·장갑 전 품목 15% 할인 이벤트'
  );

INSERT INTO business_news (profile_id, title, body, created_at)
SELECT p.id, '여름 시즌 아이스 음료 신메뉴 출시', '베트남 연유커피 베이스의 신메뉴 2종이 나왔습니다. 라이더 할인도 계속돼요.', now() - interval '3 days'
FROM business_profile p
WHERE p.name LIKE '[DEV] Saigon Rider%'
  AND NOT EXISTS (
      SELECT 1 FROM business_news n WHERE n.profile_id = p.id AND n.title = '여름 시즌 아이스 음료 신메뉴 출시'
  );
END IF;
END
$dev_seed$;
