/**
 * 인증 세션 관리 모듈
 *
 * 현재 구현: 쿠키 기반 (phone + passcode 쌍 저장)
 * 보안 개선 시 이 파일 내부만 교체하면 됨 (JWT, HttpOnly cookie 등)
 */

const COOKIE_KEY = 'sr_session';
const MAX_AGE = 60 * 60 * 24 * 180; // 180일

export interface Session {
  phone: string;
  passcode: string;
  userId: string;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function decode(value: string): string {
  return decodeURIComponent(value);
}

export function saveSession(session: Session): void {
  const payload = encode(JSON.stringify(session));
  document.cookie = `${COOKIE_KEY}=${payload}; max-age=${MAX_AGE}; path=/; SameSite=Lax`;
}

export function loadSession(): Session | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${COOKIE_KEY}=`));
  if (!match) return null;
  try {
    return JSON.parse(decode(match.split('=').slice(1).join('=')));
  } catch {
    return null;
  }
}

export function clearSession(): void {
  document.cookie = `${COOKIE_KEY}=; max-age=0; path=/`;
}
