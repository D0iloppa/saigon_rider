import { USE_MOCK, api, requireSession } from './client';
import type { FollowUser } from './types';

function transformFollowUser(raw: any): FollowUser {
  return {
    id: raw.id,
    nickname: raw.nickname ?? null,
    avatarUrl: raw.avatar_url ?? null,
    level: raw.level ?? 1,
  };
}

export async function followUser(targetUserId: string): Promise<void> {
  if (USE_MOCK) return api.delay(undefined, 100);
  const session = requireSession();
  await api.realFetch(`/follows/${targetUserId}`, {
    method: 'POST',
    body: JSON.stringify({ user_id: session.userId }),
  });
}

export async function unfollowUser(targetUserId: string): Promise<void> {
  if (USE_MOCK) return api.delay(undefined, 100);
  const session = requireSession();
  await api.realFetch(`/follows/${targetUserId}`, {
    method: 'DELETE',
    body: JSON.stringify({ user_id: session.userId }),
  });
}

export async function fetchFollowers(
  userId: string,
  page = 1,
): Promise<{ items: FollowUser[]; total: number }> {
  if (USE_MOCK) return api.delay({ items: [], total: 0 }, 150);
  const res = await api.realFetch<{ items: any[]; total: number }>(
    `/users/${userId}/followers?page=${page}`,
  );
  return { items: res.items.map(transformFollowUser), total: res.total };
}

export async function fetchFollowing(
  userId: string,
  page = 1,
): Promise<{ items: FollowUser[]; total: number }> {
  if (USE_MOCK) return api.delay({ items: [], total: 0 }, 150);
  const res = await api.realFetch<{ items: any[]; total: number }>(
    `/users/${userId}/following?page=${page}`,
  );
  return { items: res.items.map(transformFollowUser), total: res.total };
}

export async function fetchFollowCounts(
  userId: string,
): Promise<{ followerCount: number; followingCount: number }> {
  if (USE_MOCK) return api.delay({ followerCount: 0, followingCount: 0 }, 100);
  const res = await api.realFetch<{ follower_count: number; following_count: number }>(
    `/users/${userId}/follow-counts`,
  );
  return { followerCount: res.follower_count, followingCount: res.following_count };
}

export async function fetchFriends(
  userId: string,
  page = 1,
): Promise<{ items: FollowUser[]; total: number }> {
  if (USE_MOCK) return api.delay({ items: [], total: 0 }, 150);
  const res = await api.realFetch<{ items: any[]; total: number }>(
    `/users/${userId}/friends?page=${page}`,
  );
  return { items: res.items.map(transformFollowUser), total: res.total };
}

export async function searchUsers(query: string): Promise<FollowUser[]> {
  if (USE_MOCK) return api.delay([], 150);
  const res = await api.realFetch<any[]>(`/users/search?query=${encodeURIComponent(query)}`);
  return res.map(transformFollowUser);
}
