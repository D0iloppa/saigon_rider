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
 * F-CM-02 / F-DM-02 — 그룹 초대(카드는 [그룹 보기] 링크뿐, 가입은 그룹 페이지 [가입하기]로만) + 운영진 내보내기/영구 차단/차단 해제.
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

test.describe('community group invite', () => {
  let owner: DevSession;
  let invitee: DevSession;
  let stranger: DevSession;

  test.afterAll(() => {
    for (const u of [stranger, invitee, owner]) if (u) cleanupUser(u.userId);
  });

  test('초대전용 그룹: 팔로워만 후보 → 카드는 링크만 → 그룹 페이지 가입하기로 ACTIVE', async ({ page, request }) => {
    owner = await newUser(request, 'gio');
    invitee = await newUser(request, 'gii');
    stranger = await newUser(request, 'gis');
    const groupRes = await request.post(`${API}/community/groups`, {
      headers: H(owner),
      data: {
        name: `초대그룹${uniqueTag('g')}`,
        topic: await firstTopic(request),
        group_type: 'interest',
        join_policy: 'invite',
        visibility: 'public',
      },
    });
    expect(groupRes.status()).toBe(201);
    const group = await groupRes.json();

    // invitee 가 owner 를 팔로우 → owner 의 후보(팔로워). stranger 는 관계 없음 → 후보 아님
    const follow = await request.post(`${API}/follows/${owner.userId}`, { headers: H(invitee), data: { user_id: invitee.userId } });
    expect(follow.ok()).toBeTruthy();
    const cands = await (await request.get(`${API}/community/groups/${group.id}/invite-candidates`, { headers: H(owner) })).json();
    expect(cands.map((c: { user_id: string }) => c.user_id)).toContain(invitee.userId);
    expect(cands.map((c: { user_id: string }) => c.user_id)).not.toContain(stranger.userId);
    // 초대 없이는 가입 불가
    const direct = await request.post(`${API}/community/groups/${group.id}/join`, { headers: H(invitee) });
    expect(direct.status()).toBe(403);
    expect((await direct.json()).detail.code).toBe('invite_required');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));

    // owner: 초대 화면에서 선택 → 전송
    await injectSession(page, owner);
    await page.goto(`/group/${group.slug ?? group.id}/invite`);
    await expect(page.getByTestId('invite-row')).toHaveCount(1);
    await page.getByTestId('invite-row-checkbox').check();
    const sent = page.waitForResponse((r) => r.url().includes('/invites') && r.request().method() === 'POST');
    await page.getByTestId('invite-send-btn').click();
    expect((await sent).status()).toBe(200);

    // invitee: DM 방의 초대 카드 — [그룹 보기]만 있고 가입 버튼은 없다
    let convId = '';
    await expect
      .poll(async () => {
        const convs = await (await request.get(`${API}/dm/conversations?user_id=${invitee.userId}`, { headers: H(invitee) })).json();
        convId = convs.find((c: { other_user_id: string }) => c.other_user_id === owner.userId)?.id ?? '';
        return convId;
      })
      .not.toBe('');
    await page.context().clearCookies();
    await injectSession(page, invitee);
    await page.goto(`/dm/${convId}`);
    await expect(page.getByTestId('invite-card')).toBeVisible();
    await expect(page.getByTestId('invite-card-join')).toHaveCount(0);
    await page.getByRole('button', { name: '그룹 보기' }).click();

    // 그룹 페이지: 초대 안내 + [가입하기] → ACTIVE + 공식 채팅방 합류
    await expect(page.getByTestId('group-invite-notice')).toBeVisible();
    await page.getByRole('button', { name: '가입하기' }).click();
    await expect(page.getByTestId('group-invite-notice')).toHaveCount(0);

    const after = await (await request.get(`${API}/community/groups/${group.id}`, { headers: H(invitee) })).json();
    expect(after.my_membership_status).toBe('ACTIVE');
    expect(after.my_invite).toBeNull();
    const convsAfter = await (await request.get(`${API}/dm/conversations?user_id=${invitee.userId}`, { headers: H(invitee) })).json();
    expect(convsAfter.map((c: { community_group_id: string | null }) => c.community_group_id)).toContain(group.id);
  });

  test('운영진 내보내기(재가입=승인) / 영구 차단(가입 불가) / 차단 해제(재가입=승인)', async ({ page, request }) => {
    owner = await newUser(request, 'gmo');
    invitee = await newUser(request, 'gmm');
    const groupRes = await request.post(`${API}/community/groups`, {
      headers: H(owner),
      data: {
        name: `모더그룹${uniqueTag('g')}`,
        topic: await firstTopic(request),
        group_type: 'interest',
        join_policy: 'open',
        visibility: 'public',
      },
    });
    expect(groupRes.status()).toBe(201);
    const group = await groupRes.json();
    const join = () => request.post(`${API}/community/groups/${group.id}/join`, { headers: H(invitee) });
    const status = async () =>
      (await (await request.get(`${API}/community/groups/${group.id}`, { headers: H(invitee) })).json()).my_membership_status;

    expect((await (await join()).json()).my_membership_status).toBe('ACTIVE');

    // 내보내기(차단 없음) → 열린 그룹이어도 재가입은 승인 대기
    const kick = await request.delete(`${API}/community/groups/${group.id}/members/${invitee.userId}`, { headers: H(owner) });
    expect(kick.ok()).toBeTruthy();
    expect(await status()).toBe('REMOVED');
    expect((await (await join()).json()).my_membership_status).toBe('PENDING');
    // 대기 중 재호출은 open 정책이어도 승격되지 않는다 (승인만이 승격)
    expect((await (await join()).json()).my_membership_status).toBe('PENDING');
    const approve = await request.post(`${API}/community/groups/${group.id}/members/${invitee.userId}/approve`, { headers: H(owner) });
    expect(approve.ok()).toBeTruthy();
    expect(await status()).toBe('ACTIVE');

    // 영구 차단(UI): 멤버 탭 → 내보내기 → 차단 체크 → 확인
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await injectSession(page, owner);
    await page.goto(`/group/${group.slug ?? group.id}`);
    await page.getByText('멤버', { exact: true }).first().click();
    await page.getByTestId('member-kick-btn').click();
    await page.getByTestId('member-kick-ban-checkbox').check();
    await page.getByTestId('member-kick-confirm').click();
    await expect(page.getByTestId('member-kick-btn')).toHaveCount(0);

    expect(await status()).toBe('BANNED');
    const banned = await join();
    expect(banned.status()).toBe(403);
    expect((await banned.json()).detail.code).toBe('group_banned');

    // 차단 목록에서 해제 → REMOVED → 재가입은 승인 대기
    await page.getByTestId('group-ban-list').click();
    await page.getByTestId('ban-unban-btn').click();
    await expect(page.getByTestId('ban-unban-btn')).toHaveCount(0);
    expect(await status()).toBe('REMOVED');
    expect((await (await join()).json()).my_membership_status).toBe('PENDING');
  });
});
