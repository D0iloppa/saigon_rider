"""정보 모듈 액션 정의 — INFO_* 10종

날씨·침수·주유소·정비소 정보 모듈 사용자 액션에 대한
XP 지급 정의 추가.

Revision ID: sre022
Revises: sre021
Create Date: 2026-05-21
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre022"
down_revision: Union[str, None] = "sre021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ACTION_CODES = [
    "INFO_WEATHER_VIEW",
    "INFO_FAVORITE_LOCATION",
    "INFO_FLOOD_REPORT",
    "INFO_FLOOD_PHOTO",
    "INFO_FLOOD_CONFIRM",
    "INFO_GAS_WAIT_REPORT",
    "INFO_REPAIR_REVIEW",
    "INFO_REPAIR_PHOTO",
    "INFO_REPAIR_PRICE",
    "INFO_REPAIR_ADD_SHOP",
]


def upgrade() -> None:
    op.execute("""
        INSERT INTO action_definition
            (action_code, category_code, display_name, base_xp, daily_count_limit)
        VALUES
            ('INFO_WEATHER_VIEW',      'INFO', '날씨 첫 조회',          5,  1),
            ('INFO_FAVORITE_LOCATION', 'INFO', '즐겨찾기 위치 등록',    10, 3),
            ('INFO_FLOOD_REPORT',      'INFO', '침수 신고',             30, 5),
            ('INFO_FLOOD_PHOTO',       'INFO', '침수 신고 사진 첨부',   10, 5),
            ('INFO_FLOOD_CONFIRM',     'INFO', '침수 확인',             10, 5),
            ('INFO_GAS_WAIT_REPORT',   'INFO', '주유 대기 신고',         5, 5),
            ('INFO_REPAIR_REVIEW',     'INFO', '정비 리뷰 작성',        50, 3),
            ('INFO_REPAIR_PHOTO',      'INFO', '정비 리뷰 사진 첨부',   10, 3),
            ('INFO_REPAIR_PRICE',      'INFO', '정비 가격 정보 제공',   10, 3),
            ('INFO_REPAIR_ADD_SHOP',   'INFO', '새 정비소 추가',        80, 1)
        ON CONFLICT (action_code) DO NOTHING
    """)


def downgrade() -> None:
    placeholders = ", ".join(f"'{code}'" for code in _ACTION_CODES)
    op.execute(f"DELETE FROM action_definition WHERE action_code IN ({placeholders})")
