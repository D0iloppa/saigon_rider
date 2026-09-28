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
 * F-S3-02(260928) — 방 하나에 매물이 여럿 얽혀도 가격제안은 매물 단위로 독립돼야 한다.
 * 회귀 시나리오: 매물 B 에 대한 제안이 매물 A 의 PROPOSED 제안을 지우면 안 되고,
 * 매물 A 에 이미 ACCEPTED 제안이 있으면 다른 제안의 수락은 409 로 막혀야 한다.
 */

const BASE_URL = 'http://localhost:18090';

function sessionHeaders(session: DevSession): Record<string, string> {
  return { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken };
}

test('price offers are scoped per listing in a multi-listing DM room', async ({ request }) => {
  const seller = await devLogin(request, uniqueTag('sel'));
  const buyer = await devLogin(request, uniqueTag('byr'));
  const buyer2 = await devLogin(request, uniqueTag('byr2'));
  for (const s of [seller, buyer, buyer2]) {
    await verifyPhoneBypass(request, s);
    await saveConsentViaApi(request, s);
  }

  try {
    // 판매자가 협상 가능한 매물 A, B 를 등록 (is_negotiable=true — createListing 헬퍼는 기본 false 라 직접 호출)
    const makeNegotiableListing = async (title: string) => {
      const res = await request.post(`${BASE_URL}/api/bff/market/listings`, {
        headers: sessionHeaders(seller),
        data: { seller_id: seller.userId, title, price_vnd: 200000, image_content_ids: [], is_negotiable: true },
      });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).id as string;
    };
    const listingA = await makeNegotiableListing('e2e-listing-A');
    const listingB = await makeNegotiableListing('e2e-listing-B');

    // 구매자가 매물 A 로 대화를 시작 → 같은 방에서 매물 B 도 문의 (다:다 연결, dm_conversation_listings)
    const createConvRes = await request.post(`${BASE_URL}/api/bff/dm/conversations`, {
      headers: sessionHeaders(buyer),
      data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingA },
    });
    expect(createConvRes.ok()).toBeTruthy();
    const conversationId = (await createConvRes.json()).id as string;

    const inquireB = await request.post(`${BASE_URL}/api/bff/dm/conversations`, {
      headers: sessionHeaders(buyer),
      data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingB },
    });
    expect(inquireB.ok()).toBeTruthy();
    expect((await inquireB.json()).id).toBe(conversationId); // 같은 참여자쌍 → 같은 방으로 병합

    // 매물 A 에 제안
    const offerAOnA = await request.post(`${BASE_URL}/api/bff/market/price-offers`, {
      headers: sessionHeaders(buyer),
      data: { conversation_id: conversationId, amount: 150000, listing_id: listingA },
    });
    expect(offerAOnA.ok()).toBeTruthy();
    const offerAId = (await offerAOnA.json()).price_offer.id as string;

    // 매물 B 에 제안 — 매물 A 의 제안을 supersede 하면 안 된다
    const offerOnB = await request.post(`${BASE_URL}/api/bff/market/price-offers`, {
      headers: sessionHeaders(buyer),
      data: { conversation_id: conversationId, amount: 180000, listing_id: listingB },
    });
    expect(offerOnB.ok()).toBeTruthy();

    const offerAAfter = await request.get(`${BASE_URL}/api/bff/dm/conversations/${conversationId}/messages`, {
      headers: sessionHeaders(buyer),
    });
    expect(offerAAfter.ok()).toBeTruthy();
    const messages = (await offerAAfter.json()).items as any[];
    const offerAMsg = messages.find((m) => m.price_offer?.id === offerAId);
    expect(offerAMsg?.price_offer?.status).toBe('PROPOSED');

    // 판매자가 매물 A 의 제안을 수락
    const acceptA = await request.patch(`${BASE_URL}/api/bff/market/price-offers/${offerAId}/accept`, {
      headers: sessionHeaders(seller),
    });
    expect(acceptA.ok()).toBeTruthy();

    // 다른 구매자가 (다른 방에서) 매물 A 에 제안 후 판매자가 수락 시도 → 이미 ACCEPTED 있어 409
    const conv2Res = await request.post(`${BASE_URL}/api/bff/dm/conversations`, {
      headers: sessionHeaders(buyer2),
      data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingA },
    });
    expect(conv2Res.ok()).toBeTruthy();
    const conv2Id = (await conv2Res.json()).id as string;
    const offerFromBuyer2 = await request.post(`${BASE_URL}/api/bff/market/price-offers`, {
      headers: sessionHeaders(buyer2),
      data: { conversation_id: conv2Id, amount: 190000, listing_id: listingA },
    });
    expect(offerFromBuyer2.ok()).toBeTruthy();
    const offer2Id = (await offerFromBuyer2.json()).price_offer.id as string;
    const acceptOffer2 = await request.patch(`${BASE_URL}/api/bff/market/price-offers/${offer2Id}/accept`, {
      headers: sessionHeaders(seller),
    });
    expect(acceptOffer2.status()).toBe(409);
  } finally {
    cleanupUser(buyer2.userId);
    cleanupUser(buyer.userId);
    cleanupUser(seller.userId);
  }
});
