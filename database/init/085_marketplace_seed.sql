-- ================================================================
-- 085_marketplace_seed.sql
-- 거래 플랫폼 seed — 실제 stock 이미지 매물 3건 (mock 아님, 실데이터)
--   파일: contents/system/marketplace/*.jpg (loremflickr CC 다운로드)
--   판매자 '사이공라이더'가 2건 보유 → 상세페이지 '판매자 다른 매물' 연계 시연
--   고정 UUID 사용 → 재적용 멱등(ON CONFLICT DO NOTHING)
-- ================================================================

-- ── 이미지 contents 등록 ────────────────────────────────────────
INSERT INTO contents (id, owner_type, file_path, mime_type, original_filename) VALUES
    ('c0000000-0000-4000-8000-000000000001', 'system', 'system/marketplace/helmet-1.jpg',  'image/jpeg', 'helmet-1.jpg'),
    ('c0000000-0000-4000-8000-000000000002', 'system', 'system/marketplace/helmet-2.jpg',  'image/jpeg', 'helmet-2.jpg'),
    ('c0000000-0000-4000-8000-000000000003', 'system', 'system/marketplace/tire-1.jpg',    'image/jpeg', 'tire-1.jpg'),
    ('c0000000-0000-4000-8000-000000000004', 'system', 'system/marketplace/scooter-1.jpg', 'image/jpeg', 'scooter-1.jpg'),
    ('c0000000-0000-4000-8000-000000000005', 'system', 'system/marketplace/scooter-2.jpg', 'image/jpeg', 'scooter-2.jpg')
ON CONFLICT (id) DO NOTHING;

-- ── 매물 3건 ────────────────────────────────────────────────────
-- L1 헬멧 (GEAR, 판매중)         — 판매자 사이공라이더
-- L2 타이어 (PARTS, 판매중·네고) — 판매자 Midnight Drifter 361
-- L3 스쿠터 (BIKE, 예약중)       — 판매자 사이공라이더 (다른 매물 연계용)
INSERT INTO marketplace_listings
    (id, seller_id, category_id, title, description, price_vnd, is_negotiable, status, district_id, latitude, longitude, like_count, view_count, bumped_at, created_at)
VALUES
    ('a0000000-0000-4000-8000-000000000001',
     'd80efb02-8a43-4e55-830a-050d7bf4403b',
     (SELECT id FROM marketplace_categories WHERE code = 'GEAR'),
     'Mũ bảo hiểm fullface XR — size L',
     'Mũ fullface XR size L, dùng 6 tháng còn mới 95%. Kính chắn gió trong suốt không trầy. Đã vệ sinh lót trong. Giao dịch tại Bình Thạnh.',
     450000, FALSE, 'ON_SALE', 11, 10.812300, 106.711200, 5, 41, now() - interval '8 minutes',  now() - interval '8 minutes'),

    ('a0000000-0000-4000-8000-000000000002',
     'fdf3a524-4ae1-4e6c-b48a-223488bddf00',
     (SELECT id FROM marketplace_categories WHERE code = 'PARTS'),
     'Lốp Michelin City Grip 90/90-14',
     'Lốp Michelin City Grip size 90/90-14, mới 100% còn nguyên gai. Mua dư không dùng. Có thể trả giá nhẹ.',
     620000, TRUE, 'ON_SALE', 11, 10.815900, 106.715300, 12, 88, now() - interval '32 minutes', now() - interval '32 minutes'),

    ('a0000000-0000-4000-8000-000000000003',
     'd80efb02-8a43-4e55-830a-050d7bf4403b',
     (SELECT id FROM marketplace_categories WHERE code = 'BIKE'),
     'Honda Vision 2021 — 18.000 km',
     'Honda Vision 2021 bản tiêu chuẩn, đi 18.000 km. Máy êm, giấy tờ chính chủ đầy đủ. Đang giữ chỗ cho khách xem xe.',
     24500000, TRUE, 'RESERVED', 11, 10.812300, 106.711200, 28, 305, now() - interval '95 minutes', now() - interval '95 minutes')
ON CONFLICT (id) DO NOTHING;

-- ── 매물 이미지 연결 ────────────────────────────────────────────
INSERT INTO marketplace_listing_images (id, listing_id, content_id, sort_order) VALUES
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 0),
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 1),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003', 0),
    ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000004', 0),
    ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000005', 1)
ON CONFLICT (id) DO NOTHING;
