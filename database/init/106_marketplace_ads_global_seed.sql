-- ================================================================
-- 106_marketplace_ads_global_seed.sql
-- 전역 광고 풀 확충 — 기존 전역 광고가 2개뿐이라 지역 타겟 없는 화면/구에서 노출 빈약.
-- 라이더 거래 플랫폼 컨셉(부품·용품·정비·보험·주유). district_id NULL = 전역(어디서나 노출).
-- ⚠️ 개발용 더미 — 운영 배포 시: DELETE FROM marketplace_ads WHERE partner_name LIKE '[DEV]%';
-- 멱등: partner_name+title 중복 시 건너뜀(유니크 제약 없으므로 NOT EXISTS 가드).
-- ================================================================

INSERT INTO marketplace_ads (partner_name, title, body, image_url, link_url, district_id, phone, address, owner_id, sort_order)
SELECT v.partner, v.title, v.body, v.img, v.link, NULL, v.phone, v.addr, v.owner::uuid, v.so
FROM (VALUES
    ('[DEV] Saigon Rider Shop', 'Đồ bảo hộ chính hãng', 'Giáp · găng tay · áo mưa — giao toàn quốc',
     'https://loremflickr.com/360/200/motorcycle,gear?lock=21', 'https://example.com/sgr-gear',
     '1800-0005', 'Giao hàng toàn quốc', 'a1000000-0000-0000-0000-000000000005', 2),
    ('[DEV] MotoParts VN', 'Phụ tùng OEM giá sỉ', 'Nhông sên dĩa · phuộc · lốp — chính hãng',
     'https://loremflickr.com/360/200/motorcycle,parts?lock=22', 'https://example.com/motoparts',
     '1800-1001', 'Giao hàng toàn quốc', 'a1000000-0000-0000-0000-000000000002', 3),
    ('[DEV] OilPro Express', 'Thay nhớt tận nơi', 'Đặt lịch online · thợ đến tận nhà trong 30 phút',
     'https://loremflickr.com/360/200/motorcycle,oil?lock=23', 'https://example.com/oilpro',
     '1800-1002', 'Dịch vụ tận nơi TP.HCM', 'a1000000-0000-0000-0000-000000000003', 4),
    ('[DEV] HelmetHub', 'Mũ bảo hiểm fullface', 'Bảo hành 12 tháng · freeship đơn từ 500k',
     'https://loremflickr.com/360/200/helmet?lock=24', 'https://example.com/helmethub',
     '1800-1003', 'Giao hàng toàn quốc', 'a1000000-0000-0000-0000-000000000004', 5),
    ('[DEV] RiderCare Bảo hiểm', 'Bảo hiểm xe máy 5 phút', 'Đăng ký online · bồi thường nhanh',
     'https://loremflickr.com/360/200/motorcycle,road?lock=25', 'https://example.com/ridercare',
     '1800-1004', 'Trực tuyến toàn quốc', 'a1000000-0000-0000-0000-000000000005', 6),
    ('[DEV] TireZone', 'Lốp xe máy chính hãng', 'Michelin · IRC · Dunlop — lắp đặt miễn phí',
     'https://loremflickr.com/360/200/motorcycle,tire?lock=26', 'https://example.com/tirezone',
     '1800-1005', 'Giao + lắp tận nơi', 'a1000000-0000-0000-0000-000000000002', 7),
    ('[DEV] EV Scooter Center', 'Xe máy điện trả góp 0%', 'Đổi xe cũ lấy xe điện · ưu đãi rider',
     'https://loremflickr.com/360/200/electric,scooter?lock=27', 'https://example.com/ev-scooter',
     '1800-1006', 'Showroom toàn quốc', 'a1000000-0000-0000-0000-000000000004', 8),
    ('[DEV] WashGo Rửa xe', 'Rửa xe + dưỡng bóng', 'Combo chăm sóc xe máy chỉ từ 50k',
     'https://loremflickr.com/360/200/motorcycle,clean?lock=28', 'https://example.com/washgo',
     '1800-1007', 'Chuỗi cửa hàng TP.HCM', 'a1000000-0000-0000-0000-000000000001', 9),
    ('[DEV] GearUp Phụ kiện', 'Phụ kiện độ xe', 'Đèn LED · baga · điện thoại holder',
     'https://loremflickr.com/360/200/motorcycle,accessory?lock=29', 'https://example.com/gearup',
     '1800-1008', 'Giao hàng toàn quốc', 'a1000000-0000-0000-0000-000000000003', 10),
    ('[DEV] Rider Coffee Stop', 'Cà phê rider giảm 20%', 'Xuất trình app — ưu đãi cho biker',
     'https://loremflickr.com/360/200/coffee,motorcycle?lock=30', 'https://example.com/ridercoffee',
     '1800-1009', 'Chuỗi quán TP.HCM', 'a1000000-0000-0000-0000-000000000001', 11)
) AS v(partner, title, body, img, link, phone, addr, owner, so)
WHERE NOT EXISTS (
    SELECT 1 FROM marketplace_ads a WHERE a.partner_name = v.partner AND a.title = v.title
);
