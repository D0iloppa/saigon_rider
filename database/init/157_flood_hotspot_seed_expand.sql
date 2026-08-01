-- =====================================================
-- 157: 침수 핫스팟 확장 시드 (97건)
-- =====================================================
-- 출처: 호치민시 건설국/기술인프라관리센터 발표 목록 재게재 자료 + Thanh Niên 조석침수 목록
--       + Tuổi Trẻ 보도 종합 (리서치 워커 산출 후보 JSON, source_url 개별 보유).
-- 생성일: 2026-07-31
-- 생성 방법: python3 backend/scripts/geocode_flood_hotspots.py --input <candidates.json>
--           (Nominatim 지오코딩 + G1/G2'/G3/G4/G5 게이트 검증, 감독 리뷰 후 확정)
-- 멱등성: 037과 동일 패턴 — 이 배치의 첫 행 (district_code, street_name) 존재 여부로 가드
--         (flood_hotspot_stats 에 UNIQUE 제약 없음)
--
-- 폴리곤 커버리지: 이 시드의 59건은 saigon-depth1.json(37 ward, 중심부 bbox)
--   밖이라 현재 침수지도에 ward 배지가 표시되지 않는다. 리스트·통계에는 반영되며,
--   지도 지오메트리 확장 시 자동으로 표시된다. (폴리곤 안 38건 / 밖 59건)
-- 좌표 신뢰도: 행 끝 `-- s4` 는 전략4(district_vi 제외 자유질의 + 참조좌표 8km 검증)로
--   지오코딩된 건, `-- s4 unverified` 는 그 중 구 참조좌표가 없어 근접성 검증 자체를 못 한
--   건(신뢰도 최저) — 표시 없는 행은 전략 1~3(구조화/랜드마크/자유질의, district_vi 포함).

DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM flood_hotspot_stats
  WHERE district_code = 'QUAN_1' AND street_name = 'Nguyễn Thái Bình'
) THEN

INSERT INTO flood_hotspot_stats
  (district_code, street_name, centroid_lat, centroid_lng,
   flood_count_30d, last_flood_at, avg_depth_level, updated_at)
VALUES
  -- ===== 폴리곤 안 (지도 배지 표시됨) =====
  ('QUAN_1', 'Nguyễn Thái Bình', 10.7680307, 106.6984344, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),  -- s4
  ('QUAN_1', 'Cô Giang', 10.7618339, 106.6950654, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('QUAN_1', 'Hồ Hảo Hớn', 10.7612619, 106.6923711, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('QUAN_1', 'Bùi Viện', 10.7675944, 106.6943597, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),  -- s4
  ('QUAN_1', 'Trần Hưng Đạo', 10.7652308, 106.6926763, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('QUAN_1', 'Ký Con', 10.7682669, 106.6974356, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),  -- s4
  ('QUAN_1', 'Nam Kỳ Khởi Nghĩa', 10.7842739, 106.6899949, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),  -- s4
  ('QUAN_1', 'Lê Lai', 10.7619589, 106.6764718, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('QUAN_1', 'Phạm Ngũ Lão', 10.7681060, 106.6918852, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),  -- s4
  ('QUAN_1', 'Lê Lợi', 10.7803088, 106.7054885, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('QUAN_4', 'Đoàn Văn Bơ', 10.7643293, 106.7023685, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),  -- s4
  ('QUAN_4', 'Vĩnh Khánh', 10.7618392, 106.7020591, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('QUAN_4', 'Hoàng Diệu', 10.7599588, 106.6990241, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),  -- s4
  ('QUAN_4', 'Tôn Thất Thuyết', 10.7531941, 106.7041046, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),  -- s4
  ('QUAN_4', 'Nguyễn Tất Thành', 10.7661710, 106.7067745, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),  -- s4
  ('QUAN_5', 'Dương Tử Giang', 10.7578888, 106.6544521, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('QUAN_5', 'Trần Hưng Đạo', 10.7541798, 106.6782092, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('QUAN_5', 'Nguyễn Biểu', 10.7545301, 106.6845616, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('QUAN_6', 'An Dương Vương', 10.7595777, 106.6793622, 7, NOW() - INTERVAL '14 days', 'ankle', NOW()),  -- s4 unverified
  ('QUAN_6', 'Mai Xuân Thưởng', 10.8154556, 106.6942973, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),  -- s4 unverified
  ('QUAN_6', 'Lê Quang Sung', 10.7515768, 106.6452106, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4 unverified
  ('QUAN_6', 'Bình Tiên', 10.7475076, 106.6421181, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('QUAN_10', 'Trần Nhân Tông', 10.7628665, 106.6747232, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),  -- s4 unverified
  ('QUAN_11', 'Hòa Bình', 10.7685039, 106.6396287, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('QUAN_11', 'Hồng Bàng', 10.7541446, 106.6378971, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('QUAN_11', 'Tôn Thất Hiệp', 10.7614924, 106.6523629, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('QUAN_11', 'Lãnh Binh Thăng', 10.7632054, 106.6498650, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('QUAN_11', 'Tuệ Tĩnh', 10.7639123, 106.6540711, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('QUAN_11', 'Nguyễn Chí Thanh', 10.7565654, 106.6477840, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('BINH_THANH', 'Xô Viết Nghệ Tĩnh', 10.8137564, 106.7166429, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('BINH_THANH', 'Phan Đăng Lưu', 10.8025629, 106.6975723, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('BINH_THANH', 'Bạch Đằng', 10.8033087, 106.7056460, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('PHU_NHUAN', 'Phan Đình Phùng', 10.7950089, 106.6829704, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('TAN_BINH', 'Bạch Đằng', 10.8161806, 106.6696963, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('THU_DUC', 'Thảo Điền', 10.8060262, 106.7354431, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('THU_DUC', 'Nguyễn Văn Hưởng', 10.8163168, 106.7281416, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('THU_DUC', 'Phạm Văn Đồng', 10.8210436, 106.6962380, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('THU_DUC', 'Mai Chí Thọ', 10.7846143, 106.7444089, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  -- ===== 폴리곤 밖 (지도 배지 미표시 — 리스트/통계만 반영) =====
  ('QUAN_6', 'Phạm Phú Thứ', 10.7368962, 106.6351869, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('QUAN_7', 'Nguyễn Thị Thập', 10.7372002, 106.7255023, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('QUAN_7', 'Nguyễn Văn Linh', 10.7348194, 106.7212359, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),  -- s4
  ('QUAN_7', 'Phú Thuận', 10.7323681, 106.7346706, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('QUAN_7', 'Nguyễn Lương Bằng', 10.7343788, 106.7183590, 6, NOW() - INTERVAL '15 days', 'knee', NOW()),  -- s4
  ('QUAN_7', 'Hoàng Quốc Việt', 10.7136731, 106.7342324, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),  -- s4
  ('QUAN_7', 'Đường 15B', 10.7164039, 106.7346196, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('QUAN_8', 'Bến Phú Định', 10.7317426, 106.6334435, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('QUAN_8', 'Đường số 41', 10.8562479, 106.7647731, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('QUAN_10', '3 Tháng 2', 10.5483855, 107.0773853, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),  -- s4 unverified
  ('QUAN_12', 'Quốc lộ 1A', 10.8624119, 106.6582383, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),  -- s4
  ('QUAN_12', 'Phan Văn Hớn', 10.8412212, 106.5978423, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4
  ('QUAN_12', 'DN5', 10.8611305, 106.6541962, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('QUAN_12', 'Song Hành Quốc lộ 22', 10.8515067, 106.6135893, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),  -- s4
  ('GO_VAP', 'Nguyễn Văn Khối', 10.8436287, 106.6490630, 9, NOW() - INTERVAL '12 days', 'ankle', NOW()),  -- s4
  ('GO_VAP', 'Phạm Văn Chiêu', 10.8511314, 106.6534393, 8, NOW() - INTERVAL '13 days', 'ankle', NOW()),
  ('GO_VAP', 'Lê Văn Thọ', 10.8524768, 106.6597484, 8, NOW() - INTERVAL '13 days', 'ankle', NOW()),
  ('GO_VAP', 'Quang Trung', 10.8314142, 106.6685215, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('GO_VAP', 'Nguyễn Văn Thọ', 10.7934225, 106.6332052, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),  -- s4
  ('BINH_THANH', 'Bình Quới', 10.8234195, 106.7320191, 7, NOW() - INTERVAL '14 days', 'ankle', NOW()),
  ('BINH_THANH', 'D2', 10.8366380, 106.8093728, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('BINH_THANH', 'D1', 10.8337959, 106.8171562, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('BINH_THANH', 'Nguyễn Gia Trí', 10.7761189, 106.6144723, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('BINH_THANH', 'Điện Biên Phủ', 11.0183046, 106.6892568, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_BINH', 'Trương Công Định', 10.7962088, 106.6410304, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_BINH', 'Âu Cơ', 10.7987219, 106.6374728, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_BINH', 'Đồng Đen', 10.7880048, 106.6430941, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_BINH', 'Nguyễn Hồng Đào', 10.7952851, 106.6429178, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('TAN_BINH', 'Bàu Cát', 10.7926329, 106.6421017, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('TAN_BINH', 'Trần Đại Nghĩa', 10.7374472, 106.5529489, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_BINH', 'Lê Văn Quới', 10.7753504, 106.6163694, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),  -- s4
  ('TAN_BINH', 'Khuông Việt', 10.7706459, 106.6394961, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('TAN_PHU', 'Phan Anh', 10.7633619, 106.6249515, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_PHU', 'Trương Vĩnh Ký', 10.7938221, 106.6335573, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_PHU', 'Gò Dầu', 10.7958396, 106.6267150, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('TAN_PHU', 'Tân Quý', 10.7929158, 106.6205698, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),  -- s4
  ('TAN_PHU', 'Lũy Bán Bích', 10.7761470, 106.6337783, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('BINH_TAN', 'Võ Văn Kiệt', 11.0422162, 106.6902651, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('THU_DUC', 'Nguyễn Duy Trinh', 10.7876232, 106.7652159, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('THU_DUC', 'Đặng Thị Rành', 10.8506878, 106.7532413, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('THU_DUC', 'Hồ Văn Tư', 10.8498466, 106.7551018, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('THU_DUC', 'Kha Vạn Cân', 10.8452306, 106.7499585, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('THU_DUC', 'Dương Văn Cam', 10.8507362, 106.7521532, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('THU_DUC', 'Lê Văn Việt', 10.8447348, 106.7917605, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('THU_DUC', 'Xa lộ Hà Nội', 10.8530826, 106.7792277, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('THU_DUC', 'Tỉnh lộ 43', 10.8719022, 106.7325576, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('THU_DUC', 'Gò Dưa', 10.8673059, 106.7298920, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('THU_DUC', 'Lê Văn Tách', 10.8524288, 106.7509673, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('THU_DUC', 'Đường 38', 10.7522595, 106.6306705, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('THU_DUC', 'Võ Nguyên Giáp', 10.8031515, 106.7500459, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('THU_DUC', 'Quốc lộ 1', 10.8691921, 106.8060162, 4, NOW() - INTERVAL '17 days', 'ankle', NOW()),
  ('NHA_BE', 'Đào Sư Tích', 10.7018352, 106.6870006, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),  -- s4 unverified
  ('NHA_BE', 'Phạm Hữu Lầu', 10.7043333, 106.7306394, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('NHA_BE', 'Nguyễn Bình', 10.6757288, 106.7428666, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('NHA_BE', 'Huỳnh Tấn Phát', 10.7266521, 106.7336294, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('NHA_BE', 'Lê Văn Lương', 10.7080046, 106.7029164, 5, NOW() - INTERVAL '16 days', 'ankle', NOW()),
  ('BINH_CHANH', 'Quốc lộ 1A', 10.6596667, 106.5618582, 6, NOW() - INTERVAL '15 days', 'ankle', NOW()),
  ('HOC_MON', 'Bà Triệu', 10.8847909, 106.5950533, 3, NOW() - INTERVAL '18 days', 'ankle', NOW()),
  ('HOC_MON', 'Song Hành', 10.8688683, 106.6002657, 3, NOW() - INTERVAL '18 days', 'ankle', NOW());

END IF;
END $$;
