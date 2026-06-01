"""item v7 데이터 리셋 — 컬렉션 7종 + 아이템 125개 시드

Revision ID: sre031
Revises: sre030
Create Date: 2026-05-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sre031"
down_revision: Union[str, None] = "sre030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 유저/구매/가챠 데이터 정리
    for t in ["user_equipment", "item_acquisition_log", "user_item",
              "daily_featured_item", "user_gacha_pity", "gacha_pull_log",
              "lootbox_drop_log", "user_inventory_box", "shop_purchase_log"]:
        op.execute(sa.text(f"TRUNCATE TABLE {t} CASCADE"))

    # 2. 정의 데이터 정리
    for t in ["lootbox_definition", "gacha_definition", "item_definition", "item_collection"]:
        op.execute(sa.text(f"TRUNCATE TABLE {t} CASCADE"))

    # 3. 컬렉션 시드
    op.execute(sa.text("""
        INSERT INTO item_collection (collection_code, display_name, theme_color_hex) VALUES
        ('STREET_CLASSIC', 'Street Classic', '#6B7280'),
        ('NEON_SAIGON', 'Neon Saigon', '#FF6B00'),
        ('MEKONG_DELTA', 'Mekong Delta', '#0E7C66'),
        ('DELIVERY_HUSTLE', 'Delivery Hustle', '#FFD400'),
        ('TET_FESTIVAL', 'Tết Festival', '#C8102E'),
        ('SAIGON_GHOST', 'Saigon Ghost', '#3D1E6D'),
        ('LEGEND_OF_SAIGON', 'Legend of Saigon', '#FFB400')
    """))

    # 4. 아이템 시드 (125개)
    op.execute(sa.text("""
        INSERT INTO item_definition
        (item_code, display_name, slot, rarity, collection_code,
         shop_price_gp, shop_price_gc, is_shop_visible, asset_uri)
        VALUES
        ('HELMET_STREET_CLASSIC_C_01', 'Street Lid', 'HELMET', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-HELMET_STREET_CLASSIC_C_01'),
        ('HELMET_DELIVERY_HUSTLE_R_01', 'Express Lid', 'HELMET', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-HELMET_DELIVERY_HUSTLE_R_01'),
        ('HELMET_NEON_SAIGON_E_01', 'Phantom Shell', 'HELMET', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-HELMET_NEON_SAIGON_E_01'),
        ('HELMET_LEGEND_OF_SAIGON_L_01', 'Imperial Crown', 'HELMET', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-HELMET_LEGEND_OF_SAIGON_L_01'),
        ('HELMET_LEGEND_OF_SAIGON_M_01', 'Saigon Sovereign', 'HELMET', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-HELMET_LEGEND_OF_SAIGON_M_01'),
        ('JACKET_STREET_CLASSIC_C_01', 'Street Basic', 'JACKET', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-JACKET_STREET_CLASSIC_C_01'),
        ('JACKET_DELIVERY_HUSTLE_R_01', 'Express Vest', 'JACKET', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-JACKET_DELIVERY_HUSTLE_R_01'),
        ('JACKET_SAIGON_GHOST_E_01', 'Shadow Rider', 'JACKET', 'E', 'SAIGON_GHOST', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-JACKET_SAIGON_GHOST_E_01'),
        ('JACKET_LEGEND_OF_SAIGON_L_01', 'Imperial Coat', 'JACKET', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-JACKET_LEGEND_OF_SAIGON_L_01'),
        ('JACKET_LEGEND_OF_SAIGON_M_01', 'Saigon Sovereign Coat', 'JACKET', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-JACKET_LEGEND_OF_SAIGON_M_01'),
        ('GLOVES_STREET_CLASSIC_C_01', 'Daily Black', 'GLOVES', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-GLOVES_STREET_CLASSIC_C_01'),
        ('GLOVES_DELIVERY_HUSTLE_R_01', 'Express Hi-Vis', 'GLOVES', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-GLOVES_DELIVERY_HUSTLE_R_01'),
        ('GLOVES_NEON_SAIGON_E_01', 'Cyber Knuckle', 'GLOVES', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-GLOVES_NEON_SAIGON_E_01'),
        ('GLOVES_LEGEND_OF_SAIGON_L_01', 'Golden Knuckle', 'GLOVES', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-GLOVES_LEGEND_OF_SAIGON_L_01'),
        ('GLOVES_LEGEND_OF_SAIGON_M_01', 'Saigon Royalty Gauntlet', 'GLOVES', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-GLOVES_LEGEND_OF_SAIGON_M_01'),
        ('EYEWEAR_STREET_CLASSIC_C_01', 'Basic Shades', 'EYEWEAR', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-EYEWEAR_STREET_CLASSIC_C_01'),
        ('EYEWEAR_NEON_SAIGON_R_01', 'Cyber Mirror', 'EYEWEAR', 'R', 'NEON_SAIGON', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-EYEWEAR_NEON_SAIGON_R_01'),
        ('EYEWEAR_SAIGON_GHOST_E_01', 'Phantom Visor', 'EYEWEAR', 'E', 'SAIGON_GHOST', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-EYEWEAR_SAIGON_GHOST_E_01'),
        ('EYEWEAR_LEGEND_OF_SAIGON_L_01', 'Golden Aviator', 'EYEWEAR', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-EYEWEAR_LEGEND_OF_SAIGON_L_01'),
        ('EYEWEAR_TET_FESTIVAL_M_01', 'Dragon Eye', 'EYEWEAR', 'M', 'TET_FESTIVAL', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-EYEWEAR_TET_FESTIVAL_M_01'),
        ('BOOTS_STREET_CLASSIC_C_01', 'Daily Black', 'BOOTS', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-BOOTS_STREET_CLASSIC_C_01'),
        ('BOOTS_MEKONG_DELTA_R_01', 'Delta Trekker', 'BOOTS', 'R', 'MEKONG_DELTA', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-BOOTS_MEKONG_DELTA_R_01'),
        ('BOOTS_SAIGON_GHOST_E_01', 'Phantom Boots', 'BOOTS', 'E', 'SAIGON_GHOST', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-BOOTS_SAIGON_GHOST_E_01'),
        ('BOOTS_LEGEND_OF_SAIGON_L_01', 'Imperial Step', 'BOOTS', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-BOOTS_LEGEND_OF_SAIGON_L_01'),
        ('BOOTS_LEGEND_OF_SAIGON_M_01', 'Saigon Conquest Boots', 'BOOTS', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-BOOTS_LEGEND_OF_SAIGON_M_01'),
        ('NAME_STREET_CLASSIC_C_01', 'Rider Badge', 'NAME', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-NAME_STREET_CLASSIC_C_01'),
        ('NAME_DELIVERY_HUSTLE_R_01', 'Express Badge', 'NAME', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-NAME_DELIVERY_HUSTLE_R_01'),
        ('NAME_NEON_SAIGON_E_01', 'Cyber Tag', 'NAME', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-NAME_NEON_SAIGON_E_01'),
        ('NAME_LEGEND_OF_SAIGON_L_01', 'Royal Badge', 'NAME', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-NAME_LEGEND_OF_SAIGON_L_01'),
        ('NAME_LEGEND_OF_SAIGON_M_01', 'Saigon Royalty', 'NAME', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-NAME_LEGEND_OF_SAIGON_M_01'),
        ('BODY_STREET_CLASSIC_C_01', 'Matte White', 'BODY', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-BODY_STREET_CLASSIC_C_01'),
        ('BODY_DELIVERY_HUSTLE_R_01', 'Express Yellow', 'BODY', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-BODY_DELIVERY_HUSTLE_R_01'),
        ('BODY_NEON_SAIGON_E_01', 'Cyber Neon Body', 'BODY', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-BODY_NEON_SAIGON_E_01'),
        ('BODY_TET_FESTIVAL_L_01', 'Lunar Red Gold', 'BODY', 'L', 'TET_FESTIVAL', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-BODY_TET_FESTIVAL_L_01'),
        ('BODY_LEGEND_OF_SAIGON_M_01', 'Sài Gòn Golden Wave', 'BODY', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-BODY_LEGEND_OF_SAIGON_M_01'),
        ('ENGINE_STREET_CLASSIC_C_01', 'Stock Block', 'ENGINE', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-ENGINE_STREET_CLASSIC_C_01'),
        ('ENGINE_MEKONG_DELTA_R_01', 'Brass Engine', 'ENGINE', 'R', 'MEKONG_DELTA', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-ENGINE_MEKONG_DELTA_R_01'),
        ('ENGINE_NEON_SAIGON_E_01', 'Cyber Engine', 'ENGINE', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-ENGINE_NEON_SAIGON_E_01'),
        ('ENGINE_LEGEND_OF_SAIGON_L_01', 'Golden Heart', 'ENGINE', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-ENGINE_LEGEND_OF_SAIGON_L_01'),
        ('ENGINE_SAIGON_GHOST_M_01', 'Phantom Core', 'ENGINE', 'M', 'SAIGON_GHOST', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-ENGINE_SAIGON_GHOST_M_01'),
        ('SEAT_STREET_CLASSIC_C_01', 'Basic Black', 'SEAT', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-SEAT_STREET_CLASSIC_C_01'),
        ('SEAT_MEKONG_DELTA_R_01', 'Brown Leather', 'SEAT', 'R', 'MEKONG_DELTA', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-SEAT_MEKONG_DELTA_R_01'),
        ('SEAT_NEON_SAIGON_E_01', 'Cyber Stripe', 'SEAT', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-SEAT_NEON_SAIGON_E_01'),
        ('SEAT_LEGEND_OF_SAIGON_L_01', 'Imperial Throne', 'SEAT', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-SEAT_LEGEND_OF_SAIGON_L_01'),
        ('SEAT_LEGEND_OF_SAIGON_M_01', 'Royalty Throne', 'SEAT', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-SEAT_LEGEND_OF_SAIGON_M_01'),
        ('STICKER_STREET_CLASSIC_C_01', 'Stripe Line', 'STICKER', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-STICKER_STREET_CLASSIC_C_01'),
        ('STICKER_DELIVERY_HUSTLE_R_01', 'Hustle Lightning', 'STICKER', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-STICKER_DELIVERY_HUSTLE_R_01'),
        ('STICKER_NEON_SAIGON_E_01', 'Cyber Glyph', 'STICKER', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-STICKER_NEON_SAIGON_E_01'),
        ('STICKER_TET_FESTIVAL_L_01', 'Lunar Phoenix', 'STICKER', 'L', 'TET_FESTIVAL', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-STICKER_TET_FESTIVAL_L_01'),
        ('STICKER_LEGEND_OF_SAIGON_M_01', 'Saigon Dragon', 'STICKER', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-STICKER_LEGEND_OF_SAIGON_M_01'),
        ('HANDLE_STREET_CLASSIC_C_01', 'Stock Bar', 'HANDLE', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-HANDLE_STREET_CLASSIC_C_01'),
        ('HANDLE_MEKONG_DELTA_R_01', 'Wood Grip', 'HANDLE', 'R', 'MEKONG_DELTA', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-HANDLE_MEKONG_DELTA_R_01'),
        ('HANDLE_NEON_SAIGON_E_01', 'Cyber Grip', 'HANDLE', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-HANDLE_NEON_SAIGON_E_01'),
        ('HANDLE_LEGEND_OF_SAIGON_L_01', 'Golden Bar', 'HANDLE', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-HANDLE_LEGEND_OF_SAIGON_L_01'),
        ('HANDLE_LEGEND_OF_SAIGON_M_01', 'Imperial Bar', 'HANDLE', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-HANDLE_LEGEND_OF_SAIGON_M_01'),
        ('MIRROR_STREET_CLASSIC_C_01', 'Stock Round', 'MIRROR', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-MIRROR_STREET_CLASSIC_C_01'),
        ('MIRROR_DELIVERY_HUSTLE_R_01', 'Reflective Yellow', 'MIRROR', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-MIRROR_DELIVERY_HUSTLE_R_01'),
        ('MIRROR_NEON_SAIGON_E_01', 'Cyber Carbon', 'MIRROR', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-MIRROR_NEON_SAIGON_E_01'),
        ('MIRROR_LEGEND_OF_SAIGON_L_01', 'Golden Eye', 'MIRROR', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-MIRROR_LEGEND_OF_SAIGON_L_01'),
        ('MIRROR_LEGEND_OF_SAIGON_M_01', 'Imperial Vision', 'MIRROR', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-MIRROR_LEGEND_OF_SAIGON_M_01'),
        ('LIGHT_STREET_CLASSIC_C_01', 'Stock Round', 'LIGHT', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-LIGHT_STREET_CLASSIC_C_01'),
        ('LIGHT_NEON_SAIGON_R_01', 'Neon Pink Glow', 'LIGHT', 'R', 'NEON_SAIGON', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-LIGHT_NEON_SAIGON_R_01'),
        ('LIGHT_NEON_SAIGON_E_01', 'Bùi Viện Beam', 'LIGHT', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-LIGHT_NEON_SAIGON_E_01'),
        ('LIGHT_LEGEND_OF_SAIGON_L_01', 'Golden Beacon', 'LIGHT', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-LIGHT_LEGEND_OF_SAIGON_L_01'),
        ('LIGHT_LEGEND_OF_SAIGON_M_01', 'Crown Beacon', 'LIGHT', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-LIGHT_LEGEND_OF_SAIGON_M_01'),
        ('TAIL_STREET_CLASSIC_C_01', 'Stock Pipe', 'TAIL', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-TAIL_STREET_CLASSIC_C_01'),
        ('TAIL_DELIVERY_HUSTLE_R_01', 'Hustle Pipe', 'TAIL', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-TAIL_DELIVERY_HUSTLE_R_01'),
        ('TAIL_NEON_SAIGON_E_01', 'Cyber Exhaust', 'TAIL', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-TAIL_NEON_SAIGON_E_01'),
        ('TAIL_LEGEND_OF_SAIGON_L_01', 'Golden Pipe', 'TAIL', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-TAIL_LEGEND_OF_SAIGON_L_01'),
        ('TAIL_LEGEND_OF_SAIGON_M_01', 'Phoenix Tail', 'TAIL', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-TAIL_LEGEND_OF_SAIGON_M_01'),
        ('NUMBER_STREET_CLASSIC_C_01', 'Stock Plate', 'NUMBER', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-NUMBER_STREET_CLASSIC_C_01'),
        ('NUMBER_DELIVERY_HUSTLE_R_01', 'Hi-Vis Frame', 'NUMBER', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-NUMBER_DELIVERY_HUSTLE_R_01'),
        ('NUMBER_NEON_SAIGON_E_01', 'Cyber LED Frame', 'NUMBER', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-NUMBER_NEON_SAIGON_E_01'),
        ('NUMBER_LEGEND_OF_SAIGON_L_01', 'Golden Frame', 'NUMBER', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-NUMBER_LEGEND_OF_SAIGON_L_01'),
        ('NUMBER_LEGEND_OF_SAIGON_M_01', 'Royalty Plate', 'NUMBER', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-NUMBER_LEGEND_OF_SAIGON_M_01'),
        ('TITLE_STREET_CLASSIC_C_01', '(TBD)', 'TITLE', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-TITLE_STREET_CLASSIC_C_01'),
        ('TITLE_DELIVERY_HUSTLE_R_01', '(TBD)', 'TITLE', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-TITLE_DELIVERY_HUSTLE_R_01'),
        ('TITLE_NEON_SAIGON_E_01', '(TBD)', 'TITLE', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-TITLE_NEON_SAIGON_E_01'),
        ('TITLE_LEGEND_OF_SAIGON_L_01', '(TBD)', 'TITLE', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-TITLE_LEGEND_OF_SAIGON_L_01'),
        ('TITLE_LEGEND_OF_SAIGON_M_01', '(TBD)', 'TITLE', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-TITLE_LEGEND_OF_SAIGON_M_01'),
        ('RANK_STREET_CLASSIC_C_01', '(TBD)', 'RANK', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-RANK_STREET_CLASSIC_C_01'),
        ('RANK_MEKONG_DELTA_R_01', '(TBD)', 'RANK', 'R', 'MEKONG_DELTA', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-RANK_MEKONG_DELTA_R_01'),
        ('RANK_NEON_SAIGON_E_01', '(TBD)', 'RANK', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-RANK_NEON_SAIGON_E_01'),
        ('RANK_LEGEND_OF_SAIGON_L_01', '(TBD)', 'RANK', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-RANK_LEGEND_OF_SAIGON_L_01'),
        ('RANK_LEGEND_OF_SAIGON_M_01', '(TBD)', 'RANK', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-RANK_LEGEND_OF_SAIGON_M_01'),
        ('FRAME_STREET_CLASSIC_C_01', '(TBD)', 'FRAME', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-FRAME_STREET_CLASSIC_C_01'),
        ('FRAME_DELIVERY_HUSTLE_R_01', '(TBD)', 'FRAME', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-FRAME_DELIVERY_HUSTLE_R_01'),
        ('FRAME_NEON_SAIGON_E_01', '(TBD)', 'FRAME', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-FRAME_NEON_SAIGON_E_01'),
        ('FRAME_LEGEND_OF_SAIGON_L_01', '(TBD)', 'FRAME', 'L', 'LEGEND_OF_SAIGON', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-FRAME_LEGEND_OF_SAIGON_L_01'),
        ('FRAME_LEGEND_OF_SAIGON_M_01', '(TBD)', 'FRAME', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-FRAME_LEGEND_OF_SAIGON_M_01'),
        ('TRAIL_STREET_CLASSIC_C_01', '(TBD)', 'TRAIL', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-TRAIL_STREET_CLASSIC_C_01'),
        ('TRAIL_DELIVERY_HUSTLE_R_01', '(TBD)', 'TRAIL', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-TRAIL_DELIVERY_HUSTLE_R_01'),
        ('TRAIL_NEON_SAIGON_E_01', '(TBD)', 'TRAIL', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-TRAIL_NEON_SAIGON_E_01'),
        ('TRAIL_TET_FESTIVAL_L_01', '(TBD)', 'TRAIL', 'L', 'TET_FESTIVAL', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-TRAIL_TET_FESTIVAL_L_01'),
        ('TRAIL_LEGEND_OF_SAIGON_M_01', '(TBD)', 'TRAIL', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-TRAIL_LEGEND_OF_SAIGON_M_01'),
        ('START_STREET_CLASSIC_C_01', '(TBD)', 'START', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-START_STREET_CLASSIC_C_01'),
        ('START_NEON_SAIGON_R_01', '(TBD)', 'START', 'R', 'NEON_SAIGON', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-START_NEON_SAIGON_R_01'),
        ('START_SAIGON_GHOST_E_01', '(TBD)', 'START', 'E', 'SAIGON_GHOST', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-START_SAIGON_GHOST_E_01'),
        ('START_TET_FESTIVAL_L_01', '(TBD)', 'START', 'L', 'TET_FESTIVAL', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-START_TET_FESTIVAL_L_01'),
        ('START_LEGEND_OF_SAIGON_M_01', '(TBD)', 'START', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-START_LEGEND_OF_SAIGON_M_01'),
        ('HORN_STREET_CLASSIC_C_01', '(TBD)', 'HORN', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-HORN_STREET_CLASSIC_C_01'),
        ('HORN_DELIVERY_HUSTLE_R_01', '(TBD)', 'HORN', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-HORN_DELIVERY_HUSTLE_R_01'),
        ('HORN_NEON_SAIGON_E_01', '(TBD)', 'HORN', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-HORN_NEON_SAIGON_E_01'),
        ('HORN_TET_FESTIVAL_L_01', '(TBD)', 'HORN', 'L', 'TET_FESTIVAL', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-HORN_TET_FESTIVAL_L_01'),
        ('HORN_LEGEND_OF_SAIGON_M_01', '(TBD)', 'HORN', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-HORN_LEGEND_OF_SAIGON_M_01'),
        ('BANNER_STREET_CLASSIC_C_01', '(TBD)', 'BANNER', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-BANNER_STREET_CLASSIC_C_01'),
        ('BANNER_DELIVERY_HUSTLE_R_01', '(TBD)', 'BANNER', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-BANNER_DELIVERY_HUSTLE_R_01'),
        ('BANNER_NEON_SAIGON_E_01', '(TBD)', 'BANNER', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-BANNER_NEON_SAIGON_E_01'),
        ('BANNER_TET_FESTIVAL_L_01', '(TBD)', 'BANNER', 'L', 'TET_FESTIVAL', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-BANNER_TET_FESTIVAL_L_01'),
        ('BANNER_LEGEND_OF_SAIGON_M_01', '(TBD)', 'BANNER', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-BANNER_LEGEND_OF_SAIGON_M_01'),
        ('BACKDROP_STREET_CLASSIC_C_01', '(TBD)', 'BACKDROP', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-BACKDROP_STREET_CLASSIC_C_01'),
        ('BACKDROP_MEKONG_DELTA_R_01', '(TBD)', 'BACKDROP', 'R', 'MEKONG_DELTA', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-BACKDROP_MEKONG_DELTA_R_01'),
        ('BACKDROP_NEON_SAIGON_E_01', '(TBD)', 'BACKDROP', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-BACKDROP_NEON_SAIGON_E_01'),
        ('BACKDROP_SAIGON_GHOST_L_01', '(TBD)', 'BACKDROP', 'L', 'SAIGON_GHOST', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-BACKDROP_SAIGON_GHOST_L_01'),
        ('BACKDROP_LEGEND_OF_SAIGON_M_01', '(TBD)', 'BACKDROP', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-BACKDROP_LEGEND_OF_SAIGON_M_01'),
        ('EMOTE_STREET_CLASSIC_C_01', '(TBD)', 'EMOTE', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-EMOTE_STREET_CLASSIC_C_01'),
        ('EMOTE_DELIVERY_HUSTLE_R_01', '(TBD)', 'EMOTE', 'R', 'DELIVERY_HUSTLE', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-EMOTE_DELIVERY_HUSTLE_R_01'),
        ('EMOTE_NEON_SAIGON_E_01', '(TBD)', 'EMOTE', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-EMOTE_NEON_SAIGON_E_01'),
        ('EMOTE_TET_FESTIVAL_L_01', '(TBD)', 'EMOTE', 'L', 'TET_FESTIVAL', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-EMOTE_TET_FESTIVAL_L_01'),
        ('EMOTE_LEGEND_OF_SAIGON_M_01', '(TBD)', 'EMOTE', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-EMOTE_LEGEND_OF_SAIGON_M_01'),
        ('PET_STREET_CLASSIC_C_01', '(TBD)', 'PET', 'C', 'STREET_CLASSIC', 300, NULL, true, 'sprite://saigon-rider-items.svg#item-PET_STREET_CLASSIC_C_01'),
        ('PET_MEKONG_DELTA_R_01', '(TBD)', 'PET', 'R', 'MEKONG_DELTA', 2000, NULL, true, 'sprite://saigon-rider-items.svg#item-PET_MEKONG_DELTA_R_01'),
        ('PET_NEON_SAIGON_E_01', '(TBD)', 'PET', 'E', 'NEON_SAIGON', 10000, NULL, true, 'sprite://saigon-rider-items.svg#item-PET_NEON_SAIGON_E_01'),
        ('PET_TET_FESTIVAL_L_01', '(TBD)', 'PET', 'L', 'TET_FESTIVAL', 35000, 100, true, 'sprite://saigon-rider-items.svg#item-PET_TET_FESTIVAL_L_01'),
        ('PET_LEGEND_OF_SAIGON_M_01', '(TBD)', 'PET', 'M', 'LEGEND_OF_SAIGON', NULL, 500, false, 'sprite://saigon-rider-items.svg#item-PET_LEGEND_OF_SAIGON_M_01')
    """))


def downgrade() -> None:
    pass
