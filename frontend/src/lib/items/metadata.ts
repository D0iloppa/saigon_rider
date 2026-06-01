export type ItemSlot =
  | 'HELMET' | 'JACKET' | 'GLOVES' | 'EYEWEAR' | 'BOOTS'
  | 'BODY' | 'ENGINE' | 'SEAT' | 'STICKER' | 'HANDLE'
  | 'MIRROR' | 'LIGHT' | 'TAIL' | 'NUMBER'
  | 'NAME' | 'RANK' | 'FRAME' | 'TITLE' | 'BACKDROP'
  | 'TRAIL' | 'START' | 'HORN'
  | 'BANNER' | 'EMOTE' | 'PET';

export type ItemRarity = 'C' | 'R' | 'E' | 'L' | 'M';

export type CollectionCode =
  | 'STREET_CLASSIC' | 'NEON_SAIGON' | 'TET_FESTIVAL' | 'MEKONG_DELTA'
  | 'DELIVERY_HUSTLE' | 'SAIGON_GHOST' | 'LEGEND_OF_SAIGON';

export interface ItemMeta {
  num: number;
  itemCode: string;
  slot: ItemSlot;
  collection: CollectionCode;
  rarity: ItemRarity;
  /** 결합 스프라이트 출처 파일 (saigon-rider-items.svg 로 병합됨, 참조용) */
  sprite: string;
}

// 표시명(display name)은 DB가 아닌 프론트 i18n(items.<itemCode>)에서 관리한다.
// itemName(code) 헬퍼로 조회: t(`items.${code}`)
// 8개 카탈로그(_tmp/asset/saigon-rider-*-catalog.html) 기반 자동 생성 — 251종.
export const ITEMS: ItemMeta[] = [
  { num: 1, itemCode: "HELMET_STREET_CLASSIC_C_01", slot: "HELMET", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 2, itemCode: "HELMET_DELIVERY_HUSTLE_R_01", slot: "HELMET", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 3, itemCode: "HELMET_NEON_SAIGON_E_01", slot: "HELMET", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 4, itemCode: "HELMET_LEGEND_OF_SAIGON_L_01", slot: "HELMET", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 5, itemCode: "HELMET_LEGEND_OF_SAIGON_M_01", slot: "HELMET", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 6, itemCode: "JACKET_STREET_CLASSIC_C_01", slot: "JACKET", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 7, itemCode: "JACKET_DELIVERY_HUSTLE_R_01", slot: "JACKET", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 8, itemCode: "JACKET_SAIGON_GHOST_E_01", slot: "JACKET", collection: "SAIGON_GHOST", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 9, itemCode: "JACKET_LEGEND_OF_SAIGON_L_01", slot: "JACKET", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 10, itemCode: "JACKET_LEGEND_OF_SAIGON_M_01", slot: "JACKET", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 11, itemCode: "GLOVES_STREET_CLASSIC_C_01", slot: "GLOVES", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 12, itemCode: "GLOVES_DELIVERY_HUSTLE_R_01", slot: "GLOVES", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 13, itemCode: "GLOVES_NEON_SAIGON_E_01", slot: "GLOVES", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 14, itemCode: "GLOVES_LEGEND_OF_SAIGON_L_01", slot: "GLOVES", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 15, itemCode: "GLOVES_LEGEND_OF_SAIGON_M_01", slot: "GLOVES", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 16, itemCode: "EYEWEAR_STREET_CLASSIC_C_01", slot: "EYEWEAR", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 17, itemCode: "EYEWEAR_NEON_SAIGON_R_01", slot: "EYEWEAR", collection: "NEON_SAIGON", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 18, itemCode: "EYEWEAR_SAIGON_GHOST_E_01", slot: "EYEWEAR", collection: "SAIGON_GHOST", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 19, itemCode: "EYEWEAR_LEGEND_OF_SAIGON_L_01", slot: "EYEWEAR", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 20, itemCode: "EYEWEAR_TET_FESTIVAL_M_01", slot: "EYEWEAR", collection: "TET_FESTIVAL", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 21, itemCode: "BOOTS_STREET_CLASSIC_C_01", slot: "BOOTS", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 22, itemCode: "BOOTS_MEKONG_DELTA_R_01", slot: "BOOTS", collection: "MEKONG_DELTA", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 23, itemCode: "BOOTS_SAIGON_GHOST_E_01", slot: "BOOTS", collection: "SAIGON_GHOST", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 24, itemCode: "BOOTS_LEGEND_OF_SAIGON_L_01", slot: "BOOTS", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 25, itemCode: "BOOTS_LEGEND_OF_SAIGON_M_01", slot: "BOOTS", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 26, itemCode: "NAME_STREET_CLASSIC_C_01", slot: "NAME", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 27, itemCode: "NAME_DELIVERY_HUSTLE_R_01", slot: "NAME", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 28, itemCode: "NAME_NEON_SAIGON_E_01", slot: "NAME", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 29, itemCode: "NAME_LEGEND_OF_SAIGON_L_01", slot: "NAME", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 30, itemCode: "NAME_LEGEND_OF_SAIGON_M_01", slot: "NAME", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 31, itemCode: "BODY_STREET_CLASSIC_C_01", slot: "BODY", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 32, itemCode: "BODY_DELIVERY_HUSTLE_R_01", slot: "BODY", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 33, itemCode: "BODY_NEON_SAIGON_E_01", slot: "BODY", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 34, itemCode: "BODY_TET_FESTIVAL_L_01", slot: "BODY", collection: "TET_FESTIVAL", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 35, itemCode: "BODY_LEGEND_OF_SAIGON_M_01", slot: "BODY", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 36, itemCode: "ENGINE_STREET_CLASSIC_C_01", slot: "ENGINE", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 37, itemCode: "ENGINE_MEKONG_DELTA_R_01", slot: "ENGINE", collection: "MEKONG_DELTA", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 38, itemCode: "ENGINE_NEON_SAIGON_E_01", slot: "ENGINE", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 39, itemCode: "ENGINE_LEGEND_OF_SAIGON_L_01", slot: "ENGINE", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 40, itemCode: "ENGINE_SAIGON_GHOST_M_01", slot: "ENGINE", collection: "SAIGON_GHOST", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 41, itemCode: "SEAT_STREET_CLASSIC_C_01", slot: "SEAT", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 42, itemCode: "SEAT_MEKONG_DELTA_R_01", slot: "SEAT", collection: "MEKONG_DELTA", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 43, itemCode: "SEAT_NEON_SAIGON_E_01", slot: "SEAT", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 44, itemCode: "SEAT_LEGEND_OF_SAIGON_L_01", slot: "SEAT", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 45, itemCode: "SEAT_LEGEND_OF_SAIGON_M_01", slot: "SEAT", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 46, itemCode: "STICKER_STREET_CLASSIC_C_01", slot: "STICKER", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 47, itemCode: "STICKER_DELIVERY_HUSTLE_R_01", slot: "STICKER", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 48, itemCode: "STICKER_NEON_SAIGON_E_01", slot: "STICKER", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 49, itemCode: "STICKER_TET_FESTIVAL_L_01", slot: "STICKER", collection: "TET_FESTIVAL", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 50, itemCode: "STICKER_LEGEND_OF_SAIGON_M_01", slot: "STICKER", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 51, itemCode: "HANDLE_STREET_CLASSIC_C_01", slot: "HANDLE", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 52, itemCode: "HANDLE_MEKONG_DELTA_R_01", slot: "HANDLE", collection: "MEKONG_DELTA", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 53, itemCode: "HANDLE_NEON_SAIGON_E_01", slot: "HANDLE", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 54, itemCode: "HANDLE_LEGEND_OF_SAIGON_L_01", slot: "HANDLE", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 55, itemCode: "HANDLE_LEGEND_OF_SAIGON_M_01", slot: "HANDLE", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 56, itemCode: "MIRROR_STREET_CLASSIC_C_01", slot: "MIRROR", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 57, itemCode: "MIRROR_DELIVERY_HUSTLE_R_01", slot: "MIRROR", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 58, itemCode: "MIRROR_NEON_SAIGON_E_01", slot: "MIRROR", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 59, itemCode: "MIRROR_LEGEND_OF_SAIGON_L_01", slot: "MIRROR", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 60, itemCode: "MIRROR_LEGEND_OF_SAIGON_M_01", slot: "MIRROR", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 61, itemCode: "LIGHT_STREET_CLASSIC_C_01", slot: "LIGHT", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 62, itemCode: "LIGHT_NEON_SAIGON_R_01", slot: "LIGHT", collection: "NEON_SAIGON", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 63, itemCode: "LIGHT_NEON_SAIGON_E_01", slot: "LIGHT", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 64, itemCode: "LIGHT_LEGEND_OF_SAIGON_L_01", slot: "LIGHT", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 65, itemCode: "LIGHT_LEGEND_OF_SAIGON_M_01", slot: "LIGHT", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 66, itemCode: "TAIL_STREET_CLASSIC_C_01", slot: "TAIL", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 67, itemCode: "TAIL_DELIVERY_HUSTLE_R_01", slot: "TAIL", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 68, itemCode: "TAIL_NEON_SAIGON_E_01", slot: "TAIL", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 69, itemCode: "TAIL_LEGEND_OF_SAIGON_L_01", slot: "TAIL", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 70, itemCode: "TAIL_LEGEND_OF_SAIGON_M_01", slot: "TAIL", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 71, itemCode: "NUMBER_STREET_CLASSIC_C_01", slot: "NUMBER", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 72, itemCode: "NUMBER_DELIVERY_HUSTLE_R_01", slot: "NUMBER", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 73, itemCode: "NUMBER_NEON_SAIGON_E_01", slot: "NUMBER", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 74, itemCode: "NUMBER_LEGEND_OF_SAIGON_L_01", slot: "NUMBER", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 75, itemCode: "NUMBER_LEGEND_OF_SAIGON_M_01", slot: "NUMBER", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 76, itemCode: "TITLE_STREET_CLASSIC_C_01", slot: "TITLE", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 77, itemCode: "TITLE_DELIVERY_HUSTLE_R_01", slot: "TITLE", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 78, itemCode: "TITLE_NEON_SAIGON_E_01", slot: "TITLE", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 79, itemCode: "TITLE_LEGEND_OF_SAIGON_L_01", slot: "TITLE", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 80, itemCode: "TITLE_LEGEND_OF_SAIGON_M_01", slot: "TITLE", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 81, itemCode: "RANK_STREET_CLASSIC_C_01", slot: "RANK", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 82, itemCode: "RANK_MEKONG_DELTA_R_01", slot: "RANK", collection: "MEKONG_DELTA", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 83, itemCode: "RANK_NEON_SAIGON_E_01", slot: "RANK", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 84, itemCode: "RANK_LEGEND_OF_SAIGON_L_01", slot: "RANK", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 85, itemCode: "RANK_LEGEND_OF_SAIGON_M_01", slot: "RANK", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 86, itemCode: "FRAME_STREET_CLASSIC_C_01", slot: "FRAME", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 87, itemCode: "FRAME_DELIVERY_HUSTLE_R_01", slot: "FRAME", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 88, itemCode: "FRAME_NEON_SAIGON_E_01", slot: "FRAME", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 89, itemCode: "FRAME_LEGEND_OF_SAIGON_L_01", slot: "FRAME", collection: "LEGEND_OF_SAIGON", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 90, itemCode: "FRAME_LEGEND_OF_SAIGON_M_01", slot: "FRAME", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 91, itemCode: "TRAIL_STREET_CLASSIC_C_01", slot: "TRAIL", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 92, itemCode: "TRAIL_DELIVERY_HUSTLE_R_01", slot: "TRAIL", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 93, itemCode: "TRAIL_NEON_SAIGON_E_01", slot: "TRAIL", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 94, itemCode: "TRAIL_TET_FESTIVAL_L_01", slot: "TRAIL", collection: "TET_FESTIVAL", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 95, itemCode: "TRAIL_LEGEND_OF_SAIGON_M_01", slot: "TRAIL", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 96, itemCode: "START_STREET_CLASSIC_C_01", slot: "START", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 97, itemCode: "START_NEON_SAIGON_R_01", slot: "START", collection: "NEON_SAIGON", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 98, itemCode: "START_SAIGON_GHOST_E_01", slot: "START", collection: "SAIGON_GHOST", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 99, itemCode: "START_TET_FESTIVAL_L_01", slot: "START", collection: "TET_FESTIVAL", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 100, itemCode: "START_LEGEND_OF_SAIGON_M_01", slot: "START", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 101, itemCode: "HORN_STREET_CLASSIC_C_01", slot: "HORN", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 102, itemCode: "HORN_DELIVERY_HUSTLE_R_01", slot: "HORN", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 103, itemCode: "HORN_NEON_SAIGON_E_01", slot: "HORN", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 104, itemCode: "HORN_TET_FESTIVAL_L_01", slot: "HORN", collection: "TET_FESTIVAL", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 105, itemCode: "HORN_LEGEND_OF_SAIGON_M_01", slot: "HORN", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 106, itemCode: "BANNER_STREET_CLASSIC_C_01", slot: "BANNER", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 107, itemCode: "BANNER_DELIVERY_HUSTLE_R_01", slot: "BANNER", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 108, itemCode: "BANNER_NEON_SAIGON_E_01", slot: "BANNER", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 109, itemCode: "BANNER_TET_FESTIVAL_L_01", slot: "BANNER", collection: "TET_FESTIVAL", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 110, itemCode: "BANNER_LEGEND_OF_SAIGON_M_01", slot: "BANNER", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 111, itemCode: "BACKDROP_STREET_CLASSIC_C_01", slot: "BACKDROP", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 112, itemCode: "BACKDROP_MEKONG_DELTA_R_01", slot: "BACKDROP", collection: "MEKONG_DELTA", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 113, itemCode: "BACKDROP_NEON_SAIGON_E_01", slot: "BACKDROP", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 114, itemCode: "BACKDROP_SAIGON_GHOST_L_01", slot: "BACKDROP", collection: "SAIGON_GHOST", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 115, itemCode: "BACKDROP_LEGEND_OF_SAIGON_M_01", slot: "BACKDROP", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 116, itemCode: "EMOTE_STREET_CLASSIC_C_01", slot: "EMOTE", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 117, itemCode: "EMOTE_DELIVERY_HUSTLE_R_01", slot: "EMOTE", collection: "DELIVERY_HUSTLE", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 118, itemCode: "EMOTE_NEON_SAIGON_E_01", slot: "EMOTE", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 119, itemCode: "EMOTE_TET_FESTIVAL_L_01", slot: "EMOTE", collection: "TET_FESTIVAL", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 120, itemCode: "EMOTE_LEGEND_OF_SAIGON_M_01", slot: "EMOTE", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
  { num: 121, itemCode: "PET_STREET_CLASSIC_C_01", slot: "PET", collection: "STREET_CLASSIC", rarity: "C", sprite: "saigon-rider-items.svg" },
  { num: 122, itemCode: "PET_MEKONG_DELTA_R_01", slot: "PET", collection: "MEKONG_DELTA", rarity: "R", sprite: "saigon-rider-items.svg" },
  { num: 123, itemCode: "PET_NEON_SAIGON_E_01", slot: "PET", collection: "NEON_SAIGON", rarity: "E", sprite: "saigon-rider-items.svg" },
  { num: 124, itemCode: "PET_TET_FESTIVAL_L_01", slot: "PET", collection: "TET_FESTIVAL", rarity: "L", sprite: "saigon-rider-items.svg" },
  { num: 125, itemCode: "PET_LEGEND_OF_SAIGON_M_01", slot: "PET", collection: "LEGEND_OF_SAIGON", rarity: "M", sprite: "saigon-rider-items.svg" },
];

export const itemByCode = (code: string): ItemMeta | undefined =>
  ITEMS.find(i => i.itemCode === code);

export const itemsBySlot = (slot: ItemSlot): ItemMeta[] =>
  ITEMS.filter(i => i.slot === slot);

export const itemsByCollection = (c: CollectionCode): ItemMeta[] =>
  ITEMS.filter(i => i.collection === c);

export const itemsByRarity = (r: ItemRarity): ItemMeta[] =>
  ITEMS.filter(i => i.rarity === r);

/** i18n 키 헬퍼 — 컴포넌트에서 t(itemNameKey(code)) 형태로 사용 */
export const itemNameKey = (code: string): string => `items.${code}`;

/** 슬롯별 SVG 심볼 intrinsic viewBox (saigon-rider-items.svg authored 기준).
 *  심볼마다 viewBox 가 달라(60×20 ~ 240×80) 고정 박스에 <use> 하면 스케일이 깨지므로,
 *  ItemSvgRenderer 가 이 값으로 정규화(scale-to-fit)한다. */
export const SLOT_VIEWBOX: Record<ItemSlot, string> = {
  HELMET: '0 0 100 100', JACKET: '0 0 120 120', GLOVES: '0 0 50 100',
  EYEWEAR: '0 0 100 100', BOOTS: '0 0 50 100',
  BODY: '0 0 240 80', ENGINE: '0 0 60 40', SEAT: '0 0 80 30',
  STICKER: '0 0 80 40', HANDLE: '0 0 60 20', MIRROR: '0 0 25 25',
  LIGHT: '0 0 40 40', TAIL: '0 0 30 30', NUMBER: '0 0 50 30',
  NAME: '0 0 100 100', RANK: '0 0 100 100', FRAME: '0 0 100 100',
  TITLE: '0 0 100 100', BACKDROP: '0 0 100 100',
  TRAIL: '0 0 100 100', START: '0 0 100 100', HORN: '0 0 100 100',
  BANNER: '0 0 100 100', EMOTE: '0 0 100 100', PET: '0 0 100 100',
};

/** itemCode → 슬롯 (slot prop 미전달 시 폴백). 코드 형식: SLOT_COLLECTION_rarity_nn */
export const slotFromCode = (code: string): ItemSlot =>
  code.split('_')[0] as ItemSlot;
