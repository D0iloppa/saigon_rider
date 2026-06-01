-- ──────────────────────────────────────────────────────────────────────────
-- Saigon Rider — Migration Step 3: 가챠 / 상점 시스템 신규 테이블
-- 발행일: 2026-05-18
-- 대상: PostgreSQL 14+
-- 의존성: migration-step2-new-tables.sql 선행 (item_definition, sre_user 등)
--
-- 핵심 컨셉:
--   - 미션은 통화(GP/GC) 발행 펌프 → 아이템 직접 지급은 시즌 정복자만
--   - 사용자는 통화로 (a) 상점 직접 구매 또는 (b) 가챠 도박으로 아이템 획득
--   - 가챠는 천장(Pity) + 10연차 보장으로 도박성과 보호 균형
--   - 모든 거래는 audit 가능 (shop_purchase_log + gacha_pull_log)
--
-- 생성 대상:
--   ENUM 1개: gacha_status_enum
--   테이블 5개: gacha_definition, user_gacha_pity, gacha_pull_log,
--               daily_featured_item, shop_purchase_log
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 3.0 ENUM
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gacha_status_enum') THEN
    CREATE TYPE gacha_status_enum AS ENUM ('UPCOMING','ACTIVE','ENDED');
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 3.1 GACHA_DEFINITION — 가챠 카탈로그 (5종)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gacha_definition (
  gacha_code               VARCHAR(40) PRIMARY KEY,
  display_name             VARCHAR(80) NOT NULL,
  description              VARCHAR(200),
  cost_currency            VARCHAR(4) NOT NULL,         -- 'GP' | 'GC'
  cost_per_pull            INT NOT NULL,
  cost_per_10_pull         INT NOT NULL,                -- 10연차 가격 (보통 10% 할인)
  collection_filter        VARCHAR(40)
                            REFERENCES item_collection(collection_code),
  drop_table               JSONB NOT NULL,
  -- drop_table 예시:
  -- {
  --   "weighted": [
  --     { "rarity": "R", "weight": 65 },
  --     { "rarity": "E", "weight": 33 },
  --     { "rarity": "L", "weight": 2 }
  --   ],
  --   "guaranteed_at_10": "E",       -- 10연차에 이 등급 1개 보장
  --   "duplicate_policy": "REFUND_GP"
  -- }

  -- 천장 시스템
  pity_threshold           INT,                          -- NULL이면 천장 없음
  pity_guarantee_rarity    item_rarity_enum,             -- 천장 도달 시 보장 등급
  pity_resets_with_season  BOOLEAN NOT NULL DEFAULT FALSE,

  -- 운영 기간 (NULL이면 상시)
  starts_at                TIMESTAMPTZ,
  ends_at                  TIMESTAMPTZ,
  required_season_code     VARCHAR(40),
  status                   gacha_status_enum NOT NULL DEFAULT 'ACTIVE',
  is_listed                BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order               INT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gacha_def_currency_check
    CHECK (cost_currency IN ('GP', 'GC')),
  CONSTRAINT gacha_def_cost_pos
    CHECK (cost_per_pull > 0 AND cost_per_10_pull > 0),
  CONSTRAINT gacha_def_pity_consistency
    CHECK (
      pity_threshold IS NULL
      OR (pity_threshold > 0 AND pity_guarantee_rarity IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_gacha_def_status_listed
  ON gacha_definition(status, is_listed)
  WHERE status = 'ACTIVE' AND is_listed = TRUE;

COMMENT ON COLUMN gacha_definition.cost_per_10_pull IS
  '10연차 일괄 가격. 일반적으로 cost_per_pull * 9 ~ 9.5 (할인). 보장 등급 포함';
COMMENT ON COLUMN gacha_definition.pity_threshold IS
  '천장 카운터 임계값. 이 횟수만큼 보장 등급 미획득 시 다음 뽑기에서 강제 보장';


-- ──────────────────────────────────────────────────────────────────────────
-- 3.2 USER_GACHA_PITY — 사용자별 가챠 천장 카운터
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_gacha_pity (
  user_id        BIGINT NOT NULL REFERENCES sre_user(user_id),
  gacha_code     VARCHAR(40) NOT NULL REFERENCES gacha_definition(gacha_code),
  pity_count     INT NOT NULL DEFAULT 0,
  total_pulls    BIGINT NOT NULL DEFAULT 0,
  last_pull_at   TIMESTAMPTZ,
  season_scope   VARCHAR(40),     -- 이 천장이 묶인 시즌 (시즌 리셋용)
  PRIMARY KEY (user_id, gacha_code),

  CONSTRAINT user_gacha_pity_count_nonneg CHECK (pity_count >= 0),
  CONSTRAINT user_gacha_pity_total_nonneg CHECK (total_pulls >= 0)
);

COMMENT ON COLUMN user_gacha_pity.pity_count IS
  '보장 등급 미획득 누적. 보장 획득 시 0으로 리셋. 천장 도달 시 강제 보장.';


-- ──────────────────────────────────────────────────────────────────────────
-- 3.3 GACHA_PULL_LOG — 모든 뽑기 결과 감사 (도박성 분쟁 대응)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gacha_pull_log (
  pull_log_id        BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES sre_user(user_id),
  gacha_code         VARCHAR(40) NOT NULL REFERENCES gacha_definition(gacha_code),

  -- 10연차의 경우 같은 batch_id로 10개 row가 묶임
  batch_id           BIGINT NOT NULL,    -- 단일 뽑기도 batch=pull_log_id
  is_10_pull         BOOLEAN NOT NULL DEFAULT FALSE,
  pull_index         INT NOT NULL,       -- 10연차 내 위치 1~10, 단일은 1

  -- 비용 (10연차면 첫 row에 전체 비용, 나머지는 0)
  cost_currency      VARCHAR(4),
  cost_amount        INT NOT NULL DEFAULT 0,

  -- 결과
  picked_rarity      item_rarity_enum NOT NULL,
  picked_item_code   VARCHAR(60) REFERENCES item_definition(item_code),
  was_duplicate      BOOLEAN NOT NULL DEFAULT FALSE,
  refund_currency    VARCHAR(4),
  refund_amount      INT,

  -- 보장 / 천장 발동 추적
  was_pity_hit       BOOLEAN NOT NULL DEFAULT FALSE,
  was_10pull_guarantee BOOLEAN NOT NULL DEFAULT FALSE,
  pity_count_before  INT,
  pity_count_after   INT,

  -- 재현성 (분쟁 대응)
  random_seed        VARCHAR(64),
  pulled_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gacha_log_pull_index_check
    CHECK (pull_index BETWEEN 1 AND 10),
  CONSTRAINT gacha_log_refund_currency_check
    CHECK (refund_currency IS NULL OR refund_currency IN ('GP', 'GC'))
);

CREATE INDEX IF NOT EXISTS idx_gacha_log_user_time
  ON gacha_pull_log(user_id, pulled_at DESC);
CREATE INDEX IF NOT EXISTS idx_gacha_log_batch
  ON gacha_pull_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_gacha_log_gacha_rarity
  ON gacha_pull_log(gacha_code, picked_rarity, pulled_at DESC);


-- ──────────────────────────────────────────────────────────────────────────
-- 3.4 DAILY_FEATURED_ITEM — 일일 추천 상품 (할인 노출)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_featured_item (
  featured_date    DATE NOT NULL,
  item_code        VARCHAR(60) NOT NULL REFERENCES item_definition(item_code),
  discount_pct     INT NOT NULL DEFAULT 30,    -- 30 = 30% 할인
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (featured_date, item_code),

  CONSTRAINT daily_featured_discount_check
    CHECK (discount_pct BETWEEN 1 AND 90)
);

CREATE INDEX IF NOT EXISTS idx_featured_date
  ON daily_featured_item(featured_date);

COMMENT ON TABLE daily_featured_item IS
  '매일 자정 배치로 3~5개 아이템 자동 선정 후 30% 할인 노출. 운영자 수동 큐레이션도 가능';


-- ──────────────────────────────────────────────────────────────────────────
-- 3.5 SHOP_PURCHASE_LOG — 상점 구매 이력 (감사)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_purchase_log (
  purchase_log_id  BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES sre_user(user_id),
  item_code        VARCHAR(60) NOT NULL REFERENCES item_definition(item_code),
  cost_currency    VARCHAR(4) NOT NULL,
  base_price       INT NOT NULL,         -- 정가
  discount_pct     INT NOT NULL DEFAULT 0,
  cost_amount      INT NOT NULL,         -- 실제 차감 금액
  was_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  user_item_id     BIGINT,                -- 구매 직후 생성된 user_item.user_item_id
  purchased_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT shop_log_currency_check CHECK (cost_currency IN ('GP', 'GC')),
  CONSTRAINT shop_log_discount_check CHECK (discount_pct BETWEEN 0 AND 90),
  CONSTRAINT shop_log_cost_consistency
    CHECK (cost_amount = base_price - (base_price * discount_pct / 100))
);

CREATE INDEX IF NOT EXISTS idx_shop_log_user
  ON shop_purchase_log(user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_log_item
  ON shop_purchase_log(item_code, purchased_at DESC);


-- ──────────────────────────────────────────────────────────────────────────
-- 3.6 검증 쿼리
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT typname FROM pg_type WHERE typname = 'gacha_status_enum';  -- 1행
-- SELECT table_name FROM information_schema.tables
--  WHERE table_name IN ('gacha_definition','user_gacha_pity','gacha_pull_log',
--                       'daily_featured_item','shop_purchase_log');  -- 5행

COMMIT;
