-- ================================================================
-- 095_marketplace_ads.sql  (SGR-302)
-- 가맹점 제휴 광고 (애드센스 ❌). 피드 중간 네이티브 광고로 노출.
--   · 매물 테이블과 분리(피드 쿼리 오염 방지).
--   · 지역 타게팅(district_id NULL = 전역), 활성기간, 노출순서.
--   · 클릭 = 외부 링크(link_url). 이미지는 seed 편의로 image_url 직접 사용.
-- ⚠️ 개발용 더미 seed 포함 — 운영 배포 시 seed 광고 제거.
-- ================================================================

CREATE TABLE IF NOT EXISTS marketplace_ads (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name VARCHAR(80)  NOT NULL,
    title        VARCHAR(120) NOT NULL,
    body         VARCHAR(160),
    image_url    TEXT,
    link_url     TEXT,
    district_id  SMALLINT REFERENCES districts(id) ON DELETE SET NULL,  -- NULL = 전역
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    starts_at    TIMESTAMPTZ,
    ends_at      TIMESTAMPTZ,
    sort_order   SMALLINT    NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_ads_active ON marketplace_ads (is_active, district_id, sort_order);

-- ── 개발용 더미 광고 seed (지역별 + 전역) ─────────────────────
-- 운영 배포 시 DELETE FROM marketplace_ads WHERE partner_name LIKE '[DEV]%';
INSERT INTO marketplace_ads (partner_name, title, body, image_url, link_url, district_id, sort_order)
SELECT v.partner, v.title, v.body, v.img, v.link, d.id, v.so
FROM (VALUES
    ('[DEV] Bình Thạnh Moto Care', 'Bảo dưỡng xe máy -30%', 'Thay nhớt · vệ sinh kim phun · ưu đãi rider',
     'https://loremflickr.com/360/200/motorcycle,repair?lock=11', 'https://example.com/binhthanh-moto', 'BINH_THANH', 1),
    ('[DEV] Quận 1 Helmet Store', 'Mũ bảo hiểm chính hãng', 'Fullface · 3/4 · bảo hành 12 tháng',
     'https://loremflickr.com/360/200/helmet,motorcycle?lock=12', 'https://example.com/q1-helmet', 'QUAN_1', 1),
    ('[DEV] Thủ Đức Parts Hub', 'Phụ tùng xe máy giá sỉ', 'Lốp · nhông sên dĩa · phụ tùng OEM',
     'https://loremflickr.com/360/200/motorcycle,parts?lock=13', 'https://example.com/thuduc-parts', 'THU_DUC', 1)
) AS v(partner, title, body, img, link, code, so)
JOIN districts d ON d.code = v.code
ON CONFLICT DO NOTHING;

-- 전역 광고(지역 무관)
INSERT INTO marketplace_ads (partner_name, title, body, image_url, link_url, district_id, sort_order)
VALUES
    ('[DEV] Saigon Rider Shop', 'Đồ bảo hộ chính hãng toàn quốc', 'Giáp · găng tay · áo mưa — giao tận nơi',
     'https://loremflickr.com/360/200/motorcycle,gear?lock=14', 'https://example.com/sgr-shop', NULL, 1)
ON CONFLICT DO NOTHING;
