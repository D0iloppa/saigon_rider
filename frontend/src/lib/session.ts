/**
 * 인증 세션 관리 모듈
 *
 * OAuth 전환 후 세션 규약: {userId, sessionToken}
 * 이전 {phone, passcode} 쿠키는 검증 실패 → OAuthLogin으로 리다이렉트 (자연 만료)
 */

const COOKIE_KEY = 'sr_session';
const MAX_AGE = 60 * 60 * 24 * 180; // 180일

export interface Session {
  userId: string;
  sessionToken: string;
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
    const parsed = JSON.parse(decode(match.split('=').slice(1).join('=')));
    // 구형 {phone, passcode} 포맷은 무시 (OAuth 전환 후 자연 만료)
    if (!parsed.userId || !parsed.sessionToken) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  document.cookie = `${COOKIE_KEY}=; max-age=0; path=/`;
}
