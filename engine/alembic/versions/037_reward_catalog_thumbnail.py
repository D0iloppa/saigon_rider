"""reward_catalog 썸네일 컬럼 — 쿠폰 BM (SGR-213 P1)

reward_catalog 에 thumbnail_asset_uri(문자열) 추가.
contents 테이블은 BFF 전용 DB이므로 엔진은 ItemDefinition.asset_uri 와 동일하게
불투명 문자열만 보관하고, BFF 가 build_imgproxy_url 로 변환한다.

Revision ID: sre037
Revises: sre036
Create Date: 2026-06-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "sre037"
down_revision: Union[str, None] = "sre036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reward_catalog",
        sa.Column("thumbnail_asset_uri", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reward_catalog", "thumbnail_asset_uri")
