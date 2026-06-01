-- =====================================================
-- 046 — districts active 정리 + ward 행 center 좌표 backfill
-- 043 에서 ward 29개를 districts 에 흡수했으나
--   (1) ward 행 center_lat/center_lng 미충전
--   (2) 같은 영역을 가리키는 old-Quận 행이 active 상태로 남아 중복
-- 지도 폴리곤 29개 (frontend/src/components/maps/district-data.ts HCMC_DISTRICTS)
-- 를 canonical 셋으로 삼아 active/center 정합화한다.
-- =====================================================

-- 1. ward 단위 행 center 좌표 backfill (district-data.ts gps 와 동일)
UPDATE districts SET center_lat = 11.0000, center_lng = 106.5000 WHERE code = 'CU_CHI'           AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8886, center_lng = 106.5958 WHERE code = 'HOC_MON'          AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7500, center_lng = 106.5500 WHERE code = 'BINH_CHANH'       AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.6900, center_lng = 106.7400 WHERE code = 'NHA_BE'           AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.4144, center_lng = 106.9333 WHERE code = 'CAN_GIO'          AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8611, center_lng = 106.6406 WHERE code = 'TAN_THOI_HIEP'    AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8728, center_lng = 106.6544 WHERE code = 'THOI_AN'          AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8014, center_lng = 106.6531 WHERE code = 'TAN_BINH'         AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8386, center_lng = 106.6664 WHERE code = 'GO_VAP'           AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7703, center_lng = 106.6453 WHERE code = 'HOA_BINH'         AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7744, center_lng = 106.6717 WHERE code = 'HOA_HUNG'         AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8036, center_lng = 106.5914 WHERE code = 'BINH_TAN'         AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8717, center_lng = 106.7717 WHERE code = 'LINH_TRUNG'       AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8800, center_lng = 106.7717 WHERE code = 'LINH_XUAN'        AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.8060, center_lng = 106.7395 WHERE code = 'THAO_DIEN'        AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7519, center_lng = 106.6588 WHERE code = 'CHO_LON'          AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7565, center_lng = 106.6697 WHERE code = 'AN_DONG'          AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7450, center_lng = 106.6758 WHERE code = 'CHANH_HUNG'       AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7660, center_lng = 106.6960 WHERE code = 'NGUYEN_THAI_BINH' AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7625, center_lng = 106.6905 WHERE code = 'CO_GIANG'         AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7680, center_lng = 106.6920 WHERE code = 'PHAM_NGU_LAO'     AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7720, center_lng = 106.6960 WHERE code = 'BEN_THANH'        AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7665, center_lng = 106.7000 WHERE code = 'SAIGON'           AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7780, center_lng = 106.7019 WHERE code = 'BEN_NGHE'         AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7228, center_lng = 106.7178 WHERE code = 'PHU_MY'           AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7261, center_lng = 106.7228 WHERE code = 'TAN_MY'           AND center_lat IS NULL;
UPDATE districts SET center_lat = 10.7550, center_lng = 106.7364 WHERE code = 'TAN_THUAN'        AND center_lat IS NULL;

-- 2. 지도 폴리곤 29개 active 보장
UPDATE districts SET is_active = TRUE WHERE code IN (
    'CU_CHI','HOC_MON','BINH_CHANH','NHA_BE','CAN_GIO',
    'TAN_THOI_HIEP','THOI_AN',
    'TAN_BINH','GO_VAP','HOA_BINH','HOA_HUNG','BINH_TAN',
    'THU_DUC','LINH_TRUNG','LINH_XUAN','THAO_DIEN','BINH_THANH',
    'PHU_MY','TAN_MY','TAN_THUAN',
    'CHO_LON','AN_DONG','CHANH_HUNG',
    'NGUYEN_THAI_BINH','CO_GIANG','PHAM_NGU_LAO','BEN_THANH','SAIGON','BEN_NGHE'
);

-- 3. 지도에 없는 old-Quận / PHU_NHUAN / TAN_PHU 행은 inactive
--    (FK 보존 위해 삭제하지 않음 — 과거 quests/feed 가 참조 가능)
UPDATE districts SET is_active = FALSE WHERE code IN (
    'QUAN_1','QUAN_3','QUAN_4','QUAN_5','QUAN_6','QUAN_7','QUAN_8',
    'QUAN_10','QUAN_11','QUAN_12',
    'PHU_NHUAN','TAN_PHU'
);
