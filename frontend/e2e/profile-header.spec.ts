import { test, expect, type Page } from '@playwright/test';
import { devLogin, injectSession, verifyPhoneBypass, saveConsentViaApi, cleanupUser, uniqueTag, type DevSession } from './helpers';

/**
 * F-P-02 헤더(대표 판정 260930) — 신뢰 티어 칩 없음, 휴대폰 인증은 닉네임 옆 아이콘,
 * 닉네임 줄을 누르면 공개 프로필(/profile/:내 id).
 */

const users: DevSession[] = [];

test.afterAll(() => {
  for (const u of users) cleanupUser(u.userId);
});

async function openProfile(page: Page, s: DevSession) {
  await injectSession(page, s);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile');
}

test('profile header: no trust chip, verified icon beside nickname, nickname row opens public profile', async ({ page, request }) => {
  const plain = await devLogin(request, uniqueTag('pf-plain'));
  users.push(plain);
  await saveConsentViaApi(request, plain);

  await openProfile(page, plain);
  const nickBtn = page.getByTestId('profile-view-public-btn');
  await expect(nickBtn).toBeVisible();
  await expect(page.getByTestId('profile-verified-badge')).toHaveCount(0);
  await expect(page.getByText('새 이웃')).toHaveCount(0);
  await expect(page.getByText('프로필 보기', { exact: true })).toHaveCount(0);

  const verified = await devLogin(request, uniqueTag('pf-verified'));
  users.push(verified);
  await verifyPhoneBypass(request, verified);
  await saveConsentViaApi(request, verified);

  await openProfile(page, verified);
  await expect(nickBtn.getByTestId('profile-verified-badge')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/profile-header-verified.png', clip: { x: 0, y: 0, width: 390, height: 420 } });

  await nickBtn.click();
  await expect(page).toHaveURL(new RegExp(`/profile/${verified.userId}$`));
});
