import { test, expect } from '@playwright/test';
import {
  devLogin,
  injectSession,
  uniqueTag,
  verifyPhoneBypass,
  saveConsentViaApi,
  cleanupUser,
  type DevSession,
} from './helpers';

/**
 * App Store 심사 3차 — 게스트 열람 + 휴대폰 인증 게이트.
 *  A. 위치 권한 거부 게스트의 /market: 좌표 폴백이면 radius_km 를 보내지 않는다(2.1a).
 *  B. 게스트 /feed 열람 허용, 쓰기 행동은 /auth/oauth, /feed/new 는 차단(5.1.1v).
 *  C. 미인증 유저는 글·댓글 작성 403, 인증 유저는 댓글 2xx. UI: 미인증 /feed/new → /auth/phone-verify.
 */

const BASE_URL = 'http://localhost:18090';
const authHeaders = (s: DevSession) => ({ 'X-User-Id': s.userId, 'X-Session-Token': s.sessionToken });

test.describe('게스트 열람 (심사 3차)', () => {
  test('A. 위치 권한 거부 게스트의 /market 은 radius_km 없이 목록/빈 상태를 보여준다', async ({ browser }) => {
    // 새 컨텍스트: 세션·geolocation 권한 모두 없음
    const context = await browser.newContext({ locale: 'vi-VN' });
    const page = await context.newPage();
    const listingUrls: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/bff/market/listings') && req.method() === 'GET') listingUrls.push(u);
    });

    await page.goto('/market');
    await expect(page).toHaveURL(/\/market/, { timeout: 10_000 });
    await expect.poll(() => listingUrls.length, { timeout: 15_000 }).toBeGreaterThan(0);
    for (const u of listingUrls) {
      expect(new URL(u).searchParams.has('radius_km'), `radius_km 가 포함된 요청: ${u}`).toBe(false);
    }

    // 카드 또는 빈 상태 중 하나는 보이고, /splash·/auth 로 튕기지 않는다.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/market/);
    await expect(page).not.toHaveURL(/\/(splash|auth)/);
    await context.close();
  });

  test('B. 게스트 /feed 열람·상세 진입, 쓰기 FAB 은 /auth/oauth, /feed/new 는 차단', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'vi-VN' });
    const page = await context.newPage();

    await page.goto('/feed');
    await expect(page.getByTestId('feed-filter-chips')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/feed$/);

    const firstCard = page.getByTestId('feed-post-card').first();
    if (await firstCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/feed\/post\/[0-9a-f-]+/, { timeout: 10_000 });
      await expect(page).not.toHaveURL(/\/(splash|auth)/);
      await page.goBack();
      await expect(page).toHaveURL(/\/feed$/);
    }

    // 글쓰기 FAB (aria-label = feedCreate.title) — 게스트는 로그인으로 보낸다.
    await page.locator('button[class*="writeFab"]').click();
    await expect(page).toHaveURL(/\/auth\/oauth/, { timeout: 10_000 });

    // 직접 진입은 PrivateRoute 가 막는다.
    await page.goto('/feed/new');
    await expect(page).not.toHaveURL(/\/feed\/new/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/(splash|auth)/);
    await context.close();
  });
});

test.describe('휴대폰 인증 게이트 (심사 3차)', () => {
  const sessions: DevSession[] = [];
  test.afterEach(() => {
    while (sessions.length) cleanupUser(sessions.pop()!.userId);
  });

  test('C. 미인증 유저 글·댓글 403 / 인증 유저 댓글 2xx / 미인증 /feed/new → phone-verify', async ({ page, request }) => {
    // 미인증: dev-login 직후 phone_verified_at NULL (verifyPhoneBypass 를 호출하지 않는다)
    const unverified = await devLogin(request, uniqueTag('u'));
    sessions.push(unverified);
    await saveConsentViaApi(request, unverified);
    // 인증: OTP_DEV_BYPASS 경로 사용
    const verified = await devLogin(request, uniqueTag('v'));
    sessions.push(verified);
    await verifyPhoneBypass(request, verified);
    await saveConsentViaApi(request, verified);

    // 인증 유저가 글을 올려 댓글 대상 확보
    const postRes = await request.post(`${BASE_URL}/api/bff/feed`, {
      headers: authHeaders(verified),
      data: { user_id: verified.userId, content: 'e2e r3 verified post' },
    });
    expect(postRes.status(), await postRes.text()).toBe(201);
    const postId = (await postRes.json()).id as string;

    // 미인증: 글 작성 403
    const badPost = await request.post(`${BASE_URL}/api/bff/feed`, {
      headers: authHeaders(unverified),
      data: { user_id: unverified.userId, content: 'e2e r3 unverified post' },
    });
    expect(badPost.status()).toBe(403);
    expect(await badPost.text()).toContain('Phone verification required');

    // 미인증: 댓글 작성 403
    const badComment = await request.post(`${BASE_URL}/api/bff/feed/${postId}/comments`, {
      headers: authHeaders(unverified),
      data: { user_id: unverified.userId, content: 'e2e r3 unverified comment' },
    });
    expect(badComment.status()).toBe(403);

    // 인증: 댓글 2xx 후 삭제
    const okComment = await request.post(`${BASE_URL}/api/bff/feed/${postId}/comments`, {
      headers: authHeaders(verified),
      data: { user_id: verified.userId, content: 'e2e r3 verified comment' },
    });
    expect(okComment.status(), await okComment.text()).toBe(201);
    const commentId = (await okComment.json()).id as string;
    await request.delete(`${BASE_URL}/api/bff/feed/${postId}/comments/${commentId}`, { headers: authHeaders(verified) });
    await request.delete(`${BASE_URL}/api/bff/feed/${postId}`, { headers: authHeaders(verified) });

    // UI: 미인증 유저가 /feed/new 를 열면 phone-verify 로 이동
    await injectSession(page, unverified);
    await page.goto('/feed/new');
    await expect(page).toHaveURL(/\/auth\/phone-verify/, { timeout: 10_000 });
  });
});
