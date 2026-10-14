import { test, expect } from '@playwright/test';
import vi from '../src/locales/vi/translation.json' with { type: 'json' };
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 비로그인 진입 재설계 (대표 결정 2026-10-14, F-N-03 FR-1·FR-2).
 *  A. 스플래시 [둘러보기] → /browse(기본 상품 탭) → [커뮤니티] 탭 전환이 URL(?tab=community)에 남고,
 *     글 상세 왕복 후에도 탭이 유지되며, 글쓰기 FAB 은 /auth/oauth 로 보낸다.
 *  B. 상품 탭에서 매물 상세 왕복 후 탭 유지, 매물 등록 FAB 은 /auth/oauth.
 *  C. 스플래시 [로그인] → /auth/oauth.
 *  D. 로그인 사용자의 /browse 는 /home 으로.
 */

test.describe('게스트 둘러보기 (/browse)', () => {
  test('A. 스플래시 [둘러보기] → /browse → 커뮤니티 탭(URL 유지) → 상세 왕복 → FAB 은 로그인', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'vi-VN' });
    const page = await context.newPage();

    await page.goto('/splash');
    await page.getByRole('button', { name: vi.splash.startBtn }).click();
    await expect(page).toHaveURL(/\/browse(\?|$)/, { timeout: 15_000 });
    await expect(page.getByTestId('browse-seg-market')).toHaveAttribute('aria-selected', 'true');

    // 게스트 바(로그인 CTA)는 그대로 보인다 — 탭바는 없다.
    await expect(page.getByRole('button', { name: vi.guest.barCta })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);

    await page.getByTestId('browse-seg-community').click();
    await expect(page).toHaveURL(/\/browse\?tab=community$/);
    await expect(page.getByTestId('browse-seg-community')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('feed-filter-chips')).toBeVisible({ timeout: 10_000 });

    // 새로고침해도 탭 유지
    await page.reload();
    await expect(page.getByTestId('browse-seg-community')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });

    const firstCard = page.getByTestId('feed-post-card').first();
    if (await firstCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/feed\/post\/[0-9a-f-]+/, { timeout: 10_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/browse\?tab=community$/);
      await expect(page.getByTestId('browse-seg-community')).toHaveAttribute('aria-selected', 'true');
    }

    // 글쓰기 FAB (aria-label = feedCreate.title) — 게스트는 로그인으로.
    await page.locator('button[class*="writeFab"]').click();
    await expect(page).toHaveURL(/\/auth\/oauth/, { timeout: 10_000 });
    await context.close();
  });

  test('B. 상품 탭: 매물 상세 왕복 후 탭 유지, 등록 FAB 은 로그인', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'vi-VN' });
    const page = await context.newPage();

    await page.goto('/browse?tab=market');
    await expect(page.getByTestId('browse-seg-market')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });

    const firstListing = page.locator('div[class*="card"][role="button"]').first();
    if (await firstListing.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstListing.click();
      await expect(page).toHaveURL(/\/market\/[0-9a-f-]+/, { timeout: 10_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/browse\?tab=market$/);
      await expect(page.getByTestId('browse-seg-market')).toHaveAttribute('aria-selected', 'true');
    }

    await page.locator('button[class*="writeFab"]').click();
    await expect(page).toHaveURL(/\/auth\/oauth/, { timeout: 10_000 });
    await context.close();
  });

  test('C. 스플래시 [로그인] → /auth/oauth', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'vi-VN' });
    const page = await context.newPage();
    await page.goto('/splash');
    await page.getByRole('button', { name: vi.splash.loginBtn }).click();
    await expect(page).toHaveURL(/\/auth\/oauth/, { timeout: 15_000 });
    await context.close();
  });
});

test.describe('로그인 사용자의 /browse', () => {
  const sessions: DevSession[] = [];
  test.afterEach(() => {
    while (sessions.length) cleanupUser(sessions.pop()!.userId);
  });

  test('D. 로그인 상태로 /browse 진입 → /home', async ({ page, request }) => {
    const session = await devLogin(request, uniqueTag('b'));
    sessions.push(session);
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/browse?tab=community');
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });
  });
});
