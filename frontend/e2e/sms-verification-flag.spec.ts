import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { devLogin, injectSession, saveConsentViaApi, cleanupUser, uniqueTag, createListing, type DevSession } from './helpers';

/**
 * 휴대폰 인증 선택화(SMS_VERIFICATION, 기본 false) — 인증 화면/API 숨김, 어떤 기능도 인증으로 게이트하지 않음,
 * 인증 사용자는 '인증받은 사용자' 배지만 표시(플래그 무관).
 */

const BASE_URL = 'http://localhost:18090';
const users: DevSession[] = [];

test.afterAll(() => {
  for (const u of users) cleanupUser(u.userId);
});

const headers = (s: DevSession) => ({ 'X-User-Id': s.userId, 'X-Session-Token': s.sessionToken });

async function open(page: Page, s: DevSession, path: string) {
  await injectSession(page, s);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
}

test('SMS_VERIFICATION=false: verification hidden, nothing gated, verified badge shown', async ({ page, request }) => {
  const cfg = await (await request.get(`${BASE_URL}/api/bff/app-config`)).json();
  expect(cfg.sms_verification).toBe(false);

  const plain = await devLogin(request, uniqueTag('sv-plain'));
  users.push(plain);
  await saveConsentViaApi(request, plain);

  // OTP API 404
  const otp = await request.post(`${BASE_URL}/api/bff/auth/otp/request`, { headers: headers(plain), data: { phone: '0901234567' } });
  expect(otp.status()).toBe(404);

  // 미인증 개인 매물 등록·피드 글·댓글 허용
  await createListing(request, plain, 'e2e sms-flag listing');
  const post = await request.post(`${BASE_URL}/api/bff/feed`, { headers: headers(plain), data: { user_id: plain.userId, content: 'e2e sms-flag post' } });
  expect(post.status()).toBe(201);
  const postId = (await post.json()).id;
  const comment = await request.post(`${BASE_URL}/api/bff/feed/${postId}/comments`, { headers: headers(plain), data: { user_id: plain.userId, content: 'e2e comment' } });
  expect(comment.status()).toBe(201);

  // 인증 화면 직접 진입 → /profile, 프로필에 인증 카드 없음
  await open(page, plain, '/auth/phone-verify');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId('profile-view-public-btn')).toBeVisible();
  await expect(page.getByText('휴대폰 인증 필요')).toHaveCount(0);

  // 매물 등록 화면에 인증 게이트 없음
  await page.goto('/market/new');
  await expect(page).toHaveURL(/\/market\/new$/);
  await expect(page.getByRole('textbox', { name: '제목' })).toBeVisible();
  await expect(page.getByText('휴대폰 인증')).toHaveCount(0);

  // 이미 인증된 사용자 → '인증받은 사용자' 배지 (플래그 false 에서도)
  const verified = await devLogin(request, uniqueTag('sv-verif'));
  users.push(verified);
  await saveConsentViaApi(request, verified);
  execFileSync('docker', ['exec', 'saigon_db', 'psql', '-U', 'wellconn', '-d', 'saigon_rider', '-c',
    `UPDATE users SET phone_verified_at = now() WHERE id = '${verified.userId}';`]);
  await page.goto(`/profile/${verified.userId}`);
  await expect(page.getByText('인증받은 사용자').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/sms-flag-verified-badge.png', clip: { x: 0, y: 0, width: 390, height: 500 } });
});
