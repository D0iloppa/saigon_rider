import { api } from './client';

export interface UserDto {
  id: string;
  phone: string;
  nickname: string | null;
  rider_type: string | { code: string } | null;
  level: number;
  exp: number;
  xp: number;
  gold: number;
  skill_pt: number;
  avatar_url: string | null;
  created_at: string;
}

export interface RegisterResult {
  passcode: string;
  is_new: boolean;
  user: UserDto;
}

export interface LoginResult {
  user: UserDto;
}

export async function apiRegister(phone: string): Promise<RegisterResult> {
  return api.realFetch<RegisterResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function apiLogin(phone: string, passcode: string): Promise<LoginResult> {
  return api.realFetch<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, passcode }),
  });
}

export async function apiGetMe(phone: string): Promise<LoginResult> {
  return api.realFetch<LoginResult>(`/auth/me?phone=${encodeURIComponent(phone)}`);
}
