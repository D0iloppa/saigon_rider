import { api, USE_MOCK } from './client';
import type { UserDto } from './auth';
import type { LoginResult } from './auth';
import type { BadgeWithEarned, PageResponse, QuestHistoryItem, RiderStyle, UserProfile, UserStats } from './types';

export async function fetchMe(phone: string): Promise<UserDto | null> {
  if (USE_MOCK) return null;
  try {
    const res = await api.realFetch<LoginResult>(`/auth/me?phone=${encodeURIComponent(phone)}`);
    return res.user;
  } catch {
    return null;
  }
}

export interface AvatarUpdateResult {
  user: UserDto;
  content_id: string;
}

export async function apiUploadAvatar(userId: string, file: File): Promise<AvatarUpdateResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('user_id', userId);
  return api.realFetchForm<AvatarUpdateResult>('/profile/avatar', form);
}

export async function apiUpdateNickname(userId: string, nickname: string): Promise<UserDto> {
  return api.realFetch<UserDto>('/profile/nickname', {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId, nickname }),
  });
}

export async function apiSaveProfileSetup(
  userId: string,
  nickname: string,
  riderType: RiderStyle | null,
): Promise<UserDto> {
  return api.realFetch<UserDto>('/profile', {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId, nickname, rider_type: riderType ? riderType.toUpperCase() : null }),
  });
}

export async function fetchRandomNickname(): Promise<string> {
  const res = await api.realFetch<{ nickname: string }>('/profile/random-nickname');
  return res.nickname;
}

export async function fetchUserProfile(userId: string, requesterId?: string): Promise<UserProfile> {
  const params = new URLSearchParams();
  if (requesterId) params.set('requester_id', requesterId);
  const qs = params.toString();
  const url = `/users/${userId}/profile${qs ? `?${qs}` : ''}`;

  if (USE_MOCK) {
    return {
      id: userId,
      nickname: 'MockUser',
      avatarUrl: '/saigon-default.jpg',
      level: 5,
      riderStyle: 'commuter',
      followerCount: 12,
      followingCount: 8,
      isFollowing: false,
    };
  }

  const res = await api.realFetch<{
    id: string;
    nickname: string | null;
    avatar_url: string | null;
    level: number;
    rider_style: string | null;
    follower_count: number;
    following_count: number;
    is_following: boolean;
  }>(url);

  return {
    id: res.id,
    nickname: res.nickname,
    avatarUrl: res.avatar_url,
    level: res.level,
    riderStyle: res.rider_style,
    followerCount: res.follower_count,
    followingCount: res.following_count,
    isFollowing: res.is_following,
  };
}

export async function fetchUserStats(userId: string): Promise<UserStats> {
  if (USE_MOCK) {
    return { month: '2026-05', total_km: 0, lifetime_km: 0, quest_count: 0, avg_safety_grade: null };
  }
  return api.realFetch<UserStats>(`/users/me/stats?user_id=${userId}`);
}

export async function fetchQuestHistory(userId: string, page = 1, size = 20): Promise<PageResponse<QuestHistoryItem>> {
  if (USE_MOCK) {
    return { items: [], total: 0, page: 1, size: 20 };
  }
  return api.realFetch<PageResponse<QuestHistoryItem>>(`/users/me/quest-history?user_id=${userId}&page=${page}&size=${size}`);
}

export async function fetchAllBadges(userId?: string): Promise<BadgeWithEarned[]> {
  if (USE_MOCK) return [];
  const qs = userId ? `?user_id=${userId}` : '';
  return api.realFetch<BadgeWithEarned[]>(`/badges${qs}`);
}
