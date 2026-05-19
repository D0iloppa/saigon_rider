"""가챠/상점 신규 테이블 — ENUM 1개 + 테이블 5개

Revision ID: sre013
Revises: sre012
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre013"
down_revision: Union[str, None] = "sre012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ENUM
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gacha_status_enum') THEN
            CREATE TYPE gacha_status_enum AS ENUM ('UPCOMING','ACTIVE','ENDED');
          END IF;
        END $$
    """)

    # gacha_definition
    op.execute("""
        CREATE TABLE IF NOT EXISTS gacha_definition (
          gacha_code               VARCHAR(40) PRIMARY KEY,
          display_name             VARCHAR(80) NOT NULL,
          description              VARCHAR(200),
          cost_currency            VARCHAR(4) NOT NULL,
          cost_per_pull            INT NOT NULL,
          cost_per_10_pull         INT NOT NULL,
          collection_filter        VARCHAR(40)
                                    REFERENCES item_collection(collection_code),
          drop_table               JSONB NOT NULL,
          pity_threshold           INT,
          pity_guarantee_rarity    item_rarity_enum,
          pity_resets_with_season  BOOLEAN NOT NULL DEFAULT FALSE,
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
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gacha_def_status_listed
          ON gacha_definition(status, is_listed)
          WHERE status = 'ACTIVE' AND is_listed = TRUE
    """)

    # user_gacha_pity
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_gacha_pity (
          user_id        BIGINT NOT NULL REFERENCES sre_user(user_id),
          gacha_code     VARCHAR(40) NOT NULL REFERENCES gacha_definition(gacha_code),
          pity_count     INT NOT NULL DEFAULT 0,
          total_pulls    BIGINT NOT NULL DEFAULT 0,
          last_pull_at   TIMESTAMPTZ,
          season_scope   VARCHAR(40),
          PRIMARY KEY (user_id, gacha_code),

          CONSTRAINT user_gacha_pity_count_nonneg CHECK (pity_count >= 0),
          CONSTRAINT user_gacha_pity_total_nonneg CHECK (total_pulls >= 0)
        )
    """)

    # gacha_pull_log
    op.execute("""
        CREATE TABLE IF NOT EXISTS gacha_pull_log (
          pull_log_id        BIGSERIAL PRIMARY KEY,
          user_id            BIGINT NOT NULL REFERENCES sre_user(user_id),
          gacha_code         VARCHAR(40) NOT NULL REFERENCES gacha_definition(gacha_code),
          batch_id           BIGINT NOT NULL,
          is_10_pull         BOOLEAN NOT NULL DEFAULT FALSE,
          pull_index         INT NOT NULL,
          cost_currency      VARCHAR(4),
          cost_amount        INT NOT NULL DEFAULT 0,
          picked_rarity      item_rarity_enum NOT NULL,
          picked_item_code   VARCHAR(60) REFERENCES item_definition(item_code),
          was_duplicate      BOOLEAN NOT NULL DEFAULT FALSE,
          refund_currency    VARCHAR(4),
          refund_amount      INT,
          was_pity_hit       BOOLEAN NOT NULL DEFAULT FALSE,
          was_10pull_guarantee BOOLEAN NOT NULL DEFAULT FALSE,
          pity_count_before  INT,
          pity_count_after   INT,
          random_seed        VARCHAR(64),
          pulled_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT gacha_log_pull_index_check
            CHECK (pull_index BETWEEN 1 AND 10),
          CONSTRAINT gacha_log_refund_currency_check
            CHECK (refund_currency IS NULL OR refund_currency IN ('GP', 'GC'))
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gacha_log_user_time
          ON gacha_pull_log(user_id, pulled_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gacha_log_batch
          ON gacha_pull_log(batch_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_gacha_log_gacha_rarity
          ON gacha_pull_log(gacha_code, picked_rarity, pulled_at DESC)
    """)

    # daily_featured_item
    op.execute("""
        CREATE TABLE IF NOT EXISTS daily_featured_item (
          featured_date    DATE NOT NULL,
          item_code        VARCHAR(60) NOT NULL REFERENCES item_definition(item_code),
          discount_pct     INT NOT NULL DEFAULT 30,
          sort_order       INT NOT NULL DEFAULT 0,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          PRIMARY KEY (featured_date, item_code),

          CONSTRAINT daily_featured_discount_check
            CHECK (discount_pct BETWEEN 1 AND 90)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_featured_date
          ON daily_featured_item(featured_date)
    """)

    # shop_purchase_log
    op.execute("""
        CREATE TABLE IF NOT EXISTS shop_purchase_log (
          purchase_log_id  BIGSERIAL PRIMARY KEY,
          user_id          BIGINT NOT NULL REFERENCES sre_user(user_id),
          item_code        VARCHAR(60) NOT NULL REFERENCES item_definition(item_code),
          cost_currency    VARCHAR(4) NOT NULL,
          base_price       INT NOT NULL,
          discount_pct     INT NOT NULL DEFAULT 0,
          cost_amount      INT NOT NULL,
          was_featured     BOOLEAN NOT NULL DEFAULT FALSE,
          user_item_id     BIGINT,
          purchased_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT shop_log_currency_check CHECK (cost_currency IN ('GP', 'GC')),
          CONSTRAINT shop_log_discount_check CHECK (discount_pct BETWEEN 0 AND 90),
          CONSTRAINT shop_log_cost_consistency
            CHECK (cost_amount = base_price - (base_price * discount_pct / 100))
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_shop_log_user
          ON shop_purchase_log(user_id, purchased_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_shop_log_item
          ON shop_purchase_log(item_code, purchased_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS shop_purchase_log")
    op.execute("DROP TABLE IF EXISTS daily_featured_item")
    op.execute("DROP TABLE IF EXISTS gacha_pull_log")
    op.execute("DROP TABLE IF EXISTS user_gacha_pity")
    op.execute("DROP TABLE IF EXISTS gacha_definition")
    op.execute("DROP TYPE IF EXISTS gacha_status_enum")
