/**
 * 딥링크/보호 라우트 진입 시 원래 목적지(returnTo)를 sessionStorage 에 보관하고
 * 로그인(프로필 설정 포함) 성공 후 1회 소비한다. (P0-2)
 *
 * 앱 내부 경로만 허용한다 — 외부 URL, 프로토콜 상대 경로(`//evil.com`), `javascript:` 같은
 * 스킴은 전부 "/" 로 시작하지 않으므로 자연히 거부된다(open redirect 방지).
 */

const KEY = 'return_to';

// 인증 흐름 자체로 되돌리면 무한 루프가 되므로 목적지로 허용하지 않는다.
const BLOCKED_PREFIXES = ['/splash', '/auth', '/link'];

/** path 가 안전한 앱 내부 경로인지 검증한다. */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  if (!path) return false;
  const normalized = path.replace(/\\/g, '/'); // 백슬래시로 "//evil.com" 우회 시도 차단
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return false;
  for (let i = 0; i < normalized.length; i++) {
    if (normalized.charCodeAt(i) < 0x20) return false; // 제어문자(개행 등) 차단
  }
  return !BLOCKED_PREFIXES.some(
    (p) => normalized === p || normalized.startsWith(`${p}/`) || normalized.startsWith(`${p}?`),
  );
}

export function saveReturnTo(path: string | null | undefined): void {
  if (!isSafeReturnPath(path)) return;
  sessionStorage.setItem(KEY, path);
}

/** 저장된 목적지를 1회 읽고 제거한다. */
export function consumeReturnTo(): string | null {
  const v = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return isSafeReturnPath(v) ? v : null;
}
