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
 * F-CM-01 FR-1 r18 — 피드 [내 그룹] 칩 복원 + 그룹 글 출처 칩(post-group-chip → 그룹 이동), 그룹 게시판에선 숨김.
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

async function open(page: import('@playwright/test').Page, s: DevSession, path: string) {
  await injectSession(page, s);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
}

const GROUP_NAME = `e2e피드그룹${uniqueTag('')}`;
const POST_TEXT = `e2e그룹출처글${uniqueTag('')}`;

test.describe.configure({ mode: 'serial' });

test.describe('feed groups r18', () => {
  let a: DevSession; // 그룹 개설자·작성자
  let c: DevSession; // 그룹 없는 사용자
  let groupId = '';

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('setup: 그룹 + 그룹 글', async ({ request }) => {
    a = await newUser(request, 'fga');
    c = await newUser(request, 'fgc');
    const topics = await json(await request.get(`${API}/community/group-topics`));
    const group = await json(await request.post(`${API}/community/groups`, {
      headers: H(a),
      data: { name: GROUP_NAME, description: 'e2e', topic: topics[0].code },
    }));
    groupId = group.id;
    await json(await request.post(`${API}/feed`, {
      headers: H(a),
      data: { user_id: a.userId, content: POST_TEXT, image_content_ids: [], is_story: false, group_id: groupId },
    }));
  });

  test('전체 피드: 그룹 출처 칩 표시 → 탭 시 그룹으로', async ({ page }) => {
    await open(page, a, '/feed');
    const card = page.getByTestId('feed-post-card').filter({ hasText: POST_TEXT });
    const chip = card.getByTestId('post-group-chip');
    await expect(chip).toContainText(GROUP_NAME);
    await chip.click();
    await expect(page).toHaveURL(/\/group\//);
  });

  test('내 그룹 칩: 가입한 그룹 글 노출', async ({ page }) => {
    await open(page, a, '/feed');
    await page.getByTestId('feed-filter-chips').getByRole('radio', { name: '내 그룹' }).click();
    await expect(page.getByTestId('feed-post-card').filter({ hasText: POST_TEXT })).toBeVisible();
  });

  test('그룹 없는 사용자: 내 그룹 빈 상태 + 그룹 둘러보기', async ({ page }) => {
    await open(page, c, '/feed');
    await page.getByTestId('feed-filter-chips').getByRole('radio', { name: '내 그룹' }).click();
    await expect(page.getByText('가입한 그룹의 글이 여기에 모여요')).toBeVisible();
    await page.getByRole('button', { name: '그룹 둘러보기' }).click();
    await expect(page).toHaveURL(/\/community\/groups$/);
  });

  test('그룹 게시판: 출처 칩 숨김', async ({ page }) => {
    await open(page, a, `/group/${groupId}`);
    await expect(page.getByTestId('group-board-list').getByTestId('feed-post-card').first()).toBeVisible();
    await expect(page.getByTestId('post-group-chip')).toHaveCount(0);
  });

  test('r19: 비멤버가 public 그룹 게시판을 읽는다(읽기 전용) + private 은 게이트', async ({ page, request }) => {
    await open(page, c, '/feed');
    await page.getByTestId('feed-post-card').filter({ hasText: POST_TEXT }).getByTestId('post-group-chip').click();
    await expect(page).toHaveURL(/\/group\//);
    await expect(page.getByTestId('group-board-list').getByText(POST_TEXT)).toBeVisible();
    await expect(page.getByTestId('board-join-nudge')).toBeVisible();
    await expect(page.getByRole('button', { name: '새 글 작성' })).toHaveCount(0);

    const topics = await json(await request.get(`${API}/community/group-topics`));
    const priv = await json(await request.post(`${API}/community/groups`, {
      headers: H(a),
      data: { name: `${GROUP_NAME}비공개`, description: 'e2e', topic: topics[0].code, visibility: 'private' },
    }));
    const res = await request.get(`${API}/community/groups/${priv.id}/posts`, { headers: H(c) });
    expect([403, 404]).toContain(res.status());
  });

  test('r21: 그룹 글 댓글·좋아요는 ACTIVE 멤버만(API) + 비그룹 글은 누구나', async ({ request }) => {
    const feed = await json(await request.get(`${API}/feed?limit=50`, { headers: H(a) }));
    const items = Array.isArray(feed) ? feed : feed.items;
    const gp = items.find((p: { content?: string }) => p.content === POST_TEXT);
    expect(gp, 'group post in feed').toBeTruthy();
    const like = (s: DevSession, pid: string) =>
      request.post(`${API}/feed/${pid}/like`, { headers: H(s), data: { user_id: s.userId } });
    const comment = (s: DevSession, pid: string) =>
      request.post(`${API}/feed/${pid}/comments`, { headers: H(s), data: { user_id: s.userId, content: 'e2e r21' } });

    const r1 = await like(c, gp.id);
    expect(r1.status()).toBe(403);
    expect((await r1.json()).detail.code).toBe('group_member_required');
    const r2 = await comment(c, gp.id);
    expect(r2.status()).toBe(403);
    expect((await r2.json()).detail.code).toBe('group_member_required');

    await json(await like(a, gp.id));
    const cm = await json(await comment(a, gp.id));
    await json(await request.post(`${API}/feed/${gp.id}/comments/${cm.id}/like`, { headers: H(a), data: { user_id: a.userId } }));
    const r3 = await request.post(`${API}/feed/${gp.id}/comments/${cm.id}/like`, { headers: H(c), data: { user_id: c.userId } });
    expect(r3.status()).toBe(403);

    const plain = await json(await request.post(`${API}/feed`, {
      headers: H(a),
      data: { user_id: a.userId, content: `e2e비그룹글${uniqueTag('')}`, image_content_ids: [], is_story: false },
    }));
    await json(await like(c, plain.id));
    await json(await comment(c, plain.id));
  });

  test('r21: private 그룹 글은 비멤버에게 404(댓글 목록·좋아요·댓글)', async ({ request }) => {
    const topics = await json(await request.get(`${API}/community/group-topics`));
    const priv = await json(await request.post(`${API}/community/groups`, {
      headers: H(a),
      data: { name: `${GROUP_NAME}비공개글`, description: 'e2e', topic: topics[0].code, visibility: 'private' },
    }));
    const pp = await json(await request.post(`${API}/feed`, {
      headers: H(a),
      data: { user_id: a.userId, content: `e2e비공개글${uniqueTag('')}`, image_content_ids: [], is_story: false, group_id: priv.id },
    }));
    expect((await request.get(`${API}/feed/${pp.id}/comments`, { headers: H(c) })).status()).toBe(404);
    expect((await request.post(`${API}/feed/${pp.id}/like`, { headers: H(c), data: { user_id: c.userId } })).status()).toBe(404);
    expect((await request.get(`${API}/feed/${pp.id}/comments`, { headers: H(a) })).status()).toBe(200);
  });

  test('r21: 비멤버가 그룹 글 응원 탭 → 토스트, 카운트 불변', async ({ page }) => {
    await open(page, c, '/feed');
    const card = page.getByTestId('feed-post-card').filter({ hasText: POST_TEXT });
    const btn = card.getByRole('button', { name: '응원' });
    const before = await btn.innerText();
    await btn.click();
    await expect(page.getByText('그룹에 가입하면 좋아요·댓글을 남길 수 있어요')).toBeVisible();
    expect(await btn.innerText()).toBe(before);
  });
});
