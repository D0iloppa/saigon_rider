import { test, expect } from '@playwright/test';
import { devLogin, injectSession, verifyPhoneBypass, saveConsentViaApi, cleanupUser, uniqueTag, type DevSession } from './helpers';

/**
 * 홈 — 커뮤니티 인기글이 0건이면 빈 상태 안내를 보여주고, 홈에는 매물 등록 FAB 가 없다.
 * 인기글 응답을 빈 목록으로 가로채 0건 상태를 재현한다.
 */

let session: DevSession;

test.beforeAll(async ({ request }) => {
  session = await devLogin(request, uniqueTag('home-empty'));
  await verifyPhoneBypass(request, session);
  await saveConsentViaApi(request, session);
});

test.afterAll(() => {
  if (session) cleanupUser(session.userId);
});

test('empty community hot section shows placeholder and home has no listing FAB', async ({ page }) => {
  await page.route(/\/api\/bff\/feed\?.*filter=hot/, (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, size: 4, has_more: false } }),
  );
  await injectSession(page, session);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByText('커뮤니티 인기글')).toBeVisible();
  await expect(page.getByText('아직 인기글이 없어요')).toBeVisible();
  await expect(page.getByText('커뮤니티에서 직접 둘러보세요')).toBeVisible();
  await expect(page.getByRole('button', { name: '매물 등록' })).toHaveCount(0);
});
