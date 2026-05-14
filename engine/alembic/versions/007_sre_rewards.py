"""reward_partner, reward_catalog, reward_redemption 테이블

Revision ID: sre007
Revises: sre006
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre007"
down_revision: Union[str, None] = "sre006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE reward_partner (
          partner_id           BIGINT       GENERATED ALWAYS AS IDENTITY,
          partner_code         VARCHAR(40)  NOT NULL,
          partner_name         VARCHAR(120) NOT NULL,
          integration_type     integration_type_enum NOT NULL,
          api_config           JSONB        NULL,
          is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
          created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (partner_id),
          CONSTRAINT uq_partner_code UNIQUE (partner_code)
        )
    """)

    op.execute("""
        CREATE TABLE reward_catalog (
          catalog_id           BIGINT       GENERATED ALWAYS AS IDENTITY,
          partner_id           BIGINT       NOT NULL,
          item_code            VARCHAR(60)  NOT NULL,
          item_name            VARCHAR(120) NOT NULL,
          category_code        VARCHAR(20)  NOT NULL,
          required_rp          INT          NOT NULL,
          face_value_vnd       INT          NULL,
          monthly_quota        INT          NULL,
          monthly_issued       INT          NOT NULL DEFAULT 0,
          is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
          visible_from         TIMESTAMPTZ(3) NULL,
          visible_until        TIMESTAMPTZ(3) NULL,
          PRIMARY KEY (catalog_id),
          CONSTRAINT uq_item_code UNIQUE (item_code),
          CONSTRAINT fk_cat_partner FOREIGN KEY (partner_id) REFERENCES reward_partner(partner_id)
        )
    """)
    op.execute("CREATE INDEX idx_cat_active_visible ON reward_catalog (is_active, visible_from, visible_until)")

    op.execute("""
        CREATE TABLE reward_redemption (
          redemption_id        BIGINT       GENERATED ALWAYS AS IDENTITY,
          user_id              BIGINT       NOT NULL,
          catalog_id           BIGINT       NOT NULL,
          rp_transaction_id    BIGINT       NULL,
          status               redemption_status_enum NOT NULL DEFAULT 'REQUESTED',
          voucher_code         VARCHAR(120) NULL,
          external_response    JSONB        NULL,
          idempotency_key      VARCHAR(80)  NOT NULL,
          requested_at         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          fulfilled_at         TIMESTAMPTZ(3) NULL,
          expires_at           TIMESTAMPTZ(3) NULL,
          PRIMARY KEY (redemption_id),
          CONSTRAINT uq_redeem_idem UNIQUE (idempotency_key),
          CONSTRAINT fk_red_user    FOREIGN KEY (user_id)           REFERENCES sre_user(user_id),
          CONSTRAINT fk_red_catalog FOREIGN KEY (catalog_id)        REFERENCES reward_catalog(catalog_id),
          CONSTRAINT fk_red_tx      FOREIGN KEY (rp_transaction_id) REFERENCES rp_transaction(transaction_id)
        )
    """)
    op.execute("CREATE INDEX idx_red_user_status ON reward_redemption (user_id, status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reward_redemption")
    op.execute("DROP TABLE IF EXISTS reward_catalog")
    op.execute("DROP TABLE IF EXISTS reward_partner")
