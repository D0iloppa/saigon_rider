-- 150: 광고 티어 월정액 확정 (2026-07-25)
-- 근거: HCMC 현지 광고비 리서치 — Chợ Tốt Xe 최저 유료(10만 VND/월)·정비소 월광고비 관행(2~3백만) 기준
--       초기 단계 앱 물량 확보 우선. 일반 199,000 / 프리미엄 499,000 (프리미엄 노출 3x, 가격 2.5x — 채택 유도).
-- idempotent: id 고정 UPDATE (149_ads_tiers.sql 시드 뒤 실행 — fresh 볼륨은 149→150 순서로 최종 가격 반영).
UPDATE ad_tiers SET monthly_price_vnd = 199000 WHERE id = '00000000-0000-4000-8000-000000000002';  -- 일반 (weight 1)
UPDATE ad_tiers SET monthly_price_vnd = 499000 WHERE id = '00000000-0000-4000-8000-000000000001';  -- 프리미엄 (weight 3)
