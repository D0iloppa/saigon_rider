import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
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
 * F-CM-02 r24 — 매니저 지정/해제(방장 전용) + 방장 위임(이전 방장 → 매니저).
 * 이 스펙은 작성만 하고 실행하지 않는다 — 통합 실행은 감독이 1회 수행.
 */

const API = 'http://localhost:18090/api/bff';
const H = (s: DevSession): Record<string, string> => ({ 'X-User-Id': s.userId, 'X-Session-Token': s.sessionToken });

async function newUser(request: APIRequestContext, label: string): Promise<DevSession> {
  const s = await devLogin(request, uniqueTag(label));
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
  return s;
}

async function firstTopic(request: APIRequestContext): Promise<string> {
  const topics = await (await request.get(`${API}/community/group-topics`)).json();
  return topics[0].code;
}

async function pageAs(browser: Browser, s: DevSession) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await injectSession(page, s);
  return page;
}

async function myRole(request: APIRequestContext, s: DevSession, groupId: string): Promise<string | null> {
  const g = await (await request.get(`${API}/community/groups/${groupId}`, { headers: H(s) })).json();
  return g.my_role ?? null;
}

test.describe('community group roles', () => {
  let owner: DevSession;
  let memberB: DevSession;
  let memberC: DevSession;

  test.afterAll(() => {
    for (const u of [memberC, memberB, owner]) if (u) cleanupUser(u.userId);
  });

  test('방장이 매니저 지정 → 매니저 ⚙·나가기 → 방장 위임 → 이전 방장은 매니저이고 나갈 수 있다', async ({ browser, request }) => {
    owner = await newUser(request, 'gro');
    memberB = await newUser(request, 'grb');
    memberC = await newUser(request, 'grc');
    const groupRes = await request.post(`${API}/community/groups`, {
      headers: H(owner),
      data: {
        name: `역할그룹${uniqueTag('g')}`,
        topic: await firstTopic(request),
        group_type: 'interest',
        join_policy: 'open',
        visibility: 'public',
      },
    });
    expect(groupRes.status()).toBe(201);
    const group = await groupRes.json();
    const path = `/group/${group.slug ?? group.id}`;
    expect((await request.post(`${API}/community/groups/${group.id}/join`, { headers: H(memberB) })).ok()).toBeTruthy();

    // 방장: 멤버 탭 → B ⋮ → [매니저로 지정]
    const ownerPage = await pageAs(browser, owner);
    await ownerPage.goto(path);
    await ownerPage.getByText('멤버', { exact: true }).first().click();
    await ownerPage.getByTestId('member-role-btn').click();
    await ownerPage.getByTestId('member-make-manager').click();
    await expect.poll(() => myRole(request, memberB, group.id)).toBe('manager');

    // 매니저 B: ⚙ 있고 그룹 관리에 [그룹 나가기] → 나가면 멤버 아님
    const bPage = await pageAs(browser, memberB);
    await bPage.goto(path);
    await bPage.getByTestId('group-manage-btn').click();
    await bPage.getByTestId('manage-leave-btn').click();
    await bPage.getByTestId('manage-leave-confirm').click();
    await expect.poll(() => myRole(request, memberB, group.id)).toBeNull();

    // 방장 위임: C 가입 → 그룹 관리 → 방장 위임 → C 선택 → 확인
    expect((await request.post(`${API}/community/groups/${group.id}/join`, { headers: H(memberC) })).ok()).toBeTruthy();
    await ownerPage.goto(`${path}/manage`);
    await ownerPage.getByTestId('manage-transfer-row').click();
    await expect(ownerPage).toHaveURL(new RegExp('/group/.+/transfer$'));
    await ownerPage.getByTestId('transfer-search-input').fill('zzzz-no-match');
    await expect(ownerPage.getByTestId('transfer-row')).toHaveCount(0);
    await ownerPage.getByTestId('transfer-search-input').fill('');
    await ownerPage.getByTestId('transfer-row').first().click();
    await ownerPage.getByTestId('transfer-confirm').click();
    await expect.poll(() => myRole(request, memberC, group.id)).toBe('owner');
    expect(await myRole(request, owner, group.id)).toBe('manager');

    // 이전 방장은 이제 나갈 수 있다 (r23 열린 점 해소)
    const leave = await request.delete(`${API}/community/groups/${group.id}/members/${owner.userId}`, { headers: H(owner) });
    expect(leave.status()).toBe(200);
  });
});
