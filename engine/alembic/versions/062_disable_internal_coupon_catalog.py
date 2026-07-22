"""Disable INTERNAL coupon catalog items until a real fulfillment partner is ready.

Revision ID: sre062
Revises: sre061
Create Date: 2026-07-22
"""

from collections.abc import Sequence

from alembic import op

revision: str = "sre062"
down_revision: str | None = "sre061"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE reward_catalog AS catalog
        SET is_active = FALSE
        FROM reward_partner AS partner
        WHERE catalog.partner_id = partner.partner_id
          AND partner.partner_code = 'INTERNAL'
          AND catalog.is_active = TRUE
        """
    )


def downgrade() -> None:
    # Never reactivate catalog items implicitly: operators may have disabled them
    # independently, and INTERNAL fulfillment is not a real customer entitlement.
    pass
