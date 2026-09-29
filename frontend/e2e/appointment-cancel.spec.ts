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
 * F-X-01 FR-1 판정(r8, 260929) — 약속 취소 카드(WITHDRAWN/DECLINED/CANCELLED), SUPERSEDED 는 카드 없음,
 * ACCEPTED 취소 + 예약중이면 판매자 revert_prompt, 순수 방은 revert_prompt 없음, UI 카드 1회 확인.
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

/** F-X-01 FR-1(r8): reason 은 선택 — 생략하면 body 없이 호출. */
async function cancel(request: APIRequestContext, by: DevSession, apptId: string, reason?: string) {
  return json(await request.patch(`${API}/market/appointments/${apptId}/cancel`, {
    headers: H(by),
    ...(reason ? { data: { reason } } : {}),
  }));
}

async function messages(request: APIRequestContext, by: DevSession, convId: string): Promise<any[]> {
  const body = await json(await request.get(`${API}/dm/conversations/${convId}/messages`, { headers: H(by) }));
  return body.items as any[];
}

const cancelCards = (items: any[]) =>
  items.filter((m) => m.message_type === 'card' && m.meta?.subtype === 'appointment_cancelled');
const revertPrompts = (items: any[]) => items.filter((m) => m.meta?.kind === 'revert_prompt');

const getSet = async (request: APIRequestContext, by: DevSession, convId: string) =>
  json(await request.get(`${API}/dm/conversations/${convId}/trade-set`, { headers: H(by) }));

const setStatus = async (request: APIRequestContext, seller: DevSession, convId: string, status: string) =>
  json(await request.patch(`${API}/dm/conversations/${convId}/trade-set/status`, { headers: H(seller), data: { status } }));

test.describe.configure({ mode: 'serial' });

test.describe('F-X-01 FR-1 r8 appointment cancel', () => {
  let seller: DevSession;
  let buyer: DevSession;
  let c4Room: { convId: string; setId: string };

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('C1 WITHDRAWN: 구매자가 제안 후 본인이 취소 → 카드 1건, actorId=구매자', async ({ request }) => {
    seller = await newUser(request, 'sel');
    buyer = await newUser(request, 'byr');
    const listing = await newListing(request, seller, `e2e취소철회${uniqueTag('')}`);
    const { convId } = await openListingRoom(request, buyer, seller, listing);

    const before = cancelCards(await messages(request, buyer, convId)).length;
    const appt = await propose(request, buyer, convId, 2, listing);
    const cancelled = await cancel(request, buyer, appt.id);
    expect(cancelled.status).toBe('CANCELLED');

    const cards = cancelCards(await messages(request, buyer, convId));
    expect(cards.length - before).toBe(1);
    const meta = cards[cards.length - 1].meta;
    expect(meta.kind).toBe('WITHDRAWN');
    expect(meta.actorId).toBe(buyer.userId);
    expect(meta.placeName).toBe('e2e 장소');
    expect(meta.whenAt).toBeTruthy();
  });

  test('C2 DECLINED: 판매자 제안을 구매자가 취소 → kind DECLINED', async ({ request }) => {
    const listing = await newListing(request, seller, `e2e취소거절${uniqueTag('')}`);
    const { convId } = await openListingRoom(request, buyer, seller, listing);

    // 같은 두 사람은 한 방을 재사용한다(C1 카드가 이미 있음) — 새로 생긴 카드만 센다.
    const before = cancelCards(await messages(request, buyer, convId)).length;
    const appt = await propose(request, seller, convId, 2, listing);
    await cancel(request, buyer, appt.id);

    const cards = cancelCards(await messages(request, buyer, convId));
    expect(cards.length - before).toBe(1);
    expect(cards[cards.length - 1].meta.kind).toBe('DECLINED');
    expect(cards[cards.length - 1].meta.actorId).toBe(buyer.userId);
  });

  test('C3 SUPERSEDED: 새 제안이 옛 PROPOSED 를 대체 → 카드 없음, cancel_reason SUPERSEDED', async ({ request }) => {
    const listing = await newListing(request, seller, `e2e취소대체${uniqueTag('')}`);
    const { convId } = await openListingRoom(request, buyer, seller, listing);

    const before = cancelCards(await messages(request, buyer, convId)).length; // 같은 방 재사용 — 상대 카운트
    const a1 = await propose(request, buyer, convId, 2, listing);
    const a2 = await propose(request, buyer, convId, 3, listing);
    expect(a2.id).not.toBe(a1.id);

    const items = await messages(request, buyer, convId);
    expect(cancelCards(items).length - before).toBe(0);
    const old = items.find((m) => m.appointment?.id === a1.id)?.appointment;
    expect(old.status).toBe('CANCELLED');
    expect(old.cancel_reason).toBe('SUPERSEDED');
  });

  test('C4 CANCELLED + revert_prompt: 예약중 방에서 ACCEPTED 취소 → 카드(사유) + 판매자 프롬프트, 예약 유지', async ({ request }) => {
    const listing = await newListing(request, seller, `e2e취소예약${uniqueTag('')}`);
    c4Room = await openListingRoom(request, buyer, seller, listing);
    await setStatus(request, seller, c4Room.convId, 'RESERVED');

    const prev = await messages(request, buyer, c4Room.convId); // 같은 방 재사용 — 상대 카운트
    const cardsBefore = cancelCards(prev).length;
    const promptsBefore = revertPrompts(await messages(request, seller, c4Room.convId)).length;
    const appt = await propose(request, buyer, c4Room.convId, 2, listing);
    expect((await accept(request, seller, appt.id)).status).toBe('ACCEPTED');
    await cancel(request, buyer, appt.id, 'SCHEDULE_CHANGED');

    const items = await messages(request, buyer, c4Room.convId);
    const cards = cancelCards(items);
    expect(cards.length - cardsBefore).toBe(1);
    expect(cards[cards.length - 1].meta.kind).toBe('CANCELLED');
    expect(cards[cards.length - 1].meta.reason).toBe('SCHEDULE_CHANGED');

    const prompts = revertPrompts(await messages(request, seller, c4Room.convId));
    expect(prompts.length - promptsBefore).toBe(1);
    expect(prompts[prompts.length - 1].message_type).toBe('text');
    expect(prompts[prompts.length - 1].sender_id).toBe(seller.userId);

    const set = await getSet(request, buyer, c4Room.convId);
    expect(set.items.find((it: any) => it.listing_id === listing).status).toBe('RESERVED');
  });

  test('C5 순수 방: ACCEPTED 취소 → 카드 CANCELLED, revert_prompt 없음', async ({ request }) => {
    const a = await newUser(request, 'pa');
    const b = await newUser(request, 'pb');
    const conv = await json(await request.post(`${API}/dm/conversations`, {
      headers: H(a),
      data: { other_user_id: b.userId },
    }));

    const appt = await propose(request, a, conv.id, 1);
    await accept(request, b, appt.id);
    await cancel(request, a, appt.id);

    const items = await messages(request, a, conv.id);
    const cards = cancelCards(items);
    expect(cards.length).toBe(1);
    expect(cards[0].meta.kind).toBe('CANCELLED');
    expect(revertPrompts(items).length).toBe(0);
  });

  test('C6 UI: 구매자 방에 취소 카드(헤더 + 본인 취소 제목)가 보인다', async ({ page }) => {
    await injectSession(page, buyer);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/dm/${c4Room.convId}`);
    // dm.apptCancelCardLabel / dm.apptCancelCancelledMine (ko)
    await expect(page.getByText('약속 취소', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('약속을 취소했어요')).toBeVisible();
  });
});
