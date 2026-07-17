import { api } from './client';

export interface UserDto {
  id: string;
  phone: string | null;
  phone_verified?: boolean;
  nickname: string | null;
  rider_type: string | { code: string } | null;
  level: number;
  exp: number;
  xp: number;
  gold: number;
  skill_pt: number;
  skills?: { distance_rider: number; gold_hunter: number; quest_slot: number; cost_discount: number; mileage_rate: number };
  avatar_url: string | null;
  manner_temp?: number;
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

export async function apiGetMeById(userId: string): Promise<LoginResult> {
  return api.realFetch<LoginResult>(`/auth/me/by-id?user_id=${encodeURIComponent(userId)}`);
}

export interface OAuthLoginResult {
  user: UserDto;
  session_token: string;
  is_new: boolean;
}

export async function apiOAuthLogin(provider: string, token: string, tokenType: string = 'id_token'): Promise<OAuthLoginResult> {
  return api.realFetch<OAuthLoginResult>('/auth/oauth/login', {
    method: 'POST',
    body: JSON.stringify({ provider, token, token_type: tokenType }),
  });
}

export async function apiSessionVerify(userId: string, sessionToken: string): Promise<LoginResult> {
  return api.realFetch<LoginResult>('/auth/session/verify', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, session_token: sessionToken }),
  });
}

export async function apiDevLogin(): Promise<OAuthLoginResult> {
  return api.realFetch<OAuthLoginResult>('/auth/dev-login', { method: 'POST' });
}

// SGR-209 A3: 스킬 투자 (SP 1 차감 → 레벨 +1). 갱신된 유저 반환.
export async function apiInvestSkill(userId: string, key: string): Promise<UserDto> {
  return api.realFetch<UserDto>(
    `/users/me/skills/${key}/invest?user_id=${encodeURIComponent(userId)}`,
    { method: 'POST' },
  );
}

export interface OtpRequestResult {
  phone: string;
  expires_in_sec: number;
  resend_cooldown_sec: number;
}

export async function apiRequestOtp(phone: string): Promise<OtpRequestResult> {
  return api.realFetch<OtpRequestResult>('/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  }, 'bff', { rethrow: true });
}

export interface OtpVerifyResult {
  phone: string;
  phone_verified: boolean;
}

export async function apiVerifyOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  return api.realFetch<OtpVerifyResult>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  }, 'bff', { rethrow: true, keepSessionOn401: true });
}

export async function apiDeleteAccount(userId: string): Promise<void> {
  await api.realFetch(`/users/me?user_id=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function apiExportMyData(userId: string): Promise<Record<string, unknown>> {
  return api.realFetch<Record<string, unknown>>(
    `/users/me/export?user_id=${encodeURIComponent(userId)}`,
  );
}
