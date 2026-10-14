import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { test, expect, request as pwRequest } from '@playwright/test';
import { devLogin, injectSession, saveConsentViaApi, cleanupUser, uniqueTag, type DevSession } from './helpers';

/**
 * 공식 계정(ADMIN_USER_ID, is_official) + 관리자 '공식 그룹'·'커뮤니티 글' — 관리자 API 로 그룹·글을 만들고,
 * 일반 유저 화면에서 '공식' 배지와 자유가입을 확인한다. 관리자 계정은 ~/.ssh/saigon_admin_cred (1행 id, 2행 pw).
 */

const BASE_URL = 'http://localhost:18090';
const OFFICIAL_ID = '00000000-0000-0000-0000-000000000001';
const MIN_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const users: DevSession[] = [];

test.afterAll(() => {
  for (const u of users) cleanupUser(u.userId);
});

test('official group + post via admin API, official badge and open join in app', async ({ page, request }) => {
  const [username, password] = readFileSync(`${homedir()}/.ssh/saigon_admin_cred`, 'utf8').trim().split('\n');
  const admin = await pwRequest.newContext({ baseURL: BASE_URL });
  expect((await admin.post('/admin/api/auth/login', { data: { username, password } })).status()).toBe(200);

  const upload = async () => {
    const r = await admin.post('/admin/api/contents/upload', { multipart: { file: { name: 'e2e.png', mimeType: 'image/png', buffer: MIN_PNG } } });
    expect(r.status(), await r.text()).toBe(201);
    return (await r.json()).id as string;
  };

  const topics = await (await admin.get('/admin/api/community-groups/topics')).json();
  const topic = (Array.isArray(topics) ? topics : topics.items)[0].code;
  const groupRes = await admin.post('/admin/api/community-groups', {
    data: { name: `e2e official ${uniqueTag('g')}`, description: 'e2e', topic, cover_content_id: await upload() },
  });
  expect(groupRes.status(), await groupRes.text()).toBe(201);
  const group = await groupRes.json();
  expect(group.join_policy).toBe('open');

  const postRes = await admin.post('/admin/api/community/feed', {
    data: { content: 'e2e official post', group_id: group.id, image_content_ids: [await upload()] },
  });
  expect(postRes.status(), await postRes.text()).toBe(201);
  const post = await postRes.json();
  expect(post.group_id).toBe(group.id);

  // 일반 유저: 자유가입 → 공식 글 상세·공식 계정 프로필에 '공식' 배지
  const u = await devLogin(request, uniqueTag('off'));
  users.push(u);
  await saveConsentViaApi(request, u);
  const join = await request.post(`${BASE_URL}/api/bff/community/groups/${group.id}/join`, {
    headers: { 'X-User-Id': u.userId, 'X-Session-Token': u.sessionToken },
  });
  expect(join.status(), await join.text()).toBe(200);

  await injectSession(page, u);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/feed/post/${post.id}`);
  await expect(page.getByText('e2e official post')).toBeVisible();
  await expect(page.getByText('공식', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/official-post-badge.png', clip: { x: 0, y: 0, width: 390, height: 420 } });
  await page.goto(`/profile/${OFFICIAL_ID}`);
  await expect(page.getByText('Saigon Rider').first()).toBeVisible();
  await expect(page.getByText('공식', { exact: true }).first()).toBeVisible();

  // 관리자 콘솔 메뉴
  const cookies = await admin.storageState();
  await page.context().addCookies(cookies.cookies);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/');
  await page.getByRole('menuitem', { name: 'COMMUNITY' }).click();
  await expect(page.getByText('공식 그룹').first()).toBeVisible();
  await expect(page.getByText('커뮤니티 글').first()).toBeVisible();

  // 정리: 글 삭제, 그룹 정지
  expect((await admin.delete(`/admin/api/community/feed/${post.id}`)).status()).toBeLessThan(300);
  expect((await admin.put(`/admin/api/community-groups/${group.id}`, { data: { status: 'SUSPENDED' } })).status()).toBe(200);
  await admin.dispose();
});
