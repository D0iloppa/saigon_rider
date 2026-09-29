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
 * F-CM-02 r17 — 그룹 편집 화면(/group/:slug/edit, owner/manager 전용, 만들기 폼 재사용) + 일반 멤버는 진입 버튼 없음.
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

test.describe('community group edit', () => {
  let owner: DevSession;
  let member: DevSession;

  test.afterAll(() => {
    for (const u of [member, owner]) if (u) cleanupUser(u.userId);
  });

  test('owner: 편집 진입 → 값 채워짐 → 이름·주제 변경 저장 → 상세 반영 / 일반 멤버는 편집 버튼 없음', async ({ page, request }) => {
    owner = await newUser(request, 'geo');
    member = await newUser(request, 'gem');
    const topics: Array<{ code: string; labels: Record<string, string> }> = await (
      await request.get(`${API}/community/group-topics`)
    ).json();
    const [from, to] = [topics[0], topics[1]];
    const groupRes = await request.post(`${API}/community/groups`, {
      headers: H(owner),
      data: {
        name: `편집전${uniqueTag('g')}`,
        topic: from.code,
        group_type: 'interest',
        join_policy: 'open',
        visibility: 'public',
      },
    });
    expect(groupRes.status()).toBe(201);
    const group = await groupRes.json();
    const slug = group.slug ?? group.id;
    const joined = await request.post(`${API}/community/groups/${group.id}/join`, { headers: H(member) });
    expect(joined.ok()).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));

    // owner: 편집 진입
    await injectSession(page, owner);
    await page.goto(`/group/${slug}`);
    await page.getByTestId('group-edit-btn').click();
    await expect(page).toHaveURL(new RegExp(`/group/${slug}/edit$`));
    await expect(page.locator('#group-create-name')).toHaveValue(group.name);
    await expect(page.getByTestId(`group-create-topic-${from.code}`)).toHaveAttribute('aria-checked', 'true');

    const newName = `편집후${uniqueTag('g')}`;
    await page.locator('#group-create-name').fill(newName);
    await page.getByTestId(`group-create-topic-${to.code}`).click();
    const saved = page.waitForResponse((r) => r.url().includes(`/community/groups/${group.id}`) && r.request().method() === 'PATCH');
    await page.getByTestId('group-edit-save').click();
    expect((await saved).status()).toBe(200);

    // 상세로 복귀 — 새 이름 + 새 주제 라벨
    await expect(page).toHaveURL(new RegExp(`/group/${slug}$`));
    await expect(page.getByRole('heading', { name: newName })).toBeVisible();
    const label = to.labels.ko ?? Object.values(to.labels)[0];
    await expect(page.getByTestId('group-detail-topic')).toHaveText(label);

    // 일반 멤버: 편집 버튼 없음
    await page.context().clearCookies();
    await injectSession(page, member);
    await page.goto(`/group/${slug}`);
    await expect(page.getByRole('heading', { name: newName })).toBeVisible();
    await expect(page.getByTestId('group-edit-btn')).toHaveCount(0);
  });
});
