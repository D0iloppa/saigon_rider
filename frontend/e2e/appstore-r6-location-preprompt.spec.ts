import { test, expect } from '@playwright/test';
import en from '../src/locales/en/translation.json' with { type: 'json' };
import { devLogin, injectSession, saveConsentViaApi, cleanupUser, uniqueTag, type DevSession } from './helpers';

/**
 * App Store 6차 거절(Guideline 5.1.1(iv), 2026-10-20) — 위치 프리프롬프트에 "Allow location"/"Later".
 * 프리프롬프트는 중립 버튼 하나("Continue")만 있고, 백드롭·ESC 로 닫혀 요청이 미뤄지면 안 된다.
 */

const users: DevSession[] = [];
test.afterAll(() => {
  for (const u of users) cleanupUser(u.userId);
});

test('location pre-prompt has a single Continue button and cannot be dismissed', async ({ page, request }) => {
  const me = await devLogin(request, uniqueTag('loc-pp'));
  users.push(me);
  await saveConsentViaApi(request, me);

  await injectSession(page, me);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'en'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const dialog = page.locator('[class*="dialog"]').filter({ hasText: en.map.permissionRationale });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByRole('button')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: en.map.permissionContinue, exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/r6-location-preprompt-en.png' });

  // 백드롭 탭·ESC 로는 닫히지 않는다
  await page.mouse.click(10, 10);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: en.map.permissionContinue, exact: true }).click();
  await expect(dialog).toBeHidden();
});
