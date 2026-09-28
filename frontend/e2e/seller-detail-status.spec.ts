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
 * F-S0-02 FR-1(r6)/FR-6 · F-S2-01 FR-1(r6) — 판매자 매물 상세 "판매중 ∨" 상태 필 → 예약자 선택,
 * 구매자 쪽 예약중(타인) 차단 UI. ai-docs/review/260928_trade-request-flow-design.md §3.2.
 *
 * 작성만 하고 실행하지 않는다(드라이버 지시) — 통합 실행은 감독이 merge 후 1회 수행.
 */

const BASE_URL = 'http://localhost:18090';

function sessionHeaders(session: DevSession): Record<string, string> {
  return { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken };
}

test('판매자: 상태 필 → 예약자 선택 / 구매자2: 예약중 차단 안내', async ({ page, request }) => {
  const seller = await devLogin(request, uniqueTag('sel'));
  const buyer = await devLogin(request, uniqueTag('buy'));
  const buyer2 = await devLogin(request, uniqueTag('by2'));
  for (const s of [seller, buyer, buyer2]) {
    await verifyPhoneBypass(request, s);
    await saveConsentViaApi(request, s);
  }

  try {
    const listingRes = await request.post(`${BASE_URL}/api/bff/market/listings`, {
      headers: sessionHeaders(seller),
      data: { seller_id: seller.userId, title: `E2E예약${uniqueTag('t')}`, price_vnd: 100000, image_content_ids: [], is_negotiable: true },
    });
    expect(listingRes.ok()).toBeTruthy();
    const listingId = (await listingRes.json()).id as string;

    // 구매자가 채팅방을 하나 연다 — FR-6 대화중인 채팅 목록의 후보가 된다.
    const convRes = await request.post(`${BASE_URL}/api/bff/dm/conversations`, {
      headers: sessionHeaders(buyer),
      data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingId },
    });
    expect(convRes.ok()).toBeTruthy();

    await injectSession(page, seller);
    await page.addInitScript(() => {
      window.localStorage.setItem('sr-lang', 'ko');
    });

    await page.goto(`/market/${listingId}`);
    await expect(page.getByRole('button', { name: /대화중인 채팅 1/ })).toBeVisible({ timeout: 10_000 });

    // 판매중 ∨ 상태 필 → 예약중 → 예약자 선택
    await page.getByRole('button', { name: /판매중/ }).click();
    await page.getByRole('button', { name: '예약중', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/market/${listingId}/reserve`));

    await expect(page.getByText(buyer.phone, { exact: false }).first().or(page.locator('input[type=radio]').first())).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type=radio]').first().check();
    await page.getByRole('button', { name: '예약자 선택', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/market/${listingId}$`), { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /예약중/ })).toBeVisible();

    // 구매자2 — 예약중(타인) 매물이라 채팅/가격제안이 막히고 opt-in 알림 안내가 뜬다
    await injectSession(page, buyer2);
    await page.addInitScript(() => {
      window.localStorage.setItem('sr-lang', 'ko');
    });
    await page.goto(`/market/${listingId}`);
    await expect(page.getByText('취소되면 알려드려요', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: '채팅하기', exact: true })).toHaveCount(0);
  } finally {
    cleanupUser(buyer2.userId);
    cleanupUser(buyer.userId);
    cleanupUser(seller.userId);
  }
});
