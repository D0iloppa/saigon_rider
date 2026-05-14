"""behavior_category_log, user_diversity_score, tier_definition, user_tier 테이블

Revision ID: sre006
Revises: sre005
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre006"
down_revision: Union[str, None] = "sre005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE behavior_category_log (
          log_id               BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          category_code        VARCHAR(20)  NOT NULL,
          related_event_id     BIGINT       NULL,
          occurred_at          TIMESTAMPTZ(3) NOT NULL,
          month_key            INT          NOT NULL,
          PRIMARY KEY (log_id),
          CONSTRAINT fk_bcl_user FOREIGN KEY (user_id) REFERENCES sre_user(user_id)
        )
    """)
    op.execute("CREATE INDEX idx_bcl_user_month ON behavior_category_log (user_id, month_key)")
    op.execute("CREATE INDEX idx_bcl_user_cat_month ON behavior_category_log (user_id, category_code, month_key)")

    op.execute("""
        CREATE TABLE user_diversity_score (
          user_id              BIGINT       NOT NULL,
          month_key            INT          NOT NULL,
          active_category_count INT         NOT NULL DEFAULT 0,
          multiplier           NUMERIC(4,2) NOT NULL DEFAULT 1.00,
          last_calculated_at   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, month_key),
          CONSTRAINT fk_uds_user FOREIGN KEY (user_id) REFERENCES sre_user(user_id)
        )
    """)

    op.execute("""
        CREATE TABLE tier_definition (
          tier_code            VARCHAR(20)  NOT NULL,
          tier_name            VARCHAR(40)  NOT NULL,
          min_lifetime_rp      BIGINT       NOT NULL DEFAULT 0,
          min_diversity_count  INT          NOT NULL DEFAULT 0,
          sort_order           INT          NOT NULL,
          PRIMARY KEY (tier_code)
        )
    """)

    op.execute("""
        CREATE TABLE user_tier (
          user_id              BIGINT       NOT NULL,
          current_tier_code    VARCHAR(20)  NOT NULL,
          progress_to_next     BIGINT       NOT NULL DEFAULT 0,
          achieved_at          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id),
          CONSTRAINT fk_ut_user FOREIGN KEY (user_id)           REFERENCES sre_user(user_id),
          CONSTRAINT fk_ut_tier FOREIGN KEY (current_tier_code) REFERENCES tier_definition(tier_code)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_tier")
    op.execute("DROP TABLE IF EXISTS tier_definition")
    op.execute("DROP TABLE IF EXISTS user_diversity_score")
    op.execute("DROP TABLE IF EXISTS behavior_category_log")
