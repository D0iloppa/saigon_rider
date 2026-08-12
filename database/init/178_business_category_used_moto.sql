-- ================================================================
-- 178_business_category_used_moto.sql
-- 업체 카테고리 추가: 중고 오토바이 판매점 (SHOPPING 그룹)
--   필드에이전트 명단(396곳)에 담을 카테고리 코드 부재 갭 해소 (D-17).
-- ================================================================

-- ── 시드 1종 추가 (ON CONFLICT DO NOTHING — 재실행 안전) ─────────
INSERT INTO business_category
    (code, group_code, group_label_ko, group_label_vi, group_label_en, group_sort_order,
     icon, label_ko, label_vi, label_en, sort_order)
VALUES
    ('used_moto', 'SHOPPING', '구매·장비', 'Mua sắm & đồ nghề', 'Shopping & gear', 2, 'used_moto', '중고 오토바이', 'Xe máy cũ', 'Used motorbike', 4)
ON CONFLICT (code) DO NOTHING;
