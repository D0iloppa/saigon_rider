-- ================================================================
-- 084_marketplace.sql
-- 오토바이 라이더 거래 플랫폼 (SGR-287) — 도메인 스키마
--   · marketplace_categories : 품목 종류 (master-data, i18n, admin-editable)
--   · marketplace_listings   : 매물 (판매중/예약중/거래완료 상태)
--   · marketplace_listing_images : 매물 사진 (contents 중개, feed_post_images 패턴)
-- ================================================================

-- ── 품목 카테고리 (master) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_categories (
    id          SMALLSERIAL  PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL UNIQUE,
    name_ko     VARCHAR(100) NOT NULL,
    name_vi     VARCHAR(100) NOT NULL,
    name_en     VARCHAR(100) NOT NULL,
    icon        VARCHAR(10),
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- §4 오토바이 버티컬 카테고리
INSERT INTO marketplace_categories (code, name_ko, name_vi, name_en, icon, sort_order) VALUES
    ('PARTS',     '부품',         'Phụ tùng',  'Parts',       '🔧', 1),
    ('GEAR',      '용품·보호구',  'Đồ bảo hộ', 'Gear',        '🪖', 2),
    ('ACCESSORY', '액세서리',     'Phụ kiện',  'Accessories', '📱', 3),
    ('BIKE',      '중고 오토바이','Xe cũ',     'Used bikes',  '🛵', 4)
ON CONFLICT (code) DO NOTHING;

-- ── 매물 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id   SMALLINT REFERENCES marketplace_categories(id) ON DELETE SET NULL,
    title         VARCHAR(120) NOT NULL,
    description   TEXT,
    price_vnd     BIGINT NOT NULL DEFAULT 0,            -- 0 = 나눔
    is_negotiable BOOLEAN NOT NULL DEFAULT FALSE,       -- 가격 제안받기
    status        VARCHAR(20) NOT NULL DEFAULT 'ON_SALE'
                    CHECK (status IN ('ON_SALE', 'RESERVED', 'SOLD')),
    district_id   SMALLINT REFERENCES districts(id) ON DELETE SET NULL,
    latitude      NUMERIC(9, 6),
    longitude     NUMERIC(9, 6),
    like_count    INTEGER NOT NULL DEFAULT 0,
    view_count    INTEGER NOT NULL DEFAULT 0,
    bumped_at     TIMESTAMPTZ NOT NULL DEFAULT now(),   -- 끌올 신선도 (정렬 기준)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_listings_status_bumped ON marketplace_listings (status, bumped_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_listings_seller        ON marketplace_listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_mp_listings_category      ON marketplace_listings (category_id);

-- ── 매물 이미지 (contents 중개, feed_post_images 동일 패턴) ──────
CREATE TABLE IF NOT EXISTS marketplace_listing_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    content_id  UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_listing_images_listing ON marketplace_listing_images (listing_id, sort_order);
