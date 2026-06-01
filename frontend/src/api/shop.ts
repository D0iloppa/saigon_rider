import { USE_MOCK, api } from './client';
import type { ItemRarity } from './gacha';

export interface ShopItem {
  item_code: string;
  item_name: string;
  item_slot: string;
  rarity: ItemRarity;
  collection_code?: string;
  price_gold?: number;
  price_xp?: number;
  is_owned: boolean;
  is_limited: boolean;
  limited_label?: string;
  expires_at?: string;
}

export interface DailyFeaturedItem extends ShopItem {
  original_price_gold?: number;
  discount_percent: number;
  featured_until: string;
}

const MOCK_FEATURED: DailyFeaturedItem = {
  item_code: 'BODY_PAINT_SAIGON_SUNSET_L_01',
  item_name: 'Saigon Sunset Wrap',
  item_slot: 'BODY_PAINT',
  rarity: 'L',
  collection_code: 'LEGEND_OF_SAIGON',
  price_gold: 3150,
  original_price_gold: 4500,
  discount_percent: 30,
  is_owned: false,
  is_limited: true,
  limited_label: 'TODAY',
  featured_until: new Date(Date.now() + 14 * 3600 * 1000 + 32 * 60 * 1000 + 8 * 1000).toISOString(),
};

const MOCK_SHOP_ITEMS: ShopItem[] = [
  {
    item_code: 'HELMET_NEON_SAIGON_E_01',
    item_name: 'Phantom Shell',
    item_slot: 'HELMET',
    rarity: 'E',
    collection_code: 'NEON_SAIGON',
    price_gold: 10000,
    is_owned: false,
    is_limited: false,
  },
  {
    item_code: 'JACKET_DELIVERY_HUSTLE_R_01',
    item_name: 'Express Vest',
    item_slot: 'JACKET',
    rarity: 'R',
    collection_code: 'DELIVERY_HUSTLE',
    price_gold: 2000,
    is_owned: false,
    is_limited: false,
  },
  {
    item_code: 'BODY_TET_FESTIVAL_L_01',
    item_name: 'Lunar Red Gold',
    item_slot: 'BODY',
    rarity: 'L',
    collection_code: 'TET_FESTIVAL',
    price_xp: 100,
    is_owned: false,
    is_limited: true,
    limited_label: 'Tết',
    expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    item_code: 'MIRROR_STREET_CLASSIC_C_01',
    item_name: 'Stock Round',
    item_slot: 'MIRROR',
    rarity: 'C',
    collection_code: 'STREET_CLASSIC',
    price_gold: 300,
    is_owned: true,
    is_limited: false,
  },
  {
    item_code: 'ENGINE_SAIGON_GHOST_M_01',
    item_name: 'Phantom Core',
    item_slot: 'ENGINE',
    rarity: 'M',
    collection_code: 'SAIGON_GHOST',
    price_xp: 500,
    is_owned: false,
    is_limited: false,
  },
  {
    item_code: 'GLOVES_LEGEND_OF_SAIGON_L_01',
    item_name: 'Golden Knuckle',
    item_slot: 'GLOVES',
    rarity: 'L',
    collection_code: 'LEGEND_OF_SAIGON',
    price_gold: 35000,
    is_owned: false,
    is_limited: false,
  },
];

const SLOT_LABELS: Record<string, string> = {
  HELMET: 'Helmet', JACKET: 'Jacket', GLOVES: 'Gloves', EYEWEAR: 'Eyewear', BOOTS: 'Boots',
  PANTS: 'Pants', KNEE: 'Knee Guard',
  BODY: 'Body', ENGINE: 'Engine', SEAT: 'Seat', STICKER: 'Sticker', HANDLE: 'Handle',
  MIRROR: 'Mirror', LIGHT: 'Light', TAIL: 'Tail', NUMBER: 'Number', WHEEL: 'Wheel',
  NAME: 'Name', RANK: 'Rank', FRAME: 'Frame', TITLE: 'Title', BACKDROP: 'Backdrop',
  TRAIL: 'Trail', START: 'Start', HORN: 'Horn',
  BANNER: 'Banner', EMOTE: 'Emote', PET: 'Pet',
};

export function slotLabel(slot: string): string {
  return SLOT_LABELS[slot] ?? slot;
}

export async function fetchDailyFeatured(): Promise<DailyFeaturedItem | null> {
  if (USE_MOCK) return api.delay(MOCK_FEATURED, 150);
  try {
    return await api.realFetch<DailyFeaturedItem>('/shop/daily-featured');
  } catch {
    return null;
  }
}

// 드릴다운 그룹 → 슬롯 집합 (BFF/엔진 SHOP_GROUPS 와 일치, mock 필터용)
const SHOP_GROUP_SLOTS: Record<string, string[]> = {
  rider: ['HELMET', 'JACKET', 'GLOVES', 'EYEWEAR', 'BOOTS', 'PANTS', 'KNEE'],
  bike: ['BODY', 'ENGINE', 'SEAT', 'STICKER', 'HANDLE', 'MIRROR', 'LIGHT', 'TAIL', 'NUMBER', 'WHEEL'],
  effect: ['NAME', 'RANK', 'FRAME', 'TITLE', 'BACKDROP', 'TRAIL', 'START', 'HORN', 'BANNER', 'EMOTE', 'PET'],
};

export interface ShopItemFilter {
  slot?: string;
  group?: string;
  limit?: number;
  offset?: number;
}

export async function fetchShopItems(filter?: ShopItemFilter): Promise<ShopItem[]> {
  if (USE_MOCK) {
    let items = MOCK_SHOP_ITEMS;
    if (filter?.slot) items = items.filter((i) => i.item_slot === filter.slot);
    else if (filter?.group) {
      const slots = SHOP_GROUP_SLOTS[filter.group] ?? [];
      items = items.filter((i) => slots.includes(i.item_slot));
    }
    const off = filter?.offset ?? 0;
    const lim = filter?.limit ?? items.length;
    return api.delay(items.slice(off, off + lim), 200);
  }
  const params = new URLSearchParams();
  if (filter?.slot) params.set('slot', filter.slot);
  if (filter?.group) params.set('group', filter.group);
  if (filter?.limit) params.set('limit', String(filter.limit));
  if (filter?.offset) params.set('offset', String(filter.offset));
  return api.realFetch<ShopItem[]>(`/shop/items${params.size ? `?${params}` : ''}`);
}

export async function purchaseShopItem(
  itemCode: string,
  currency: 'GOLD' | 'XP',
): Promise<{ success: boolean; balance_gold?: number; balance_xp?: number }> {
  if (USE_MOCK) return api.delay({ success: true }, 300);
  return api.realFetch('/shop/purchase', {
    method: 'POST',
    body: JSON.stringify({ item_code: itemCode, currency }),
  }, 'bff', { rethrow: true });
}
