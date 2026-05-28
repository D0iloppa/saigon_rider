"""device_user_map.user_id 에 UNIQUE 제약 추가 (1 user = 1 active device)

기존 (idx_device_user_map_user) 는 비고유 인덱스라 라우터가 user_id 기준 UPSERT 를
보장하지 못했다. UNIQUE 로 승격해 `INSERT … ON CONFLICT (user_id) DO UPDATE` 를
DB 레벨에서 단단히 묶는다.

Revision ID: sre026
Revises: sre025
Create Date: 2026-05-27
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre026"
down_revision: Union[str, None] = "sre025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 동일 user_id 가 중복돼 있으면 가장 최근 logged_in_at 만 남기고 제거
    op.execute(
        """
        DELETE FROM device_user_map a
        USING device_user_map b
        WHERE a.user_id = b.user_id
          AND (a.logged_in_at, a.device_uuid) < (b.logged_in_at, b.device_uuid)
        """
    )
    op.execute("DROP INDEX IF EXISTS idx_device_user_map_user")
    op.execute(
        "ALTER TABLE device_user_map "
        "ADD CONSTRAINT uq_device_user_map_user_id UNIQUE (user_id)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE device_user_map DROP CONSTRAINT IF EXISTS uq_device_user_map_user_id")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_device_user_map_user ON device_user_map (user_id)"
    )
