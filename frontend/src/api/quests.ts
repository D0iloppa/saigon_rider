import i18n from '@/lib/i18n';
import { USE_MOCK, api } from './client';
import { MOCK_QUESTS } from '@/data/quests';
import type { Quest } from './types';
import type { District, RiderType, SafetyGrade } from './master';
import { localizedName } from './master';

function localized(raw: any, field: string): string {
  const lang = i18n.language;
  return raw[`${field}_${lang}`] || raw[`${field}_en`] || raw[`${field}_ko`] || raw[field] || '';
}

function transformQuest(raw: any): Quest {
  const district: District | null = raw.district ?? null;
  const riderType: RiderType | null = raw.rider_type ?? null;
  const safetyGrade: SafetyGrade | null = raw.min_safety_grade ?? null;
  return {
    id: raw.id,
    title: localized(raw, 'title'),
    description: localized(raw, 'description'),
    questType: (raw.period ?? 'DAILY').toLowerCase() as Quest['questType'],
    district,
    districtName: district ? localizedName(district) : '',
    riderType,
    minLevel: raw.required_level ?? 1,
    minDistanceM: raw.target_distance_km != null
      ? Math.round(Number(raw.target_distance_km) * 1000)
      : 0,
    maxDurationSec: null,
    timeRestriction: null,
    safetyGrade,
    rewardExp: raw.reward_exp ?? 0,
    rewardXpPoints: Math.round((raw.reward_exp ?? 0) * 0.3),
    rewardGold: raw.reward_gold ?? 0,
    rewardItems: raw.reward_item ? [raw.reward_item] : [],
    difficulty: 1,
    tags: [],
    thumbnailUrls: raw.thumbnail_urls?.length
      ? raw.thumbnail_urls
      : [raw.thumbnail_url ?? raw.hero_image_url ?? ''].filter(Boolean),
    thumbnailUrl: (raw.thumbnail_urls?.[0] ?? raw.thumbnail_url ?? raw.hero_image_url ?? ''),
    expiresAt: raw.ends_at ?? undefined,
  };
}

export interface QuestPage {
  items: Quest[];
  total: number;
  page: number;
  size: number;
}

export async function fetchQuests(filter?: {
  type?: 'daily' | 'weekly' | 'event';
  districtId?: number;
  riderTypeId?: number;
  safetyGradeId?: number;
  userId?: string;
  excludeCompleted?: boolean;
  onlyCompleted?: boolean;
  page?: number;
  size?: number;
}): Promise<QuestPage> {
  const page = filter?.page ?? 1;
  const size = filter?.size ?? 20;

  if (USE_MOCK) {
    let list = [...MOCK_QUESTS];
    if (filter?.type) list = list.filter((q) => q.questType === filter.type);
    const start = (page - 1) * size;
    return api.delay({ items: list.slice(start, start + size), total: list.length, page, size }, 200);
  }
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (filter?.type) params.set('period', filter.type.toUpperCase());
  if (filter?.districtId) params.set('district_id', String(filter.districtId));
  if (filter?.riderTypeId) params.set('rider_type_id', String(filter.riderTypeId));
  if (filter?.safetyGradeId) params.set('safety_grade_id', String(filter.safetyGradeId));
  if (filter?.userId) params.set('user_id', filter.userId);
  if (filter?.excludeCompleted) params.set('exclude_completed', 'true');
  if (filter?.onlyCompleted) params.set('only_completed', 'true');
  const raw = await api.realFetch<{ items: any[]; total: number; page: number; size: number }>(`/quests?${params}`);
  return { items: raw.items.map(transformQuest), total: raw.total, page: raw.page, size: raw.size };
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

export async function fetchDistrictQuestCounts(): Promise<Record<string, number>> {
  if (USE_MOCK) {
    return api.delay({ QUAN_1: 3, QUAN_3: 1, GO_VAP: 2, THU_DUC: 5, BINH_THANH: 2, QUAN_7: 1 }, 100);
  }
  return api.realFetch<Record<string, number>>('/quests/district-counts');
}

export async function fetchRecommendedQuests(userId: string): Promise<Quest[]> {
  if (USE_MOCK) {
    return api.delay(MOCK_QUESTS.slice(0, 3), 200);
  }
  const raw = await api.realFetch<any[]>(`/quests/recommended?user_id=${userId}`);
  return raw.map(transformQuest);
}
