"""device_user_map — fcm_token 컬럼 추가

FCM 푸시 토큰을 device-map upsert 시 함께 저장.
NULL 허용 (웹 접속 등 네이티브 미연동 케이스).

Revision ID: sre029
Revises: sre028
Create Date: 2026-05-29
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre029"
down_revision: Union[str, None] = "sre028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE device_user_map ADD COLUMN IF NOT EXISTS fcm_token TEXT"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE device_user_map DROP COLUMN IF EXISTS fcm_token"
    )
