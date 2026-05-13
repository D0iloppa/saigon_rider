import { USE_MOCK, api } from './client';
import { MOCK_QUESTS } from '@/data/quests';
import type { Quest } from './types';

export async function fetchQuests(filter?: {
  type?: 'daily' | 'weekly' | 'event';
  district?: string;
}): Promise<Quest[]> {
  if (USE_MOCK) {
    let list = [...MOCK_QUESTS];
    if (filter?.type) list = list.filter((q) => q.questType === filter.type);
    if (filter?.district) list = list.filter((q) => q.district === filter.district);
    return api.delay(list, 200);
  }
  const params = new URLSearchParams();
  if (filter?.type) params.set('type', filter.type);
  if (filter?.district) params.set('district', filter.district);
  return api.realFetch<Quest[]>(`/quests?${params}`);
}

export async function fetchQuest(id: string): Promise<Quest | null> {
  if (USE_MOCK) {
    const q = MOCK_QUESTS.find((x) => x.id === id) ?? null;
    return api.delay(q, 150);
  }
  return api.realFetch<Quest>(`/quests/${id}`);
}

export async function fetchRecommendedQuest(): Promise<Quest> {
  if (USE_MOCK) {
    return api.delay(MOCK_QUESTS[0], 200);
  }
  return api.realFetch<Quest>(`/quests/recommended`);
}
