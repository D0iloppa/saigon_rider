"""게이미피케이션 시드 — 액션 14개 + 컬렉션 7 + 아이템 213 + 박스 8 + 가챠 5 + 미션 보상 240

Revision ID: sre014
Revises: sre013
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre014"
down_revision: Union[str, None] = "sre013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ACTION_SEED = """
INSERT INTO action_definition (
  action_code, display_name, base_rp, is_active, category_code
) VALUES
('PHOTO_UPLOAD','사진 업로드',3,TRUE,'COMMUNITY'),
('DAILY_INSPECTION','일일 점검',5,TRUE,'MAINT'),
('POST_CREATE','피드 게시물 작성',4,TRUE,'COMMUNITY'),
('LIKE_RECEIVED','좋아요 받음',1,TRUE,'COMMUNITY'),
('COMMENT_POST','댓글 작성',2,TRUE,'COMMUNITY'),
('PROFILE_UPDATE','프로필 정보 입력',5,TRUE,'MIXED'),
('DRIVER_VERIFY','드라이버 인증',0,TRUE,'DELIVERY'),
('MARKET_BROWSE','부품 조회',1,TRUE,'MARKET'),
('MARKET_INQUIRY','판매자 문의',2,TRUE,'MARKET'),
('MARKET_FAVORITE','즐겨찾기',1,TRUE,'MARKET'),
('MARKET_CHAT','판매자 채팅',1,TRUE,'MARKET'),
('CAR_WASH_RECEIPT','세차 영수증',3,TRUE,'MAINT'),
('PART_REPLACE','부품 교체 인증',5,TRUE,'MAINT'),
('ACCOUNT_AGE','가입 경과일',0,TRUE,'MIXED')
ON CONFLICT (action_code) DO NOTHING
"""

_COLLECTION_SEED = """
INSERT INTO item_collection (collection_code, display_name, theme_color_hex, status, sort_order) VALUES
('STREET_CLASSIC','Street Classic','#6B7280','ACTIVE',10),
('NEON_SAIGON','Neon Saigon','#FF6B00','ACTIVE',20),
('MEKONG_DELTA','Mekong Delta','#0E7C66','ACTIVE',30),
('DELIVERY_HUSTLE','Delivery Hustle','#FFD400','ACTIVE',40),
('TET_FESTIVAL','Tết Festival','#C8102E','ACTIVE',50),
('SAIGON_GHOST','Saigon Ghost','#3D1E6D','ACTIVE',60),
('LEGEND_OF_SAIGON','Legend of Saigon','#FFB400','ACTIVE',70)
ON CONFLICT (collection_code) DO NOTHING
"""

_ITEM_SEED = """
INSERT INTO item_definition (
  item_code, display_name, slot, rarity, collection_code,
  shop_price_gp, shop_price_gc, is_shop_visible,
  season_lock, required_season_code, asset_uri
) VALUES
('HELMET_STREET_CLASSIC_C_01','Matte Helmet','HELMET','C','STREET_CLASSIC',130,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_street_classic_c_01.svg'),
('HELMET_STREET_CLASSIC_C_02','Plain Helmet','HELMET','C','STREET_CLASSIC',270,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_street_classic_c_02.svg'),
('HELMET_STREET_CLASSIC_C_03','Cotton Helmet','HELMET','C','STREET_CLASSIC',200,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_street_classic_c_03.svg'),
('HELMET_STREET_CLASSIC_C_04','Classic Helmet','HELMET','C','STREET_CLASSIC',540,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_street_classic_c_04.svg'),
('HELMET_STREET_CLASSIC_C_05','Daily Helmet','HELMET','C','STREET_CLASSIC',480,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_street_classic_c_05.svg'),
('HELMET_STREET_CLASSIC_C_06','Worn Helmet','HELMET','C','STREET_CLASSIC',140,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_street_classic_c_06.svg'),
('HELMET_STREET_CLASSIC_C_07','Vintage Helmet','HELMET','C','STREET_CLASSIC',180,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_street_classic_c_07.svg'),
('HELMET_STREET_CLASSIC_C_08','Heritage Helmet','HELMET','C','STREET_CLASSIC',260,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_street_classic_c_08.svg'),
('HELMET_NEON_SAIGON_R_01','LED Helmet','HELMET','R','NEON_SAIGON',1900,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_neon_saigon_r_01.svg'),
('HELMET_NEON_SAIGON_R_02','Neon Helmet','HELMET','R','NEON_SAIGON',2000,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_neon_saigon_r_02.svg'),
('HELMET_NEON_SAIGON_R_03','Glow Helmet','HELMET','R','NEON_SAIGON',2300,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_neon_saigon_r_03.svg'),
('HELMET_NEON_SAIGON_R_04','Cyber Helmet','HELMET','R','NEON_SAIGON',1700,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_neon_saigon_r_04.svg'),
('HELMET_NEON_SAIGON_R_05','Pulse Helmet','HELMET','R','NEON_SAIGON',2600,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_neon_saigon_r_05.svg'),
('HELMET_NEON_SAIGON_E_01','LED Helmet','HELMET','E','NEON_SAIGON',9100,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_neon_saigon_e_01.svg'),
('HELMET_NEON_SAIGON_E_02','Neon Helmet','HELMET','E','NEON_SAIGON',12600,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_neon_saigon_e_02.svg'),
('HELMET_NEON_SAIGON_E_03','Glow Helmet','HELMET','E','NEON_SAIGON',7800,NULL,TRUE,FALSE,NULL,'asset://items/helmet/helmet_neon_saigon_e_03.svg'),
('HELMET_TET_FESTIVAL_L_01','Red Helmet ★','HELMET','L','TET_FESTIVAL',28000,230,FALSE,TRUE,'TET_S1','asset://items/helmet/helmet_tet_festival_l_01.svg'),
('HELMET_TET_FESTIVAL_L_02','Gold Helmet ★','HELMET','L','TET_FESTIVAL',48000,200,FALSE,TRUE,'TET_S1','asset://items/helmet/helmet_tet_festival_l_02.svg'),
('HELMET_LEGEND_OF_SAIGON_M_01','Gold Dragon Helmet ✦','HELMET','M','LEGEND_OF_SAIGON',NULL,520,FALSE,FALSE,NULL,'asset://items/helmet/helmet_legend_of_saigon_m_01.svg'),
('JACKET_STREET_CLASSIC_C_01','Matte Jacket','JACKET','C','STREET_CLASSIC',380,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_street_classic_c_01.svg'),
('JACKET_STREET_CLASSIC_C_02','Plain Jacket','JACKET','C','STREET_CLASSIC',500,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_street_classic_c_02.svg'),
('JACKET_STREET_CLASSIC_C_03','Cotton Jacket','JACKET','C','STREET_CLASSIC',550,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_street_classic_c_03.svg'),
('JACKET_STREET_CLASSIC_C_04','Classic Jacket','JACKET','C','STREET_CLASSIC',510,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_street_classic_c_04.svg'),
('JACKET_STREET_CLASSIC_C_05','Daily Jacket','JACKET','C','STREET_CLASSIC',600,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_street_classic_c_05.svg'),
('JACKET_STREET_CLASSIC_C_06','Worn Jacket','JACKET','C','STREET_CLASSIC',160,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_street_classic_c_06.svg'),
('JACKET_DELIVERY_HUSTLE_R_01','Cargo Jacket','JACKET','R','DELIVERY_HUSTLE',2600,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_delivery_hustle_r_01.svg'),
('JACKET_DELIVERY_HUSTLE_R_02','Hi-Vis Jacket','JACKET','R','DELIVERY_HUSTLE',2300,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_delivery_hustle_r_02.svg'),
('JACKET_DELIVERY_HUSTLE_R_03','Courier Jacket','JACKET','R','DELIVERY_HUSTLE',3100,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_delivery_hustle_r_03.svg'),
('JACKET_DELIVERY_HUSTLE_R_04','Box Jacket','JACKET','R','DELIVERY_HUSTLE',3500,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_delivery_hustle_r_04.svg'),
('JACKET_TET_FESTIVAL_E_01','Red Jacket','JACKET','E','TET_FESTIVAL',10000,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_tet_festival_e_01.svg'),
('JACKET_TET_FESTIVAL_E_02','Gold Jacket','JACKET','E','TET_FESTIVAL',14100,NULL,TRUE,FALSE,NULL,'asset://items/jacket/jacket_tet_festival_e_02.svg'),
('JACKET_LEGEND_OF_SAIGON_L_01','Gold Dragon Jacket ★','JACKET','L','LEGEND_OF_SAIGON',55000,220,TRUE,FALSE,NULL,'asset://items/jacket/jacket_legend_of_saigon_l_01.svg'),
('JACKET_LEGEND_OF_SAIGON_M_01','Gold Dragon Jacket ✦','JACKET','M','LEGEND_OF_SAIGON',NULL,370,FALSE,FALSE,NULL,'asset://items/jacket/jacket_legend_of_saigon_m_01.svg'),
('GLOVES_STREET_CLASSIC_C_01','Matte Gloves','GLOVES','C','STREET_CLASSIC',130,NULL,TRUE,FALSE,NULL,'asset://items/gloves/gloves_street_classic_c_01.svg'),
('GLOVES_STREET_CLASSIC_C_02','Plain Gloves','GLOVES','C','STREET_CLASSIC',200,NULL,TRUE,FALSE,NULL,'asset://items/gloves/gloves_street_classic_c_02.svg'),
('GLOVES_STREET_CLASSIC_C_03','Cotton Gloves','GLOVES','C','STREET_CLASSIC',300,NULL,TRUE,FALSE,NULL,'asset://items/gloves/gloves_street_classic_c_03.svg'),
('GLOVES_STREET_CLASSIC_C_04','Classic Gloves','GLOVES','C','STREET_CLASSIC',320,NULL,TRUE,FALSE,NULL,'asset://items/gloves/gloves_street_classic_c_04.svg'),
('GLOVES_MEKONG_DELTA_R_01','River Gloves','GLOVES','R','MEKONG_DELTA',700,NULL,TRUE,FALSE,NULL,'asset://items/gloves/gloves_mekong_delta_r_01.svg'),
('GLOVES_MEKONG_DELTA_R_02','Bamboo Gloves','GLOVES','R','MEKONG_DELTA',700,NULL,TRUE,FALSE,NULL,'asset://items/gloves/gloves_mekong_delta_r_02.svg'),
('GLOVES_MEKONG_DELTA_R_03','Lotus Gloves','GLOVES','R','MEKONG_DELTA',1700,NULL,TRUE,FALSE,NULL,'asset://items/gloves/gloves_mekong_delta_r_03.svg'),
('GLOVES_SAIGON_GHOST_E_01','Shadow Gloves','GLOVES','E','SAIGON_GHOST',4300,NULL,TRUE,FALSE,NULL,'asset://items/gloves/gloves_saigon_ghost_e_01.svg'),
('GLOVES_TET_FESTIVAL_L_01','Red Gloves ★','GLOVES','L','TET_FESTIVAL',35000,170,FALSE,TRUE,'TET_S1','asset://items/gloves/gloves_tet_festival_l_01.svg'),
('BOOTS_STREET_CLASSIC_C_01','Matte Boots','BOOTS','C','STREET_CLASSIC',140,NULL,TRUE,FALSE,NULL,'asset://items/boots/boots_street_classic_c_01.svg'),
('BOOTS_STREET_CLASSIC_C_02','Plain Boots','BOOTS','C','STREET_CLASSIC',210,NULL,TRUE,FALSE,NULL,'asset://items/boots/boots_street_classic_c_02.svg'),
('BOOTS_STREET_CLASSIC_C_03','Cotton Boots','BOOTS','C','STREET_CLASSIC',120,NULL,TRUE,FALSE,NULL,'asset://items/boots/boots_street_classic_c_03.svg'),
('BOOTS_STREET_CLASSIC_C_04','Classic Boots','BOOTS','C','STREET_CLASSIC',120,NULL,TRUE,FALSE,NULL,'asset://items/boots/boots_street_classic_c_04.svg'),
('BOOTS_DELIVERY_HUSTLE_R_01','Cargo Boots','BOOTS','R','DELIVERY_HUSTLE',1300,NULL,TRUE,FALSE,NULL,'asset://items/boots/boots_delivery_hustle_r_01.svg'),
('BOOTS_DELIVERY_HUSTLE_R_02','Hi-Vis Boots','BOOTS','R','DELIVERY_HUSTLE',1700,NULL,TRUE,FALSE,NULL,'asset://items/boots/boots_delivery_hustle_r_02.svg'),
('BOOTS_DELIVERY_HUSTLE_R_03','Courier Boots','BOOTS','R','DELIVERY_HUSTLE',1200,NULL,TRUE,FALSE,NULL,'asset://items/boots/boots_delivery_hustle_r_03.svg'),
('BOOTS_DELIVERY_HUSTLE_E_01','Cargo Boots','BOOTS','E','DELIVERY_HUSTLE',9300,NULL,TRUE,FALSE,NULL,'asset://items/boots/boots_delivery_hustle_e_01.svg'),
('BOOTS_LEGEND_OF_SAIGON_L_01','Gold Dragon Boots ★','BOOTS','L','LEGEND_OF_SAIGON',16000,200,TRUE,FALSE,NULL,'asset://items/boots/boots_legend_of_saigon_l_01.svg'),
('EYEWEAR_DELIVERY_HUSTLE_C_01','Cargo Goggles','EYEWEAR','C','DELIVERY_HUSTLE',120,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_delivery_hustle_c_01.svg'),
('EYEWEAR_DELIVERY_HUSTLE_C_02','Hi-Vis Goggles','EYEWEAR','C','DELIVERY_HUSTLE',340,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_delivery_hustle_c_02.svg'),
('EYEWEAR_DELIVERY_HUSTLE_C_03','Courier Goggles','EYEWEAR','C','DELIVERY_HUSTLE',360,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_delivery_hustle_c_03.svg'),
('EYEWEAR_DELIVERY_HUSTLE_C_04','Box Shades','EYEWEAR','C','DELIVERY_HUSTLE',320,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_delivery_hustle_c_04.svg'),
('EYEWEAR_TET_FESTIVAL_R_01','Red Goggles','EYEWEAR','R','TET_FESTIVAL',1900,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_tet_festival_r_01.svg'),
('EYEWEAR_TET_FESTIVAL_R_02','Gold Shades','EYEWEAR','R','TET_FESTIVAL',2200,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_tet_festival_r_02.svg'),
('EYEWEAR_TET_FESTIVAL_R_03','Lunar Shades','EYEWEAR','R','TET_FESTIVAL',700,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_tet_festival_r_03.svg'),
('EYEWEAR_SAIGON_GHOST_E_01','Shadow Goggles','EYEWEAR','E','SAIGON_GHOST',11000,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_saigon_ghost_e_01.svg'),
('EYEWEAR_SAIGON_GHOST_E_02','Phantom Shades','EYEWEAR','E','SAIGON_GHOST',8500,NULL,TRUE,FALSE,NULL,'asset://items/eyewear/eyewear_saigon_ghost_e_02.svg'),
('EYEWEAR_TET_FESTIVAL_L_01','Red Goggles ★','EYEWEAR','L','TET_FESTIVAL',24000,170,FALSE,TRUE,'TET_S1','asset://items/eyewear/eyewear_tet_festival_l_01.svg'),
('NAMEPLATE_STREET_CLASSIC_C_01','Matte Nameplate','NAMEPLATE','C','STREET_CLASSIC',200,NULL,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_street_classic_c_01.svg'),
('NAMEPLATE_STREET_CLASSIC_C_02','Plain Nameplate','NAMEPLATE','C','STREET_CLASSIC',280,NULL,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_street_classic_c_02.svg'),
('NAMEPLATE_STREET_CLASSIC_C_03','Cotton Nameplate','NAMEPLATE','C','STREET_CLASSIC',210,NULL,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_street_classic_c_03.svg'),
('NAMEPLATE_STREET_CLASSIC_R_01','Matte Nameplate','NAMEPLATE','R','STREET_CLASSIC',1700,NULL,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_street_classic_r_01.svg'),
('NAMEPLATE_STREET_CLASSIC_R_02','Plain Nameplate','NAMEPLATE','R','STREET_CLASSIC',1200,NULL,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_street_classic_r_02.svg'),
('NAMEPLATE_STREET_CLASSIC_R_03','Cotton Nameplate','NAMEPLATE','R','STREET_CLASSIC',900,NULL,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_street_classic_r_03.svg'),
('NAMEPLATE_NEON_SAIGON_E_01','LED Nameplate','NAMEPLATE','E','NEON_SAIGON',4600,NULL,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_neon_saigon_e_01.svg'),
('NAMEPLATE_NEON_SAIGON_E_02','Neon Nameplate','NAMEPLATE','E','NEON_SAIGON',8900,NULL,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_neon_saigon_e_02.svg'),
('NAMEPLATE_SAIGON_GHOST_L_01','Shadow Nameplate ★','NAMEPLATE','L','SAIGON_GHOST',22000,60,TRUE,FALSE,NULL,'asset://items/nameplate/nameplate_saigon_ghost_l_01.svg'),
('NAMEPLATE_LEGEND_OF_SAIGON_M_01','Gold Dragon Nameplate ✦','NAMEPLATE','M','LEGEND_OF_SAIGON',NULL,230,FALSE,FALSE,NULL,'asset://items/nameplate/nameplate_legend_of_saigon_m_01.svg'),
('BODY_PAINT_STREET_CLASSIC_C_01','Matte Paint','BODY_PAINT','C','STREET_CLASSIC',310,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_street_classic_c_01.svg'),
('BODY_PAINT_STREET_CLASSIC_C_02','Plain Wrap','BODY_PAINT','C','STREET_CLASSIC',310,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_street_classic_c_02.svg'),
('BODY_PAINT_STREET_CLASSIC_C_03','Cotton Wrap','BODY_PAINT','C','STREET_CLASSIC',200,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_street_classic_c_03.svg'),
('BODY_PAINT_STREET_CLASSIC_C_04','Classic Paint','BODY_PAINT','C','STREET_CLASSIC',190,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_street_classic_c_04.svg'),
('BODY_PAINT_STREET_CLASSIC_C_05','Daily Wrap','BODY_PAINT','C','STREET_CLASSIC',230,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_street_classic_c_05.svg'),
('BODY_PAINT_STREET_CLASSIC_C_06','Worn Paint','BODY_PAINT','C','STREET_CLASSIC',530,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_street_classic_c_06.svg'),
('BODY_PAINT_STREET_CLASSIC_C_07','Vintage Wrap','BODY_PAINT','C','STREET_CLASSIC',330,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_street_classic_c_07.svg'),
('BODY_PAINT_STREET_CLASSIC_C_08','Heritage Paint','BODY_PAINT','C','STREET_CLASSIC',290,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_street_classic_c_08.svg'),
('BODY_PAINT_NEON_SAIGON_R_01','LED Wrap','BODY_PAINT','R','NEON_SAIGON',2900,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_neon_saigon_r_01.svg'),
('BODY_PAINT_NEON_SAIGON_R_02','Neon Paint','BODY_PAINT','R','NEON_SAIGON',3300,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_neon_saigon_r_02.svg'),
('BODY_PAINT_NEON_SAIGON_R_03','Glow Paint','BODY_PAINT','R','NEON_SAIGON',4100,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_neon_saigon_r_03.svg'),
('BODY_PAINT_NEON_SAIGON_R_04','Cyber Paint','BODY_PAINT','R','NEON_SAIGON',1800,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_neon_saigon_r_04.svg'),
('BODY_PAINT_NEON_SAIGON_R_05','Pulse Wrap','BODY_PAINT','R','NEON_SAIGON',2400,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_neon_saigon_r_05.svg'),
('BODY_PAINT_TET_FESTIVAL_E_01','Red Wrap','BODY_PAINT','E','TET_FESTIVAL',14800,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_tet_festival_e_01.svg'),
('BODY_PAINT_TET_FESTIVAL_E_02','Gold Wrap','BODY_PAINT','E','TET_FESTIVAL',20500,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_tet_festival_e_02.svg'),
('BODY_PAINT_TET_FESTIVAL_E_03','Lunar Wrap','BODY_PAINT','E','TET_FESTIVAL',20500,NULL,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_tet_festival_e_03.svg'),
('BODY_PAINT_SAIGON_GHOST_L_01','Shadow Wrap ★','BODY_PAINT','L','SAIGON_GHOST',28000,160,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_saigon_ghost_l_01.svg'),
('BODY_PAINT_SAIGON_GHOST_L_02','Phantom Wrap ★','BODY_PAINT','L','SAIGON_GHOST',39000,160,TRUE,FALSE,NULL,'asset://items/body_paint/body_paint_saigon_ghost_l_02.svg'),
('BODY_PAINT_LEGEND_OF_SAIGON_M_01','Gold Dragon Wrap ✦','BODY_PAINT','M','LEGEND_OF_SAIGON',NULL,520,FALSE,FALSE,NULL,'asset://items/body_paint/body_paint_legend_of_saigon_m_01.svg'),
('WHEEL_DELIVERY_HUSTLE_C_01','Cargo Wheel','WHEEL','C','DELIVERY_HUSTLE',440,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_delivery_hustle_c_01.svg'),
('WHEEL_DELIVERY_HUSTLE_C_02','Hi-Vis Wheel','WHEEL','C','DELIVERY_HUSTLE',290,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_delivery_hustle_c_02.svg'),
('WHEEL_DELIVERY_HUSTLE_C_03','Courier Wheel','WHEEL','C','DELIVERY_HUSTLE',250,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_delivery_hustle_c_03.svg'),
('WHEEL_DELIVERY_HUSTLE_C_04','Box Wheel','WHEEL','C','DELIVERY_HUSTLE',560,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_delivery_hustle_c_04.svg'),
('WHEEL_DELIVERY_HUSTLE_C_05','Route Wheel','WHEEL','C','DELIVERY_HUSTLE',270,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_delivery_hustle_c_05.svg'),
('WHEEL_STREET_CLASSIC_R_01','Matte Wheel','WHEEL','R','STREET_CLASSIC',3000,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_street_classic_r_01.svg'),
('WHEEL_STREET_CLASSIC_R_02','Plain Wheel','WHEEL','R','STREET_CLASSIC',1400,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_street_classic_r_02.svg'),
('WHEEL_STREET_CLASSIC_R_03','Cotton Wheel','WHEEL','R','STREET_CLASSIC',3100,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_street_classic_r_03.svg'),
('WHEEL_STREET_CLASSIC_R_04','Classic Wheel','WHEEL','R','STREET_CLASSIC',3000,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_street_classic_r_04.svg'),
('WHEEL_TET_FESTIVAL_E_01','Red Wheel','WHEEL','E','TET_FESTIVAL',15200,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_tet_festival_e_01.svg'),
('WHEEL_TET_FESTIVAL_E_02','Gold Wheel','WHEEL','E','TET_FESTIVAL',7900,NULL,TRUE,FALSE,NULL,'asset://items/wheel/wheel_tet_festival_e_02.svg'),
('WHEEL_LEGEND_OF_SAIGON_L_01','Gold Dragon Wheel ★','WHEEL','L','LEGEND_OF_SAIGON',40000,340,TRUE,FALSE,NULL,'asset://items/wheel/wheel_legend_of_saigon_l_01.svg'),
('WHEEL_TET_FESTIVAL_M_01','Red Wheel ✦','WHEEL','M','TET_FESTIVAL',NULL,310,FALSE,TRUE,'TET_S1','asset://items/wheel/wheel_tet_festival_m_01.svg'),
('EXHAUST_MEKONG_DELTA_C_01','River Exhaust','EXHAUST','C','MEKONG_DELTA',200,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_mekong_delta_c_01.svg'),
('EXHAUST_MEKONG_DELTA_C_02','Bamboo Exhaust','EXHAUST','C','MEKONG_DELTA',370,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_mekong_delta_c_02.svg'),
('EXHAUST_MEKONG_DELTA_C_03','Lotus Exhaust','EXHAUST','C','MEKONG_DELTA',170,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_mekong_delta_c_03.svg'),
('EXHAUST_MEKONG_DELTA_C_04','Delta Exhaust','EXHAUST','C','MEKONG_DELTA',190,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_mekong_delta_c_04.svg'),
('EXHAUST_NEON_SAIGON_R_01','LED Exhaust','EXHAUST','R','NEON_SAIGON',2700,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_neon_saigon_r_01.svg'),
('EXHAUST_NEON_SAIGON_R_02','Neon Exhaust','EXHAUST','R','NEON_SAIGON',1100,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_neon_saigon_r_02.svg'),
('EXHAUST_NEON_SAIGON_R_03','Glow Exhaust','EXHAUST','R','NEON_SAIGON',1200,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_neon_saigon_r_03.svg'),
('EXHAUST_SAIGON_GHOST_E_01','Shadow Exhaust','EXHAUST','E','SAIGON_GHOST',13900,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_saigon_ghost_e_01.svg'),
('EXHAUST_SAIGON_GHOST_E_02','Phantom Exhaust','EXHAUST','E','SAIGON_GHOST',6500,NULL,TRUE,FALSE,NULL,'asset://items/exhaust/exhaust_saigon_ghost_e_02.svg'),
('EXHAUST_TET_FESTIVAL_L_01','Red Exhaust ★','EXHAUST','L','TET_FESTIVAL',25000,200,FALSE,TRUE,'TET_S1','asset://items/exhaust/exhaust_tet_festival_l_01.svg'),
('HEADLIGHT_DELIVERY_HUSTLE_C_01','Cargo Headlight','HEADLIGHT','C','DELIVERY_HUSTLE',310,NULL,TRUE,FALSE,NULL,'asset://items/headlight/headlight_delivery_hustle_c_01.svg'),
('HEADLIGHT_DELIVERY_HUSTLE_C_02','Hi-Vis Headlight','HEADLIGHT','C','DELIVERY_HUSTLE',270,NULL,TRUE,FALSE,NULL,'asset://items/headlight/headlight_delivery_hustle_c_02.svg'),
('HEADLIGHT_DELIVERY_HUSTLE_C_03','Courier Headlight','HEADLIGHT','C','DELIVERY_HUSTLE',160,NULL,TRUE,FALSE,NULL,'asset://items/headlight/headlight_delivery_hustle_c_03.svg'),
('HEADLIGHT_MEKONG_DELTA_R_01','River Headlight','HEADLIGHT','R','MEKONG_DELTA',700,NULL,TRUE,FALSE,NULL,'asset://items/headlight/headlight_mekong_delta_r_01.svg'),
('HEADLIGHT_MEKONG_DELTA_R_02','Bamboo Headlight','HEADLIGHT','R','MEKONG_DELTA',1700,NULL,TRUE,FALSE,NULL,'asset://items/headlight/headlight_mekong_delta_r_02.svg'),
('HEADLIGHT_MEKONG_DELTA_R_03','Lotus Headlight','HEADLIGHT','R','MEKONG_DELTA',1800,NULL,TRUE,FALSE,NULL,'asset://items/headlight/headlight_mekong_delta_r_03.svg'),
('HEADLIGHT_DELIVERY_HUSTLE_E_01','Cargo Headlight','HEADLIGHT','E','DELIVERY_HUSTLE',12700,NULL,TRUE,FALSE,NULL,'asset://items/headlight/headlight_delivery_hustle_e_01.svg'),
('HEADLIGHT_DELIVERY_HUSTLE_E_02','Hi-Vis Headlight','HEADLIGHT','E','DELIVERY_HUSTLE',6800,NULL,TRUE,FALSE,NULL,'asset://items/headlight/headlight_delivery_hustle_e_02.svg'),
('HEADLIGHT_SAIGON_GHOST_L_01','Shadow Headlight ★','HEADLIGHT','L','SAIGON_GHOST',27000,140,TRUE,FALSE,NULL,'asset://items/headlight/headlight_saigon_ghost_l_01.svg'),
('HEADLIGHT_SAIGON_GHOST_M_01','Shadow Headlight ✦','HEADLIGHT','M','SAIGON_GHOST',NULL,450,FALSE,FALSE,NULL,'asset://items/headlight/headlight_saigon_ghost_m_01.svg'),
('MIRROR_MEKONG_DELTA_C_01','River Mirror','MIRROR','C','MEKONG_DELTA',340,NULL,TRUE,FALSE,NULL,'asset://items/mirror/mirror_mekong_delta_c_01.svg'),
('MIRROR_MEKONG_DELTA_C_02','Bamboo Mirror','MIRROR','C','MEKONG_DELTA',90,NULL,TRUE,FALSE,NULL,'asset://items/mirror/mirror_mekong_delta_c_02.svg'),
('MIRROR_MEKONG_DELTA_C_03','Lotus Mirror','MIRROR','C','MEKONG_DELTA',280,NULL,TRUE,FALSE,NULL,'asset://items/mirror/mirror_mekong_delta_c_03.svg'),
('MIRROR_STREET_CLASSIC_R_01','Matte Mirror','MIRROR','R','STREET_CLASSIC',2000,NULL,TRUE,FALSE,NULL,'asset://items/mirror/mirror_street_classic_r_01.svg'),
('MIRROR_STREET_CLASSIC_R_02','Plain Mirror','MIRROR','R','STREET_CLASSIC',700,NULL,TRUE,FALSE,NULL,'asset://items/mirror/mirror_street_classic_r_02.svg'),
('MIRROR_NEON_SAIGON_E_01','LED Mirror','MIRROR','E','NEON_SAIGON',5600,NULL,TRUE,FALSE,NULL,'asset://items/mirror/mirror_neon_saigon_e_01.svg'),
('DECAL_MEKONG_DELTA_C_01','River Decal','DECAL','C','MEKONG_DELTA',320,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_c_01.svg'),
('DECAL_MEKONG_DELTA_C_02','Bamboo Decal','DECAL','C','MEKONG_DELTA',360,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_c_02.svg'),
('DECAL_MEKONG_DELTA_C_03','Lotus Decal','DECAL','C','MEKONG_DELTA',240,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_c_03.svg'),
('DECAL_MEKONG_DELTA_C_04','Delta Decal','DECAL','C','MEKONG_DELTA',310,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_c_04.svg'),
('DECAL_MEKONG_DELTA_C_05','Mangrove Decal','DECAL','C','MEKONG_DELTA',320,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_c_05.svg'),
('DECAL_MEKONG_DELTA_C_06','Khaki Decal','DECAL','C','MEKONG_DELTA',330,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_c_06.svg'),
('DECAL_MEKONG_DELTA_R_01','River Decal','DECAL','R','MEKONG_DELTA',2000,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_r_01.svg'),
('DECAL_MEKONG_DELTA_R_02','Bamboo Decal','DECAL','R','MEKONG_DELTA',1500,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_r_02.svg'),
('DECAL_MEKONG_DELTA_R_03','Lotus Decal','DECAL','R','MEKONG_DELTA',1700,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_r_03.svg'),
('DECAL_MEKONG_DELTA_R_04','Delta Decal','DECAL','R','MEKONG_DELTA',1500,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_r_04.svg'),
('DECAL_MEKONG_DELTA_R_05','Mangrove Decal','DECAL','R','MEKONG_DELTA',1100,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_mekong_delta_r_05.svg'),
('DECAL_SAIGON_GHOST_E_01','Shadow Decal','DECAL','E','SAIGON_GHOST',10000,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_saigon_ghost_e_01.svg'),
('DECAL_SAIGON_GHOST_E_02','Phantom Decal','DECAL','E','SAIGON_GHOST',5000,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_saigon_ghost_e_02.svg'),
('DECAL_SAIGON_GHOST_E_03','Mist Decal','DECAL','E','SAIGON_GHOST',10000,NULL,TRUE,FALSE,NULL,'asset://items/decal/decal_saigon_ghost_e_03.svg'),
('DECAL_TET_FESTIVAL_L_01','Red Decal ★','DECAL','L','TET_FESTIVAL',18000,190,FALSE,TRUE,'TET_S1','asset://items/decal/decal_tet_festival_l_01.svg'),
('DECAL_TET_FESTIVAL_L_02','Gold Decal ★','DECAL','L','TET_FESTIVAL',29000,130,FALSE,TRUE,'TET_S1','asset://items/decal/decal_tet_festival_l_02.svg'),
('DECAL_LEGEND_OF_SAIGON_M_01','Gold Dragon Decal ✦','DECAL','M','LEGEND_OF_SAIGON',NULL,300,FALSE,FALSE,NULL,'asset://items/decal/decal_legend_of_saigon_m_01.svg'),
('NUMBER_STREET_CLASSIC_C_01','Matte Plate Frame','NUMBER','C','STREET_CLASSIC',160,NULL,TRUE,FALSE,NULL,'asset://items/number/number_street_classic_c_01.svg'),
('NUMBER_STREET_CLASSIC_C_02','Plain Plate Frame','NUMBER','C','STREET_CLASSIC',170,NULL,TRUE,FALSE,NULL,'asset://items/number/number_street_classic_c_02.svg'),
('NUMBER_STREET_CLASSIC_C_03','Cotton Plate Frame','NUMBER','C','STREET_CLASSIC',230,NULL,TRUE,FALSE,NULL,'asset://items/number/number_street_classic_c_03.svg'),
('NUMBER_NEON_SAIGON_R_01','LED Plate Frame','NUMBER','R','NEON_SAIGON',2100,NULL,TRUE,FALSE,NULL,'asset://items/number/number_neon_saigon_r_01.svg'),
('NUMBER_NEON_SAIGON_R_02','Neon Plate Frame','NUMBER','R','NEON_SAIGON',1400,NULL,TRUE,FALSE,NULL,'asset://items/number/number_neon_saigon_r_02.svg'),
('NUMBER_SAIGON_GHOST_E_01','Shadow Plate Frame','NUMBER','E','SAIGON_GHOST',5000,NULL,TRUE,FALSE,NULL,'asset://items/number/number_saigon_ghost_e_01.svg'),
('NUMBER_LEGEND_OF_SAIGON_L_01','Gold Dragon Plate Frame ★','NUMBER','L','LEGEND_OF_SAIGON',17000,90,TRUE,FALSE,NULL,'asset://items/number/number_legend_of_saigon_l_01.svg'),
('FRAME_STREET_CLASSIC_C_01','Matte Frame','FRAME','C','STREET_CLASSIC',140,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_street_classic_c_01.svg'),
('FRAME_STREET_CLASSIC_C_02','Plain Frame','FRAME','C','STREET_CLASSIC',240,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_street_classic_c_02.svg'),
('FRAME_STREET_CLASSIC_C_03','Cotton Frame','FRAME','C','STREET_CLASSIC',280,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_street_classic_c_03.svg'),
('FRAME_STREET_CLASSIC_C_04','Classic Frame','FRAME','C','STREET_CLASSIC',120,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_street_classic_c_04.svg'),
('FRAME_DELIVERY_HUSTLE_R_01','Cargo Frame','FRAME','R','DELIVERY_HUSTLE',1700,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_delivery_hustle_r_01.svg'),
('FRAME_DELIVERY_HUSTLE_R_02','Hi-Vis Frame','FRAME','R','DELIVERY_HUSTLE',1100,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_delivery_hustle_r_02.svg'),
('FRAME_DELIVERY_HUSTLE_R_03','Courier Frame','FRAME','R','DELIVERY_HUSTLE',700,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_delivery_hustle_r_03.svg'),
('FRAME_NEON_SAIGON_E_01','LED Frame','FRAME','E','NEON_SAIGON',5700,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_neon_saigon_e_01.svg'),
('FRAME_NEON_SAIGON_E_02','Neon Frame','FRAME','E','NEON_SAIGON',3000,NULL,TRUE,FALSE,NULL,'asset://items/frame/frame_neon_saigon_e_02.svg'),
('FRAME_NEON_SAIGON_L_01','LED Frame ★','FRAME','L','NEON_SAIGON',27000,80,TRUE,FALSE,NULL,'asset://items/frame/frame_neon_saigon_l_01.svg'),
('FRAME_TET_FESTIVAL_M_01','Red Frame ✦','FRAME','M','TET_FESTIVAL',NULL,170,FALSE,TRUE,'TET_S1','asset://items/frame/frame_tet_festival_m_01.svg'),
('BACKDROP_DELIVERY_HUSTLE_C_01','Cargo Backdrop','BACKDROP','C','DELIVERY_HUSTLE',270,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_delivery_hustle_c_01.svg'),
('BACKDROP_DELIVERY_HUSTLE_C_02','Hi-Vis Backdrop','BACKDROP','C','DELIVERY_HUSTLE',270,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_delivery_hustle_c_02.svg'),
('BACKDROP_DELIVERY_HUSTLE_C_03','Courier Backdrop','BACKDROP','C','DELIVERY_HUSTLE',110,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_delivery_hustle_c_03.svg'),
('BACKDROP_DELIVERY_HUSTLE_C_04','Box Backdrop','BACKDROP','C','DELIVERY_HUSTLE',320,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_delivery_hustle_c_04.svg'),
('BACKDROP_TET_FESTIVAL_R_01','Red Backdrop','BACKDROP','R','TET_FESTIVAL',700,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_tet_festival_r_01.svg'),
('BACKDROP_TET_FESTIVAL_R_02','Gold Backdrop','BACKDROP','R','TET_FESTIVAL',1000,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_tet_festival_r_02.svg'),
('BACKDROP_TET_FESTIVAL_R_03','Lunar Backdrop','BACKDROP','R','TET_FESTIVAL',900,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_tet_festival_r_03.svg'),
('BACKDROP_MEKONG_DELTA_E_01','River Backdrop','BACKDROP','E','MEKONG_DELTA',7000,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_mekong_delta_e_01.svg'),
('BACKDROP_MEKONG_DELTA_E_02','Bamboo Backdrop','BACKDROP','E','MEKONG_DELTA',4000,NULL,TRUE,FALSE,NULL,'asset://items/backdrop/backdrop_mekong_delta_e_02.svg'),
('BACKDROP_TET_FESTIVAL_L_01','Red Backdrop ★','BACKDROP','L','TET_FESTIVAL',19000,190,FALSE,TRUE,'TET_S1','asset://items/backdrop/backdrop_tet_festival_l_01.svg'),
('BACKDROP_SAIGON_GHOST_M_01','Shadow Backdrop ✦','BACKDROP','M','SAIGON_GHOST',NULL,180,FALSE,FALSE,NULL,'asset://items/backdrop/backdrop_saigon_ghost_m_01.svg'),
('TITLE_MEKONG_DELTA_C_01','River Title','TITLE','C','MEKONG_DELTA',250,NULL,TRUE,FALSE,NULL,'asset://items/title/title_mekong_delta_c_01.svg'),
('TITLE_MEKONG_DELTA_C_02','Bamboo Title','TITLE','C','MEKONG_DELTA',210,NULL,TRUE,FALSE,NULL,'asset://items/title/title_mekong_delta_c_02.svg'),
('TITLE_MEKONG_DELTA_C_03','Lotus Title','TITLE','C','MEKONG_DELTA',110,NULL,TRUE,FALSE,NULL,'asset://items/title/title_mekong_delta_c_03.svg'),
('TITLE_MEKONG_DELTA_C_04','Delta Title','TITLE','C','MEKONG_DELTA',100,NULL,TRUE,FALSE,NULL,'asset://items/title/title_mekong_delta_c_04.svg'),
('TITLE_NEON_SAIGON_R_01','LED Title','TITLE','R','NEON_SAIGON',400,NULL,TRUE,FALSE,NULL,'asset://items/title/title_neon_saigon_r_01.svg'),
('TITLE_NEON_SAIGON_R_02','Neon Title','TITLE','R','NEON_SAIGON',1100,NULL,TRUE,FALSE,NULL,'asset://items/title/title_neon_saigon_r_02.svg'),
('TITLE_NEON_SAIGON_R_03','Glow Title','TITLE','R','NEON_SAIGON',900,NULL,TRUE,FALSE,NULL,'asset://items/title/title_neon_saigon_r_03.svg'),
('TITLE_NEON_SAIGON_R_04','Cyber Title','TITLE','R','NEON_SAIGON',700,NULL,TRUE,FALSE,NULL,'asset://items/title/title_neon_saigon_r_04.svg'),
('TITLE_NEON_SAIGON_E_01','LED Title','TITLE','E','NEON_SAIGON',5600,NULL,TRUE,FALSE,NULL,'asset://items/title/title_neon_saigon_e_01.svg'),
('TITLE_NEON_SAIGON_E_02','Neon Title','TITLE','E','NEON_SAIGON',6400,NULL,TRUE,FALSE,NULL,'asset://items/title/title_neon_saigon_e_02.svg'),
('TITLE_NEON_SAIGON_E_03','Glow Title','TITLE','E','NEON_SAIGON',4100,NULL,TRUE,FALSE,NULL,'asset://items/title/title_neon_saigon_e_03.svg'),
('TITLE_SAIGON_GHOST_L_01','Shadow Title ★','TITLE','L','SAIGON_GHOST',16000,90,TRUE,FALSE,NULL,'asset://items/title/title_saigon_ghost_l_01.svg'),
('TITLE_SAIGON_GHOST_L_02','Phantom Title ★','TITLE','L','SAIGON_GHOST',14000,50,TRUE,FALSE,NULL,'asset://items/title/title_saigon_ghost_l_02.svg'),
('TITLE_LEGEND_OF_SAIGON_M_01','Gold Dragon Title ✦','TITLE','M','LEGEND_OF_SAIGON',NULL,200,FALSE,FALSE,NULL,'asset://items/title/title_legend_of_saigon_m_01.svg'),
('TRAIL_DELIVERY_HUSTLE_C_01','Cargo Trail','TRAIL','C','DELIVERY_HUSTLE',240,NULL,TRUE,FALSE,NULL,'asset://items/trail/trail_delivery_hustle_c_01.svg'),
('TRAIL_DELIVERY_HUSTLE_C_02','Hi-Vis Trail','TRAIL','C','DELIVERY_HUSTLE',500,NULL,TRUE,FALSE,NULL,'asset://items/trail/trail_delivery_hustle_c_02.svg'),
('TRAIL_DELIVERY_HUSTLE_C_03','Courier Trail','TRAIL','C','DELIVERY_HUSTLE',280,NULL,TRUE,FALSE,NULL,'asset://items/trail/trail_delivery_hustle_c_03.svg'),
('TRAIL_SAIGON_GHOST_R_01','Shadow Trail','TRAIL','R','SAIGON_GHOST',3000,NULL,TRUE,FALSE,NULL,'asset://items/trail/trail_saigon_ghost_r_01.svg'),
('TRAIL_SAIGON_GHOST_R_02','Phantom Trail','TRAIL','R','SAIGON_GHOST',900,NULL,TRUE,FALSE,NULL,'asset://items/trail/trail_saigon_ghost_r_02.svg'),
('TRAIL_SAIGON_GHOST_R_03','Mist Trail','TRAIL','R','SAIGON_GHOST',1900,NULL,TRUE,FALSE,NULL,'asset://items/trail/trail_saigon_ghost_r_03.svg'),
('TRAIL_TET_FESTIVAL_E_01','Red Trail','TRAIL','E','TET_FESTIVAL',14500,NULL,TRUE,FALSE,NULL,'asset://items/trail/trail_tet_festival_e_01.svg'),
('TRAIL_TET_FESTIVAL_E_02','Gold Trail','TRAIL','E','TET_FESTIVAL',5600,NULL,TRUE,FALSE,NULL,'asset://items/trail/trail_tet_festival_e_02.svg'),
('TRAIL_SAIGON_GHOST_L_01','Shadow Trail ★','TRAIL','L','SAIGON_GHOST',40000,210,TRUE,FALSE,NULL,'asset://items/trail/trail_saigon_ghost_l_01.svg'),
('TRAIL_TET_FESTIVAL_M_01','Red Trail ✦','TRAIL','M','TET_FESTIVAL',NULL,360,FALSE,TRUE,'TET_S1','asset://items/trail/trail_tet_festival_m_01.svg'),
('HORN_MEKONG_DELTA_C_01','River Horn','HORN','C','MEKONG_DELTA',250,NULL,TRUE,FALSE,NULL,'asset://items/horn/horn_mekong_delta_c_01.svg'),
('HORN_MEKONG_DELTA_C_02','Bamboo Horn','HORN','C','MEKONG_DELTA',180,NULL,TRUE,FALSE,NULL,'asset://items/horn/horn_mekong_delta_c_02.svg'),
('HORN_MEKONG_DELTA_C_03','Lotus Horn','HORN','C','MEKONG_DELTA',140,NULL,TRUE,FALSE,NULL,'asset://items/horn/horn_mekong_delta_c_03.svg'),
('HORN_MEKONG_DELTA_R_01','River Horn','HORN','R','MEKONG_DELTA',1600,NULL,TRUE,FALSE,NULL,'asset://items/horn/horn_mekong_delta_r_01.svg'),
('HORN_MEKONG_DELTA_R_02','Bamboo Horn','HORN','R','MEKONG_DELTA',1800,NULL,TRUE,FALSE,NULL,'asset://items/horn/horn_mekong_delta_r_02.svg'),
('HORN_DELIVERY_HUSTLE_E_01','Cargo Horn','HORN','E','DELIVERY_HUSTLE',6600,NULL,TRUE,FALSE,NULL,'asset://items/horn/horn_delivery_hustle_e_01.svg'),
('HORN_LEGEND_OF_SAIGON_L_01','Gold Dragon Horn ★','HORN','L','LEGEND_OF_SAIGON',13000,160,TRUE,FALSE,NULL,'asset://items/horn/horn_legend_of_saigon_l_01.svg'),
('START_ANIM_STREET_CLASSIC_C_01','Matte Intro','START_ANIM','C','STREET_CLASSIC',380,NULL,TRUE,FALSE,NULL,'asset://items/start_anim/start_anim_street_classic_c_01.svg'),
('START_ANIM_DELIVERY_HUSTLE_C_01','Cargo Intro','START_ANIM','C','DELIVERY_HUSTLE',400,NULL,TRUE,FALSE,NULL,'asset://items/start_anim/start_anim_delivery_hustle_c_01.svg'),
('START_ANIM_DELIVERY_HUSTLE_R_01','Cargo Intro','START_ANIM','R','DELIVERY_HUSTLE',1800,NULL,TRUE,FALSE,NULL,'asset://items/start_anim/start_anim_delivery_hustle_r_01.svg'),
('START_ANIM_DELIVERY_HUSTLE_R_02','Hi-Vis Intro','START_ANIM','R','DELIVERY_HUSTLE',2200,NULL,TRUE,FALSE,NULL,'asset://items/start_anim/start_anim_delivery_hustle_r_02.svg'),
('START_ANIM_MEKONG_DELTA_E_01','River Intro','START_ANIM','E','MEKONG_DELTA',10400,NULL,TRUE,FALSE,NULL,'asset://items/start_anim/start_anim_mekong_delta_e_01.svg'),
('START_ANIM_NEON_SAIGON_L_01','LED Intro ★','START_ANIM','L','NEON_SAIGON',34000,120,TRUE,FALSE,NULL,'asset://items/start_anim/start_anim_neon_saigon_l_01.svg'),
('START_ANIM_SAIGON_GHOST_M_01','Shadow Intro ✦','START_ANIM','M','SAIGON_GHOST',NULL,370,FALSE,FALSE,NULL,'asset://items/start_anim/start_anim_saigon_ghost_m_01.svg')
ON CONFLICT (item_code) DO NOTHING
"""

_LOOTBOX_SEED = """
INSERT INTO lootbox_definition (
  box_code, display_name, collection_filter, drop_table,
  expires_with_season, required_season_code, auto_open_on_grant
) VALUES
('COMMON_BOX','Garage Box (Common)',NULL,'{"guaranteed":[],"weighted":[{"rarity":"C","weight":80},{"rarity":"R","weight":20}],"duplicate_policy":"REFUND_GP","affinity_boost":{"by_mission_category":true,"boost_factor":1.5}}'::jsonb,FALSE,NULL,FALSE),
('RARE_BOX','Garage Box (Rare)',NULL,'{"guaranteed":[],"weighted":[{"rarity":"R","weight":65},{"rarity":"E","weight":30},{"rarity":"L","weight":5}],"duplicate_policy":"REFUND_GP","affinity_boost":{"by_mission_category":true,"boost_factor":2.0}}'::jsonb,FALSE,NULL,FALSE),
('EPIC_BOX','Garage Box (Epic)',NULL,'{"guaranteed":[],"weighted":[{"rarity":"E","weight":70},{"rarity":"L","weight":28},{"rarity":"M","weight":2}],"duplicate_policy":"REFUND_GP","affinity_boost":{"by_mission_category":true,"boost_factor":2.0}}'::jsonb,FALSE,NULL,FALSE),
('TET_BOX_R','Tết Lucky Box (Rare)','TET_FESTIVAL','{"guaranteed":[],"weighted":[{"rarity":"R","weight":60},{"rarity":"E","weight":35},{"rarity":"L","weight":5}],"duplicate_policy":"REFUND_GP","affinity_boost":null}'::jsonb,TRUE,'TET_S1',FALSE),
('TET_BOX_L','Tết Lucky Box (Legendary)','TET_FESTIVAL','{"guaranteed":[],"weighted":[{"rarity":"E","weight":40},{"rarity":"L","weight":50},{"rarity":"M","weight":10}],"duplicate_policy":"REFUND_GP","affinity_boost":null}'::jsonb,TRUE,'TET_S1',FALSE),
('NEON_BOX','Neon Saigon Box','NEON_SAIGON','{"guaranteed":[],"weighted":[{"rarity":"R","weight":55},{"rarity":"E","weight":40},{"rarity":"L","weight":5}],"duplicate_policy":"REFUND_GP","affinity_boost":null}'::jsonb,FALSE,NULL,FALSE),
('GHOST_BOX','Saigon Ghost Box','SAIGON_GHOST','{"guaranteed":[],"weighted":[{"rarity":"E","weight":60},{"rarity":"L","weight":35},{"rarity":"M","weight":5}],"duplicate_policy":"REFUND_GP","affinity_boost":null}'::jsonb,FALSE,NULL,FALSE),
('DELIVERY_BOX','Hustle Box (Driver)','DELIVERY_HUSTLE','{"guaranteed":[],"weighted":[{"rarity":"C","weight":50},{"rarity":"R","weight":45},{"rarity":"E","weight":5}],"duplicate_policy":"REFUND_GP","affinity_boost":null}'::jsonb,FALSE,NULL,FALSE)
ON CONFLICT (box_code) DO NOTHING
"""

_GACHA_SEED = """
INSERT INTO gacha_definition (
  gacha_code, display_name, description,
  cost_currency, cost_per_pull, cost_per_10_pull,
  collection_filter, drop_table,
  pity_threshold, pity_guarantee_rarity, pity_resets_with_season,
  status, is_listed, sort_order
) VALUES
('BASIC_PULL','Garage 일반 뽑기','Common~Rare 위주. 일상 라이딩으로 모은 GP를 소소하게 굴리는 재미','GP',200,1800,NULL,'{"weighted":[{"rarity":"C","weight":70},{"rarity":"R","weight":28},{"rarity":"E","weight":2}],"guaranteed_at_10":"R","duplicate_policy":"REFUND_GP"}'::jsonb,NULL,NULL,FALSE,'ACTIVE',TRUE,10),
('PREMIUM_PULL','Garage 프리미엄 뽑기','Rare~Epic 위주, 가끔 Legendary. 100연 천장 보장으로 도박성 완화','GP',1500,13500,NULL,'{"weighted":[{"rarity":"R","weight":65},{"rarity":"E","weight":33},{"rarity":"L","weight":2}],"guaranteed_at_10":"E","duplicate_policy":"REFUND_GP"}'::jsonb,100,'L',FALSE,'ACTIVE',TRUE,20),
('GC_PREMIUM_PULL','크리스탈 뽑기','Rare~Mythic. 시즌으로 모은 크리스탈을 굴리는 큰 한 방. 80연 Legendary 천장','GC',30,270,NULL,'{"weighted":[{"rarity":"R","weight":50},{"rarity":"E","weight":40},{"rarity":"L","weight":9},{"rarity":"M","weight":1}],"guaranteed_at_10":"E","duplicate_policy":"REFUND_GC"}'::jsonb,80,'L',FALSE,'ACTIVE',TRUE,30),
('SEASON_PULL','시즌 한정 뽑기','현재 시즌 컬렉션 전용. 시즌 종료 시 천장 리셋. 60연 Legendary 보장','GC',25,225,'TET_FESTIVAL','{"weighted":[{"rarity":"R","weight":60},{"rarity":"E","weight":30},{"rarity":"L","weight":9},{"rarity":"M","weight":1}],"guaranteed_at_10":"E","duplicate_policy":"REFUND_GC"}'::jsonb,60,'L',TRUE,'ACTIVE',TRUE,40),
('LEGEND_PULL','전설 뽑기','Epic~Mythic 전용. 가장 비싼 만큼 Mythic 5%. 50연 Mythic 천장 (찐 도박)','GC',80,720,NULL,'{"weighted":[{"rarity":"E","weight":70},{"rarity":"L","weight":25},{"rarity":"M","weight":5}],"guaranteed_at_10":"L","duplicate_policy":"REFUND_GC"}'::jsonb,50,'M',FALSE,'ACTIVE',TRUE,50)
ON CONFLICT (gacha_code) DO NOTHING
"""

_MISSION_REWARD_BUNDLE = """
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-RD-01';
UPDATE mission_definition SET reward_bundle = '{"gp":130,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-RD-02';
UPDATE mission_definition SET reward_bundle = '{"gp":180,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-RD-03';
UPDATE mission_definition SET reward_bundle = '{"gp":100,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-MT-01';
UPDATE mission_definition SET reward_bundle = '{"gp":150,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-MT-02';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-MT-03';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-MK-01';
UPDATE mission_definition SET reward_bundle = '{"gp":110,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-MK-02';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-CM-01';
UPDATE mission_definition SET reward_bundle = '{"gp":130,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-CM-02';
UPDATE mission_definition SET reward_bundle = '{"gp":180,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-CM-03';
UPDATE mission_definition SET reward_bundle = '{"gp":150,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-DL-01';
UPDATE mission_definition SET reward_bundle = '{"gp":120,"gc":0,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-MX-01';
UPDATE mission_definition SET reward_bundle = '{"gp":800,"gc":10,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-MX-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":30,"sxp":0,"items":[],"boxes":[]}'::jsonb WHERE mission_code='O-MX-03';
UPDATE mission_definition SET reward_bundle = '{"gp":90,"gc":0,"sxp":11,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-01';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-02';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-03';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-04';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-05';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-06';
UPDATE mission_definition SET reward_bundle = '{"gp":40,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-07';
UPDATE mission_definition SET reward_bundle = '{"gp":90,"gc":0,"sxp":11,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-08';
UPDATE mission_definition SET reward_bundle = '{"gp":40,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-09';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-10';
UPDATE mission_definition SET reward_bundle = '{"gp":90,"gc":0,"sxp":11,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-11';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-12';
UPDATE mission_definition SET reward_bundle = '{"gp":30,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-13';
UPDATE mission_definition SET reward_bundle = '{"gp":50,"gc":0,"sxp":6,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-14';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-15';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-16';
UPDATE mission_definition SET reward_bundle = '{"gp":40,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-17';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-18';
UPDATE mission_definition SET reward_bundle = '{"gp":40,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-19';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-RD-20';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-01';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-02';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-03';
UPDATE mission_definition SET reward_bundle = '{"gp":110,"gc":0,"sxp":13,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-04';
UPDATE mission_definition SET reward_bundle = '{"gp":110,"gc":0,"sxp":13,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-05';
UPDATE mission_definition SET reward_bundle = '{"gp":100,"gc":0,"sxp":12,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-06';
UPDATE mission_definition SET reward_bundle = '{"gp":110,"gc":0,"sxp":13,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-07';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-08';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-09';
UPDATE mission_definition SET reward_bundle = '{"gp":100,"gc":0,"sxp":12,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-10';
UPDATE mission_definition SET reward_bundle = '{"gp":110,"gc":0,"sxp":13,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-11';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MT-12';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-01';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-02';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-03';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-04';
UPDATE mission_definition SET reward_bundle = '{"gp":30,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-05';
UPDATE mission_definition SET reward_bundle = '{"gp":50,"gc":0,"sxp":6,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-06';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-07';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-08';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-09';
UPDATE mission_definition SET reward_bundle = '{"gp":50,"gc":0,"sxp":6,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-10';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-11';
UPDATE mission_definition SET reward_bundle = '{"gp":40,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MK-12';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-01';
UPDATE mission_definition SET reward_bundle = '{"gp":40,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-02';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-03';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-04';
UPDATE mission_definition SET reward_bundle = '{"gp":30,"gc":0,"sxp":5,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-05';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-06';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-07';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-08';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-09';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-10';
UPDATE mission_definition SET reward_bundle = '{"gp":50,"gc":0,"sxp":6,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-11';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-CM-12';
UPDATE mission_definition SET reward_bundle = '{"gp":120,"gc":0,"sxp":15,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-01';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-02';
UPDATE mission_definition SET reward_bundle = '{"gp":60,"gc":0,"sxp":7,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-03';
UPDATE mission_definition SET reward_bundle = '{"gp":100,"gc":0,"sxp":12,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-04';
UPDATE mission_definition SET reward_bundle = '{"gp":110,"gc":0,"sxp":13,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-05';
UPDATE mission_definition SET reward_bundle = '{"gp":100,"gc":0,"sxp":12,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-06';
UPDATE mission_definition SET reward_bundle = '{"gp":100,"gc":0,"sxp":12,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-07';
UPDATE mission_definition SET reward_bundle = '{"gp":90,"gc":0,"sxp":11,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-08';
UPDATE mission_definition SET reward_bundle = '{"gp":100,"gc":0,"sxp":12,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-09';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-DL-10';
UPDATE mission_definition SET reward_bundle = '{"gp":120,"gc":0,"sxp":15,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MX-01';
UPDATE mission_definition SET reward_bundle = '{"gp":100,"gc":0,"sxp":12,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MX-02';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MX-03';
UPDATE mission_definition SET reward_bundle = '{"gp":80,"gc":0,"sxp":10,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MX-04';
UPDATE mission_definition SET reward_bundle = '{"gp":110,"gc":0,"sxp":13,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MX-05';
UPDATE mission_definition SET reward_bundle = '{"gp":70,"gc":0,"sxp":8,"items":[],"boxes":[]}'::jsonb WHERE mission_code='D-MX-06';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-01';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-02';
UPDATE mission_definition SET reward_bundle = '{"gp":500,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-03';
UPDATE mission_definition SET reward_bundle = '{"gp":800,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-04';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-05';
UPDATE mission_definition SET reward_bundle = '{"gp":500,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-06';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-07';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-08';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-09';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-10';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-11';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-12';
UPDATE mission_definition SET reward_bundle = '{"gp":500,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-13';
UPDATE mission_definition SET reward_bundle = '{"gp":500,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-14';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-RD-15';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-01';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-02';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-03';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-04';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-05';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-06';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-07';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-08';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-09';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MT-10';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-01';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-02';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-03';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-04';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-05';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-06';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-07';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-08';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-09';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MK-10';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-01';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-02';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-03';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-04';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-05';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-06';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-07';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-08';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-09';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-10';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-11';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-CM-12';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-01';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-02';
UPDATE mission_definition SET reward_bundle = '{"gp":500,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-03';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-04';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-05';
UPDATE mission_definition SET reward_bundle = '{"gp":800,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-06';
UPDATE mission_definition SET reward_bundle = '{"gp":300,"gc":0,"sxp":60,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-07';
UPDATE mission_definition SET reward_bundle = '{"gp":500,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-08';
UPDATE mission_definition SET reward_bundle = '{"gp":200,"gc":0,"sxp":40,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-09';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-DL-10';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":120,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MX-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":120,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MX-02';
UPDATE mission_definition SET reward_bundle = '{"gp":700,"gc":0,"sxp":140,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MX-03';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MX-04';
UPDATE mission_definition SET reward_bundle = '{"gp":700,"gc":0,"sxp":140,"items":[],"boxes":[]}'::jsonb WHERE mission_code='W-MX-05';
UPDATE mission_definition SET reward_bundle = '{"gp":1900,"gc":0,"sxp":271,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-RD-01';
UPDATE mission_definition SET reward_bundle = '{"gp":700,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-RD-02';
UPDATE mission_definition SET reward_bundle = '{"gp":3000,"gc":25,"sxp":400,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-RD-03';
UPDATE mission_definition SET reward_bundle = '{"gp":2200,"gc":0,"sxp":314,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-RD-04';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":0,"sxp":214,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-RD-05';
UPDATE mission_definition SET reward_bundle = '{"gp":1200,"gc":0,"sxp":171,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-RD-06';
UPDATE mission_definition SET reward_bundle = '{"gp":2100,"gc":0,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-RD-07';
UPDATE mission_definition SET reward_bundle = '{"gp":800,"gc":0,"sxp":114,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-RD-08';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":0,"sxp":142,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MT-01';
UPDATE mission_definition SET reward_bundle = '{"gp":1100,"gc":0,"sxp":157,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MT-02';
UPDATE mission_definition SET reward_bundle = '{"gp":800,"gc":0,"sxp":114,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MT-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1400,"gc":0,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MT-04';
UPDATE mission_definition SET reward_bundle = '{"gp":1200,"gc":0,"sxp":171,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MT-05';
UPDATE mission_definition SET reward_bundle = '{"gp":1400,"gc":0,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MK-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MK-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1700,"gc":0,"sxp":242,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MK-03';
UPDATE mission_definition SET reward_bundle = '{"gp":500,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MK-04';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":0,"sxp":214,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MK-05';
UPDATE mission_definition SET reward_bundle = '{"gp":800,"gc":0,"sxp":114,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-CM-01';
UPDATE mission_definition SET reward_bundle = '{"gp":900,"gc":0,"sxp":128,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-CM-02';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-CM-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1100,"gc":0,"sxp":157,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-CM-04';
UPDATE mission_definition SET reward_bundle = '{"gp":1600,"gc":0,"sxp":228,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-CM-05';
UPDATE mission_definition SET reward_bundle = '{"gp":1100,"gc":0,"sxp":157,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-DL-01';
UPDATE mission_definition SET reward_bundle = '{"gp":2400,"gc":0,"sxp":342,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-DL-02';
UPDATE mission_definition SET reward_bundle = '{"gp":3000,"gc":25,"sxp":400,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-DL-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1900,"gc":0,"sxp":271,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-DL-04';
UPDATE mission_definition SET reward_bundle = '{"gp":3000,"gc":25,"sxp":400,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MX-01';
UPDATE mission_definition SET reward_bundle = '{"gp":1600,"gc":0,"sxp":228,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MX-02';
UPDATE mission_definition SET reward_bundle = '{"gp":3000,"gc":25,"sxp":400,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MX-03';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":0,"sxp":285,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MX-04';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":0,"sxp":214,"items":[],"boxes":[]}'::jsonb WHERE mission_code='M-MX-05';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-TET-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-TET-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-TET-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":10,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-TET-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":15,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-TET-05';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":25,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-TET-06';
UPDATE mission_definition SET reward_bundle = '{"gp":3000,"gc":40,"sxp":350,"items":[{"item_code":"DECAL_TET_FESTIVAL_L_01","on_duplicate":"REFUND_GP"}],"boxes":[]}'::jsonb WHERE mission_code='S-TET-07';
UPDATE mission_definition SET reward_bundle = '{"gp":4000,"gc":60,"sxp":400,"items":[{"item_code":"HELMET_TET_FESTIVAL_L_02","on_duplicate":"REFUND_GP"}],"boxes":[]}'::jsonb WHERE mission_code='S-TET-08';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SPRING-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SPRING-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SPRING-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":10,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SPRING-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":15,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SPRING-05';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":25,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SPRING-06';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-RAIN-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-RAIN-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-RAIN-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":10,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-RAIN-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":15,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-RAIN-05';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":25,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-RAIN-06';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SUM-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SUM-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SUM-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":10,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SUM-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":15,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SUM-05';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":25,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-SUM-06';
UPDATE mission_definition SET reward_bundle = '{"gp":3000,"gc":40,"sxp":350,"items":[{"item_code":"FRAME_NEON_SAIGON_L_01","on_duplicate":"REFUND_GP"}],"boxes":[]}'::jsonb WHERE mission_code='S-SUM-07';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-INDEP-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-INDEP-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-INDEP-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":10,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-INDEP-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":15,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-INDEP-05';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":25,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-INDEP-06';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-MID-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-MID-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-MID-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":10,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-MID-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":15,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-MID-05';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":25,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-MID-06';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-XMAS-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-XMAS-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-XMAS-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":10,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-XMAS-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":15,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-XMAS-05';
UPDATE mission_definition SET reward_bundle = '{"gp":400,"gc":0,"sxp":80,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-DRY-01';
UPDATE mission_definition SET reward_bundle = '{"gp":600,"gc":0,"sxp":100,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-DRY-02';
UPDATE mission_definition SET reward_bundle = '{"gp":1000,"gc":5,"sxp":150,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-DRY-03';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":10,"sxp":200,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-DRY-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":15,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-DRY-05';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":25,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='S-DRY-06';
UPDATE mission_definition SET reward_bundle = '{"gp":1500,"gc":50,"sxp":250,"items":[],"boxes":[]}'::jsonb WHERE mission_code='A-MX-01';
UPDATE mission_definition SET reward_bundle = '{"gp":3000,"gc":150,"sxp":350,"items":[{"item_code":"BOOTS_LEGEND_OF_SAIGON_L_01","on_duplicate":"REFUND_GP"}],"boxes":[]}'::jsonb WHERE mission_code='A-MX-02';
UPDATE mission_definition SET reward_bundle = '{"gp":4000,"gc":80,"sxp":450,"items":[],"boxes":[]}'::jsonb WHERE mission_code='A-MX-03';
UPDATE mission_definition SET reward_bundle = '{"gp":6000,"gc":300,"sxp":600,"items":[{"item_code":"JACKET_LEGEND_OF_SAIGON_M_01","on_duplicate":"REFUND_GC"}],"boxes":[]}'::jsonb WHERE mission_code='A-MX-04';
UPDATE mission_definition SET reward_bundle = '{"gp":2000,"gc":100,"sxp":300,"items":[],"boxes":[]}'::jsonb WHERE mission_code='A-MX-05';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":70,"sxp":350,"items":[{"item_code":"WHEEL_LEGEND_OF_SAIGON_L_01","on_duplicate":"REFUND_GP"}],"boxes":[]}'::jsonb WHERE mission_code='A-MX-06';
UPDATE mission_definition SET reward_bundle = '{"gp":3000,"gc":120,"sxp":400,"items":[],"boxes":[]}'::jsonb WHERE mission_code='A-MX-07';
UPDATE mission_definition SET reward_bundle = '{"gp":2500,"gc":60,"sxp":350,"items":[],"boxes":[]}'::jsonb WHERE mission_code='A-MX-08';
UPDATE mission_definition SET reward_bundle = '{"gp":4000,"gc":200,"sxp":500,"items":[{"item_code":"TITLE_LEGEND_OF_SAIGON_M_01","on_duplicate":"REFUND_GC"}],"boxes":[]}'::jsonb WHERE mission_code='A-MX-09'
"""


_SEASON_SEED = """
INSERT INTO season (season_code, display_name, collection_code,
                     starts_at, ends_at, status,
                     max_level, sxp_per_level, daily_sxp_cap)
VALUES ('TET_S1', '2027 Tết Season', 'TET_FESTIVAL',
        '2027-01-15 00:00:00+07', '2027-02-28 23:59:59+07',
        'ACTIVE', 30, 100, 500)
ON CONFLICT (season_code) DO NOTHING
"""


def upgrade() -> None:
    op.execute(_ACTION_SEED)
    op.execute(_COLLECTION_SEED)
    op.execute(_ITEM_SEED)
    op.execute(_SEASON_SEED)
    # JSON values contain ":number" patterns that SQLAlchemy misparses as bind params;
    # exec_driver_sql sends SQL directly to the driver bypassing parameter substitution.
    bind = op.get_bind()
    bind.exec_driver_sql(_LOOTBOX_SEED)
    bind.exec_driver_sql(_GACHA_SEED)
    # asyncpg cannot run multiple commands in one prepared statement; split them.
    for stmt in _MISSION_REWARD_BUNDLE.split(';'):
        stmt = stmt.strip()
        if stmt:
            bind.exec_driver_sql(stmt)


def downgrade() -> None:
    op.execute("DELETE FROM season WHERE season_code = 'TET_S1'")
    op.execute("DELETE FROM gacha_definition WHERE gacha_code IN ('BASIC_PULL','PREMIUM_PULL','GC_PREMIUM_PULL','SEASON_PULL','LEGEND_PULL')")
    op.execute("DELETE FROM lootbox_definition WHERE box_code IN ('COMMON_BOX','RARE_BOX','EPIC_BOX','TET_BOX_R','TET_BOX_L','NEON_BOX','GHOST_BOX','DELIVERY_BOX')")
    op.execute("DELETE FROM item_definition")
    op.execute("DELETE FROM item_collection")
    op.execute("DELETE FROM action_definition WHERE action_code IN ('PHOTO_UPLOAD','DAILY_INSPECTION','POST_CREATE','LIKE_RECEIVED','COMMENT_POST','PROFILE_UPDATE','DRIVER_VERIFY','MARKET_BROWSE','MARKET_INQUIRY','MARKET_FAVORITE','MARKET_CHAT','CAR_WASH_RECEIPT','PART_REPLACE','ACCOUNT_AGE')")
