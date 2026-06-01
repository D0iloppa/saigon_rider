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
    total_owned: 9,
    total_catalog: 125,
    avg_rarity: 'R',
    completed_collections: 0,
    total_collections: 7,
  },
  items: [
    { user_item_id: '1', item_code: 'HELMET_STREET_CLASSIC_C_01',       item_name: 'Street Lid',       item_slot: 'HELMET',  rarity: 'C', collection_code: 'STREET_CLASSIC',   is_equipped: true,  is_new: false, acquired_at: '2026-05-29' },
    { user_item_id: '2', item_code: 'JACKET_SAIGON_GHOST_E_01',         item_name: 'Shadow Rider',     item_slot: 'JACKET',  rarity: 'E', collection_code: 'SAIGON_GHOST',     is_equipped: true,  is_new: false, acquired_at: '2026-05-29' },
    { user_item_id: '3', item_code: 'GLOVES_NEON_SAIGON_E_01',          item_name: 'Cyber Knuckle',    item_slot: 'GLOVES',  rarity: 'E', collection_code: 'NEON_SAIGON',      is_equipped: true,  is_new: false, acquired_at: '2026-05-29' },
    { user_item_id: '4', item_code: 'EYEWEAR_LEGEND_OF_SAIGON_L_01',    item_name: 'Golden Aviator',   item_slot: 'EYEWEAR', rarity: 'L', collection_code: 'LEGEND_OF_SAIGON', is_equipped: true,  is_new: false, acquired_at: '2026-05-29' },
    { user_item_id: '5', item_code: 'BOOTS_MEKONG_DELTA_R_01',          item_name: 'Delta Trekker',    item_slot: 'BOOTS',   rarity: 'R', collection_code: 'MEKONG_DELTA',     is_equipped: true,  is_new: false, acquired_at: '2026-05-29' },
    { user_item_id: '6', item_code: 'BODY_NEON_SAIGON_E_01',            item_name: 'Cyber Neon Body',  item_slot: 'BODY',    rarity: 'E', collection_code: 'NEON_SAIGON',      is_equipped: true,  is_new: true,  acquired_at: '2026-05-29' },
    { user_item_id: '7', item_code: 'MIRROR_STREET_CLASSIC_C_01',       item_name: 'Stock Round',      item_slot: 'MIRROR',  rarity: 'C', collection_code: 'STREET_CLASSIC',   is_equipped: false, is_new: false, acquired_at: '2026-05-29' },
    { user_item_id: '8', item_code: 'STICKER_LEGEND_OF_SAIGON_M_01',    item_name: 'Saigon Dragon',    item_slot: 'STICKER', rarity: 'M', collection_code: 'LEGEND_OF_SAIGON', is_equipped: false, is_new: true,  acquired_at: '2026-05-29' },
    { user_item_id: '9', item_code: 'TRAIL_NEON_SAIGON_E_01',           item_name: '(TBD)',            item_slot: 'TRAIL',   rarity: 'E', collection_code: 'NEON_SAIGON',      is_equipped: false, is_new: false, acquired_at: '2026-05-29' },
  ],
};

const RARITY_LABEL: Record<ItemRarity, string> = {
  C: 'Common', R: 'Rare', E: 'Epic', L: 'Legendary', M: 'Mythic',
};

const SLOT_LABELS: Record<string, string> = {
  HELMET: 'Helmet', JACKET: 'Jacket', GLOVES: 'Gloves', EYEWEAR: 'Eyewear', BOOTS: 'Boots',
  PANTS: 'Pants', KNEE: 'Knee Guard',
  BODY: 'Body', ENGINE: 'Engine', SEAT: 'Seat', STICKER: 'Sticker', HANDLE: 'Handle',
  MIRROR: 'Mirror', LIGHT: 'Light', TAIL: 'Tail', NUMBER: 'Number', WHEEL: 'Wheel',
  NAME: 'Name', RANK: 'Rank', FRAME: 'Frame', TITLE: 'Title', BACKDROP: 'Backdrop',
  TRAIL: 'Trail', START: 'Start', HORN: 'Horn',
  BANNER: 'Banner', EMOTE: 'Emote', PET: 'Pet',
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
