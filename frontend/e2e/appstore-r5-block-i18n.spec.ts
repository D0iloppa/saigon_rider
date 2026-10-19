import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import en from '../src/locales/en/translation.json' with { type: 'json' };
import { devLogin, injectSession, saveConsentViaApi, cleanupUser, uniqueTag, type DevSession } from './helpers';

/**
 * App Store 5차 거절(Guideline 4, 2026-10-18) — 차단 UI 가 앱 언어(en)와 다른 한국어로 노출.
 * 영어 환경에서 프로필 차단 → 차단 사용자 관리 → 해제 흐름의 문구에 한글이 없어야 한다.
 */

const HANGUL = /[가-힣]/;
const users: DevSession[] = [];

test.afterAll(() => {
  for (const u of users) cleanupUser(u.userId);
});

function expectNoHangul(text: string, nickname: string) {
  expect(text.split(nickname).join(''), text).not.toMatch(HANGUL);
}

test('block flow is fully English when app language is en', async ({ page, request }) => {
  const me = await devLogin(request, uniqueTag('blk-me'));
  const target = await devLogin(request, uniqueTag('blk-tg'));
  users.push(me, target);
  await saveConsentViaApi(request, me);
  await saveConsentViaApi(request, target);
  const targetNick = execFileSync('docker', [
    'exec', 'saigon_db', 'psql', '-U', 'wellconn', '-d', 'saigon_rider', '-tAc',
    `SELECT nickname FROM users WHERE id = '${target.userId}';`,
  ]).toString().trim();

  await injectSession(page, me);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'en'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/profile/${target.userId}`);

  // 더보기 시트: [Report] [Block this user]
  await page.getByRole('button', { name: en.follow.report }).first().click();
  const blockItem = page.getByRole('button', { name: en.follow.block });
  await expect(blockItem).toBeVisible();

  // 차단 확인 다이얼로그
  await blockItem.click();
  const dialog = page.locator('[class*="dialog"]').filter({ has: page.getByRole('button', { name: en.market.blockConfirm, exact: true }) });
  await expect(dialog).toBeVisible();
  expectNoHangul(await dialog.innerText(), targetNick);
  await page.screenshot({ path: 'test-results/r5-block-confirm-en.png' });
  await dialog.getByRole('button', { name: en.market.blockConfirm, exact: true }).click();
  await expect(page.getByText(en.market.blockDone)).toBeVisible();

  // 차단 사용자 관리 → 해제 확인
  await page.goto('/settings/blocked');
  await page.getByRole('button', { name: en.market.unblock }).first().click();
  const unblockDialog = page.locator('[class*="dialog"]').filter({ hasText: en.market.unblockConfirmBody });
  await expect(unblockDialog).toBeVisible();
  expectNoHangul(await page.locator('body').innerText(), targetNick);
  await page.screenshot({ path: 'test-results/r5-unblock-confirm-en.png' });
  await unblockDialog.getByRole('button', { name: en.market.unblock }).click();
  await expect(page.getByText(en.market.unblockDone)).toBeVisible();
});
