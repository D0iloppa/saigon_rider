"""sre_seed_config — CHECKPOINT_DISTANCE_BANDS 시드

CHECKPOINT 퀘스트 잔여거리 표시 밴드. 내림차순 배열. D >= thresholdM 인
첫 항목의 code 를 사용해 i18n 라벨로 표기. 어디에도 매칭 안 되면 실제 m
단위 노출.

Revision ID: sre027
Revises: sre026
Create Date: 2026-05-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre027"
down_revision: Union[str, None] = "sre026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # JSON 안의 콜론이 alembic op.execute 에서 bind param 으로 해석되는 것을 피하려고
    # bindparam 으로 분리해 전달.
    op.execute(
        sa.text("""
            INSERT INTO sre_seed_config (seed_code, value_text, description)
            VALUES (:code, :value, :desc)
            ON CONFLICT (seed_code) DO NOTHING
        """).bindparams(
            code="CHECKPOINT_DISTANCE_BANDS",
            value='[{"code":"BAND_5KM","thresholdM":5000},{"code":"BAND_1KM","thresholdM":1000}]',
            desc="CHECKPOINT 잔여거리 표시 밴드 (내림차순)",
        )
    )


def downgrade() -> None:
    op.execute("DELETE FROM sre_seed_config WHERE seed_code = 'CHECKPOINT_DISTANCE_BANDS'")
