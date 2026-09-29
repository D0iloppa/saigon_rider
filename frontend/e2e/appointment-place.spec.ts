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
 * F-S4-01 FR-2 판정(r10, 260929) — 약속 장소: 인라인 지도 1단계 시트 · 카드 지도 썸네일 · 정확 좌표 상시 노출.
 *  - 제안(PROPOSED) 단계부터 API 가 정확한 place_lat/place_lng 를 돌려준다(정밀도 정책 폐지).
 *  - 길안내 엔드포인트는 시간창 게이트 없이 200(수락된 약속 기준 — 미수락이면 409 not_accepted).
 *  - 수락 카드 meta 에 placeLat/placeLng 스냅샷.
 *  - 시트는 별도 전체화면 피커 없이 한 화면에서 지도 + 상세 입력 + 자동 동 라벨.
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

const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

const LAT = 10.772;
const LNG = 106.698;

async function messages(request: APIRequestContext, by: DevSession, convId: string): Promise<any[]> {
  const body = await json(await request.get(`${API}/dm/conversations/${convId}/messages`, { headers: H(by) }));
  return body.items as any[];
}

const apptMessages = (items: any[]) => items.filter((m) => m.appointment);
const acceptedCards = (items: any[]) =>
  items.filter((m) => m.message_type === 'card' && m.meta?.subtype === 'appointment_accepted');

test.describe.configure({ mode: 'serial' });

test.describe('F-S4-01 FR-2 r10 appointment place (inline map · thumbnail · exact coords)', () => {
  let a: DevSession;
  let b: DevSession;
  let convId: string;
  let apptId: string;

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('L1 API: 제안 단계부터 정확 좌표 반환 (PROPOSED)', async ({ request }) => {
    a = await newUser(request, 'pa');
    b = await newUser(request, 'pb');
    convId = await pureRoom(request, a, b);

    const msg = await json(await request.post(`${API}/market/appointments`, {
      headers: H(a),
      data: { conversation_id: convId, when_at: inDays(3), place_name: 'e2e 장소', place_lat: LAT, place_lng: LNG },
    }));
    const appt = msg.appointment;
    expect(appt.status).toBe('PROPOSED');
    expect(Math.abs(appt.place_lat - LAT)).toBeLessThan(1e-6);
    expect(Math.abs(appt.place_lng - LNG)).toBeLessThan(1e-6);
    apptId = appt.id;

    // 상대(B)가 메시지 목록에서 봐도 동일한 정확 좌표.
    const seen = apptMessages(await messages(request, b, convId)).find((m) => m.appointment.id === apptId);
    expect(seen).toBeTruthy();
    expect(Math.abs(seen.appointment.place_lat - LAT)).toBeLessThan(1e-6);
    expect(Math.abs(seen.appointment.place_lng - LNG)).toBeLessThan(1e-6);
  });

  test('L2 API: 수락 카드 meta 에 placeLat/placeLng + 길안내 시간창 게이트 없음(200)', async ({ request }) => {
    const before = acceptedCards(await messages(request, a, convId)).length;
    await json(await request.patch(`${API}/market/appointments/${apptId}/accept`, { headers: H(b) }));
    const cards = acceptedCards(await messages(request, a, convId));
    expect(cards.length - before).toBe(1);
    const meta = cards[cards.length - 1].meta;
    expect(meta.appointmentId).toBe(apptId);
    expect(Math.abs(meta.placeLat - LAT)).toBeLessThan(1e-6);
    expect(Math.abs(meta.placeLng - LNG)).toBeLessThan(1e-6);

    // 약속이 3일 뒤여도 길안내 200 (구 시간창 게이트 제거). 서버는 ACCEPTED 만 요구한다.
    const nav = await json(await request.get(`${API}/market/appointments/${apptId}/navigation`, { headers: H(b) }));
    expect(nav.precision).toBe('exact');
    expect(Math.abs(nav.place_lat - LAT)).toBeLessThan(1e-6);
    expect(Math.abs(nav.place_lng - LNG)).toBeLessThan(1e-6);

    // L3 에서 새 제안을 낼 수 있도록 활성 약속 정리.
    await json(await request.patch(`${API}/market/appointments/${apptId}/cancel`, { headers: H(a) }));
  });

  test('L3 UI: 한 화면 시트(인라인 지도 + 상세 입력) → 전송 → place_name 에 상세 포함', async ({ page, request }) => {
    await injectSession(page, a);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/dm/${convId}`);

    // + 패널 — 헤더 ⋮ 도 같은 이름이라 마지막 것.
    await page.getByRole('button', { name: '더보기' }).last().click();
    await page.getByRole('button', { name: '약속잡기' }).click();

    // 같은 시트 안에 인라인 지도(mapWrap, CSS module 클래스명 부분일치) + 상세 입력이 함께 보인다.
    const mapWrap = page.locator('[class*="mapWrap"]').first();
    const detail = page.getByPlaceholder('예: 벤탄시장 정문 앞');
    await expect(mapWrap).toBeVisible({ timeout: 10_000 });
    await expect(detail).toBeVisible();
    // 별도 전체화면 피커(구 "거래 희망 장소" 타이틀)는 열리지 않는다.
    await expect(page.getByText('거래 희망 장소')).toHaveCount(0);

    // 지도 아래 자동 동 라벨 — districts 로드 후 비어있지 않고 안내 문구가 아니다.
    const area = mapWrap.locator('xpath=following-sibling::div[1]');
    await expect(area).not.toHaveText(/^\s*$/, { timeout: 10_000 });
    await expect(area).not.toContainText('지도를 움직여', { timeout: 10_000 });

    await detail.fill('e2e 정문 앞');
    // 일시는 시트 오픈 시 기본값(다음 정시)이 들어가 별도 입력이 필요 없다.
    const send = page.getByRole('button', { name: '약속 제안 보내기' });
    await expect(send).toBeEnabled({ timeout: 10_000 });
    await send.click();

    await expect.poll(async () => {
      const items = apptMessages(await messages(request, a, convId));
      const last = items[items.length - 1]?.appointment;
      return last?.place_name ?? '';
    }, { timeout: 10_000 }).toContain('e2e 정문 앞');

    const items = apptMessages(await messages(request, a, convId));
    const last = items[items.length - 1].appointment;
    expect(last.place_name).not.toBe('사이공');
    expect(last.place_name).toMatch(/^e2e 정문 앞 · .+/);
  });

  test('L4 UI: 약속 카드에 지도 썸네일(지연 마운트) 노출', async ({ page }) => {
    await injectSession(page, a);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.goto(`/dm/${convId}`);

    // 최신 약속 카드(L3 상세 텍스트 포함)를 뷰포트로 — IntersectionObserver 가 지도를 마운트한다.
    const place = page.getByText('e2e 정문 앞').last();
    await place.scrollIntoViewIfNeeded();
    // 텍스트에서 가장 가까운 canvas 를 품은 조상 = 카드. 그 안의 maplibre canvas.
    const canvas = place.locator('xpath=ancestor::*[.//canvas][1]').locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
  });
});
