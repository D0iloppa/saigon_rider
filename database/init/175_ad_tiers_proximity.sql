-- ================================================================
-- 175_ad_tiers_proximity.sql
--
-- 근접 광고 계약형태 옵션A(ai-docs/260810_proximity_ad_contract_model.md §A-2) —
-- 근접알림을 별도 상품이 아니라 프리미엄 tier 가 제공하는 기능으로 정의한다.
-- 가격(D-8/D-9)은 미확정이라 이 마이그레이션에서 건드리지 않는다 — 컬럼 추가 + 프리미엄 TRUE 뿐.
--
-- 멱등(ADD COLUMN IF NOT EXISTS / 고정 UUID UPDATE). fresh volume 자동적용 +
-- 기존 volume 수동 psql 둘 다 안전.
-- ================================================================

ALTER TABLE ad_tiers
  ADD COLUMN IF NOT EXISTS proximity_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE ad_tiers SET proximity_enabled = TRUE, updated_at = NOW()
 WHERE id = '00000000-0000-4000-8000-000000000001';  -- 프리미엄
