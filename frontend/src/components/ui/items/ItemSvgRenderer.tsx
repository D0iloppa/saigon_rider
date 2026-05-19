// Item codes that have a specific symbol in the SVG sprite
const SPRITE_ITEM_CODES = new Set([
  'BODY_PAINT_DELIVERY_HUSTLE_E_02','BODY_PAINT_LEGEND_OF_SAIGON_M_02',
  'BODY_PAINT_MEKONG_DELTA_R_04','BODY_PAINT_SAIGON_GHOST_L_01',
  'BODY_PAINT_STREET_CLASSIC_C_03','DECAL_LEGEND_OF_SAIGON_M_01',
  'DECAL_SAIGON_GHOST_E_03','DECAL_STREET_CLASSIC_C_02',
  'DECAL_TET_FESTIVAL_R_03','EXHAUST_SAIGON_GHOST_E_02',
  'HEADLIGHT_TET_FESTIVAL_R_01','HELMET_LEGEND_OF_SAIGON_M_01',
  'HELMET_NEON_SAIGON_R_03','HELMET_SAIGON_GHOST_L_01',
  'HELMET_STREET_CLASSIC_C_01','HELMET_TET_FESTIVAL_E_01',
  'JACKET_NEON_SAIGON_E_02','JACKET_STREET_CLASSIC_C_02',
  'NAMEPLATE_LEGEND_OF_SAIGON_M_01','START_ANIM_SAIGON_GHOST_L_01',
  'TITLE_LEGEND_OF_SAIGON_L_01','TRAIL_LEGEND_OF_SAIGON_M_01',
  'TRAIL_NEON_SAIGON_E_01','WHEEL_LEGEND_OF_SAIGON_L_01',
  'WHEEL_LEGEND_OF_SAIGON_M_01','WHEEL_NEON_SAIGON_E_01',
  'WHEEL_STREET_CLASSIC_C_01',
]);

// Normalize API slot names to SVG base symbol IDs
const SLOT_TO_BASE: Record<string, string> = {
  NUMBER_PLATE: 'NUMBER',
  TITLE_BANNER: 'TITLE',
};

// currentColor for base slot silhouettes (rarity-tinted)
const RARITY_COLOR: Record<string, string> = {
  C: '#8A9099',
  R: '#3B82F6',
  E: '#8B5CF6',
  L: '#FFB800',
  M: '#FF2D9C',
};

export interface ItemSvgRendererProps {
  itemCode: string;
  slot?: string;
  size?: number;
  rarity?: 'C' | 'R' | 'E' | 'L' | 'M';
  className?: string;
}

export function ItemSvgRenderer({
  itemCode, slot, size = 80, rarity, className,
}: ItemSvgRendererProps) {
  const filterClass = rarity ? `item-r-${rarity.toLowerCase()}` : '';
  const hasSpecific = SPRITE_ITEM_CODES.has(itemCode);
  const baseSlot = slot ? (SLOT_TO_BASE[slot] ?? slot) : null;
  const symbolId = hasSpecific ? `#item-${itemCode}` : baseSlot ? `#base-${baseSlot}` : `#item-${itemCode}`;
  // Base silhouettes use currentColor — set explicit color so they're visible on any bg
  const color = !hasSpecific && rarity ? RARITY_COLOR[rarity] : undefined;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      style={color ? { color } : undefined}
      className={[filterClass, className].filter(Boolean).join(' ')}
    >
      <use href={symbolId} />
    </svg>
  );
}
