/**
 * 인증 API
 * - register: 신규 가입 (phone → passcode 발급)
 * - login: 기존 세션으로 자동 로그인 (phone + passcode)
 */

const BASE = '/api';

export interface UserDto {
  id: string;
  phone: string;
  nickname: string | null;
  rider_type: string | null;
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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiRegister(phone: string): Promise<RegisterResult> {
  return post('/auth/register', { phone });
}

export async function apiLogin(phone: string, passcode: string): Promise<LoginResult> {
  return post('/auth/login', { phone, passcode });
}
