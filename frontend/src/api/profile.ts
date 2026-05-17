import { api, USE_MOCK } from './client';
import type { UserDto } from './auth';
import type { LoginResult } from './auth';
import type { RiderStyle, UserProfile } from './types';

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
  riderType: RiderStyle,
): Promise<UserDto> {
  return api.realFetch<UserDto>('/profile', {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId, nickname, rider_type: riderType.toUpperCase() }),
  });
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
