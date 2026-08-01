"""sre_quest_card — live telemetry 컬럼 추가

GPS 핑마다 카드 row 에 누적되어 BFF 폴링으로 프론트에 전달되는 휘발성 값.

- last_lat / last_lng : 가장 최근 GPS 좌표 (CHECKPOINT 거리 계산 / 디버깅용)
- last_speed_kmh      : 직전 핑과의 dt 기반 순간 속도
- last_gps_at         : 위 값들의 기준 시각 (다음 핑의 dt 계산용)
- distance_to_target_m: CHECKPOINT 카드에 한해 last 좌표 → target 의 haversine 거리

DISTANCE 카드는 distance_to_target_m=NULL, current_distance_m 누적은 기존 그대로.

Revision ID: sre028
Revises: sre027
Create Date: 2026-05-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre028"
down_revision: Union[str, None] = "sre027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sre_quest_card", sa.Column("last_lat", sa.Numeric(9, 6), nullable=True))
    op.add_column("sre_quest_card", sa.Column("last_lng", sa.Numeric(9, 6), nullable=True))
    op.add_column("sre_quest_card", sa.Column("last_speed_kmh", sa.Numeric(6, 2), nullable=True))
    op.add_column("sre_quest_card", sa.Column("last_gps_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("sre_quest_card", sa.Column("distance_to_target_m", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("sre_quest_card", "distance_to_target_m")
    op.drop_column("sre_quest_card", "last_gps_at")
    op.drop_column("sre_quest_card", "last_speed_kmh")
    op.drop_column("sre_quest_card", "last_lng")
    op.drop_column("sre_quest_card", "last_lat")
