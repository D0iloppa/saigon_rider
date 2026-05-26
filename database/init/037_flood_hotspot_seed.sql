-- =====================================================
-- 037: 침수 핫스팟 초기 시드 (운영팀 큐레이션)
-- =====================================================
-- 배경: flood_hotspot_stats 는 본래 flood_report 집계 결과로 채워지나,
--       서비스 초기 신고 데이터 0건 → 핫스팟 API(/info/flood/hotspots) 가 빈 응답.
--       HCMC 상습 침수 지점(공개 보도 누적: VnExpress / Tuổi Trẻ / Thanh Niên)
--       30개 큐레이션하여 초기 시드 제공. 이후 실신고 누적되면 배치로 갱신.
--
-- 데이터 출처: 사이공/호치민 우기 침수 상습 지점 공개 보도 종합 (2020~2025)
-- 멱등성: 사전에 동일 (district_code, street_name) 조합 존재 여부로 가드 (UNIQUE 제약 없음)

DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM flood_hotspot_stats
  WHERE district_code = 'BINH_THANH' AND street_name = 'Nguyễn Hữu Cảnh'
) THEN

INSERT INTO flood_hotspot_stats
  (district_code, street_name, centroid_lat, centroid_lng,
   flood_count_30d, last_flood_at, avg_depth_level, updated_at)
VALUES
  -- ===== 최악 등급 (legendary) =====
  ('BINH_THANH', 'Nguyễn Hữu Cảnh',    10.7923, 106.7170, 15, NOW() - INTERVAL '2 days',  'knee',  NOW()),
  ('QUAN_8',     'An Dương Vương',     10.7370, 106.6590, 12, NOW() - INTERVAL '4 days',  'thigh', NOW()),
  ('BINH_TAN',   'Kinh Dương Vương',   10.7450, 106.6160, 11, NOW() - INTERVAL '3 days',  'knee',  NOW()),

  -- ===== 상위 (heavy, knee 깊이) =====
  ('THU_DUC',    'Quốc Hương',         10.7990, 106.7370,  9, NOW() - INTERVAL '5 days',  'knee',  NOW()),
  ('THU_DUC',    'Lương Định Của',     10.7950, 106.7480,  9, NOW() - INTERVAL '6 days',  'knee',  NOW()),
  ('THU_DUC',    'Tô Ngọc Vân',        10.8570, 106.7480,  8, NOW() - INTERVAL '5 days',  'knee',  NOW()),
  ('QUAN_7',     'Huỳnh Tấn Phát',     10.7310, 106.7170,  8, NOW() - INTERVAL '7 days',  'knee',  NOW()),
  ('QUAN_7',     'Trần Xuân Soạn',     10.7430, 106.7130,  8, NOW() - INTERVAL '8 days',  'knee',  NOW()),
  ('QUAN_12',    'Nguyễn Văn Quá',     10.8470, 106.6330,  7, NOW() - INTERVAL '6 days',  'knee',  NOW()),
  ('GO_VAP',     'Phan Huy Ích',       10.8350, 106.6420,  7, NOW() - INTERVAL '9 days',  'knee',  NOW()),
  ('PHU_NHUAN',  'Phan Xích Long',     10.7990, 106.6870,  6, NOW() - INTERVAL '10 days', 'knee',  NOW()),

  -- ===== 중간 (moderate, ankle) =====
  ('THU_DUC',    'Trần Não',           10.7910, 106.7360,  6, NOW() - INTERVAL '8 days',  'ankle', NOW()),
  ('THU_DUC',    'Đỗ Xuân Hợp',        10.8350, 106.7870,  5, NOW() - INTERVAL '11 days', 'ankle', NOW()),
  ('THU_DUC',    'Võ Văn Ngân',        10.8500, 106.7700,  5, NOW() - INTERVAL '7 days',  'ankle', NOW()),
  ('THU_DUC',    'Quốc lộ 13',         10.8350, 106.7110,  5, NOW() - INTERVAL '12 days', 'ankle', NOW()),
  ('BINH_TAN',   'Hồ Học Lãm',         10.7380, 106.6170,  5, NOW() - INTERVAL '9 days',  'ankle', NOW()),
  ('BINH_TAN',   'Tỉnh lộ 10',         10.7560, 106.5950,  4, NOW() - INTERVAL '13 days', 'ankle', NOW()),
  ('BINH_TAN',   'Mã Lò',              10.7660, 106.6090,  4, NOW() - INTERVAL '10 days', 'ankle', NOW()),
  ('QUAN_8',     'Phạm Thế Hiển',      10.7380, 106.6730,  4, NOW() - INTERVAL '14 days', 'ankle', NOW()),
  ('QUAN_7',     'Lê Văn Lương',       10.7110, 106.7110,  4, NOW() - INTERVAL '11 days', 'ankle', NOW()),
  ('BINH_TAN',   'Phan Anh',           10.7760, 106.6240,  4, NOW() - INTERVAL '12 days', 'ankle', NOW()),
  ('GO_VAP',     'Lê Đức Thọ',         10.8420, 106.6680,  4, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('BINH_THANH', 'Ung Văn Khiêm',      10.8020, 106.7130,  4, NOW() - INTERVAL '13 days', 'ankle', NOW()),
  ('BINH_THANH', 'Đinh Bộ Lĩnh',       10.8070, 106.7080,  3, NOW() - INTERVAL '14 days', 'ankle', NOW()),
  ('BINH_THANH', 'Bùi Đình Túy',       10.8120, 106.7010,  3, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('QUAN_4',     'Bến Vân Đồn',        10.7620, 106.6960,  3, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('QUAN_1',     'Calmette',           10.7690, 106.6960,  3, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('QUAN_5',     'Nguyễn Văn Cừ',      10.7620, 106.6830,  3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('GO_VAP',     'Cây Trâm',           10.8420, 106.6580,  3, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_BINH',   'Hoàng Hoa Thám',     10.8020, 106.6540,  3, NOW() - INTERVAL '19 days', 'ankle', NOW());

END IF;
END $$;
