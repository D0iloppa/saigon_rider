-- ──────────────────────────────────────────────────────────────────────────
-- Saigon Rider — Migration Step 2: 게이미피케이션 신규 테이블 생성
-- 발행일: 2026-05-18
-- 대상: PostgreSQL 14+
-- 참조: sre-mission-item-reward-spec.md §8.2
--
-- 생성 대상:
--   ENUM 6개:
--     - collection_status_enum, item_slot_enum, item_rarity_enum,
--       acquisition_source_enum, season_status_enum, box_status_enum
--   테이블 10개:
--     - item_collection, item_definition, user_item, user_equipment
--     - season, user_season_pass
--     - lootbox_definition, user_inventory_box, lootbox_drop_log
--     - item_acquisition_log
--
-- 순서: 외래키 의존성 순서대로 작성됨. 통째로 실행하면 한 번에 완료.
-- 멱등성: 모든 CREATE에 IF NOT EXISTS 사용. ENUM은 DO 블록으로 보호.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 2.0 ENUM 타입 6개 (PostgreSQL ENUM은 CREATE TYPE IF NOT EXISTS 미지원)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_status_enum') THEN
    CREATE TYPE collection_status_enum AS ENUM ('ACTIVE', 'RETIRED', 'UPCOMING');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_slot_enum') THEN
    CREATE TYPE item_slot_enum AS ENUM (
      -- AVATAR (6)
      'HELMET','JACKET','GLOVES','BOOTS','EYEWEAR','NAMEPLATE',
      -- GARAGE (7)
      'BODY_PAINT','WHEEL','EXHAUST','HEADLIGHT','MIRROR','DECAL','NUMBER',
      -- PROFILE (3)
      'FRAME','BACKDROP','TITLE',
      -- FX (3)
      'TRAIL','HORN','START_ANIM'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_rarity_enum') THEN
    CREATE TYPE item_rarity_enum AS ENUM ('C','R','E','L','M');
    -- C=Common, R=Rare, E=Epic, L=Legendary, M=Mythic
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'acquisition_source_enum') THEN
    CREATE TYPE acquisition_source_enum AS ENUM (
      'MISSION', 'SEASON_PASS', 'SHOP', 'LOOTBOX', 'TIER_REWARD',
      'REFERRAL', 'EVENT', 'ADMIN_GRANT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'season_status_enum') THEN
    CREATE TYPE season_status_enum AS ENUM ('UPCOMING','ACTIVE','ENDED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'box_status_enum') THEN
    CREATE TYPE box_status_enum AS ENUM ('UNOPENED','OPENED','EXPIRED');
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 2.1 ITEM_COLLECTION — 7개 컬렉션 카탈로그
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_collection (
  collection_code  VARCHAR(40) PRIMARY KEY,
  display_name     VARCHAR(80) NOT NULL,
  theme_color_hex  VARCHAR(7),
  status           collection_status_enum NOT NULL DEFAULT 'ACTIVE',
  sort_order       INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  item_collection IS '아이템 컬렉션 정의 (STREET_CLASSIC, NEON_SAIGON 등 7개)';
COMMENT ON COLUMN item_collection.theme_color_hex IS 'UI 테마 컬러 (예: #FF6B00)';


-- ──────────────────────────────────────────────────────────────────────────
-- 2.2 ITEM_DEFINITION — 213개 아이템 마스터
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_definition (
  item_code              VARCHAR(60) PRIMARY KEY,
  display_name           VARCHAR(120) NOT NULL,
  slot                   item_slot_enum NOT NULL,
  rarity                 item_rarity_enum NOT NULL,
  collection_code        VARCHAR(40) NOT NULL
                          REFERENCES item_collection(collection_code),
  shop_price_gp          INT,                -- NULL이면 GC 전용 또는 비매품
  shop_price_gc          INT,
  is_shop_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  season_lock            BOOLEAN NOT NULL DEFAULT FALSE,
  required_season_code   VARCHAR(40),        -- season_lock=TRUE일 때 필수
  asset_uri              VARCHAR(200),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 시즌 잠금 무결성
  CONSTRAINT item_def_season_lock_consistency
    CHECK (
      (season_lock = FALSE)
      OR (season_lock = TRUE AND required_season_code IS NOT NULL)
    ),
  -- 최소 한 가지 통화 가격은 있어야 함 (비매품은 둘 다 NULL + is_shop_visible=FALSE)
  CONSTRAINT item_def_price_consistency
    CHECK (
      is_shop_visible = FALSE
      OR shop_price_gp IS NOT NULL
      OR shop_price_gc IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_item_def_collection_rarity
  ON item_definition(collection_code, rarity);
CREATE INDEX IF NOT EXISTS idx_item_def_slot
  ON item_definition(slot);
CREATE INDEX IF NOT EXISTS idx_item_def_shop_visible
  ON item_definition(is_shop_visible, collection_code, rarity)
  WHERE is_shop_visible = TRUE;


-- ──────────────────────────────────────────────────────────────────────────
-- 2.3 USER_ITEM — Soul-bound 사용자 인벤토리
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_item (
  user_item_id       BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES sre_user(user_id),
  item_code          VARCHAR(60) NOT NULL
                      REFERENCES item_definition(item_code),
  acquired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acquisition_source acquisition_source_enum NOT NULL,
  source_ref_id      BIGINT,  -- progress_id / catalog_id / drop_log_id

  -- Soul-bound: 같은 아이템 중복 보유 불가
  UNIQUE (user_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_user_item_user
  ON user_item(user_id, acquired_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_item_source
  ON user_item(acquisition_source, source_ref_id);


-- ──────────────────────────────────────────────────────────────────────────
-- 2.4 USER_EQUIPMENT — 슬롯별 현재 착용 1개
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_equipment (
  user_id      BIGINT NOT NULL REFERENCES sre_user(user_id),
  slot         item_slot_enum NOT NULL,
  item_code    VARCHAR(60) REFERENCES item_definition(item_code),  -- NULL = 미착용
  equipped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, slot)
);

-- 착용 아이템은 반드시 user_item에 보유 중이어야 함 (애플리케이션 레벨 검증)


-- ──────────────────────────────────────────────────────────────────────────
-- 2.5 SEASON — 시즌 정의 (TET_S1, XMAS_S1 등)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS season (
  season_code        VARCHAR(40) PRIMARY KEY,
  display_name       VARCHAR(80) NOT NULL,
  collection_code    VARCHAR(40) NOT NULL
                      REFERENCES item_collection(collection_code),
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  status             season_status_enum NOT NULL DEFAULT 'UPCOMING',
  max_level          INT NOT NULL DEFAULT 30,
  sxp_per_level      INT NOT NULL DEFAULT 100,
  daily_sxp_cap      INT NOT NULL DEFAULT 500,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT season_period_valid CHECK (ends_at > starts_at),
  CONSTRAINT season_max_level_pos CHECK (max_level > 0)
);

CREATE INDEX IF NOT EXISTS idx_season_status_period
  ON season(status, starts_at, ends_at);

-- 활성 시즌은 시점당 1개만 (선택적 — 운영 정책에 따라 활성화 가능)
-- CREATE UNIQUE INDEX idx_season_one_active
--   ON season(status) WHERE status = 'ACTIVE';


-- ──────────────────────────────────────────────────────────────────────────
-- 2.6 USER_SEASON_PASS — 사용자별 시즌 진척
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_season_pass (
  user_id            BIGINT NOT NULL REFERENCES sre_user(user_id),
  season_code        VARCHAR(40) NOT NULL REFERENCES season(season_code),
  sxp_balance        INT NOT NULL DEFAULT 0,
  current_level      INT NOT NULL DEFAULT 0,
  has_premium        BOOLEAN NOT NULL DEFAULT FALSE,
  premium_granted_at TIMESTAMPTZ,
  claimed_levels     INT[] NOT NULL DEFAULT '{}',   -- 보상 수령한 레벨 배열
  daily_sxp_today    INT NOT NULL DEFAULT 0,
  daily_sxp_date     DATE,
  PRIMARY KEY (user_id, season_code),

  CONSTRAINT user_season_pass_sxp_nonneg CHECK (sxp_balance >= 0),
  CONSTRAINT user_season_pass_level_nonneg CHECK (current_level >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_season_pass_level
  ON user_season_pass(season_code, current_level);


-- ──────────────────────────────────────────────────────────────────────────
-- 2.7 LOOTBOX_DEFINITION — 박스 카탈로그 (8개)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lootbox_definition (
  box_code             VARCHAR(40) PRIMARY KEY,
  display_name         VARCHAR(80) NOT NULL,
  collection_filter    VARCHAR(40) REFERENCES item_collection(collection_code),
  drop_table           JSONB NOT NULL,
  expires_with_season  BOOLEAN NOT NULL DEFAULT FALSE,
  required_season_code VARCHAR(40),
  auto_open_on_grant   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 시즌 만료 박스는 시즌 코드 필수
  CONSTRAINT lootbox_def_season_consistency
    CHECK (
      (expires_with_season = FALSE)
      OR (expires_with_season = TRUE AND required_season_code IS NOT NULL)
    )
);

COMMENT ON COLUMN lootbox_definition.drop_table IS
  '{"guaranteed": [...], "weighted": [{"rarity":"R","weight":60}, ...],
    "duplicate_policy": "REFUND_GP", "affinity_boost": {...}}';


-- ──────────────────────────────────────────────────────────────────────────
-- 2.8 USER_INVENTORY_BOX — 사용자 보유 박스 (개봉 전/후)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_inventory_box (
  inventory_box_id   BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES sre_user(user_id),
  box_code           VARCHAR(40) NOT NULL
                      REFERENCES lootbox_definition(box_code),
  granted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_source     acquisition_source_enum NOT NULL,
  granted_source_ref BIGINT,
  opened_at          TIMESTAMPTZ,
  status             box_status_enum NOT NULL DEFAULT 'UNOPENED'
);

CREATE INDEX IF NOT EXISTS idx_user_box_user_status
  ON user_inventory_box(user_id, status);
-- 시즌 박스 일괄 만료 처리용
CREATE INDEX IF NOT EXISTS idx_user_box_unopened
  ON user_inventory_box(box_code, status)
  WHERE status = 'UNOPENED';


-- ──────────────────────────────────────────────────────────────────────────
-- 2.9 LOOTBOX_DROP_LOG — 박스 개봉 결과 감사
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lootbox_drop_log (
  drop_log_id         BIGSERIAL PRIMARY KEY,
  inventory_box_id    BIGINT NOT NULL
                       REFERENCES user_inventory_box(inventory_box_id),
  user_id             BIGINT NOT NULL REFERENCES sre_user(user_id),
  box_code            VARCHAR(40) NOT NULL
                       REFERENCES lootbox_definition(box_code),
  dropped_item_code   VARCHAR(60)
                       REFERENCES item_definition(item_code),
  was_duplicate       BOOLEAN NOT NULL DEFAULT FALSE,
  refund_currency     VARCHAR(4),
  refund_amount       INT,
  random_seed         VARCHAR(64),    -- 검증용 (확률 검증, 분쟁 처리)
  opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT drop_log_refund_currency_check
    CHECK (refund_currency IS NULL OR refund_currency IN ('GP', 'GC'))
);

CREATE INDEX IF NOT EXISTS idx_drop_log_user
  ON lootbox_drop_log(user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_drop_log_box
  ON lootbox_drop_log(box_code, opened_at DESC);


-- ──────────────────────────────────────────────────────────────────────────
-- 2.10 ITEM_ACQUISITION_LOG — 모든 아이템 획득 통합 감사
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_acquisition_log (
  log_id              BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES sre_user(user_id),
  item_code           VARCHAR(60) NOT NULL
                       REFERENCES item_definition(item_code),
  acquisition_source  acquisition_source_enum NOT NULL,
  source_ref_id       BIGINT,
  granted_or_refunded VARCHAR(10) NOT NULL
                       CHECK (granted_or_refunded IN ('GRANTED','REFUNDED')),
  refund_currency     VARCHAR(4),
  refund_amount       INT,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT item_acq_log_refund_currency_check
    CHECK (refund_currency IS NULL OR refund_currency IN ('GP', 'GC')),
  -- REFUNDED면 refund_currency/refund_amount 필수
  CONSTRAINT item_acq_log_refund_consistency
    CHECK (
      granted_or_refunded = 'GRANTED'
      OR (granted_or_refunded = 'REFUNDED'
          AND refund_currency IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_item_acq_log_user
  ON item_acquisition_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_acq_log_item
  ON item_acquisition_log(item_code, occurred_at DESC);


-- ──────────────────────────────────────────────────────────────────────────
-- 2.11 검증 쿼리 (실행 후 확인용)
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT typname FROM pg_type
--  WHERE typname IN ('collection_status_enum','item_slot_enum','item_rarity_enum',
--                    'acquisition_source_enum','season_status_enum','box_status_enum');
--   기대: 6행
--
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public'
--    AND table_name IN ('item_collection','item_definition','user_item','user_equipment',
--                       'season','user_season_pass','lootbox_definition',
--                       'user_inventory_box','lootbox_drop_log','item_acquisition_log');
--   기대: 10행

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- 다음 단계:
--   1. sre-action-definition-extension.sql  ← 신규 액션 코드 14개 시드
--   2. sre-item-seed.sql                    ← 컬렉션 7 + 아이템 213 + 박스 8
--   3. sre-mission-reward-bundle.sql        ← 240개 미션 reward_bundle UPDATE
--   4. sre-reward-dispatcher.sql            ← PL/pgSQL 함수 10개
-- ──────────────────────────────────────────────────────────────────────────
