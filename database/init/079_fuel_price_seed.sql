-- =====================================================
-- 079: 표준유가 시드 (MOIT/Petrolimex 권역 Vùng1, 2026-06-04 15:00 ICT 조정)
--   전국 규제가. 자동 스크래퍼/관리자 upsert 가 이후 supersede. 초기/재현 상태용.
-- =====================================================

INSERT INTO fuel_price_snapshot
  (effective_date, effective_time, region, brand, fuel_type, price_vnd, source, raw_fetched_at, status)
VALUES
  ('2026-06-04','2026-06-04 15:00:00+07','VUNG_1','PETROLIMEX','RON95_III',  22330,'manual:moit-2026-06-04',now(),'ACTIVE'),
  ('2026-06-04','2026-06-04 15:00:00+07','VUNG_1','PETROLIMEX','RON95_V',    23230,'manual:moit-2026-06-04',now(),'ACTIVE'),
  ('2026-06-04','2026-06-04 15:00:00+07','VUNG_1','PETROLIMEX','E5_RON92_II',21784,'manual:moit-2026-06-04',now(),'ACTIVE'),
  ('2026-06-04','2026-06-04 15:00:00+07','VUNG_1','PETROLIMEX','DO_005S_II', 26866,'manual:moit-2026-06-04',now(),'ACTIVE')
ON CONFLICT (effective_date, region, brand, fuel_type, source)
DO UPDATE SET price_vnd=EXCLUDED.price_vnd, status='ACTIVE';
