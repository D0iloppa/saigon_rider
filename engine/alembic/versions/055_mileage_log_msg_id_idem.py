"""user_mileage_log에 msg_id 멱등키 추가

at-least-once 스트림 + 비멱등 핸들러의 이중 적립 근본 차단 (적대 리뷰 260707 권고):
xack 실패/DLQ xadd 실패 등 어떤 재전달 창에서도 같은 스트림 메시지의 마일리지가
두 번 적립되지 않도록, 로그 행에 원본 메시지 id 를 unique 로 기록한다.
기존 행/비스트림 경로(NULL)는 제약에서 제외된다 (PG unique index는 NULL 중복 허용).

Revision ID: sre055
Revises: sre054
Create Date: 2026-07-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "sre055"
down_revision: Union[str, None] = "sre054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_mileage_log", sa.Column("msg_id", sa.Text(), nullable=True))
    op.create_index("uq_mileage_log_msg_id", "user_mileage_log", ["msg_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_mileage_log_msg_id", table_name="user_mileage_log")
    op.drop_column("user_mileage_log", "msg_id")
