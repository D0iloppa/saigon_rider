export type ItemSlot =
  | 'HELMET' | 'JACKET' | 'GLOVES' | 'BOOTS' | 'EYEWEAR' | 'NAMEPLATE'
  | 'BODY_PAINT' | 'WHEEL' | 'EXHAUST' | 'HEADLIGHT' | 'MIRROR' | 'DECAL'
  | 'NUMBER' | 'FRAME' | 'BACKDROP' | 'TITLE' | 'TRAIL' | 'HORN' | 'START_ANIM';

export type ItemRarity = 'C' | 'R' | 'E' | 'L' | 'M';

export type CollectionCode =
  | 'STREET_CLASSIC' | 'NEON_SAIGON' | 'TET_FESTIVAL' | 'MEKONG_DELTA'
  | 'DELIVERY_HUSTLE' | 'SAIGON_GHOST' | 'LEGEND_OF_SAIGON';

export interface ItemMeta {
  num: number;
  itemCode: string;
  name: string;
  slot: ItemSlot;
  collection: CollectionCode;
  rarity: ItemRarity;
  itemNum: string;
}

export const ITEMS: ItemMeta[] = [
  { num:  1, itemCode: 'HELMET_STREET_CLASSIC_C_01',         name: 'Daily Commuter',       slot: 'HELMET',     collection: 'STREET_CLASSIC',    rarity: 'C', itemNum: '01' },
  { num:  2, itemCode: 'HELMET_NEON_SAIGON_R_03',            name: 'Cyber Bui Vien',       slot: 'HELMET',     collection: 'NEON_SAIGON',       rarity: 'R', itemNum: '03' },
  { num:  3, itemCode: 'HELMET_TET_FESTIVAL_E_01',           name: 'Year of the Dragon',   slot: 'HELMET',     collection: 'TET_FESTIVAL',      rarity: 'E', itemNum: '01' },
  { num:  4, itemCode: 'HELMET_SAIGON_GHOST_L_01',           name: 'Midnight Mayor',       slot: 'HELMET',     collection: 'SAIGON_GHOST',      rarity: 'L', itemNum: '01' },
  { num:  5, itemCode: 'HELMET_LEGEND_OF_SAIGON_M_01',       name: 'Saigon Crown',         slot: 'HELMET',     collection: 'LEGEND_OF_SAIGON',  rarity: 'M', itemNum: '01' },
  { num:  6, itemCode: 'JACKET_STREET_CLASSIC_C_02',         name: 'Matte Rider',          slot: 'JACKET',     collection: 'STREET_CLASSIC',    rarity: 'C', itemNum: '02' },
  { num:  7, itemCode: 'JACKET_NEON_SAIGON_E_02',            name: 'BuiVien Night',        slot: 'JACKET',     collection: 'NEON_SAIGON',       rarity: 'E', itemNum: '02' },
  { num: 11, itemCode: 'BODY_PAINT_STREET_CLASSIC_C_03',     name: 'Pearl White Stock',    slot: 'BODY_PAINT', collection: 'STREET_CLASSIC',    rarity: 'C', itemNum: '03' },
  { num: 12, itemCode: 'BODY_PAINT_MEKONG_DELTA_R_04',       name: 'Bamboo Green',         slot: 'BODY_PAINT', collection: 'MEKONG_DELTA',      rarity: 'R', itemNum: '04' },
  { num: 13, itemCode: 'BODY_PAINT_DELIVERY_HUSTLE_E_02',    name: 'GrabExpress Tribute',  slot: 'BODY_PAINT', collection: 'DELIVERY_HUSTLE',   rarity: 'E', itemNum: '02' },
  { num: 14, itemCode: 'BODY_PAINT_SAIGON_GHOST_L_01',       name: 'Wraith Black',         slot: 'BODY_PAINT', collection: 'SAIGON_GHOST',      rarity: 'L', itemNum: '01' },
  { num: 15, itemCode: 'BODY_PAINT_LEGEND_OF_SAIGON_M_02',   name: 'Saigon Sunset Wrap',   slot: 'BODY_PAINT', collection: 'LEGEND_OF_SAIGON',  rarity: 'M', itemNum: '02' },
  { num: 16, itemCode: 'WHEEL_STREET_CLASSIC_C_01',          name: 'Standard Spoke',       slot: 'WHEEL',      collection: 'STREET_CLASSIC',    rarity: 'C', itemNum: '01' },
  { num: 17, itemCode: 'WHEEL_NEON_SAIGON_E_01',             name: 'Neon Spoke 17',        slot: 'WHEEL',      collection: 'NEON_SAIGON',       rarity: 'E', itemNum: '01' },
  { num: 18, itemCode: 'WHEEL_LEGEND_OF_SAIGON_L_01',        name: 'Imperial Gold',        slot: 'WHEEL',      collection: 'LEGEND_OF_SAIGON',  rarity: 'L', itemNum: '01' },
  { num: 19, itemCode: 'WHEEL_LEGEND_OF_SAIGON_M_01',        name: 'Dragon Wheel',         slot: 'WHEEL',      collection: 'LEGEND_OF_SAIGON',  rarity: 'M', itemNum: '01' },
  { num: 20, itemCode: 'DECAL_STREET_CLASSIC_C_02',          name: 'City Map Sticker',     slot: 'DECAL',      collection: 'STREET_CLASSIC',    rarity: 'C', itemNum: '02' },
  { num: 21, itemCode: 'DECAL_TET_FESTIVAL_R_03',            name: 'Lantern Sticker',      slot: 'DECAL',      collection: 'TET_FESTIVAL',      rarity: 'R', itemNum: '03' },
  { num: 22, itemCode: 'DECAL_SAIGON_GHOST_E_03',            name: 'Ghost Tag',            slot: 'DECAL',      collection: 'SAIGON_GHOST',      rarity: 'E', itemNum: '03' },
  { num: 23, itemCode: 'DECAL_LEGEND_OF_SAIGON_M_01',        name: 'Dragon Skin Limited',  slot: 'DECAL',      collection: 'LEGEND_OF_SAIGON',  rarity: 'M', itemNum: '01' },
  { num: 24, itemCode: 'EXHAUST_SAIGON_GHOST_E_02',          name: 'Ghost Whisper',        slot: 'EXHAUST',    collection: 'SAIGON_GHOST',      rarity: 'E', itemNum: '02' },
  { num: 25, itemCode: 'HEADLIGHT_TET_FESTIVAL_R_01',        name: 'Tết Lantern',          slot: 'HEADLIGHT',  collection: 'TET_FESTIVAL',      rarity: 'R', itemNum: '01' },
  { num: 26, itemCode: 'NAMEPLATE_LEGEND_OF_SAIGON_M_01',    name: 'Saigon Royalty',       slot: 'NAMEPLATE',  collection: 'LEGEND_OF_SAIGON',  rarity: 'M', itemNum: '01' },
  { num: 27, itemCode: 'TRAIL_NEON_SAIGON_E_01',             name: 'Cyber Trail',          slot: 'TRAIL',      collection: 'NEON_SAIGON',       rarity: 'E', itemNum: '01' },
  { num: 28, itemCode: 'TRAIL_LEGEND_OF_SAIGON_M_01',        name: 'Rainbow Trail',        slot: 'TRAIL',      collection: 'LEGEND_OF_SAIGON',  rarity: 'M', itemNum: '01' },
  { num: 29, itemCode: 'START_ANIM_SAIGON_GHOST_L_01',       name: 'Phantom Boost',        slot: 'START_ANIM', collection: 'SAIGON_GHOST',      rarity: 'L', itemNum: '01' },
  { num: 30, itemCode: 'TITLE_LEGEND_OF_SAIGON_L_01',        name: 'Saigon Mayor',         slot: 'TITLE',      collection: 'LEGEND_OF_SAIGON',  rarity: 'L', itemNum: '01' },
];

export const itemByCode = (code: string): ItemMeta | undefined =>
  ITEMS.find(i => i.itemCode === code);

export const itemsBySlot = (slot: ItemSlot): ItemMeta[] =>
  ITEMS.filter(i => i.slot === slot);

export const itemsByCollection = (c: CollectionCode): ItemMeta[] =>
  ITEMS.filter(i => i.collection === c);

export const itemsByRarity = (r: ItemRarity): ItemMeta[] =>
  ITEMS.filter(i => i.rarity === r);
