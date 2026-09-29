import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
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
 * F-CM-01/02/03 r13 — 커뮤니티 IA: [피드|그룹] 세그먼트, 피드 칩 4종, 그룹 탭(레일·1열 카드·커버),
 * 내 커뮤니티 허브(/community/me), 좋아요한 글, 그룹 공식 채팅(오픈톡방) 노출.
 * 이 스펙은 작성만 하고 실행하지 않는다 — 통합 실행은 감독이 1회 수행.
 * S7 만 따로: npx playwright test community-ia -g "S7"  (S1~S6 의 setup 이 필요하므로 serial — 단독 실행 시 setup 테스트도 포함되게 -g "setup|S7")
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

async function openAs(page: Page, s: DevSession, path: string) {
  await injectSession(page, s);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
}

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const GROUP_NAME = `e2e그룹${uniqueTag('')}`;
const POST_TEXT = `e2e좋아요글${uniqueTag('')}`;

test.describe.configure({ mode: 'serial' });

test.describe('community IA r13', () => {
  let a: DevSession; // 그룹 개설자
  let b: DevSession; // 가입자(S7)
  let groupId = '';
  let groupPath = '';

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('setup: 사용자 A/B', async ({ request }) => {
    a = await newUser(request, 'cma');
    b = await newUser(request, 'cmb');
  });

  test('S1 피드 셸: 헤더·메뉴 버튼·세그먼트·칩 4종', async ({ page }) => {
    await openAs(page, a, '/feed');
    await expect(page.getByText('커뮤니티', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('community-menu-btn')).toBeVisible();
    await expect(page.getByTestId('community-seg-feed')).toBeVisible();
    await expect(page.getByTestId('community-seg-group')).toBeVisible();
    const chips = page.getByTestId('feed-filter-chips').getByRole('radio');
    await expect(chips).toHaveCount(4);
    for (const label of ['전체', '내 동네', '팔로잉', '인기']) {
      await expect(page.getByTestId('feed-filter-chips').getByRole('radio', { name: label })).toBeVisible();
    }
    await expect(page.getByTestId('feed-filter-chips').getByRole('radio', { name: /그룹/ })).toHaveCount(0);
  });

  test('S2 세그먼트: 그룹 ↔ 피드, 하단 탭 유지', async ({ page }) => {
    await openAs(page, a, '/feed');
    await page.getByTestId('community-seg-group').click();
    await expect(page).toHaveURL(/\/community\/groups$/);
    // TabBar 활성 = NavLink class "active"(CSS module 해시 접두 포함) — 커뮤니티 탭(/feed 링크)이 활성 상태여야 한다.
    await expect(page.locator('nav a[href="/feed"]').first()).toHaveAttribute('class', /active/);
    await expect(page.getByTestId('group-create-fab')).toBeVisible();
    await page.getByTestId('community-seg-feed').click();
    await expect(page).toHaveURL(/\/feed$/);
  });

  test('S3 그룹 개설(커버 포함) → 상세 배너 이미지·게시판 단일 컬럼', async ({ page, request }) => {
    await openAs(page, a, '/community/groups');
    await page.getByTestId('group-create-fab').click();
    await expect(page).toHaveURL(/\/community\/groups\/new$/);
    await page.getByTestId('group-cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
    // 커버 업로드 완료(미리보기 img 등장 + 제출 버튼 활성화)까지 대기
    await expect(page.getByTestId('group-cover-picker').locator('img')).toBeVisible();
    await page.locator('input[type="text"]').first().fill(GROUP_NAME);
    await page.locator('textarea').first().fill('e2e 커뮤니티 IA 그룹');
    const created = page.waitForResponse((r) => r.url().includes('/community/groups') && r.request().method() === 'POST');
    // 제출 버튼: 하단 submitBar 의 마지막 버튼(이름 입력 전엔 disabled — 위에서 이름을 채웠다)
    await page.locator('button').last().click();
    const res = await created;
    expect(res.status()).toBe(201);
    groupId = (await res.json()).id;
    await expect(page).toHaveURL(/\/group\//);
    groupPath = new URL(page.url()).pathname;

    // 배너: 커버가 있으면 AppImage(img), 없으면 이름 첫 글자 타일(img 없음)
    const banner = page.locator('[class*="banner"]').first();
    await expect(banner.locator('img')).toHaveCount(1);
    await expect(banner).not.toHaveText(GROUP_NAME[0].toUpperCase());

    // 게시판: 글 2개 올려 단일 컬럼 검사(그룹 글은 group_id 로 API 생성)
    for (const n of [1, 2]) {
      await json(await request.post(`${API}/feed`, {
        headers: H(a),
        data: { user_id: a.userId, content: `e2e그룹글${n}${uniqueTag('')}`, image_content_ids: [], is_story: false, group_id: groupId },
      }));
    }
    await page.reload();
    await expect(page.getByTestId('group-board-list')).toBeVisible();
    const cards = page.getByTestId('group-board-list').locator('[data-testid="feed-post-card"]');
    await expect(cards.first()).toBeVisible();
    if ((await cards.count()) >= 2) {
      const b0 = (await cards.nth(0).boundingBox())!;
      const b1 = (await cards.nth(1).boundingBox())!;
      expect(Math.abs(b0.x - b1.x)).toBeLessThan(1);
    }
  });

  test('S4 그룹 탭: 내 그룹 레일 + 가입됨 카드', async ({ page }) => {
    await openAs(page, a, '/community/groups');
    await expect(page.getByTestId('my-groups-rail')).toBeVisible();
    await expect(page.getByTestId('my-groups-rail-item').filter({ hasText: GROUP_NAME })).toHaveCount(1);
    const card = page.getByTestId('group-card').filter({ hasText: GROUP_NAME }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('가입됨');
  });

  test('S5 허브: /community/me 구성, 내 글 이동', async ({ page }) => {
    await openAs(page, a, '/feed');
    await page.getByTestId('community-menu-btn').click();
    await expect(page).toHaveURL(/\/community\/me$/);
    for (const id of ['hub-profile', 'hub-my-posts', 'hub-liked', 'hub-my-groups']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('hub-group-list')).toContainText(GROUP_NAME);
    await page.getByTestId('hub-my-posts').click();
    await expect(page).toHaveURL(new RegExp(`/profile/${a.userId}/posts$`));
  });

  test('S6 좋아요한 글: liked 필터·화면, 비로그인 401', async ({ page, request }) => {
    const post = await json(await request.post(`${API}/feed`, {
      headers: H(a),
      data: { user_id: a.userId, content: POST_TEXT, image_content_ids: [], is_story: false },
    }));
    const like = await json(await request.post(`${API}/feed/${post.id}/like`, {
      headers: H(a),
      data: { user_id: a.userId },
    }));
    expect(like.liked).toBe(true);

    await openAs(page, a, '/community/me/liked');
    await expect(page.getByTestId('liked-list')).toBeVisible();
    await expect(
      page.getByTestId('liked-list').locator('[data-testid="feed-post-card"]').filter({ hasText: POST_TEXT }),
    ).toHaveCount(1);

    const anon = await request.get(`${API}/feed?filter=liked&page=1&size=20`);
    expect(anon.status()).toBe(401);
  });
});

test.describe('S7 group official chat', () => {
  // 그룹 개설 시 오픈톡방이 자동 생성되고(community_groups.create_group), 가입 시 멤버로 자동 편입된다
  // (_add_open_conversation_member, muted) — "채팅 입장" 없이 채팅 목록에 나와야 한다.
  let a: DevSession;
  let b: DevSession;
  let groupId = '';
  const name = `e2e공식챗${uniqueTag('')}`;

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('S7 B 가입 → 채팅 목록에 그룹 배지 행 → 방 상단 그룹 링크', async ({ page, request }) => {
    a = await newUser(request, 'cmc');
    b = await newUser(request, 'cmd');
    const g = await json(await request.post(`${API}/community/groups`, {
      headers: H(a),
      data: { name, description: 'e2e', group_type: 'interest', join_policy: 'open', visibility: 'public' },
    }));
    groupId = g.id;
    await json(await request.post(`${API}/community/groups/${groupId}/join`, { headers: H(b) }));

    await openAs(page, b, '/dm');
    const row = page.locator('button', { hasText: name }).first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId('dm-row-group-badge')).toBeVisible();

    await row.click();
    await expect(page).toHaveURL(/\/dm\/[0-9a-f-]{36}$/);
    const link = page.getByTestId('dm-room-group-link');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/group\//);
    await expect(page.getByText(name).first()).toBeVisible();
  });
});
