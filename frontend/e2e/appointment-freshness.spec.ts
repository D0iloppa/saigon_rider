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
 * F-DM-02 FR-8 (커밋 2c2cace9) — 약속 칩 제안자 진입 + 폴링 최신성.
 *  F1: 제안자의 [약속 제안됨] 칩 → 약속 시트 → [제안 취소] → CANCELLED, 칩이 [약속잡기]로 복귀
 *  F2: 다른 기기에서 상대가 취소해도 열린 방이 폴링 1회(~5s) 안에 갱신(약속 카드 재전송)
 *  F3: after=<커서> 재조회 시 같은 약속 카드가 무한 재전송되지 않음
 *
 * 이 스펙은 작성만 하고 실행하지 않는다 — 통합 실행은 감독이 1회 수행.
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

test.describe.configure({ mode: 'serial' });

test.describe('F-DM-02 FR-8 appointment freshness', () => {
  let seller: DevSession;
  let buyer: DevSession;
  let f2Room: string;

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('F1 UI: 제안자 [약속 제안됨] 칩 → 시트 → [제안 취소] → CANCELLED, 칩 [약속잡기] 복귀', async ({ page, request }) => {
    seller = await newUser(request, 'fsel');
    buyer = await newUser(request, 'fbyr');
    const listing = await newListing(request, seller, `e2e신선도1${uniqueTag('')}`);
    const { convId } = await openListingRoom(request, buyer, seller, listing);
    const appt = await propose(request, buyer, convId, 2, listing);

    await injectSession(page, buyer);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/dm/${convId}`);

    // dm.tradeChipProposedMine (ko) — 제안자 칩이 버튼이어야 한다.
    await page.getByRole('button', { name: /약속 제안됨/ }).click();
    // dm.apptCancelOffer (ko) — 시트 안 제안자용 취소 버튼(PROPOSED 는 확인 없이 즉시 취소).
    await page.getByRole('button', { name: '제안 취소' }).last().click(); // 카드와 시트에 같은 버튼 — 시트(포털, DOM 마지막)를 고른다

    await expect.poll(async () => {
      const items = await messages(request, buyer, convId);
      return items.find((m) => m.appointment?.id === appt.id)?.appointment?.status;
    }, { timeout: 10000 }).toBe('CANCELLED');
    // dm.makeAppointment (ko) — 빈 슬롯 칩
    await expect(page.getByRole('button', { name: '약속잡기' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /약속 제안됨/ })).toHaveCount(0);
  });

  test('F2 UI: 열린 방(구매자)에서 판매자가 API 로 취소 → 리로드 없이 15초 안에 칩 갱신', async ({ page, request }) => {
    const listing = await newListing(request, seller, `e2e신선도2${uniqueTag('')}`);
    const { convId } = await openListingRoom(request, buyer, seller, listing);
    f2Room = convId;
    const appt = await propose(request, seller, convId, 2, listing);

    await injectSession(page, buyer);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/dm/${convId}`);
    // dm.tradeChipProposedIncoming (ko)
    await expect(page.getByRole('button', { name: /약속 제안 도착/ })).toBeVisible();

    // 다른 기기에서 취소 — 페이지 리로드 없음.
    await cancel(request, seller, appt.id);

    await expect(page.getByRole('button', { name: /약속 제안 도착/ })).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByRole('button', { name: '약속잡기' })).toBeVisible({ timeout: 15000 });
  });

  test('F3 API: after=<최대 updated_at> 두 번 연속 조회 시 같은 약속 카드가 두 번째엔 없다', async ({ request }) => {
    const full = await messages(request, buyer, f2Room);
    // 메시지에 updated_at 이 없으면 created_at 으로 대체(추정).
    const stamps = full.map((m) => m.updated_at ?? m.created_at).filter(Boolean).sort();
    expect(stamps.length).toBeGreaterThan(0);
    const cursor = stamps[stamps.length - 1] as string;

    const fetchAfter = async () => {
      const body = await json(await request.get(`${API}/dm/conversations/${f2Room}/messages`, {
        headers: H(buyer),
        params: { after: cursor },
      }));
      return body.items as any[];
    };
    await fetchAfter(); // 첫 호출은 재전송이 있을 수도 있다(허용).
    const second = await fetchAfter();
    expect(second.filter((m) => m.appointment)).toHaveLength(0);
  });
});
