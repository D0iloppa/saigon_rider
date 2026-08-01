"""SRE ENUM 타입 10종 + set_updated_at 트리거 함수

Revision ID: sre001
Revises:
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE account_type_enum AS ENUM ('STANDARD','DRIVER','BUSINESS')")
    op.execute("CREATE TYPE user_status_enum AS ENUM ('ACTIVE','SUSPENDED','DELETED')")
    op.execute("CREATE TYPE event_status_enum AS ENUM ('PENDING','PROCESSED','REJECTED','REFUNDED')")
    op.execute("CREATE TYPE mission_status_enum AS ENUM ('ACTIVE','COMPLETED','EXPIRED','CANCELLED')")
    op.execute("CREATE TYPE tx_type_enum AS ENUM ('EARN','REDEEM','EXPIRE','ADJUST_PLUS','ADJUST_MINUS','REFUND')")
    op.execute("CREATE TYPE expire_status_enum AS ENUM ('PENDING','PARTIALLY_USED','EXPIRED','FULLY_USED')")
    op.execute("CREATE TYPE integration_type_enum AS ENUM ('INTERNAL','GOTIT','URBOX','TELCO','MANUAL')")
    op.execute("CREATE TYPE redemption_status_enum AS ENUM ('REQUESTED','FULFILLED','FAILED','REFUNDED','CANCELLED')")
    op.execute("CREATE TYPE abuse_severity_enum AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL')")
    op.execute("CREATE TYPE abuse_action_enum AS ENUM ('LOG','REDUCE','REJECT','SUSPEND')")

    op.execute("""
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")
    op.execute("DROP TYPE IF EXISTS abuse_action_enum")
    op.execute("DROP TYPE IF EXISTS abuse_severity_enum")
    op.execute("DROP TYPE IF EXISTS redemption_status_enum")
    op.execute("DROP TYPE IF EXISTS integration_type_enum")
    op.execute("DROP TYPE IF EXISTS expire_status_enum")
    op.execute("DROP TYPE IF EXISTS tx_type_enum")
    op.execute("DROP TYPE IF EXISTS mission_status_enum")
    op.execute("DROP TYPE IF EXISTS event_status_enum")
    op.execute("DROP TYPE IF EXISTS user_status_enum")
    op.execute("DROP TYPE IF EXISTS account_type_enum")
