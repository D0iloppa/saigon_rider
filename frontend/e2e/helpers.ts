import { execFileSync } from 'node:child_process';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * E2E 테스트 계정/데이터 생성·정리 헬퍼.
 *
 * 세션 주입 방식: frontend/src/lib/session.ts 의 saveSession()과 동일한 포맷으로
 * `sr_session` 쿠키를 직접 심는다. App.tsx 부팅 시 이 쿠키를 읽어 apiSessionVerify 를 호출해
 * store 를 채우므로, localStorage(zustand persist)를 건드릴 필요가 없다 — 앱이 스스로 부트스트랩한다.
 */

const BASE_URL = 'http://localhost:18090';

export interface DevSession {
  userId: string;
  sessionToken: string;
  phone: string;
}

/** dev-login 태그 접두사 — 정리 쿼리가 이 패턴만 지운다. */
const TAG_PREFIX = 'e2e';

export function uniqueTag(label: string): string {
  // users.phone 은 "__dev_" + phone 을 20자로 자른다 — 태그를 짧게 유지.
  const suffix = Date.now().toString(36).slice(-6);
  return `${TAG_PREFIX}${label}${suffix}`.slice(0, 14);
}

export async function devLogin(request: APIRequestContext, tag: string): Promise<DevSession> {
  const res = await request.post(`${BASE_URL}/api/bff/auth/dev-login`, {
    data: { phone: tag },
  });
  if (!res.ok()) throw new Error(`dev-login failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { userId: body.user.id, sessionToken: body.session_token, phone: tag };
}

export async function injectSession(page: Page, session: DevSession): Promise<void> {
  const payload = encodeURIComponent(JSON.stringify({ userId: session.userId, sessionToken: session.sessionToken }));
  await page.context().addCookies([
    { name: 'sr_session', value: payload, url: BASE_URL },
  ]);
}

function sessionHeaders(session: DevSession): Record<string, string> {
  return { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken };
}

/** OTP_DEV_BYPASS(dev 서버 한정) 경로로 판매자 휴대폰 인증을 완료한다 — DB를 직접 건드리지 않는다. */
export async function verifyPhoneBypass(request: APIRequestContext, session: DevSession): Promise<void> {
  const phone = Date.now().toString().slice(-9); // OTP bypass 하에서는 숫자 4자리 이상이면 통과
  const reqRes = await request.post(`${BASE_URL}/api/bff/auth/otp/request`, {
    headers: sessionHeaders(session),
    data: { phone },
  });
  if (!reqRes.ok()) throw new Error(`otp/request failed: ${reqRes.status()} ${await reqRes.text()}`);
  const { phone: normalizedPhone } = await reqRes.json();
  const verifyRes = await request.post(`${BASE_URL}/api/bff/auth/otp/verify`, {
    headers: sessionHeaders(session),
    data: { phone: normalizedPhone, code: '123456' },
  });
  if (!verifyRes.ok()) throw new Error(`otp/verify failed: ${verifyRes.status()} ${await verifyRes.text()}`);
}

/** ProfileSetup 화면과 동일한 API 호출로 동의를 기록한다(대상 화면이 UI 플로우 자체가 아닐 때 사용). */
export async function saveConsentViaApi(request: APIRequestContext, session: DevSession): Promise<void> {
  const res = await request.post(`${BASE_URL}/api/bff/profile/consent`, {
    headers: sessionHeaders(session),
    data: { user_id: session.userId, terms_version: '2026-06-01', privacy_version: '2026-06-01', age_confirmed: true },
  });
  if (!res.ok()) throw new Error(`profile/consent failed: ${res.status()} ${await res.text()}`);
}

// 1x1 투명 PNG — MarketEdit 저장 버튼은 이미지가 1장 이상 있어야 활성화되므로 최소한의 실제 이미지가 필요하다.
const MIN_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function uploadTestImage(request: APIRequestContext, session: DevSession): Promise<string> {
  const res = await request.post(`${BASE_URL}/api/bff/contents/upload`, {
    headers: sessionHeaders(session),
    multipart: {
      file: {
        name: 'e2e.png',
        mimeType: 'image/png',
        buffer: Buffer.from(MIN_PNG_BASE64, 'base64'),
      },
      owner_type: 'user',
    },
  });
  if (!res.ok()) throw new Error(`content upload failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return body.id;
}

export interface CreatedListing {
  id: string;
}

export async function createListing(
  request: APIRequestContext,
  session: DevSession,
  title: string,
  imageContentIds: string[] = [],
): Promise<CreatedListing> {
  const res = await request.post(`${BASE_URL}/api/bff/market/listings`, {
    headers: sessionHeaders(session),
    data: { seller_id: session.userId, title, price_vnd: 100000, image_content_ids: imageContentIds },
  });
  if (!res.ok()) throw new Error(`create listing failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { id: body.id };
}

/**
 * 테스트 계정 삭제 — users 행 CASCADE 로 매물·이미지·oauth identity·otp 까지 함께 정리된다
 * (marketplace_listings.seller_id, user_oauth_identities.user_id 모두 ON DELETE CASCADE).
 * dev DB 를 오염시키지 않기 위한 유일한 정리 지점.
 */
export function cleanupUser(userId: string): void {
  execFileSync('docker', [
    'exec', 'saigon_db', 'psql', '-U', 'wellconn', '-d', 'saigon_rider',
    '-c', `DELETE FROM users WHERE id = '${userId}';`,
  ]);
}
