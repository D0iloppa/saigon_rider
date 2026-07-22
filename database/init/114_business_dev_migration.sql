-- ================================================================
-- 114_business_dev_migration.sql  (SGR-312 BP-5)
-- dev 비즈니스 프로필 시드 + 기존 [DEV] 광고 owner 이관
--   전제: 113_business_partner.sql (business_profile, marketplace_ads.owner_business_profile_id)
--         098_marketplace_ads_advertiser.sql (users.is_advertiser, marketplace_ads.owner_id)
--
-- 이관 매핑 기준:
--   1) business_profile 은 is_advertiser=TRUE 인 dev 광고주 user 당 1개 시드
--      (user_id 1:1). status='APPROVED' — 기존에 이미 노출 중인 [DEV] 광고들의
--      소유 주체이므로 심사를 거친 것으로 취급.
--   2) name = users.nickname 그대로 사용 ([DEV] 접두 유지 — 기존 dev 시드 표기 관례).
--   3) phone/address 는 해당 owner_id 소유 광고 중 created_at 최초(= 098 이 원래
--      직접 채워준 "대표" 광고) 값을 대표값으로 채택. 그 owner 는 실제로는 여러
--      partner_name(제품군)의 광고를 함께 소유하는 dev 포트폴리오 성격이라
--      category/좌표는 단일값으로 확정할 근거가 없어 NULL 유지.
--   4) marketplace_ads.owner_business_profile_id 는 owner_id(users FK) 로 매칭되는
--      business_profile 을 연결. 기존 owner_id 컬럼은 삭제하지 않고 read-only 레거시로 보존.
--
-- 알려진 갭 (범위 밖, 의도적으로 미처리):
--   [DEV] Quận 5 Repair Pro / [DEV] Quận 5 Battery King / [DEV] Rider Insurance
--   3건은 096 시드 당시부터 owner_id 자체가 NULL — 098/106/107 그 어떤 후속
--   마이그레이션도 이 3건에 owner 를 배정한 적이 없다. 이번 작업은 "기존 owner_id
--   보유 광고의 이관"이므로 없는 owner 관계를 새로 창작하지 않고 그대로 NULL 유지.
--   (owner_business_profile_id IS NULL 로 3건 잔존 — 별도 결정 필요 시 후속 처리)
--
-- 멱등성: business_profile 시드는 WHERE NOT EXISTS(user_id 기준), 광고 이관은
--   owner_id → business_profile.user_id UPDATE 라 재실행해도 동일 결과.
-- ================================================================

-- 1) dev 광고주 user 당 business_profile 1개 시드
DO $dev_seed$
BEGIN
IF current_setting('app.seed_profile', true) IN ('development', 'dev', 'local', 'test') THEN
INSERT INTO business_profile (user_id, name, phone, address, status, reviewed_at, created_at, updated_at)
SELECT
    u.id,
    u.nickname,
    rep.phone,
    rep.address,
    'APPROVED',
    NOW(),
    NOW(),
    NOW()
FROM users u
CROSS JOIN LATERAL (
    SELECT a.phone, a.address
    FROM marketplace_ads a
    WHERE a.owner_id = u.id
    ORDER BY a.created_at, a.id
    LIMIT 1
) rep
WHERE u.is_advertiser = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM business_profile bp WHERE bp.user_id = u.id
  );

-- 2) 기존 [DEV] 광고 owner_id → owner_business_profile_id 이관
UPDATE marketplace_ads a
SET owner_business_profile_id = bp.id
FROM business_profile bp
WHERE bp.user_id = a.owner_id
  AND a.owner_business_profile_id IS DISTINCT FROM bp.id;
END IF;
END
$dev_seed$;
