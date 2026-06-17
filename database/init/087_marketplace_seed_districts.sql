-- ================================================================
-- 087_marketplace_seed_districts.sql
-- 거래 플랫폼 seed 확장 — 여러 구에 매물 분산(거리순 정렬 시연용)
--   Quận 1 / Thủ Đức / Phú Nhuận / Gò Vấp / Quận 7 / Bình Thạnh
--   고정 UUID → 멱등
-- ================================================================

INSERT INTO contents (id, owner_type, file_path, mime_type, original_filename) VALUES
    ('c0000000-0000-4000-8000-000000000006', 'system', 'system/marketplace/brake-1.jpg',   'image/jpeg', 'brake-1.jpg'),
    ('c0000000-0000-4000-8000-000000000007', 'system', 'system/marketplace/mirror-1.jpg',  'image/jpeg', 'mirror-1.jpg'),
    ('c0000000-0000-4000-8000-000000000008', 'system', 'system/marketplace/gloves-1.jpg',  'image/jpeg', 'gloves-1.jpg'),
    ('c0000000-0000-4000-8000-000000000009', 'system', 'system/marketplace/battery-1.jpg', 'image/jpeg', 'battery-1.jpg'),
    ('c0000000-0000-4000-8000-00000000000a', 'system', 'system/marketplace/exhaust-1.jpg', 'image/jpeg', 'exhaust-1.jpg'),
    ('c0000000-0000-4000-8000-00000000000b', 'system', 'system/marketplace/seat-1.jpg',    'image/jpeg', 'seat-1.jpg')
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace_listings
    (id, seller_id, category_id, title, description, price_vnd, is_negotiable, status, district_id, latitude, longitude, like_count, view_count, bumped_at, created_at)
VALUES
    ('a0000000-0000-4000-8000-000000000004', 'a4681186-a8b6-4914-8f89-9552e277794f',
     (SELECT id FROM marketplace_categories WHERE code='PARTS'),
     'Má phanh Brembo (mới)', 'Má phanh Brembo còn mới, mua nhầm đời xe. Quận 1.',
     280000, FALSE, 'ON_SALE', 1, 10.781660, 106.697520, 3, 22, now() - interval '15 minutes', now() - interval '15 minutes'),

    ('a0000000-0000-4000-8000-000000000005', 'b2cb995b-b158-4e87-b609-7a0a580bd489',
     (SELECT id FROM marketplace_categories WHERE code='ACCESSORY'),
     'Bộ gương chiếu hậu CNC', 'Gương CNC nhôm, lắp vừa nhiều dòng xe. Thủ Đức.',
     150000, FALSE, 'ON_SALE', 17, 10.839170, 106.756730, 6, 47, now() - interval '47 minutes', now() - interval '47 minutes'),

    ('a0000000-0000-4000-8000-000000000006', '119b1a3c-4b54-4cd7-9efe-802185113d7e',
     (SELECT id FROM marketplace_categories WHERE code='GEAR'),
     'Găng tay da đi phượt — size M', 'Găng tay da thật, bảo vệ khớp. Đi vài lần. Phú Nhuận.',
     220000, TRUE, 'ON_SALE', 14, 10.796620, 106.678600, 9, 61, now() - interval '70 minutes', now() - interval '70 minutes'),

    ('a0000000-0000-4000-8000-000000000007', 'a4681186-a8b6-4914-8f89-9552e277794f',
     (SELECT id FROM marketplace_categories WHERE code='PARTS'),
     'Bình ắc quy GS khô 12V', 'Ắc quy GS còn bảo hành. Gò Vấp.',
     540000, FALSE, 'ON_SALE', 13, 10.837950, 106.668280, 4, 33, now() - interval '120 minutes', now() - interval '120 minutes'),

    ('a0000000-0000-4000-8000-000000000008', 'fdf3a524-4ae1-4e6c-b48a-223488bddf00',
     (SELECT id FROM marketplace_categories WHERE code='PARTS'),
     'Pô độ Akrapovic (thanh lý)', 'Pô độ inox, âm thanh chuẩn. Có thể trả giá. Quận 7.',
     1800000, TRUE, 'ON_SALE', 6, 10.735640, 106.723860, 17, 142, now() - interval '180 minutes', now() - interval '180 minutes'),

    ('a0000000-0000-4000-8000-000000000009', '119b1a3c-4b54-4cd7-9efe-802185113d7e',
     (SELECT id FROM marketplace_categories WHERE code='ACCESSORY'),
     'Bọc yên xe chống nóng', 'Bọc yên da chống nóng, đã bán. Bình Thạnh.',
     90000, FALSE, 'SOLD', 11, 10.813780, 106.713660, 2, 70, now() - interval '300 minutes', now() - interval '300 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace_listing_images (id, listing_id, content_id, sort_order) VALUES
    ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000006', 0),
    ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000007', 0),
    ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000008', 0),
    ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000009', 0),
    ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-00000000000a', 0),
    ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-00000000000b', 0)
ON CONFLICT (id) DO NOTHING;
