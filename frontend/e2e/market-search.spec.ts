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
 * 마켓 검색 — 정적 계약 테스트는 "검색 API를 호출하는 코드가 있다"만 확인한다.
 * 키워드를 입력했을 때 실제로 결과가 화면에 렌더되는지는 브라우저가 있어야 확인 가능하다.
 */

test.describe('마켓 검색', () => {
  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('키워드를 입력하면 매물 카드가 실제로 렌더된다', async ({ page, request }) => {
    const tag = uniqueTag('s');
    session = await devLogin(request, tag);
    // 검색 대상 매물을 만들려면 판매자 휴대폰 인증 + 동의가 선행 조건 — UI 흐름 자체는
    // 이 테스트의 대상이 아니므로 API로 빠르게 충족한다(consent-gate.spec.ts 가 그 흐름을 검증).
    await verifyPhoneBypass(request, session);
    await saveConsentViaApi(request, session);

    const uniqueTitle = `E2E검색용매물${tag}`;
    await createListing(request, session, uniqueTitle);

    await injectSession(page, session);
    await page.goto('/market/search');

    await page.getByPlaceholder('Tìm món bạn cần').fill(uniqueTitle);
    await expect(page.getByText(uniqueTitle, { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
