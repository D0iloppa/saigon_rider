import { USE_MOCK, api } from './client';
import type { ItemRarity } from './gacha';

export interface InventoryItem {
  user_item_id: string;
  item_code: string;
  item_name: string;
  item_slot: string;
  rarity: ItemRarity;
  collection_code?: string;
  is_equipped: boolean;
  is_new: boolean;
  acquired_at: string;
}

export interface InventoryStats {
  total_owned: number;
  total_catalog: number;
  avg_rarity: ItemRarity;
  completed_collections: number;
  total_collections: number;
}

export interface InventoryResponse {
  stats: InventoryStats;
  items: InventoryItem[];
}

const MOCK_INVENTORY: InventoryResponse = {
  stats: {
    total_owned: 47,
    total_catalog: 213,
    avg_rarity: 'R',
    completed_collections: 3,
    total_collections: 7,
  },
  items: [
    { user_item_id: '1', item_code: 'DECAL_DRAGON_SKIN_M_01',        item_name: 'Dragon Skin',       item_slot: 'DECAL',      rarity: 'M', collection_code: 'LEGEND_OF_SAIGON', is_equipped: false, is_new: false, acquired_at: '2026-05-10' },
    { user_item_id: '2', item_code: 'HELMET_CYBER_SAIGON_L_01',      item_name: 'Cyber Saigon',      item_slot: 'HELMET',     rarity: 'L', collection_code: 'NEON_SAIGON',      is_equipped: true,  is_new: false, acquired_at: '2026-05-12' },
    { user_item_id: '3', item_code: 'BODY_PAINT_SAIGON_SUNSET_L_01', item_name: 'Sunset Wrap',       item_slot: 'BODY_PAINT', rarity: 'L', collection_code: 'LEGEND_OF_SAIGON', is_equipped: false, is_new: false, acquired_at: '2026-05-14' },
    { user_item_id: '4', item_code: 'EXHAUST_GHOST_WHISPER_E_01',    item_name: 'Ghost Whisper',     item_slot: 'EXHAUST',    rarity: 'E', collection_code: 'SAIGON_GHOST',     is_equipped: true,  is_new: false, acquired_at: '2026-05-15' },
    { user_item_id: '5', item_code: 'WHEEL_NEON_SPOKE_E_01',         item_name: 'Neon Spoke 17',     item_slot: 'WHEEL',      rarity: 'E', collection_code: 'NEON_SAIGON',      is_equipped: false, is_new: true,  acquired_at: '2026-05-17' },
    { user_item_id: '6', item_code: 'HEADLIGHT_TET_LANTERN_R_01',    item_name: 'Tết Lantern',       item_slot: 'HEADLIGHT',  rarity: 'R', collection_code: 'TET_FESTIVAL',     is_equipped: true,  is_new: false, acquired_at: '2026-05-13' },
    { user_item_id: '7', item_code: 'MIRROR_STANDARD_CHROME_C_01',   item_name: 'Standard Chrome',   item_slot: 'MIRROR',     rarity: 'C', collection_code: 'STREET_CLASSIC',   is_equipped: false, is_new: false, acquired_at: '2026-05-11' },
    { user_item_id: '8', item_code: 'JACKET_GHOST_RIDER_E_01',       item_name: 'Ghost Rider Coat',  item_slot: 'JACKET',     rarity: 'E', collection_code: 'SAIGON_GHOST',     is_equipped: true,  is_new: false, acquired_at: '2026-05-16' },
    { user_item_id: '9', item_code: 'BOOTS_MEKONG_DELTA_R_01',       item_name: 'Mekong Delta Boot', item_slot: 'BOOTS',      rarity: 'R', collection_code: 'MEKONG_DELTA',     is_equipped: true,  is_new: false, acquired_at: '2026-05-10' },
  ],
};

const RARITY_LABEL: Record<ItemRarity, string> = {
  C: 'Common', R: 'Rare', E: 'Epic', L: 'Legendary', M: 'Mythic',
};

const SLOT_LABELS: Record<string, string> = {
  MOTORCYCLE_BODY: 'Body', SEAT: 'Seat', STICKER: 'Sticker', RANK_CARD: 'Rank Card',
  HANDLEBAR: 'Handlebar', TAIL_LIGHT: 'Tail Light', ENGINE_COVER: 'Engine Cover',
  HEADLIGHT: 'Headlight', MIRROR: 'Mirror', NUMBER: 'Number',
  GLOVES: 'Gloves', BOOTS: 'Boots', EYEWEAR: 'Eyewear', NAMEPLATE: 'Nameplate',
  FRAME: 'Frame', BACKDROP: 'Backdrop', TITLE: 'Title',
  TRAIL: 'Trail', HORN: 'Horn', START_ANIM: 'Start',
  EMOTE: 'Emote', BANNER: 'Banner', PET: 'Pet',
};

export function rarityLabel(r: ItemRarity) { return RARITY_LABEL[r] ?? r; }
export function slotLabel(slot: string) { return SLOT_LABELS[slot] ?? slot; }

export async function fetchInventory(_userId?: string): Promise<InventoryResponse> {
  if (USE_MOCK) return api.delay(MOCK_INVENTORY, 250);
  return api.realFetch<InventoryResponse>('/inventory/items');
}

export async function equipItem(
  _userId: string,
  itemCode: string,
): Promise<{ success: boolean }> {
  if (USE_MOCK) return api.delay({ success: true }, 200);
  return api.realFetch('/inventory/equip', {
    method: 'PUT',
    body: JSON.stringify({ item_code: itemCode }),
  });
}

export async function unequipSlot(slot: string): Promise<void> {
  if (USE_MOCK) { await api.delay(null, 150); return; }
  await api.realFetch(`/inventory/equip/${slot}`, { method: 'DELETE' });
}
