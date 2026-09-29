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
 * F-DM-02 FR-8 r9(260929) — 약속 고정 바 · 약속 시트.
 *  - accept 시 appointment_accepted 카드 1건, GET 대화 상세 active_appointment(PROPOSED/ACCEPTED, 취소 후 null)
 *  - 약속 카드가 첫 로드 페이지 밖이어도 고정 바 → 시트 → 수락이 동작(active_appointment 덕분)
 *  - 세트 없는 매물 방에서도 고정 바 노출
 *
 * 이 스펙은 작성만 하고 실행하지 않는다 — 통합 실행은 감독이 1회 수행.
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

async function pureRoom(request: APIRequestContext, a: DevSession, b: DevSession): Promise<string> {
  const conv = await json(await request.post(`${API}/dm/conversations`, {
    headers: H(a),
    data: { other_user_id: b.userId },
  }));
  return conv.id as string;
}

async function newListing(request: APIRequestContext, seller: DevSession, title: string, price = 100000): Promise<string> {
  const body = await json(await request.post(`${API}/market/listings`, {
    headers: H(seller),
    data: { seller_id: seller.userId, title, price_vnd: price, image_content_ids: [], is_negotiable: true },
  }));
  return body.id;
}

/** 매물 방만 연다 — 세트 담기(trade-set/items)는 하지 않는다(세트 칩 행이 없는 방). */
async function openListingRoomOnly(request: APIRequestContext, buyer: DevSession, seller: DevSession, listingId: string) {
  const conv = await json(await request.post(`${API}/dm/conversations`, {
    headers: H(buyer),
    data: { other_user_id: seller.userId, context_type: 'listing', context_id: listingId },
  }));
  return conv.id as string;
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

async function cancel(request: APIRequestContext, by: DevSession, apptId: string) {
  return json(await request.patch(`${API}/market/appointments/${apptId}/cancel`, { headers: H(by) }));
}

async function messages(request: APIRequestContext, by: DevSession, convId: string): Promise<any[]> {
  const body = await json(await request.get(`${API}/dm/conversations/${convId}/messages`, { headers: H(by) }));
  return body.items as any[];
}

async function activeAppointment(request: APIRequestContext, by: DevSession, convId: string) {
  const conv = await json(await request.get(`${API}/dm/conversations/${convId}`, { headers: H(by) }));
  return conv.active_appointment as { id: string; status: string } | null;
}

const acceptedCards = (items: any[]) =>
  items.filter((m) => m.message_type === 'card' && m.meta?.subtype === 'appointment_accepted');

test.describe.configure({ mode: 'serial' });

test.describe('F-DM-02 FR-8 r9 appointment pinned bar + sheet', () => {
  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('P1 API: active_appointment PROPOSED → ACCEPTED(+카드 1건) → 취소 후 null', async ({ request }) => {
    const a = await newUser(request, 'sa');
    const b = await newUser(request, 'sb');
    const convId = await pureRoom(request, a, b);

    expect(await activeAppointment(request, a, convId)).toBeNull();

    const appt = await propose(request, a, convId, 2);
    expect((await activeAppointment(request, b, convId))?.status).toBe('PROPOSED');

    // 같은 두 사람은 한 방을 재사용 — 상대 카운트.
    const before = acceptedCards(await messages(request, a, convId)).length;
    await accept(request, b, appt.id);
    const cards = acceptedCards(await messages(request, a, convId));
    expect(cards.length - before).toBe(1);
    const meta = cards[cards.length - 1].meta;
    expect(meta.appointmentId).toBe(appt.id);
    expect(meta.actorId).toBe(b.userId);
    expect(meta.placeName).toBe('e2e 장소');
    expect(meta.whenAt).toBeTruthy();
    expect((await activeAppointment(request, a, convId))?.status).toBe('ACCEPTED');

    await cancel(request, a, appt.id);
    expect(await activeAppointment(request, a, convId)).toBeNull();
  });

  test('P2 UI: 약속 카드가 로드 범위 밖이어도 고정 바 → 시트 → 수락 → 확정 표시', async ({ page, request }) => {
    const a = await newUser(request, 'ra');
    const b = await newUser(request, 'rb');
    const convId = await pureRoom(request, a, b);
    const appt = await propose(request, a, convId, 2);

    // 첫 로드 페이지(기본 limit) 밖으로 밀어내기 — 텍스트 60건.
    for (let i = 0; i < 60; i++) {
      await json(await request.post(`${API}/dm/conversations/${convId}/messages`, {
        headers: H(a),
        data: { content: `e2e filler ${i}`, message_type: 'text' },
      }));
    }

    await injectSession(page, b);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/dm/${convId}`);

    // dm.apptBarProposedTheirs (ko)
    const bar = page.getByRole('button', { name: /제안 도착/ });
    await expect(bar).toBeVisible();
    await bar.click();

    // dm.apptAccept (ko) — 시트 안의 수락 버튼
    const acceptBtn = page.getByRole('button', { name: '약속 수락' });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    await expect.poll(async () => (await activeAppointment(request, b, convId))?.status).toBe('ACCEPTED');
    expect((await activeAppointment(request, b, convId))?.id).toBe(appt.id);
    // dm.apptBarConfirmed (ko)
    await expect(page.getByRole('button', { name: /약속 확정/ })).toBeVisible();
  });

  test('P3 UI: 세트 없는 매물 방에서 구매자 제안 → 판매자에게 고정 바 노출', async ({ page, request }) => {
    const seller = await newUser(request, 'ls');
    const buyer = await newUser(request, 'lb');
    const listing = await newListing(request, seller, `e2e약속시트${uniqueTag('')}`);
    const convId = await openListingRoomOnly(request, buyer, seller, listing);
    await propose(request, buyer, convId, 2, listing);

    await injectSession(page, seller);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/dm/${convId}`);

    await expect(page.getByRole('button', { name: /제안 도착/ })).toBeVisible();
  });
});
