import { USE_MOCK, api } from './client';
import type { ItemRarity } from './gacha';

export interface Season {
  id: string;
  name: string;
  status: 'ACTIVE' | 'UPCOMING' | 'ENDED';
  ends_at: string;
  total_levels: number;
  description?: string;
}

export interface SeasonRewardNode {
  level: number;
  free_reward: { type: 'GOLD' | 'XP' | 'ITEM' | 'BOX'; label: string; rarity?: ItemRarity };
  premium_reward?: { type: 'GOLD' | 'XP' | 'ITEM' | 'BOX'; label: string; rarity?: ItemRarity };
  is_claimed_free: boolean;
  is_claimed_premium: boolean;
}

export interface SeasonPass {
  season: Season;
  current_level: number;
  current_sxp: number;
  sxp_to_next: number;
  is_premium: boolean;
  tier_label: string;
  rewards: SeasonRewardNode[];
}

const MOCK_SEASON: SeasonPass = {
  season: {
    id: 'season-1',
    name: 'Tết Season Pass',
    status: 'ACTIVE',
    ends_at: new Date(Date.now() + 18 * 24 * 3600 * 1000 + 23 * 3600 * 1000).toISOString(),
    total_levels: 30,
  },
  current_level: 14,
  current_sxp: 1430,
  sxp_to_next: 1500,
  is_premium: false,
  tier_label: 'VETERAN',
  rewards: [
    { level: 1,  free_reward: { type: 'GOLD', label: 'Gold 50' },   premium_reward: { type: 'GOLD', label: 'Gold 100', rarity: 'E' }, is_claimed_free: true,  is_claimed_premium: true  },
    { level: 5,  free_reward: { type: 'BOX', label: 'C BOX' }, premium_reward: { type: 'ITEM', label: 'E ×1', rarity: 'E' }, is_claimed_free: true,  is_claimed_premium: true  },
    { level: 10, free_reward: { type: 'GOLD', label: 'Gold 200' },  premium_reward: { type: 'XP', label: 'XP 30', rarity: 'E' }, is_claimed_free: true,  is_claimed_premium: true  },
    { level: 14, free_reward: { type: 'ITEM', label: 'Claim', rarity: 'R' }, premium_reward: { type: 'ITEM', label: 'Claim', rarity: 'E' }, is_claimed_free: false, is_claimed_premium: false },
    { level: 15, free_reward: { type: 'ITEM', label: 'R ×1', rarity: 'R' }, premium_reward: { type: 'ITEM', label: 'L+Trail', rarity: 'L' }, is_claimed_free: false, is_claimed_premium: false },
    { level: 20, free_reward: { type: 'GOLD', label: 'Gold 500' },  premium_reward: { type: 'ITEM', label: 'L ×1', rarity: 'L' }, is_claimed_free: false, is_claimed_premium: false },
    { level: 25, free_reward: { type: 'XP', label: 'E ×1', rarity: 'E' }, premium_reward: { type: 'ITEM', label: 'M ×1 ⭐', rarity: 'M' }, is_claimed_free: false, is_claimed_premium: false },
    { level: 30, free_reward: { type: 'ITEM', label: 'L ×1', rarity: 'L' }, premium_reward: { type: 'ITEM', label: 'M ×1 ⭐⭐', rarity: 'M' }, is_claimed_free: false, is_claimed_premium: false },
  ],
};

export async function fetchSeasonPass(): Promise<SeasonPass> {
  if (USE_MOCK) return api.delay(MOCK_SEASON, 200);
  return api.realFetch<SeasonPass>('/season/pass');
}

export async function fetchCurrentSeason(): Promise<Season> {
  if (USE_MOCK) return api.delay(MOCK_SEASON.season, 150);
  return api.realFetch<Season>('/season/current');
}
