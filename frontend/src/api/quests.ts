import i18n from '@/lib/i18n';
import { USE_MOCK, api } from './client';
import { MOCK_QUESTS } from '@/data/quests';
import type { Quest } from './types';
import type { District, SafetyGrade } from './master';
import { localizedName } from './master';

function localized(raw: any, field: string): string {
  const lang = i18n.language;
  return raw[`${field}_${lang}`] || raw[`${field}_en`] || raw[`${field}_ko`] || raw[field] || '';
}

function transformQuest(raw: any): Quest {
  const district: District | null = raw.district ?? null;
  const safetyGrade: SafetyGrade | null = raw.min_safety_grade ?? null;
  return {
    id: raw.id,
    title: localized(raw, 'title'),
    description: localized(raw, 'description'),
    questType: (raw.period ?? 'DAILY').toLowerCase() as Quest['questType'],
    district,
    districtName: district ? localizedName(district) : '',
    minLevel: raw.required_level ?? 1,
    minDistanceM: raw.target_distance_km != null
      ? Math.round(Number(raw.target_distance_km) * 1000)
      : 0,
    maxDurationSec: null,
    timeRestriction: null,
    safetyGrade,
    rewardExp: raw.reward_exp ?? 0,
    rewardXpPoints: 0,
    rewardGold: raw.reward_gold ?? 0,
    rewardItems: raw.reward_item ? [raw.reward_item] : [],
    difficulty: 1,
    tags: [],
    thumbnailUrl: raw.thumbnail_url ?? raw.hero_image_url ?? '',
    expiresAt: raw.ends_at ?? undefined,
  };
}

export async function fetchQuests(filter?: {
  type?: 'daily' | 'weekly' | 'event';
  districtId?: number;
  riderTypeId?: number;
  safetyGradeId?: number;
}): Promise<Quest[]> {
  if (USE_MOCK) {
    let list = [...MOCK_QUESTS];
    if (filter?.type) list = list.filter((q) => q.questType === filter.type);
    return api.delay(list, 200);
  }
  const params = new URLSearchParams();
  if (filter?.type) params.set('period', filter.type.toUpperCase());
  if (filter?.districtId) params.set('district_id', String(filter.districtId));
  if (filter?.riderTypeId) params.set('rider_type_id', String(filter.riderTypeId));
  if (filter?.safetyGradeId) params.set('safety_grade_id', String(filter.safetyGradeId));
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

export interface CompleteQuestResult {
  rewardExp: number;
  rewardGold: number;
  rewardItem: string | null;
}

export async function completeQuest(questId: string, userId: string, passcode: string): Promise<CompleteQuestResult> {
  if (USE_MOCK) return { rewardExp: 0, rewardGold: 0, rewardItem: null };
  const raw = await api.realFetch<any>(`/quests/${questId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
    headers: { 'X-Passcode': passcode },
  });
  return {
    rewardExp: raw.reward_exp ?? 0,
    rewardGold: raw.reward_gold ?? 0,
    rewardItem: raw.reward_item ?? null,
  };
}

export async function fetchCompletedQuestIds(userId: string, type: 'daily' | 'weekly' | 'event'): Promise<Set<string>> {
  if (USE_MOCK) return new Set();
  const params = new URLSearchParams({ user_id: userId, period: type.toUpperCase() });
  const ids = await api.realFetch<string[]>(`/quests/completed-ids?${params}`);
  return new Set(ids);
}

export async function fetchRecommendedQuest(): Promise<Quest> {
  if (USE_MOCK) {
    return api.delay(MOCK_QUESTS[0], 200);
  }
  const raw = await api.realFetch<any>(`/quests/recommended`);
  return transformQuest(raw);
}
