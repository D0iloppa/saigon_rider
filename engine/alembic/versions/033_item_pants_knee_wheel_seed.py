"""item 시드 — PANTS / KNEE / WHEEL 부위 3종 ×5등급 = 15개 추가

기존 카탈로그(125개) 유지하고 additive INSERT 만 수행(TRUNCATE 없음).
가격/노출 티어는 031 패턴 동일(C=300, R=2000, E=10000, L=35000/100GC, M=500GC·비노출).

Revision ID: sre033
Revises: sre032
Create Date: 2026-06-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre033"
down_revision: Union[str, None] = "sre032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        INSERT INTO item_definition
        (item_code, display_name, slot, rarity, collection_code,
         shop_price_gp, shop_price_gc, is_shop_visible, asset_uri)
        VALUES
        ('PANTS_STREET_CLASSIC_C_01', 'Daily Jeans', 'PANTS', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-PANTS_STREET_CLASSIC_C_01'),
        ('PANTS_DELIVERY_HUSTLE_R_01', 'Express Cargo', 'PANTS', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-PANTS_DELIVERY_HUSTLE_R_01'),
        ('PANTS_SAIGON_GHOST_E_01', 'Phantom Trousers', 'PANTS', 'E', 'SAIGON_GHOST', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-PANTS_SAIGON_GHOST_E_01'),
        ('PANTS_LEGEND_OF_SAIGON_L_01', 'Imperial Trousers', 'PANTS', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-PANTS_LEGEND_OF_SAIGON_L_01'),
        ('PANTS_LEGEND_OF_SAIGON_M_01', 'Saigon Sovereign Pants', 'PANTS', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-PANTS_LEGEND_OF_SAIGON_M_01'),
        ('KNEE_STREET_CLASSIC_C_01', 'Basic Pads', 'KNEE', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-KNEE_STREET_CLASSIC_C_01'),
        ('KNEE_MEKONG_DELTA_R_01', 'Delta Guard', 'KNEE', 'R', 'MEKONG_DELTA', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-KNEE_MEKONG_DELTA_R_01'),
        ('KNEE_NEON_SAIGON_E_01', 'Cyber Knee', 'KNEE', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-KNEE_NEON_SAIGON_E_01'),
        ('KNEE_LEGEND_OF_SAIGON_L_01', 'Golden Guard', 'KNEE', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-KNEE_LEGEND_OF_SAIGON_L_01'),
        ('KNEE_LEGEND_OF_SAIGON_M_01', 'Saigon Royalty Knee', 'KNEE', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-KNEE_LEGEND_OF_SAIGON_M_01'),
        ('WHEEL_STREET_CLASSIC_C_01', 'Stock Alloy', 'WHEEL', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-WHEEL_STREET_CLASSIC_C_01'),
        ('WHEEL_DELIVERY_HUSTLE_R_01', 'Hustle Spoke', 'WHEEL', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-WHEEL_DELIVERY_HUSTLE_R_01'),
        ('WHEEL_NEON_SAIGON_E_01', 'Cyber Rim', 'WHEEL', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-WHEEL_NEON_SAIGON_E_01'),
        ('WHEEL_LEGEND_OF_SAIGON_L_01', 'Golden Rim', 'WHEEL', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-WHEEL_LEGEND_OF_SAIGON_L_01'),
        ('WHEEL_LEGEND_OF_SAIGON_M_01', 'Phoenix Wheel', 'WHEEL', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-WHEEL_LEGEND_OF_SAIGON_M_01')
    """))


def downgrade() -> None:
    pass
