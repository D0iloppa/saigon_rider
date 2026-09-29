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
 * F-N-02 FR-7 — 약속은 거래(예약·결제)와 독립. 게이트 제거 / 예약과 무관한 약속 / 약속 없는 결제 /
 * 한 매물에 약속 2건 / 매물 없는 순수 약속을 API 로, 칩 행·+ 패널을 UI 로 1회 확인한다.
 *
 * 이 스펙은 작성만 하고 실행하지 않는다(드라이버 지시) — 통합 실행은 감독이 1회 수행.
 */

const API = 'http://localhost:18090/api/bff';

const H = (s: DevSession): Record<string, string> => ({ 'X-User-Id': s.userId, 'X-Session-Token': s.sessionToken });
const users: DevSession[] = [];

async function newUser(request: APIRequestContext, label: string): Promise<DevSession> {
  const s = await devLogin(request, uniqueTag(label));
  // nginx OTP 레이트리밋(auth_limit 10r/m, burst 5)에 걸리면 503 — 이 스펙은 사용자를 7명 만들므로 대기 후 재시도.
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
  const set = await json(await request.post(`${API}/dm/conversations/${conv.id}/trade-set/items`, {
    headers: H(buyer),
    data: { listing_ids: [listingId] },
  }));
  return { convId: conv.id as string, setId: set.id as string };
}

const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

/** 약속 제안 → appointment id. listingId 생략 = 서버가 방 컨텍스트 매물로 폴백(매물 없는 방이면 null). */
async function propose(request: APIRequestContext, by: DevSession, convId: string, days: number, listingId?: string) {
  const msg = await json(await request.post(`${API}/market/appointments`, {
    headers: H(by),
    data: {
      conversation_id: convId,
      when_at: inDays(days),
      place_name: 'e2e 장소',
      place_lat: 10.7769,
      place_lng: 106.7009,
      ...(listingId ? { listing_id: listingId } : {}),
    },
  }));
  return msg.appointment as { id: string; listing_id: string | null; status: string };
}

async function accept(request: APIRequestContext, by: DevSession, apptId: string) {
  return json(await request.patch(`${API}/market/appointments/${apptId}/accept`, { headers: H(by) }));
}

/** 약속 상태는 방 메시지의 appointment 임베드로 읽는다(단건 GET 엔드포인트 없음). */
async function apptStatus(request: APIRequestContext, by: DevSession, convId: string, apptId: string) {
  const body = await json(await request.get(`${API}/dm/conversations/${convId}/messages`, { headers: H(by) }));
  return (body.items as any[]).find((m) => m.appointment?.id === apptId)?.appointment?.status as string | undefined;
}

const getSet = async (request: APIRequestContext, by: DevSession, convId: string) =>
  json(await request.get(`${API}/dm/conversations/${convId}/trade-set`, { headers: H(by) }));

const setStatus = async (request: APIRequestContext, seller: DevSession, convId: string, status: string) =>
  json(await request.patch(`${API}/dm/conversations/${convId}/trade-set/status`, { headers: H(seller), data: { status } }));

const txPatch = (request: APIRequestContext, by: DevSession, setId: string, step: string) =>
  request.patch(`${API}/market/trade-sets/${setId}/transaction/${step}`, { headers: H(by) });

const listingStatus = async (request: APIRequestContext, by: DevSession, id: string) =>
  (await json(await request.get(`${API}/market/listings/${id}`, { headers: H(by) }))).status;

/** 결제 QR — 앱(registerMarketplacePaymentQr)과 같이 private 이미지로 올리고 세트에 등록한다. */
async function registerQr(request: APIRequestContext, seller: DevSession, convId: string, setId: string) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const content = await json(await request.post(`${API}/contents/upload`, {
    headers: H(seller),
    multipart: {
      file: { name: 'qr.png', mimeType: 'image/png', buffer: png },
      owner_type: 'user',
      owner_id: seller.userId,
      is_private: 'true',
    },
  }));
  await json(await request.post(`${API}/dm/conversations/${convId}/payment-qr`, {
    headers: H(seller),
    data: { trade_set_id: setId, image_content_id: content.id },
  }));
}

test.describe.configure({ mode: 'serial' });

test.describe('F-N-02 FR-7 appointment independence', () => {
  let seller: DevSession;
  let buyer: DevSession;
  let listing1: string;
  let room1: { convId: string; setId: string };

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('S1 게이트 제거: 판매자 선행 액션 없이 구매자가 약속 제안 → 판매자 수락', async ({ request }) => {
    seller = await newUser(request, 'sel');
    buyer = await newUser(request, 'byr');
    listing1 = await newListing(request, seller, `e2e약속독립${uniqueTag('')}`);
    room1 = await openListingRoom(request, buyer, seller, listing1);

    const appt = await propose(request, buyer, room1.convId, 2, listing1);
    expect(appt.status).toBe('PROPOSED');
    const accepted = await accept(request, seller, appt.id);
    expect(accepted.status).toBe('ACCEPTED');
  });

  test('S2 약속은 예약과 독립: RESERVED 중에도 제안·수락 가능, 취소해도 예약 유지', async ({ request }) => {
    const reserved = await setStatus(request, seller, room1.convId, 'RESERVED');
    expect(reserved.items.every((it: any) => it.status === 'RESERVED')).toBeTruthy();
    expect(await listingStatus(request, seller, listing1)).toBe('RESERVED');

    // 판매자가 새 약속 제안 → 구매자 수락(매물 RESERVED 상태)
    const appt = await propose(request, seller, room1.convId, 3, listing1);
    expect((await accept(request, buyer, appt.id)).status).toBe('ACCEPTED');

    const cancelled = await json(await request.patch(`${API}/market/appointments/${appt.id}/cancel`, { headers: H(buyer) }));
    expect(cancelled.status).toBe('CANCELLED');
    const set = await getSet(request, buyer, room1.convId);
    expect(set.items.find((it: any) => it.listing_id === listing1).status).toBe('RESERVED');
  });

  test('S3 약속 없는 결제: 예약 → 검수 → 송금 신고 → 입금 확인 → 거래완료', async ({ request }) => {
    const buyer2 = await newUser(request, 'by3');
    const listing = await newListing(request, seller, `e2e결제${uniqueTag('')}`, 250000);
    const { convId, setId } = await openListingRoom(request, buyer2, seller, listing);

    await setStatus(request, seller, convId, 'RESERVED'); // 약속 없음

    const tx = await json(await request.get(`${API}/market/trade-sets/${setId}/transaction`, { headers: H(buyer2) }));
    expect(tx.amount_vnd).toBe(250000);
    expect(tx.trade_set_id).toBe(setId);
    expect(tx.appointment_id).toBeNull();

    await registerQr(request, seller, convId, setId);

    // 검수 전 송금 신고 → 409 item_inspection_required
    const early = await txPatch(request, buyer2, setId, 'payment-reported');
    expect(early.status()).toBe(409);
    expect((await early.json()).detail?.code).toBe('item_inspection_required');

    await json(await txPatch(request, buyer2, setId, 'item-inspected'));
    const reported = await json(await txPatch(request, buyer2, setId, 'payment-reported'));
    expect(reported.payment_status).toBe('PAYMENT_REPORTED');

    const confirmed = await json(await txPatch(request, seller, setId, 'payment-confirmed'));
    expect(confirmed.payment_status).toBe('PAYMENT_CONFIRMED');

    const done = await setStatus(request, seller, convId, 'COMPLETED');
    expect(done.status).toBe('CLOSED');
    expect(await listingStatus(request, seller, listing)).toBe('SOLD');
  });

  test('S4 한 매물에 약속 2건: 둘 다 수락, 예약하면 다른 방 세트에서만 빠지고 약속은 유지', async ({ request }) => {
    const b1 = await newUser(request, 'b41');
    const b2 = await newUser(request, 'b42');
    const listing = await newListing(request, seller, `e2e이중${uniqueTag('')}`);
    const r1 = await openListingRoom(request, b1, seller, listing);
    const r2 = await openListingRoom(request, b2, seller, listing);

    const a1 = await propose(request, b1, r1.convId, 2, listing);
    const a2 = await propose(request, b2, r2.convId, 2, listing);
    expect((await accept(request, seller, a1.id)).status).toBe('ACCEPTED');
    expect((await accept(request, seller, a2.id)).status).toBe('ACCEPTED');

    await setStatus(request, seller, r1.convId, 'RESERVED');

    // B2 방 세트에서 L 이 활성 항목이 아니다(빠지거나 REMOVED) — 약속은 그대로 ACCEPTED
    const set2 = await getSet(request, b2, r2.convId);
    const item = set2.items.find((it: any) => it.listing_id === listing);
    expect(item === undefined || item.status === 'REMOVED').toBeTruthy();
    expect(await apptStatus(request, b2, r2.convId, a2.id)).toBe('ACCEPTED');
  });

  test('S5 순수 약속: 매물 없는 1:1 방 — listing_id null, 수락 OK, 완료는 400 not_a_trade', async ({ request }) => {
    const a = await newUser(request, 'pa');
    const b = await newUser(request, 'pb');
    const conv = await json(await request.post(`${API}/dm/conversations`, {
      headers: H(a),
      data: { other_user_id: b.userId },
    }));

    const appt = await propose(request, a, conv.id, 1); // listing_id 생략
    expect(appt.listing_id).toBeNull();
    expect((await accept(request, b, appt.id)).status).toBe('ACCEPTED');

    const complete = await request.patch(`${API}/market/appointments/${appt.id}/complete`, { headers: H(b) });
    expect(complete.status()).toBe(400);
    expect((await complete.json()).detail?.code).toBe('not_a_trade');
  });

  test('S6 UI: 매물 방 칩 행에 약속 칩(수락된 일시), 순수 방 + 패널에 약속잡기', async ({ page, request }) => {
    // S2 에서 마지막 약속을 취소했으므로 칩 행 확인용으로 ACCEPTED 약속을 하나 만든다.
    const appt = await propose(request, buyer, room1.convId, 4, listing1);
    await accept(request, seller, appt.id);

    await injectSession(page, buyer);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/dm/${room1.convId}`);
    // tradeSetChip "M.DD HH:mm" 일시 칩 (TradeSetChips formatApptChip)
    await expect(page.getByRole('button', { name: /^\d{1,2}\.\d{2} \d{2}:\d{2}$/ })).toBeVisible();

    const other = await newUser(request, 'pc');
    const conv = await json(await request.post(`${API}/dm/conversations`, {
      headers: H(buyer),
      data: { other_user_id: other.userId },
    }));
    await page.goto(`/dm/${conv.id}`);
    await page.getByRole('button', { name: '더보기' }).last().click(); // dm.more — 헤더 ⋮ 와 같은 이름이라 입력창 + 버튼(마지막)을 고른다
    await expect(page.getByText('약속잡기', { exact: true })).toBeVisible();
  });
});
