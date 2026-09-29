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
 * F-CM-02 FR-1 r14 — 그룹 탭 검색(`GET /community/groups?q=`) + 로그인 시 항상 보이는 "내 그룹" 섹션.
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

test.describe('community group search (r14)', () => {
  let owner: DevSession;
  let visitor: DevSession;
  const tag = uniqueTag('gs');
  const groupName = `검색그룹${tag}`;

  test.afterAll(() => {
    for (const u of [visitor, owner]) if (u) cleanupUser(u.userId);
  });

  test('검색어로 카드가 좁혀지고, 없는 검색어는 빈 상태 · 내 그룹 섹션은 0개여도 보인다', async ({ page, request }) => {
    owner = await newUser(request, 'gso');
    visitor = await newUser(request, 'gsv');
    const created = await request.post(`${API}/community/groups`, {
      headers: H(owner),
      data: { name: groupName, description: `설명 ${tag}`, group_type: 'interest', join_policy: 'open', visibility: 'public' },
    });
    expect(created.status()).toBe(201);

    // API: q 가 이름·설명 부분일치로 좁힌다
    const byName = await (await request.get(`${API}/community/groups?q=${encodeURIComponent(tag)}`, { headers: H(visitor) })).json();
    expect(byName.items.map((g: { name: string }) => g.name)).toContain(groupName);
    const none = await (await request.get(`${API}/community/groups?q=${encodeURIComponent(`없는검색어${tag}`)}`, { headers: H(visitor) })).json();
    expect(none.total).toBe(0);

    await injectSession(page, visitor);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/community/groups');

    // 가입 그룹이 없어도 "내 그룹" 섹션(빈 카드)이 보인다
    await expect(page.getByTestId('my-groups-empty')).toBeVisible();
    await expect(page.getByTestId('my-groups-rail')).toHaveCount(0);

    const input = page.getByTestId('group-search-input');
    await input.fill(tag);
    const cards = page.getByTestId('group-card');
    await expect(cards.filter({ hasText: groupName })).toHaveCount(1);
    await expect(page.getByText('검색 결과', { exact: true })).toBeVisible();
    // 검색 중에는 내 그룹 섹션을 접는다
    await expect(page.getByTestId('my-groups-empty')).toHaveCount(0);

    await input.fill(`없는검색어${tag}`);
    await expect(page.getByText('검색 결과가 없어요')).toBeVisible();
    await expect(cards).toHaveCount(0);

    // 지우기 → 둘러보기 + 내 그룹 섹션 복귀
    await page.getByRole('button', { name: '지우기' }).click();
    await expect(page.getByText('그룹 둘러보기', { exact: true })).toBeVisible();
    await expect(page.getByTestId('my-groups-empty')).toBeVisible();
  });
});
