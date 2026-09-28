import { test, expect } from '@playwright/test';
import {
  devLogin,
  injectSession,
  verifyPhoneBypass,
  saveConsentViaApi,
  cleanupUser,
  uniqueTag,
  type DevSession,
} from './helpers';

/**
 * F-DM-02(260928) — 방 안 거래 세트 바/칩/피커/상태시트 UI.
 * 구매자가 매물 A 로 방을 열고 [+ 물품추가]에서 B 를 체크해 담으면(A 는 컨텍스트 매물로 자동
 * 포함) 세트 바가 "외 1"·총액·묶음 요청 카드를 보여준다. 판매자가 상태 라벨을 탭해 [예약중]을
 * 고르면 바 라벨이 즉시 바뀐다.
 *
 * 이 스펙은 작성만 하고 실행하지 않는다(드라이버 지시) — 통합 실행은 감독이 merge 후 1회 수행.
 */

const BASE_URL = 'http://localhost:18090';

function sessionHeaders(session: DevSession): Record<string, string> {
  return { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken };
}

test('trade-set room UI: buyer builds a set via picker, seller reserves via status sheet', async ({ page, browser, request }) => {
  const seller = await devLogin(request, uniqueTag('sel'));
  const buyer = await devLogin(request, uniqueTag('byr'));
  for (const s of [seller, buyer]) {
    await verifyPhoneBypass(request, s);
    await saveConsentViaApi(request, s);
  }

  try {
    // 판매자가 협상 가능한 매물 A·B 등록 (is_negotiable=true — PATCH status 는 seller_id 필요하나
    // 신규 매물은 기본 ON_SALE 이라 별도 상태 변경은 하지 않는다)
    const makeListing = async (title: string) => {
      const res = await request.post(`${BASE_URL}/api/bff/market/listings`, {
        headers: sessionHeaders(seller),
        data: { seller_id: seller.userId, title, price_vnd: 100000, image_content_ids: [], is_negotiable: true },
      });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).id as string;
    };
    const titleA = `E2E세트A${uniqueTag('')}`;
    const titleB = `E2E세트B${uniqueTag('')}`;
    const listingA = await makeListing(titleA);
    const listingB = await makeListing(titleB);

    // 구매자가 매물 A 로 방을 연다
    const convRes = await request.post(`${BASE_URL}/api/bff/dm/conversations`, {
      headers: sessionHeaders(buyer),
      data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingA },
    });
    expect(convRes.ok()).toBeTruthy();
    const conversationId = (await convRes.json()).id as string;

    // 구매자 화면
    await injectSession(page, buyer);
    await page.addInitScript(() => {
      window.localStorage.setItem('sr-lang', 'ko');
    });
    await page.goto(`/dm/${conversationId}`);

    await page.getByRole('button', { name: '+ 물품추가' }).click();
    await page.getByText(titleB, { exact: false }).click();
    await page.getByRole('button', { name: '담기' }).click();

    // 세트 바 — 대표 매물(A) 외 1건, 묶음 요청 카드
    await expect(page.getByText('외 1', { exact: false })).toBeVisible();
    await expect(page.getByText('묶음 구매 요청', { exact: false })).toBeVisible();

    // 판매자 화면 — 같은 방에서 상태 라벨 탭 → [예약중]
    const sellerCtx = await browser.newContext({ baseURL: BASE_URL });
    const sellerPage = await sellerCtx.newPage();
    await injectSession(sellerPage, seller);
    await sellerPage.addInitScript(() => {
      window.localStorage.setItem('sr-lang', 'ko');
    });
    await sellerPage.goto(`/dm/${conversationId}`);

    await sellerPage.getByText('판매중', { exact: false }).first().click();
    await sellerPage.getByRole('button', { name: '예약중', exact: true }).click();
    await expect(sellerPage.getByText('예약중', { exact: false }).first()).toBeVisible();

    await sellerCtx.close();
  } finally {
    cleanupUser(buyer.userId);
    cleanupUser(seller.userId);
  }
});
