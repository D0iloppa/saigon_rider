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
 * F-CM-02 / F-DM-02 — 그룹 초대: 관계 기반 후보 → 1:1 DM group_invite 카드 → 초대장 수락(초대전용 그룹의 유일한 진입 경로).
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

test.describe('community group invite', () => {
  let owner: DevSession;
  let invitee: DevSession;
  let stranger: DevSession;

  test.afterAll(() => {
    for (const u of [stranger, invitee, owner]) if (u) cleanupUser(u.userId);
  });

  test('초대전용 그룹: 팔로워만 후보 → 초대 카드 → 가입하기로 ACTIVE', async ({ page, request }) => {
    owner = await newUser(request, 'gio');
    invitee = await newUser(request, 'gii');
    stranger = await newUser(request, 'gis');
    const groupRes = await request.post(`${API}/community/groups`, {
      headers: H(owner),
      data: { name: `초대그룹${uniqueTag('g')}`, group_type: 'interest', join_policy: 'invite', visibility: 'public' },
    });
    expect(groupRes.status()).toBe(201);
    const group = await groupRes.json();

    // invitee 가 owner 를 팔로우 → owner 의 후보(팔로워). stranger 는 관계 없음 → 후보 아님
    const follow = await request.post(`${API}/follows/${owner.userId}`, { headers: H(invitee), data: { user_id: invitee.userId } });
    expect(follow.ok()).toBeTruthy();
    const cands = await (await request.get(`${API}/community/groups/${group.id}/invite-candidates`, { headers: H(owner) })).json();
    expect(cands.map((c: { user_id: string }) => c.user_id)).toContain(invitee.userId);
    expect(cands.map((c: { user_id: string }) => c.user_id)).not.toContain(stranger.userId);
    // 초대전용 그룹은 직접 가입 불가(초대장 수락이 유일한 경로)
    const direct = await request.post(`${API}/community/groups/${group.id}/join`, { headers: H(invitee) });
    expect(direct.status()).toBe(400);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));

    // owner: 초대 화면에서 선택 → 전송
    await injectSession(page, owner);
    await page.goto(`/group/${group.slug ?? group.id}/invite`);
    await expect(page.getByTestId('invite-row')).toHaveCount(1);
    await page.getByTestId('invite-row-checkbox').check();
    await page.getByTestId('invite-send-btn').click();

    // invitee: DM 방의 초대 카드 → 가입하기
    const convs = await (await request.get(`${API}/dm/conversations`, { headers: H(invitee) })).json();
    const convId = convs.find((c: { other_user_id: string }) => c.other_user_id === owner.userId).id;
    await page.context().clearCookies();
    await injectSession(page, invitee);
    await page.goto(`/dm/${convId}`);
    await expect(page.getByTestId('invite-card')).toBeVisible();
    await page.getByTestId('invite-card-join').click();
    await expect(page.getByTestId('invite-card-join')).toHaveCount(0);

    const after = await (await request.get(`${API}/community/groups/${group.id}`, { headers: H(invitee) })).json();
    expect(after.my_membership_status).toBe('ACTIVE');
  });
});
