import { api } from './client';
import type { UserDto } from './auth';

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
