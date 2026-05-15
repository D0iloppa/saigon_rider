import { USE_MOCK, api } from './client';
import { MOCK_QUESTS } from '@/data/quests';
import type { Quest } from './types';

function transformQuest(raw: any): Quest {
  return {
    id: raw.id,
    title: raw.title ?? '',
    description: raw.description ?? '',
    questType: (raw.period ?? 'DAILY').toLowerCase() as Quest['questType'],
    district: raw.district ?? '',
    minLevel: raw.required_level ?? 1,
    minDistanceM: raw.target_distance_km != null
      ? Math.round(Number(raw.target_distance_km) * 1000)
      : 0,
    maxDurationSec: null,
    timeRestriction: null,
    safetyGradeMin: raw.min_safety_grade ?? null,
    rewardExp: raw.reward_exp ?? 0,
    rewardXpPoints: 0,
    rewardGold: raw.reward_gold ?? 0,
    rewardItems: raw.reward_item ? [raw.reward_item] : [],
    difficulty: 1,
    tags: [],
    thumbnailUrl: raw.hero_image_url ?? '',
    expiresAt: raw.ends_at ?? undefined,
  };
}

export async function fetchQuests(filter?: {
  type?: 'daily' | 'weekly' | 'event';
  district?: string;
  safetyGrade?: string;
}): Promise<Quest[]> {
  if (USE_MOCK) {
    let list = [...MOCK_QUESTS];
    if (filter?.type) list = list.filter((q) => q.questType === filter.type);
    if (filter?.district) list = list.filter((q) => q.district === filter.district);
    if (filter?.safetyGrade) list = list.filter((q) => q.safetyGradeMin === filter.safetyGrade);
    return api.delay(list, 200);
  }
  const params = new URLSearchParams();
  if (filter?.type) params.set('type', filter.type);
  if (filter?.district) params.set('district', filter.district);
  if (filter?.safetyGrade) params.set('safety_grade', filter.safetyGrade);
  const raw = await api.realFetch<any[]>(`/quests?${params}`);
  return raw.map(transformQuest);
}

export async function fetchQuest(id: string): Promise<Quest | null> {
  if (USE_MOCK) {
    const q = MOCK_QUESTS.find((x) => x.id === id) ?? null;
    return api.delay(q, 150);
  }
  const raw = await api.realFetch<any>(`/quests/${id}`);
  return transformQuest(raw);
}

export async function fetchRecommendedQuest(): Promise<Quest> {
  if (USE_MOCK) {
    return api.delay(MOCK_QUESTS[0], 200);
  }
  const raw = await api.realFetch<any>(`/quests/recommended`);
  return transformQuest(raw);
}
