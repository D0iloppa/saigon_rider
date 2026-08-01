-- ================================================================
-- 159_wards_seed.sql
-- HCMC 37동 phường 시드 — dev DB(backend/scripts/ward_import.py 로 적재된 데이터)의 스냅샷.
-- N-1: wards를 채우는 INSERT가 database/init/ 에 전무했다 — 신규 배포 시 _ward_map
-- (backend/app/routers/biz.py) 이 빈 dict가 되어 동네지도 ward chip이 영구 미표시되는
-- 결함을 막기 위한 시드. code UNIQUE 로 멱등(ON CONFLICT DO NOTHING) — 재실행 안전.
-- ================================================================

INSERT INTO wards (code, city_code, name_vi, name_en, center_lat, center_lng, sort_order)
VALUES
  ('HCMC_TAN_HUNG', 'HCMC', 'Tân Hưng', 'Tan Hung', 10.73719, 106.70471, 0),
  ('HCMC_TAN_THUAN', 'HCMC', 'Tân Thuận', 'Tan Thuan', 10.75535, 106.73472, 1),
  ('HCMC_AN_KHANH', 'HCMC', 'An Khánh', 'An Khanh', 10.78674, 106.7291, 2),
  ('HCMC_CAU_ONG_LANH', 'HCMC', 'Cầu Ông Lãnh', 'Cau Ong Lanh', 10.7619, 106.68931, 3),
  ('HCMC_BEN_THANH', 'HCMC', 'Bến Thành', 'Ben Thanh', 10.7707, 106.69456, 4),
  ('HCMC_SAI_GON', 'HCMC', 'Sài Gòn', 'Sai Gon', 10.781, 106.70418, 5),
  ('HCMC_TAN_DINH', 'HCMC', 'Tân Định', 'Tan Dinh', 10.79126, 106.69396, 6),
  ('HCMC_NHIEU_LOC', 'HCMC', 'Nhiêu Lộc', 'Nhieu Loc', 10.78554, 106.67609, 7),
  ('HCMC_XUAN_HOA', 'HCMC', 'Xuân Hòa', 'Xuan Hoa', 10.78306, 106.68844, 8),
  ('HCMC_BAN_CO', 'HCMC', 'Bàn Cờ', 'Ban Co', 10.77087, 106.68203, 9),
  ('HCMC_XOM_CHIEU', 'HCMC', 'Xóm Chiếu', 'Xom Chieu', 10.75998, 106.71194, 10),
  ('HCMC_KHANH_HOI', 'HCMC', 'Khánh Hội', 'Khanh Hoi', 10.75918, 106.70404, 11),
  ('HCMC_VINH_HOI', 'HCMC', 'Vĩnh Hội', 'Vinh Hoi', 10.75529, 106.69636, 12),
  ('HCMC_CHO_LON', 'HCMC', 'Chợ Lớn', 'Cho Lon', 10.75324, 106.65909, 13),
  ('HCMC_AN_DONG', 'HCMC', 'An Đông', 'An Dong', 10.75473, 106.67164, 14),
  ('HCMC_CHO_QUAN', 'HCMC', 'Chợ Quán', 'Cho Quan', 10.75738, 106.68074, 15),
  ('HCMC_BINH_TAY', 'HCMC', 'Bình Tây', 'Binh Tay', 10.75084, 106.64502, 16),
  ('HCMC_MINH_PHUNG', 'HCMC', 'Minh Phụng', 'Minh Phung', 10.75764, 106.64897, 17),
  ('HCMC_BINH_THOI', 'HCMC', 'Bình Thới', 'Binh Thoi', 10.76262, 106.64222, 18),
  ('HCMC_HOA_BINH', 'HCMC', 'Hòa Bình', 'Hoa Binh', 10.77016, 106.64532, 19),
  ('HCMC_PHU_THO', 'HCMC', 'Phú Thọ', 'Phu Tho', 10.76749, 106.65439, 20),
  ('HCMC_HOA_HUNG', 'HCMC', 'Hòa Hưng', 'Hoa Hung', 10.77767, 106.66964, 21),
  ('HCMC_VUON_LAI', 'HCMC', 'Vườn Lài', 'Vuon Lai', 10.76667, 106.67386, 22),
  ('HCMC_DIEN_HONG', 'HCMC', 'Diên Hồng', 'Dien Hong', 10.76887, 106.66239, 23),
  ('HCMC_CHANH_HUNG', 'HCMC', 'Chánh Hưng', 'Chanh Hung', 10.74342, 106.67705, 24),
  ('HCMC_BINH_LOI_TRUNG', 'HCMC', 'Bình Lợi Trung', 'Binh Loi Trung', 10.82252, 106.69998, 25),
  ('HCMC_BINH_THANH', 'HCMC', 'Bình Thạnh', 'Binh Thanh', 10.81095, 106.70491, 26),
  ('HCMC_GIA_DINH', 'HCMC', 'Gia Định', 'Gia Dinh', 10.80001, 106.69954, 27),
  ('HCMC_THANH_MY_TAY', 'HCMC', 'Thạnh Mỹ Tây', 'Thanh My Tay', 10.79815, 106.71757, 28),
  ('HCMC_HANH_THONG', 'HCMC', 'Hạnh Thông', 'Hanh Thong', 10.8213, 106.68277, 29),
  ('HCMC_TAN_HOA', 'HCMC', 'Tân Hòa', 'Tan Hoa', 10.78088, 106.65476, 30),
  ('HCMC_TAN_SON_HOA', 'HCMC', 'Tân Sơn Hòa', 'Tan Son Hoa', 10.80602, 106.66613, 31),
  ('HCMC_TAN_SON_NHAT', 'HCMC', 'Tân Sơn Nhất', 'Tan Son Nhat', 10.80069, 106.65811, 32),
  ('HCMC_BAY_HIEN', 'HCMC', 'Bảy Hiền', 'Bay Hien', 10.79289, 106.64868, 33),
  ('HCMC_PHU_NHUAN', 'HCMC', 'Phú Nhuận', 'Phu Nhuan', 10.7941, 106.67395, 34),
  ('HCMC_CAU_KIEU', 'HCMC', 'Cầu Kiệu', 'Cau Kieu', 10.79863, 106.68534, 35),
  ('HCMC_DUC_NHUAN', 'HCMC', 'Đức Nhuận', 'Duc Nhuan', 10.80549, 106.67689, 36)
ON CONFLICT (code) DO NOTHING;
