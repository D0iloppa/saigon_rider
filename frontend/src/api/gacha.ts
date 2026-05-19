import { USE_MOCK, api } from './client';

export type ItemRarity = 'C' | 'R' | 'E' | 'L' | 'M';

export interface GachaDefinition {
  code: string;
  name: string;
  gacha_type: 'GOLD' | 'XP' | 'SEASON' | 'LEGEND';
  cost_currency: 'GOLD' | 'XP';
  cost_single: number;
  cost_10pull: number;
  pity_hard_ceiling: number;
  rate_common?: number;
  rate_rare: number;
  rate_epic: number;
  rate_legendary: number;
  rate_mythic?: number;
  description?: string;
  limited_label?: string;
  expires_at?: string;
}

export interface GachaPity {
  gacha_code: string;
  pull_count: number;
  pity_hard_ceiling: number;
}

export interface PulledItem {
  item_code: string;
  item_name: string;
  rarity: ItemRarity;
  slot: string;
  is_new: boolean;
}

export interface GachaPullResult {
  items: PulledItem[];
  new_pity_count: number;
  ceiling_reset: boolean;
  cost_paid: number;
  currency: 'GOLD' | 'XP';
}

const MOCK_GACHA_LIST: GachaDefinition[] = [
  {
    code: 'GARAGE_NORMAL',
    name: 'Garage 일반 뽑기',
    gacha_type: 'GOLD',
    cost_currency: 'GOLD',
    cost_single: 200,
    cost_10pull: 1800,
    pity_hard_ceiling: 0,
    rate_common: 70,
    rate_rare: 28,
    rate_epic: 2,
    rate_legendary: 0,
    rate_mythic: 0,
    description: 'C 70% · R 28% · E 2%',
  },
  {
    code: 'GARAGE_PREMIUM',
    name: 'Garage 프리미엄',
    gacha_type: 'GOLD',
    cost_currency: 'GOLD',
    cost_single: 1500,
    cost_10pull: 13500,
    pity_hard_ceiling: 100,
    rate_common: 0,
    rate_rare: 65,
    rate_epic: 33,
    rate_legendary: 2,
    rate_mythic: 0,
    description: 'R 65% · E 33% · L 2%',
  },
  {
    code: 'CRYSTAL',
    name: '크리스탈 뽑기',
    gacha_type: 'XP',
    cost_currency: 'XP',
    cost_single: 30,
    cost_10pull: 270,
    pity_hard_ceiling: 80,
    rate_common: 0,
    rate_rare: 50,
    rate_epic: 40,
    rate_legendary: 9,
    rate_mythic: 1,
    description: 'R 50% · E 40% · L 9% · M 1%',
  },
  {
    code: 'TET_SEASON',
    name: 'Tết Festival 한정',
    gacha_type: 'SEASON',
    cost_currency: 'XP',
    cost_single: 25,
    cost_10pull: 225,
    pity_hard_ceiling: 60,
    rate_common: 0,
    rate_rare: 60,
    rate_epic: 30,
    rate_legendary: 9,
    rate_mythic: 1,
    description: 'R 60% · E 30% · L 9% · M 1%',
    limited_label: 'Tết 18일',
    expires_at: new Date(Date.now() + 18 * 24 * 3600 * 1000).toISOString(),
  },
  {
    code: 'LEGEND',
    name: '전설 뽑기',
    gacha_type: 'LEGEND',
    cost_currency: 'XP',
    cost_single: 80,
    cost_10pull: 720,
    pity_hard_ceiling: 50,
    rate_common: 0,
    rate_rare: 0,
    rate_epic: 70,
    rate_legendary: 25,
    rate_mythic: 5,
    description: 'E 70% · L 25% · M 5%',
  },
];

const MOCK_PITY: Record<string, GachaPity> = {
  GARAGE_PREMIUM: { gacha_code: 'GARAGE_PREMIUM', pull_count: 87, pity_hard_ceiling: 100 },
  CRYSTAL:        { gacha_code: 'CRYSTAL',        pull_count: 42, pity_hard_ceiling: 80 },
  TET_SEASON:     { gacha_code: 'TET_SEASON',     pull_count: 23, pity_hard_ceiling: 60 },
  LEGEND:         { gacha_code: 'LEGEND',          pull_count: 31, pity_hard_ceiling: 50 },
};

export async function fetchGachaList(): Promise<GachaDefinition[]> {
  if (USE_MOCK) return api.delay(MOCK_GACHA_LIST, 200);
  return api.realFetch<GachaDefinition[]>('/gacha/list');
}

export async function fetchGachaPity(gachaCode: string): Promise<GachaPity | null> {
  if (USE_MOCK) return api.delay(MOCK_PITY[gachaCode] ?? null, 100);
  return api.realFetch<GachaPity>(`/gacha/pity/${gachaCode}`);
}

export async function pullGacha(
  gachaCode: string,
  is10Pull: boolean,
): Promise<GachaPullResult> {
  if (USE_MOCK) {
    const rarities: ItemRarity[] = is10Pull
      ? ['M', 'L', 'L', 'E', 'E', 'E', 'E', 'R', 'R', 'R']
      : ['E'];
    const items: PulledItem[] = rarities.map((r, i) => ({
      item_code: `MOCK_ITEM_${i}`,
      item_name: `Mock Item ${i + 1}`,
      rarity: r,
      slot: 'HELMET',
      is_new: i === 0,
    }));
    return api.delay({ items, new_pity_count: 0, ceiling_reset: true, cost_paid: is10Pull ? 13500 : 1500, currency: 'GOLD' }, 400);
  }
  const params = new URLSearchParams({ gacha_code: gachaCode, is_10_pull: String(is10Pull) });
  return api.realFetch<GachaPullResult>(`/gacha/pull?${params}`, { method: 'POST' });
}
