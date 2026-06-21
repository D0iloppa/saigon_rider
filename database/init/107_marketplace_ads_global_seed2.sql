-- ================================================================
-- 107_marketplace_ads_global_seed2.sql
-- 전역 광고 추가 확충 — HCMC 어디서든(전역) 광고가 충분히 노출되도록 풀 확대.
-- 106 에 이어 전역(district_id NULL) 광고 10개 추가. 라이더 거래 플랫폼 컨셉.
-- ⚠️ 개발용 더미 — 운영 배포 시: DELETE FROM marketplace_ads WHERE partner_name LIKE '[DEV]%';
-- 멱등: partner_name+title 중복 시 건너뜀.
-- ================================================================

INSERT INTO marketplace_ads (partner_name, title, body, image_url, link_url, district_id, phone, address, owner_id, sort_order)
SELECT v.partner, v.title, v.body, v.img, v.link, NULL, v.phone, v.addr, v.owner::uuid, v.so
FROM (VALUES
    ('[DEV] BrakePro', 'Má phanh & dầu phanh', 'Brembo · Nissin — lắp đặt lấy ngay',
     'https://loremflickr.com/360/200/motorcycle,brake?lock=31', 'https://example.com/brakepro',
     '1800-2001', 'Giao + lắp toàn quốc', 'a1000000-0000-0000-0000-000000000002', 12),
    ('[DEV] ChainMaster', 'Nhông sên dĩa cao cấp', 'DID · RK — bảo hành 6 tháng',
     'https://loremflickr.com/360/200/motorcycle,chain?lock=32', 'https://example.com/chainmaster',
     '1800-2002', 'Giao hàng toàn quốc', 'a1000000-0000-0000-0000-000000000003', 13),
    ('[DEV] LightUp Moto', 'Đèn LED tăng sáng', 'Bi cầu · gầm · xi nhan — độ an toàn',
     'https://loremflickr.com/360/200/motorcycle,light?lock=33', 'https://example.com/lightup',
     '1800-2003', 'Showroom + online', 'a1000000-0000-0000-0000-000000000004', 14),
    ('[DEV] RainGear VN', 'Áo mưa bộ rider', 'Chống thấm 100% · gọn nhẹ — freeship',
     'https://loremflickr.com/360/200/raincoat,motorcycle?lock=34', 'https://example.com/raingear',
     '1800-2004', 'Giao hàng toàn quốc', 'a1000000-0000-0000-0000-000000000005', 15),
    ('[DEV] BatteryHub', 'Ắc quy xe máy', 'GS · Yuasa — đổi cũ lấy mới tận nơi',
     'https://loremflickr.com/360/200/battery,motorcycle?lock=35', 'https://example.com/batteryhub',
     '1800-2005', 'Cứu hộ tận nơi TP.HCM', 'a1000000-0000-0000-0000-000000000003', 16),
    ('[DEV] PhoneMount Pro', 'Giá đỡ điện thoại', 'Chống rung · sạc không dây cho rider',
     'https://loremflickr.com/360/200/phone,motorcycle?lock=36', 'https://example.com/phonemount',
     '1800-2006', 'Giao hàng toàn quốc', 'a1000000-0000-0000-0000-000000000004', 17),
    ('[DEV] MotoWash 24h', 'Rửa xe 24/7', 'Combo rửa + dưỡng xích — đặt app giảm 15%',
     'https://loremflickr.com/360/200/motorcycle,wash?lock=37', 'https://example.com/motowash24',
     '1800-2007', 'Chuỗi TP.HCM', 'a1000000-0000-0000-0000-000000000001', 18),
    ('[DEV] RescueMoto', 'Cứu hộ xe máy 24/7', 'Vá lốp · hết xăng · chết máy — đến trong 20 phút',
     'https://loremflickr.com/360/200/motorcycle,road?lock=38', 'https://example.com/rescuemoto',
     '1800-2008', 'Toàn TP.HCM', 'a1000000-0000-0000-0000-000000000005', 19),
    ('[DEV] GloveZone', 'Găng tay & bảo hộ tay', 'Cảm ứng · chống trượt — nhiều size',
     'https://loremflickr.com/360/200/gloves,motorcycle?lock=39', 'https://example.com/glovezone',
     '1800-2009', 'Giao hàng toàn quốc', 'a1000000-0000-0000-0000-000000000002', 20),
    ('[DEV] FuelSave App', 'Tích điểm đổ xăng', 'Quét app tại trạm — hoàn tiền cho rider',
     'https://loremflickr.com/360/200/fuel,station?lock=40', 'https://example.com/fuelsave',
     '1800-2010', 'Trạm liên kết toàn quốc', 'a1000000-0000-0000-0000-000000000001', 21)
) AS v(partner, title, body, img, link, phone, addr, owner, so)
WHERE NOT EXISTS (
    SELECT 1 FROM marketplace_ads a WHERE a.partner_name = v.partner AND a.title = v.title
);
