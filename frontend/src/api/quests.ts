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
    cardType: (raw.card_type ?? 'DISTANCE') as 'DISTANCE' | 'CHECKPOINT',
    targetLat: raw.target_lat != null ? Number(raw.target_lat) : null,
    targetLng: raw.target_lng != null ? Number(raw.target_lng) : null,
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
    thumbnailImageUrl: raw.thumbnail_image_url ?? null,
    mainImageUrl: raw.main_image_url ?? null,
    bannerImageUrl: raw.banner_image_url ?? null,
    expiresAt: raw.ends_at ?? undefined,
    missionCode: raw.mission_code ?? null,
    rarity: (raw.rarity ?? 'C') as Quest['rarity'],
    csv: raw.csv ?? null,
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
  excludeAccepted?: boolean;
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
  if (filter?.excludeAccepted) params.set('exclude_accepted', 'true');
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

export interface AcceptQuestResult {
  userQuestId: string;
}

export async function acceptQuest(questId: string, userId: string): Promise<AcceptQuestResult> {
  if (USE_MOCK) return { userQuestId: 'mock-user-quest-' + Date.now() };
  // rethrow: 전역 토스트를 억제하고 호출자(handleAccept)가 메시지를 직접 결정 (예: 409 슬롯 만석)
  const raw = await api.realFetch<{ user_quest_id: string }>(`/quests/${questId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  }, 'bff', { rethrow: true });
  return { userQuestId: raw.user_quest_id };
}

export async function startRide(userQuestId: string): Promise<void> {
  if (USE_MOCK) return;
  await api.realFetch<{ user_quest_id: string }>(`/user-quests/${userQuestId}/start-ride`, {
    method: 'POST',
  });
}

export async function abandonRide(userQuestId: string): Promise<void> {
  if (USE_MOCK) return;
  // fire-and-forget: 호출자가 에러를 무시하므로 realFetch의 토스트를 우회한다
  const session = (await import('@/lib/session')).loadSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.userId) headers['X-User-Id'] = session.userId;
  await fetch(`/api/bff/user-quests/${userQuestId}/abandon-ride`, { method: 'POST', headers });
}

export async function dropAccepted(userQuestId: string): Promise<void> {
  if (USE_MOCK) return;
  await api.realFetch<unknown>(`/user-quests/${userQuestId}`, { method: 'DELETE' });
}

export interface MyAcceptedItem {
  userQuestId: string;
  acceptedAt: string;
  periodKey: string | null;
  quest: Quest;
}

export async function fetchMyAccepted(userId: string): Promise<MyAcceptedItem[]> {
  if (USE_MOCK) return [];
  const raw = await api.realFetch<Array<{ user_quest_id: string; accepted_at: string; period_key: string | null; quest: any }>>(
    `/quests/my-accepted?user_id=${userId}`,
  );
  return raw.map((r) => ({
    userQuestId: r.user_quest_id,
    acceptedAt: r.accepted_at,
    periodKey: r.period_key,
    quest: transformQuest(r.quest),
  }));
}

export interface MyCompletedItem {
  userQuestId: string;
  completedAt: string | null;
  periodKey: string | null;
  quest: Quest;
}

export async function fetchMyCompleted(userId: string): Promise<MyCompletedItem[]> {
  if (USE_MOCK) return [];
  const raw = await api.realFetch<Array<{ user_quest_id: string; completed_at: string | null; period_key: string | null; quest: any }>>(
    `/quests/my-completed?user_id=${userId}`,
  );
  return raw.map((r) => ({
    userQuestId: r.user_quest_id,
    completedAt: r.completed_at,
    periodKey: r.period_key,
    quest: transformQuest(r.quest),
  }));
}

export interface ActiveCardState {
  card_id: number;
  card_type: 'DISTANCE' | 'CHECKPOINT';
  criteria: Record<string, unknown>;
  current_distance_m: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  completed_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_speed_kmh: number | null;
  distance_to_target_m: number | null;
}

export async function fetchActiveCard(userQuestId: string): Promise<ActiveCardState | null> {
  if (USE_MOCK) return null;
  try {
    return await api.realFetch<ActiveCardState>(`/quests/active-card?user_quest_id=${userQuestId}`);
  } catch {
    return null;
  }
}

export interface TrailPoint { lat: number; lng: number; }

/** 라이드 이동경로 — 엔진 redis 스트림의 해당 device gps 핑을 좌표열(오래된→최신)로. 시각화 전용. */
export async function fetchRideTrail(deviceUuid: string, sinceTs?: number): Promise<TrailPoint[]> {
  if (USE_MOCK || !deviceUuid) return [];
  const params = new URLSearchParams({ device_uuid: deviceUuid });
  if (sinceTs) params.set('since_ts', String(sinceTs));
  try {
    const raw = await api.realFetch<{ points: TrailPoint[] }>(`/quests/ride-trail?${params}`);
    return raw.points ?? [];
  } catch {
    return [];
  }
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
  return raw.map(transformQuest).slice(0, 3);
}

export interface RidePolicy {
  checkpointProximityM: number;
  checkpointDistanceBands: Array<{ code: string; thresholdM: number }>;
}

export async function fetchRidePolicy(): Promise<RidePolicy> {
  if (USE_MOCK) {
    return api.delay(
      {
        checkpointProximityM: 100,
        checkpointDistanceBands: [
          { code: 'BAND_5KM', thresholdM: 5000 },
          { code: 'BAND_1KM', thresholdM: 1000 },
        ],
      },
      50,
    );
  }
  return api.realFetch<RidePolicy>('/ride/policy');
}
