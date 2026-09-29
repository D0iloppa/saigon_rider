import { test, expect, type APIRequestContext } from '@playwright/test';
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
 * F-P-01 FR-1 판정(r11, 260929) — 프로필 신뢰 카드 안 "받은 후기" + /profile/:userId/reviews 전체 목록.
 *  - 카드(review_summary.recent): 별점 3 이상 + 본문 있는 후기만 최대 2건, 닉네임 마스킹 없음.
 *  - 전체 목록(GET /users/{id}/reviews): 낮은 별점 포함 모든 후기.
 * 후기 중복 방지가 (작성자→대상) 단위라 구매자 2명으로 같은 판매자에게 후기 2건(★5, ★1)을 남긴다.
 *
 * 이 스펙은 작성만 하고 실행하지 않는다(드라이버 지시) — 통합 실행은 감독이 1회 수행.
 */

const API = 'http://localhost:18090/api/bff';

const H = (s: DevSession): Record<string, string> => ({ 'X-User-Id': s.userId, 'X-Session-Token': s.sessionToken });
const users: DevSession[] = [];

async function newUser(request: APIRequestContext, label: string): Promise<DevSession> {
  const s = await devLogin(request, uniqueTag(label));
  // nginx OTP 레이트리밋(auth_limit 10r/m, burst 5)에 걸리면 503 — 대기 후 재시도.
  for (let attempt = 0; ; attempt++) {
    try {
      await verifyPhoneBypass(request, s);
      break;
    } catch (e) {
      if (attempt >= 6 || !String(e).includes('503')) throw e;
      await new Promise((r) => setTimeout(r, 7000));
    }
  }
  await saveConsentViaApi(request, s);
  users.push(s);
  return s;
}

async function json(res: Awaited<ReturnType<APIRequestContext['get']>>, expected: number[] = [200, 201]) {
  expect(expected, `${res.url()} → ${res.status()} ${await res.text()}`).toContain(res.status());
  return res.json();
}

async function newListing(request: APIRequestContext, seller: DevSession, title: string, price = 100000): Promise<string> {
  const body = await json(await request.post(`${API}/market/listings`, {
    headers: H(seller),
    data: { seller_id: seller.userId, title, price_vnd: price, image_content_ids: [], is_negotiable: true },
  }));
  return body.id;
}

/** 구매자가 매물로 방을 열고 그 매물을 세트에 담는다(세트는 담을 때 생긴다). */
async function openListingRoom(request: APIRequestContext, buyer: DevSession, seller: DevSession, listingId: string) {
  const conv = await json(await request.post(`${API}/dm/conversations`, {
    headers: H(buyer),
    data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingId },
  }));
  await json(await request.post(`${API}/dm/conversations/${conv.id}/trade-set/items`, {
    headers: H(buyer),
    data: { listing_ids: [listingId] },
  }));
  return conv.id as string;
}

const setStatus = async (request: APIRequestContext, seller: DevSession, convId: string, status: string) =>
  json(await request.patch(`${API}/dm/conversations/${convId}/trade-set/status`, { headers: H(seller), data: { status } }));

/** 방 열기 → 담기 → 예약 → 거래완료(결제 단계 없이 세트 상태 전이만으로 COMPLETED — appointment-independence S3 의 마지막 단계와 동일). */
async function completeTrade(request: APIRequestContext, buyer: DevSession, seller: DevSession, listingId: string) {
  const convId = await openListingRoom(request, buyer, seller, listingId);
  await setStatus(request, seller, convId, 'RESERVED');
  await setStatus(request, seller, convId, 'COMPLETED');
}

async function review(
  request: APIRequestContext,
  reviewer: DevSession,
  target: DevSession,
  listingId: string,
  rating: number,
  comment: string,
  tags: string[] = [],
) {
  return json(await request.post(`${API}/market/reviews`, {
    headers: H(reviewer),
    data: {
      reviewer_id: reviewer.userId,
      target_id: target.userId,
      listing_id: listingId,
      rating,
      manner_tags: tags,
      comment,
    },
  }));
}

const GOOD = 'e2e 최고의 판매자';
const BAD = 'e2e 별로였어요';

test.describe.configure({ mode: 'serial' });

test.describe('F-P-01 FR-1 r11 profile received reviews', () => {
  let seller: DevSession;
  let b1: DevSession;
  let b2: DevSession;
  let b1Nickname = '';

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('R1 API: review_summary(count 2, avg 3.0, recent 는 ★5 만) + 전체 목록은 ★5·★1 모두', async ({ request }) => {
    seller = await newUser(request, 'rsl');
    b1 = await newUser(request, 'rb1');
    b2 = await newUser(request, 'rb2');
    const l1 = await newListing(request, seller, `e2e후기A${uniqueTag('')}`);
    const l2 = await newListing(request, seller, `e2e후기B${uniqueTag('')}`);

    await completeTrade(request, b1, seller, l1);
    await completeTrade(request, b2, seller, l2);

    await review(request, b1, seller, l1, 5, GOOD, ['PUNCTUAL']);
    await review(request, b2, seller, l2, 1, BAD);

    // 판매자 프로필을 B1 이 조회 — 후기 요약
    const profile = await json(await request.get(`${API}/users/${seller.userId}/profile`, { headers: H(b1) }));
    const summary = profile.review_summary;
    expect(summary.count).toBe(2);
    expect(summary.avg_rating).toBe(3.0);
    expect(summary.recent).toHaveLength(1); // ★1 은 카드 요약에서 제외(별점 ≥3 + 본문 조건)
    expect(summary.recent[0].rating).toBe(5);
    expect(summary.recent[0].text).toBe(GOOD);
    expect(summary.recent[0].reviewer_role).toBe('BUYER');
    b1Nickname = summary.recent[0].reviewer.nickname;
    expect(b1Nickname).toBeTruthy();
    expect(b1Nickname).not.toContain('*'); // 닉네임 마스킹 없음

    // B1 본인 프로필의 닉네임과 일치
    const b1Profile = await json(await request.get(`${API}/users/${b1.userId}/profile`, { headers: H(seller) }));
    expect(b1Nickname).toBe(b1Profile.nickname);

    // 전체 목록 — 모든 별점
    const list = await json(await request.get(`${API}/users/${seller.userId}/reviews?page=1&size=20`, { headers: H(b1) }));
    expect(list.total).toBe(2);
    expect((list.items as any[]).map((i) => i.rating).sort()).toEqual([1, 5]);
  });

  test('R2 UI 프로필 카드: "받은 후기 2" + ★5 본문만 노출, ★1 본문 미노출, 작성자 닉네임 전체 표시', async ({ page }) => {
    await injectSession(page, b1);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/profile/${seller.userId}`);

    await expect(page.getByRole('heading', { name: '받은 후기 2' })).toBeVisible();
    await expect(page.getByText(GOOD)).toBeVisible();
    await expect(page.getByText(BAD)).toHaveCount(0);
    await expect(page.getByText(b1Nickname).first()).toBeVisible();
  });

  test('R3 UI 전체보기: /profile/{id}/reviews 에서 ★5·★1 본문 모두 노출', async ({ page }) => {
    await injectSession(page, b1);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/profile/${seller.userId}`);

    await page.getByRole('button', { name: /전체보기/ }).click(); // userProfile.seeAll
    await expect(page).toHaveURL(new RegExp(`/profile/${seller.userId}/reviews`));
    await expect(page.getByText(GOOD)).toBeVisible();
    await expect(page.getByText(BAD)).toBeVisible();
  });
});
