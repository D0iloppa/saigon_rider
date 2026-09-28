import { test, expect } from '@playwright/test';
import {
  devLogin,
  verifyPhoneBypass,
  saveConsentViaApi,
  cleanupUser,
  uniqueTag,
  type DevSession,
} from './helpers';

/**
 * 260928_trade-request-flow-design.md — 거래 세트(trade_sets/trade_set_items) MVP 코어.
 * 판매자가 매물 A·B 를 올리고, 구매자1이 A 로 대화하며 B 를 담아 세트를 만들고, 판매자가 방 안
 * 상태 시트로 예약중을 선언하면 다른 구매자(버퍼2)의 세트에서 A 가 빠지고 d1 보호(LISTING_RESERVED
 * 409, opt-in 구독)가 걸린다. 마지막으로 매물 상세 경로(/market/listings/{id}/complete)로
 * 구매자1과의 거래를 완료하면 SOLD + /market/trades 에 COMPLETED 로 뜬다.
 *
 * 이 스펙은 작성만 하고 실행하지 않는다(드라이버 지시) — 통합 실행은 감독이 merge 후 1회 수행.
 */

const BASE_URL = 'http://localhost:18090';

function sessionHeaders(session: DevSession): Record<string, string> {
  return { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken };
}

test('trade-set core flow: bundle add, seller reserve, d1 guard, listing-detail complete', async ({ request }) => {
  const seller = await devLogin(request, uniqueTag('sel'));
  const buyer1 = await devLogin(request, uniqueTag('by1'));
  const buyer2 = await devLogin(request, uniqueTag('by2'));
  for (const s of [seller, buyer1, buyer2]) {
    await verifyPhoneBypass(request, s);
    await saveConsentViaApi(request, s);
  }

  try {
    const makeListing = async (title: string) => {
      const res = await request.post(`${BASE_URL}/api/bff/market/listings`, {
        headers: sessionHeaders(seller),
        data: { seller_id: seller.userId, title, price_vnd: 100000, image_content_ids: [], is_negotiable: true },
      });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).id as string;
    };
    const listingA = await makeListing('e2e-set-A');
    const listingB = await makeListing('e2e-set-B');

    // 구매자1이 매물 A 로 대화 시작
    const conv1Res = await request.post(`${BASE_URL}/api/bff/dm/conversations`, {
      headers: sessionHeaders(buyer1),
      data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingA },
    });
    expect(conv1Res.ok()).toBeTruthy();
    const conv1Id = (await conv1Res.json()).id as string;

    // 구매자1이 A+B 를 세트에 담는다 → INQUIRY 2건 + 묶음 요청 카드
    const addItems = await request.post(`${BASE_URL}/api/bff/dm/conversations/${conv1Id}/trade-set/items`, {
      headers: sessionHeaders(buyer1),
      data: { listing_ids: [listingA, listingB] },
    });
    expect(addItems.ok()).toBeTruthy();
    const set1 = await addItems.json();
    expect(set1.items).toHaveLength(2);
    expect(set1.items.every((it: any) => it.status === 'INQUIRY')).toBeTruthy();

    const messages1 = await request.get(`${BASE_URL}/api/bff/dm/conversations/${conv1Id}/messages`, {
      headers: sessionHeaders(buyer1),
    });
    expect(messages1.ok()).toBeTruthy();
    const items1 = (await messages1.json()).items as any[];
    expect(items1.some((m) => m.message_type === 'card' && m.meta?.subtype === 'bundle')).toBeTruthy();

    // 구매자2도 매물 A 로 대화 시작 (아직 예약 전이라 허용)
    const conv2Res = await request.post(`${BASE_URL}/api/bff/dm/conversations`, {
      headers: sessionHeaders(buyer2),
      data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingA },
    });
    expect(conv2Res.ok()).toBeTruthy();
    const conv2Id = (await conv2Res.json()).id as string;
    const addItemBuyer2 = await request.post(`${BASE_URL}/api/bff/dm/conversations/${conv2Id}/trade-set/items`, {
      headers: sessionHeaders(buyer2),
      data: { listing_ids: [listingA] },
    });
    expect(addItemBuyer2.ok()).toBeTruthy();

    // 판매자가 구매자1의 방에서 세트 상태를 예약중으로 변경 → A, B 예약중
    const reserveRes = await request.patch(`${BASE_URL}/api/bff/dm/conversations/${conv1Id}/trade-set/status`, {
      headers: sessionHeaders(seller),
      data: { status: 'RESERVED' },
    });
    expect(reserveRes.ok()).toBeTruthy();
    const reservedSet = await reserveRes.json();
    expect(reservedSet.items.every((it: any) => it.status === 'RESERVED')).toBeTruthy();

    const listingAAfter = await request.get(`${BASE_URL}/api/bff/market/listings/${listingA}`, {
      headers: sessionHeaders(seller),
    });
    expect((await listingAAfter.json()).status).toBe('RESERVED');

    // 구매자2 세트에서는 A 가 밀려났어야 한다
    const set2After = await request.get(`${BASE_URL}/api/bff/dm/conversations/${conv2Id}/trade-set`, {
      headers: sessionHeaders(buyer2),
    });
    expect(set2After.ok()).toBeTruthy();
    const set2AfterBody = await set2After.json();
    expect(set2AfterBody.items.find((it: any) => it.listing_id === listingA)).toBeUndefined();

    // 구매자2가 매물 A 에 가격 제안 시도 → d1: 409 LISTING_RESERVED
    const offerAttempt = await request.post(`${BASE_URL}/api/bff/market/price-offers`, {
      headers: sessionHeaders(buyer2),
      data: { conversation_id: conv2Id, amount: 90000, listing_id: listingA },
    });
    expect(offerAttempt.status()).toBe(409);
    const offerAttemptBody = await offerAttempt.json();
    expect(offerAttemptBody.detail?.code).toBe('LISTING_RESERVED');

    // 구매자2가 "취소되면 알림 받기" 구독
    const subscribeRes = await request.post(`${BASE_URL}/api/bff/market/listings/${listingA}/notify-when-available`, {
      headers: sessionHeaders(buyer2),
    });
    expect(subscribeRes.ok()).toBeTruthy();

    // 판매자가 다시 판매중으로 되돌린다 → 구독자에게 알림 이벤트가 발행된다(노티워커 소비는 별도)
    const onSaleRes = await request.patch(`${BASE_URL}/api/bff/dm/conversations/${conv1Id}/trade-set/status`, {
      headers: sessionHeaders(seller),
      data: { status: 'ON_SALE' },
    });
    expect(onSaleRes.ok()).toBeTruthy();
    const listingAOnSale = await request.get(`${BASE_URL}/api/bff/market/listings/${listingA}`, {
      headers: sessionHeaders(seller),
    });
    expect((await listingAOnSale.json()).status).toBe('ON_SALE');

    // 매물 상세 수동 PATCH 로 예약중 시도 → 상대 미지정이라 409
    const manualReserve = await request.patch(`${BASE_URL}/api/bff/market/listings/${listingA}/status`, {
      headers: sessionHeaders(seller),
      data: { seller_id: seller.userId, status: 'RESERVED' },
    });
    expect(manualReserve.status()).toBe(409);

    // 매물 상세 경로로 구매자1과의 거래를 완료 (/market/listings/{id}/complete)
    const completeRes = await request.post(`${BASE_URL}/api/bff/market/listings/${listingA}/complete`, {
      headers: sessionHeaders(seller),
      data: { conversation_id: conv1Id },
    });
    expect(completeRes.ok()).toBeTruthy();
    const listingASold = await request.get(`${BASE_URL}/api/bff/market/listings/${listingA}`, {
      headers: sessionHeaders(seller),
    });
    expect((await listingASold.json()).status).toBe('SOLD');

    // 구매자1의 /market/trades 에 A 가 COMPLETED 로 노출
    const trades = await request.get(`${BASE_URL}/api/bff/market/trades?user_id=${buyer1.userId}`, {
      headers: sessionHeaders(buyer1),
    });
    expect(trades.ok()).toBeTruthy();
    const tradeRows = (await trades.json()) as any[];
    const tradeA = tradeRows.find((r) => r.listing_id === listingA);
    expect(tradeA?.stage).toBe('COMPLETED');
  } finally {
    cleanupUser(buyer2.userId);
    cleanupUser(buyer1.userId);
    cleanupUser(seller.userId);
  }
});
