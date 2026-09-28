import { test, expect } from '@playwright/test';
import {
  devLogin,
  injectSession,
  uniqueTag,
  verifyPhoneBypass,
  saveConsentViaApi,
  createListing,
  cleanupUser,
  type DevSession,
} from './helpers';

/**
 * 실기기 피드백 3차(260928): 판매중 매물만 있고 완료·진행중 거래가 없는 판매자 계정에서
 * "판매 이력"이 비어 보이던 문제 — ON_SALE 매물을 거래 이력(/trades, 프로필 판매 탭)에
 * [판매중] 배지로 함께 노출한다. 예약중(RESERVED)은 이 판정 대상이 아니다(기존 거래중 행이 담당).
 */
test.describe('판매 이력 — 판매중 매물 포함', () => {
  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('/trades 판매 필터와 프로필 판매 탭 모두 판매중 매물을 노출한다', async ({ page, request }) => {
    const tag = uniqueTag('o');
    session = await devLogin(request, tag);
    await verifyPhoneBypass(request, session);
    await saveConsentViaApi(request, session);

    const title = `E2E판매중${tag}`;
    const listing = await createListing(request, session, title);

    await injectSession(page, session);
    await page.addInitScript(() => {
      window.localStorage.setItem('sr-lang', 'ko');
    });

    await page.goto('/trades?role=sold');
    const row = page.getByText(title, { exact: false });
    await expect(row).toBeVisible();
    await expect(page.getByText('판매중', { exact: true }).first()).toBeVisible();

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/market/${listing.id}`));

    await page.goto('/profile');
    await page.getByRole('button', { name: '판매', exact: true }).click();
    await expect(page.getByText(title, { exact: false })).toBeVisible();
    await expect(page.getByText('판매중', { exact: true }).first()).toBeVisible();
  });
});
