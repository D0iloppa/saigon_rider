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
    item_code: 'EXHAUST_GHOST_WHISPER_E_01',
    item_name: 'Ghost Whisper',
    item_slot: 'EXHAUST',
    rarity: 'E',
    collection_code: 'SAIGON_GHOST',
    price_gold: 8000,
    is_owned: false,
    is_limited: false,
  },
  {
    item_code: 'HEADLIGHT_TET_LANTERN_R_01',
    item_name: 'Tết Lantern',
    item_slot: 'HEADLIGHT',
    rarity: 'R',
    collection_code: 'TET_FESTIVAL',
    price_xp: 30,
    is_owned: false,
    is_limited: true,
    limited_label: 'Tết 5일',
    expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    item_code: 'MIRROR_STANDARD_CHROME_C_01',
    item_name: 'Standard Chrome',
    item_slot: 'MIRROR',
    rarity: 'C',
    collection_code: 'STREET_CLASSIC',
    price_gold: 500,
    is_owned: true,
    is_limited: false,
  },
  {
    item_code: 'HELMET_CYBER_SAIGON_L_01',
    item_name: 'Cyber Saigon Lid',
    item_slot: 'HELMET',
    rarity: 'L',
    collection_code: 'NEON_SAIGON',
    price_xp: 80,
    is_owned: false,
    is_limited: false,
  },
  {
    item_code: 'JACKET_GHOST_RIDER_E_01',
    item_name: 'Ghost Rider Coat',
    item_slot: 'JACKET',
    rarity: 'E',
    collection_code: 'SAIGON_GHOST',
    price_gold: 6000,
    is_owned: false,
    is_limited: false,
  },
  {
    item_code: 'WHEEL_NEON_SPOKE_E_01',
    item_name: 'Neon Spoke 17',
    item_slot: 'WHEEL',
    rarity: 'E',
    collection_code: 'NEON_SAIGON',
    price_gold: 7500,
    is_owned: false,
    is_limited: false,
  },
];

const SLOT_LABELS: Record<string, string> = {
  MOTORCYCLE_BODY: 'Body', SEAT: 'Seat', STICKER: 'Sticker', RANK_CARD: 'Rank Card',
  HANDLEBAR: 'Handlebar', TAIL_LIGHT: 'Tail Light', ENGINE_COVER: 'Engine Cover',
  HEADLIGHT: 'Headlight', MIRROR: 'Mirror', NUMBER: 'Number',
  GLOVES: 'Gloves', BOOTS: 'Boots', EYEWEAR: 'Eyewear', NAMEPLATE: 'Nameplate',
  FRAME: 'Frame', BACKDROP: 'Backdrop', TITLE: 'Title',
  TRAIL: 'Trail', HORN: 'Horn', START_ANIM: 'Start',
  EMOTE: 'Emote', BANNER: 'Banner', PET: 'Pet',
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

export async function fetchShopItems(filter?: { slot?: string }): Promise<ShopItem[]> {
  if (USE_MOCK) {
    let items = MOCK_SHOP_ITEMS;
    if (filter?.slot) items = items.filter((i) => i.item_slot === filter.slot);
    return api.delay(items, 200);
  }
  const params = new URLSearchParams();
  if (filter?.slot) params.set('slot', filter.slot);
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
  });
}
