"""아이템 착용효과 — item_effect_enum + item_effect_value + effect_type 컬럼

착용효과 4종(RP_MULT/GOLD_MULT/QUEST_SLOT/COST_DISCOUNT)을 정의한다.
- item_definition.effect_type: 아이템이 부여하는 효과 종류(NULL=효과 없음).
- item_effect_value: (effect_type, rarity) → stat_value 고정 테이블(가산 합산).
신규 enum은 트랜잭션 제약이 없어 컬럼 추가·시드를 같은 마이그에서 수행한다.
효과 종류 enum은 engine/app/enums.py ItemEffectEnum 과 값 일치 필수.

Revision ID: sre034
Revises: sre033
Create Date: 2026-06-02
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre034"
down_revision: Union[str, None] = "sre033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (effect_type, {rarity: stat_value}) — 배수효과는 퍼센트포인트, QUEST_SLOT은 슬롯 수
_SEED = {
    "RP_MULT": {"C": 2, "R": 4, "E": 7, "L": 12, "M": 20},
    "GOLD_MULT": {"C": 2, "R": 4, "E": 7, "L": 12, "M": 20},
    "QUEST_SLOT": {"C": 0, "R": 1, "E": 1, "L": 2, "M": 3},
    "COST_DISCOUNT": {"C": 1, "R": 3, "E": 5, "L": 8, "M": 12},
}


def upgrade() -> None:
    op.execute(
        "CREATE TYPE item_effect_enum AS ENUM "
        "('RP_MULT','GOLD_MULT','QUEST_SLOT','COST_DISCOUNT')"
    )
    op.execute(
        "ALTER TABLE item_definition "
        "ADD COLUMN effect_type item_effect_enum NULL"
    )
    op.execute(
        """
        CREATE TABLE item_effect_value (
            effect_type item_effect_enum NOT NULL,
            rarity      item_rarity_enum NOT NULL,
            stat_value  INTEGER NOT NULL,
            PRIMARY KEY (effect_type, rarity)
        )
        """
    )
    rows = [
        f"('{etype}', '{rarity}', {value})"
        for etype, by_rarity in _SEED.items()
        for rarity, value in by_rarity.items()
    ]
    op.execute(
        "INSERT INTO item_effect_value (effect_type, rarity, stat_value) VALUES "
        + ", ".join(rows)
    )


def downgrade() -> None:
    op.execute("ALTER TABLE item_definition DROP COLUMN IF EXISTS effect_type")
    op.execute("DROP TABLE IF EXISTS item_effect_value")
    op.execute("DROP TYPE IF EXISTS item_effect_enum")
