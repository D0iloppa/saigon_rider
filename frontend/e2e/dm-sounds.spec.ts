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
 * DM 효과음(대표 지시 260929) — 텍스트 발신은 무음, 띠동(dm_send)은 워키토키 음성 발신·수신 전용,
 * 텍스트 수신은 dm_receive. 브라우저 Audio 생성자를 가로채 재생 요청된 파일명을 기록해 확인한다.
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

test.afterAll(() => {
  for (const u of users.reverse()) cleanupUser(u.userId);
});

test('텍스트 발신은 무음, 텍스트 수신은 dm_receive', async ({ page, request }) => {
  const a = await newUser(request, 'snda');
  const b = await newUser(request, 'sndb');
  const convRes = await request.post(`${API}/dm/conversations`, { headers: H(a), data: { other_user_id: b.userId } });
  expect(convRes.ok(), await convRes.text()).toBeTruthy();
  const conv = await convRes.json();

  await injectSession(page, a);
  await page.addInitScript(() => {
    window.localStorage.setItem('sr-lang', 'ko');
    const w = window as unknown as { __sounds: string[]; Audio: typeof Audio };
    w.__sounds = [];
    const Orig = w.Audio;
    w.Audio = function (src?: string) {
      if (src) w.__sounds.push(src);
      return new Orig(src);
    } as unknown as typeof Audio;
  });
  await page.goto(`/dm/${conv.id}`);

  const text = `효과음 확인 ${uniqueTag('')}`;
  await page.getByPlaceholder('메시지 입력...').fill(text);
  await page.getByRole('button', { name: '전송' }).click();
  await expect(page.getByText(text)).toBeVisible();
  await page.waitForTimeout(500);
  const afterSend = await page.evaluate(() => (window as unknown as { __sounds: string[] }).__sounds);
  expect(afterSend.filter((s) => s.includes('dm_send'))).toHaveLength(0);

  // 상대가 텍스트를 보내면 폴링(~5s)으로 도착 → dm_receive (띠동 아님)
  const sendRes = await request.post(`${API}/dm/conversations/${conv.id}/messages`, {
    headers: H(b),
    data: { content: '받는 소리 확인', message_type: 'text' },
  });
  expect(sendRes.ok(), await sendRes.text()).toBeTruthy();
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __sounds: string[] }).__sounds), { timeout: 20000 })
    .toContainEqual(expect.stringContaining('dm_receive'));
  const all = await page.evaluate(() => (window as unknown as { __sounds: string[] }).__sounds);
  expect(all.filter((s) => s.includes('dm_send'))).toHaveLength(0);
});
