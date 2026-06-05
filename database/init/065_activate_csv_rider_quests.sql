-- ================================================================
-- 065_activate_csv_rider_quests.sql
-- csv(정적 SVG 카드 id)가 v4 RIDER 스프라이트 12종에 해당하는 비활성 퀘스트를 활성화.
-- 목적: 신규 v4 카드 아트를 앱에서 노출/검토. 검증기는 후속(차차)으로,
--       현재는 DISTANCE/CHECKPOINT 기존 검증기로만 판정(미구현 의도는 placeholder).
-- season(_SEASON)/mythic(_M) 및 v4 미보유 코드(MIXED_WEEKLY 등)는 제외 → 비활성 유지.
-- ================================================================

BEGIN;

UPDATE quests SET is_active = TRUE
WHERE is_active = FALSE
  AND csv IN (
    'RIDING_DAILY', 'RIDING_WEEKLY', 'RIDING_MONTHLY',
    'COMMUNITY_DAILY', 'COMMUNITY_WEEKLY',
    'MAINT_DAILY', 'MAINT_WEEKLY',
    'MARKET_DAILY', 'MARKET_WEEKLY',
    'MIXED_DAILY',
    'DELIVERY_DAILY',
    'ONBOARDING'
  );

COMMIT;
