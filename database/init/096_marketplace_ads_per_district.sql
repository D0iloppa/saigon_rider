-- ================================================================
-- 096_marketplace_ads_per_district.sql  (SGR-302)
-- 개발용 제휴광고 재시드: 지역별 2개씩 + 전역 2개.
--   · QUAN_5 는 매물이 없는 구 → "상품 없어도 광고 노출" 확인용.
-- ⚠️ 개발용. 운영 배포 시: DELETE FROM marketplace_ads WHERE partner_name LIKE '[DEV]%';
-- 멱등: 기존 [DEV] 광고 제거 후 재삽입.
-- ================================================================

DELETE FROM marketplace_ads WHERE partner_name LIKE '[DEV]%';

-- 지역별 2개씩 (district code 로 매핑)
INSERT INTO marketplace_ads (partner_name, title, body, image_url, link_url, district_id, sort_order)
SELECT v.partner, v.title, v.body, v.img, NULL, d.id, v.so
FROM (VALUES
    ('[DEV] Bình Thạnh Moto Care', 'Bảo dưỡng xe máy -30%',   'Thay nhớt · vệ sinh kim phun',     'https://loremflickr.com/360/200/motorcycle,repair?lock=21', 'BINH_THANH', 1),
    ('[DEV] Bình Thạnh Helmet',    'Mũ bảo hiểm chính hãng',   'Fullface · 3/4 · bảo hành',        'https://loremflickr.com/360/200/helmet?lock=22',            'BINH_THANH', 2),
    ('[DEV] Quận 1 Parts Hub',     'Phụ tùng giá sỉ',          'Lốp · nhông sên dĩa · OEM',        'https://loremflickr.com/360/200/motorcycle,parts?lock=23',  'QUAN_1', 1),
    ('[DEV] Quận 1 Gear Shop',     'Đồ bảo hộ rider',          'Giáp · găng tay · áo mưa',         'https://loremflickr.com/360/200/motorcycle,gear?lock=24',   'QUAN_1', 2),
    ('[DEV] Thủ Đức Tire Center',  'Lốp xe máy mọi loại',      'Michelin · IRC · lắp tận nơi',     'https://loremflickr.com/360/200/tire?lock=25',              'THU_DUC', 1),
    ('[DEV] Thủ Đức Oil Express',  'Thay nhớt nhanh',          'Castrol · Motul · 10 phút',        'https://loremflickr.com/360/200/motoroil?lock=26',          'THU_DUC', 2),
    ('[DEV] Quận 7 Scooter Mart',  'Xe tay ga thanh lý',       'Vision · Vario · trả góp',         'https://loremflickr.com/360/200/scooter?lock=27',           'QUAN_7', 1),
    ('[DEV] Quận 7 Accessory',     'Phụ kiện độ xe',           'Đèn · gương · baga',               'https://loremflickr.com/360/200/motorcycle,accessory?lock=28','QUAN_7', 2),
    ('[DEV] Quận 5 Repair Pro',    'Sửa xe uy tín Quận 5',     'Thợ lành nghề · giá tốt',          'https://loremflickr.com/360/200/mechanic?lock=29',          'QUAN_5', 1),
    ('[DEV] Quận 5 Battery King',  'Ắc quy chính hãng',        'GS · Yuasa · bảo hành 12 tháng',   'https://loremflickr.com/360/200/battery?lock=30',           'QUAN_5', 2)
) AS v(partner, title, body, img, code, so)
JOIN districts d ON d.code = v.code;

-- 전역 광고 2개 (district NULL)
INSERT INTO marketplace_ads (partner_name, title, body, image_url, link_url, district_id, sort_order)
VALUES
    ('[DEV] Saigon Rider Shop',  'Đồ bảo hộ chính hãng',   'Giao toàn quốc · giảm 20%',  'https://loremflickr.com/360/200/motorcycle,gear?lock=31', NULL, NULL, 1),
    ('[DEV] Rider Insurance',    'Bảo hiểm xe máy 1 phút',  'Mua online · bồi thường nhanh', 'https://loremflickr.com/360/200/insurance?lock=32', NULL, NULL, 2);
