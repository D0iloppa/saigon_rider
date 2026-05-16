import { api, USE_MOCK } from './client';
import type { UserDto } from './auth';
import type { LoginResult } from './auth';
import type { RiderStyle } from './types';

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
