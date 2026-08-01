"""아이템 착용효과 시드 — 슬롯별 effect_type 부여 (주제별 균형)

기능성 슬롯 18종에 effect_type 부여, 순수 외형 10슬롯은 NULL 유지.
수치는 rarity별 고정 테이블(item_effect_value)에서 자동 결정.
부여 후 개별 조정은 어드민 아이템 편집(effect_type select)에서 수행.

매핑:
- RP_MULT      : HELMET JACKET BOOTS ENGINE WHEEL
- GOLD_MULT    : BODY SEAT NAME RANK BANNER
- QUEST_SLOT   : GLOVES HANDLE PET
- COST_DISCOUNT: EYEWEAR MIRROR NUMBER STICKER TRAIL
- (NULL/외형)  : PANTS KNEE LIGHT TAIL FRAME TITLE BACKDROP START HORN EMOTE

Revision ID: sre036
Revises: sre035
Create Date: 2026-06-02
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre036"
down_revision: Union[str, None] = "sre035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_MAPPING = {
    "RP_MULT": ["HELMET", "JACKET", "BOOTS", "ENGINE", "WHEEL"],
    "GOLD_MULT": ["BODY", "SEAT", "NAME", "RANK", "BANNER"],
    "QUEST_SLOT": ["GLOVES", "HANDLE", "PET"],
    "COST_DISCOUNT": ["EYEWEAR", "MIRROR", "NUMBER", "STICKER", "TRAIL"],
}

_ALL_SLOTS = [s for slots in _MAPPING.values() for s in slots]


def upgrade() -> None:
    for effect_type, slots in _MAPPING.items():
        slot_list = ", ".join(f"'{s}'" for s in slots)
        op.execute(
            f"UPDATE item_definition SET effect_type = '{effect_type}' "
            f"WHERE slot IN ({slot_list})"
        )


def downgrade() -> None:
    slot_list = ", ".join(f"'{s}'" for s in _ALL_SLOTS)
    op.execute(
        f"UPDATE item_definition SET effect_type = NULL WHERE slot IN ({slot_list})"
    )
