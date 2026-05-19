"""게이미피케이션 신규 테이블 — ENUM 6개 + 테이블 10개 (아이템/시즌/박스)

Revision ID: sre012
Revises: sre011
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre012"
down_revision: Union[str, None] = "sre011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ENUM 6개
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collection_status_enum') THEN
            CREATE TYPE collection_status_enum AS ENUM ('ACTIVE', 'RETIRED', 'UPCOMING');
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_slot_enum') THEN
            CREATE TYPE item_slot_enum AS ENUM (
              'HELMET','JACKET','GLOVES','BOOTS','EYEWEAR','NAMEPLATE',
              'BODY_PAINT','WHEEL','EXHAUST','HEADLIGHT','MIRROR','DECAL','NUMBER',
              'FRAME','BACKDROP','TITLE',
              'TRAIL','HORN','START_ANIM'
            );
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_rarity_enum') THEN
            CREATE TYPE item_rarity_enum AS ENUM ('C','R','E','L','M');
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
        END $$
    """)

    # item_collection
    op.execute("""
        CREATE TABLE IF NOT EXISTS item_collection (
          collection_code  VARCHAR(40) PRIMARY KEY,
          display_name     VARCHAR(80) NOT NULL,
          theme_color_hex  VARCHAR(7),
          status           collection_status_enum NOT NULL DEFAULT 'ACTIVE',
          sort_order       INT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # item_definition
    op.execute("""
        CREATE TABLE IF NOT EXISTS item_definition (
          item_code              VARCHAR(60) PRIMARY KEY,
          display_name           VARCHAR(120) NOT NULL,
          slot                   item_slot_enum NOT NULL,
          rarity                 item_rarity_enum NOT NULL,
          collection_code        VARCHAR(40) NOT NULL
                                  REFERENCES item_collection(collection_code),
          shop_price_gp          INT,
          shop_price_gc          INT,
          is_shop_visible        BOOLEAN NOT NULL DEFAULT TRUE,
          season_lock            BOOLEAN NOT NULL DEFAULT FALSE,
          required_season_code   VARCHAR(40),
          asset_uri              VARCHAR(200),
          created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT item_def_season_lock_consistency
            CHECK (
              (season_lock = FALSE)
              OR (season_lock = TRUE AND required_season_code IS NOT NULL)
            ),
          CONSTRAINT item_def_price_consistency
            CHECK (
              is_shop_visible = FALSE
              OR shop_price_gp IS NOT NULL
              OR shop_price_gc IS NOT NULL
            )
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_item_def_collection_rarity
          ON item_definition(collection_code, rarity)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_item_def_slot
          ON item_definition(slot)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_item_def_shop_visible
          ON item_definition(is_shop_visible, collection_code, rarity)
          WHERE is_shop_visible = TRUE
    """)

    # user_item
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_item (
          user_item_id       BIGSERIAL PRIMARY KEY,
          user_id            BIGINT NOT NULL REFERENCES sre_user(user_id),
          item_code          VARCHAR(60) NOT NULL
                              REFERENCES item_definition(item_code),
          acquired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          acquisition_source acquisition_source_enum NOT NULL,
          source_ref_id      BIGINT,
          UNIQUE (user_id, item_code)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_item_user
          ON user_item(user_id, acquired_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_item_source
          ON user_item(acquisition_source, source_ref_id)
    """)

    # user_equipment
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_equipment (
          user_id      BIGINT NOT NULL REFERENCES sre_user(user_id),
          slot         item_slot_enum NOT NULL,
          item_code    VARCHAR(60) REFERENCES item_definition(item_code),
          equipped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, slot)
        )
    """)

    # season
    op.execute("""
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
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_season_status_period
          ON season(status, starts_at, ends_at)
    """)

    # user_season_pass
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_season_pass (
          user_id            BIGINT NOT NULL REFERENCES sre_user(user_id),
          season_code        VARCHAR(40) NOT NULL REFERENCES season(season_code),
          sxp_balance        INT NOT NULL DEFAULT 0,
          current_level      INT NOT NULL DEFAULT 0,
          has_premium        BOOLEAN NOT NULL DEFAULT FALSE,
          premium_granted_at TIMESTAMPTZ,
          claimed_levels     INT[] NOT NULL DEFAULT '{}',
          daily_sxp_today    INT NOT NULL DEFAULT 0,
          daily_sxp_date     DATE,
          PRIMARY KEY (user_id, season_code),

          CONSTRAINT user_season_pass_sxp_nonneg CHECK (sxp_balance >= 0),
          CONSTRAINT user_season_pass_level_nonneg CHECK (current_level >= 0)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_season_pass_level
          ON user_season_pass(season_code, current_level)
    """)

    # lootbox_definition
    op.execute("""
        CREATE TABLE IF NOT EXISTS lootbox_definition (
          box_code             VARCHAR(40) PRIMARY KEY,
          display_name         VARCHAR(80) NOT NULL,
          collection_filter    VARCHAR(40) REFERENCES item_collection(collection_code),
          drop_table           JSONB NOT NULL,
          expires_with_season  BOOLEAN NOT NULL DEFAULT FALSE,
          required_season_code VARCHAR(40),
          auto_open_on_grant   BOOLEAN NOT NULL DEFAULT FALSE,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT lootbox_def_season_consistency
            CHECK (
              (expires_with_season = FALSE)
              OR (expires_with_season = TRUE AND required_season_code IS NOT NULL)
            )
        )
    """)

    # user_inventory_box
    op.execute("""
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
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_box_user_status
          ON user_inventory_box(user_id, status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_box_unopened
          ON user_inventory_box(box_code, status)
          WHERE status = 'UNOPENED'
    """)

    # lootbox_drop_log
    op.execute("""
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
          random_seed         VARCHAR(64),
          opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT drop_log_refund_currency_check
            CHECK (refund_currency IS NULL OR refund_currency IN ('GP', 'GC'))
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_drop_log_user
          ON lootbox_drop_log(user_id, opened_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_drop_log_box
          ON lootbox_drop_log(box_code, opened_at DESC)
    """)

    # item_acquisition_log
    op.execute("""
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
          CONSTRAINT item_acq_log_refund_consistency
            CHECK (
              granted_or_refunded = 'GRANTED'
              OR (granted_or_refunded = 'REFUNDED'
                  AND refund_currency IS NOT NULL)
            )
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_item_acq_log_user
          ON item_acquisition_log(user_id, occurred_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_item_acq_log_item
          ON item_acquisition_log(item_code, occurred_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS item_acquisition_log")
    op.execute("DROP TABLE IF EXISTS lootbox_drop_log")
    op.execute("DROP TABLE IF EXISTS user_inventory_box")
    op.execute("DROP TABLE IF EXISTS lootbox_definition")
    op.execute("DROP TABLE IF EXISTS user_season_pass")
    op.execute("DROP TABLE IF EXISTS season")
    op.execute("DROP TABLE IF EXISTS user_equipment")
    op.execute("DROP TABLE IF EXISTS user_item")
    op.execute("DROP TABLE IF EXISTS item_definition")
    op.execute("DROP TABLE IF EXISTS item_collection")
    op.execute("DROP TYPE IF EXISTS box_status_enum")
    op.execute("DROP TYPE IF EXISTS season_status_enum")
    op.execute("DROP TYPE IF EXISTS acquisition_source_enum")
    op.execute("DROP TYPE IF EXISTS item_rarity_enum")
    op.execute("DROP TYPE IF EXISTS item_slot_enum")
    op.execute("DROP TYPE IF EXISTS collection_status_enum")
