import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  devLogin,
  injectSession,
  verifyPhoneBypass,
  saveConsentViaApi,
  cleanupUser,
  uniqueTag,
  uploadTestImage,
  type DevSession,
} from './helpers';

/**
 * F-CM-01 FR-1 r12 — 피드 단일 컬럼 카드 레이아웃(커밋 3d2a0365).
 * A 가 이미지 글 1 + 긴 텍스트 글 1 을 올리고, B 가 A 를 팔로우한 뒤 /feed 를 본다.
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

const IMG_TEXT = `e2e피드이미지글${uniqueTag('')}`;
const LONG_TEXT = `e2e긴텍스트${uniqueTag('')}\n` + Array.from({ length: 14 }, (_, i) => `긴 본문 ${i + 1}번째 줄입니다`).join('\n');
const LONG_KEY = LONG_TEXT.split('\n')[0];

let postImgId = '';

/** B 로 /feed 진입 후 "팔로잉" 칩으로 좁혀 A 글만 남긴다(전체 피드의 다른 글에 밀리지 않도록). */
async function openFollowingFeed(page: Page, b: DevSession) {
  await injectSession(page, b);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/feed');
  await page.getByRole('radio', { name: '팔로잉' }).click();
}

const cardOf = (page: Page, text: string) =>
  page.locator('[data-testid="feed-post-card"]').filter({ hasText: text }).first();

test.describe.configure({ mode: 'serial' });

test.describe('F-CM-01 FR-1 r12 feed single-column layout', () => {
  let a: DevSession;
  let b: DevSession;

  test.afterAll(() => {
    for (const u of users.reverse()) cleanupUser(u.userId);
  });

  test('setup: A 이미지 글 + 긴 텍스트 글, B 가 A 팔로우', async ({ request }) => {
    a = await newUser(request, 'fla');
    b = await newUser(request, 'flb');
    const imgId = await uploadTestImage(request, a);
    await json(await request.post(`${API}/feed`, {
      headers: H(a),
      data: { user_id: a.userId, content: IMG_TEXT, image_content_ids: [imgId], is_story: false },
    }));
    await json(await request.post(`${API}/feed`, {
      headers: H(a),
      data: { user_id: a.userId, content: LONG_TEXT, image_content_ids: [], is_story: false },
    }));
    await json(await request.post(`${API}/follows/${a.userId}`, {
      headers: H(b),
      data: { user_id: b.userId },
    }));
    const mine = await json(await request.get(`${API}/feed?filter=following&page=1&size=20`, { headers: H(b) }));
    const found = (mine.items as any[]).find((p) => p.content === IMG_TEXT);
    expect(found, 'A 이미지 글이 B 팔로잉 피드에 보여야 함').toBeTruthy();
    postImgId = found.id;
  });

  test('V1 레이아웃: 카드는 단일 컬럼(x 동일, 폭 ≥ 80%, 세로 적층)', async ({ page }) => {
    await openFollowingFeed(page, b);
    const cards = page.locator('[data-testid="feed-post-card"]');
    await expect(cards.nth(1)).toBeVisible();
    const b0 = (await cards.nth(0).boundingBox())!;
    const b1 = (await cards.nth(1).boundingBox())!;
    expect(Math.abs(b0.x - b1.x)).toBeLessThan(1);
    expect(b0.width).toBeGreaterThanOrEqual(390 * 0.8);
    expect(b1.width).toBeGreaterThanOrEqual(390 * 0.8);
    expect(b1.y).toBeGreaterThanOrEqual(b0.y + b0.height - 1);
  });

  test('V2 칩: "팔로잉" 있음, "친구" 없음', async ({ page }) => {
    await injectSession(page, b);
    await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/feed');
    await expect(page.getByRole('radio', { name: '팔로잉' })).toBeVisible();
    await expect(page.getByRole('radio', { name: '친구' })).toHaveCount(0);
    await expect(page.getByText('친구', { exact: true })).toHaveCount(0);
  });

  test('V3 인라인 응원: URL 유지, aria-pressed true, 카운트 +1', async ({ page }) => {
    await openFollowingFeed(page, b);
    const card = cardOf(page, IMG_TEXT);
    await expect(card).toBeVisible();
    const btn = card.getByRole('button', { name: '응원' });
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    const before = parseInt(((await btn.innerText()).match(/\d+/) ?? ['0'])[0], 10);
    await btn.click();
    await expect(page).toHaveURL(/\/feed(\?[^/]*)?$/);
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => parseInt(((await btn.innerText()).match(/\d+/) ?? ['0'])[0], 10)).toBe(before + 1);
  });

  test('V4 상세 진입: /feed/post/<id>, LV 배지 텍스트 없음', async ({ page }) => {
    await openFollowingFeed(page, b);
    await cardOf(page, IMG_TEXT).getByText(IMG_TEXT).click();
    await expect(page).toHaveURL(new RegExp(`/feed/post/${postImgId}`));
    await expect(page.getByText(IMG_TEXT).first()).toBeVisible();
    await expect(page.getByText(/^LV\.?\s?\d/)).toHaveCount(0);
  });

  test('V5 댓글 앵커: 💬 → #comments, 요소가 뷰포트 안', async ({ page }) => {
    await openFollowingFeed(page, b);
    await cardOf(page, IMG_TEXT).getByRole('button', { name: '댓글' }).click();
    await expect(page).toHaveURL(/#comments$/);
    await expect(page.locator('#comments')).toBeInViewport();
  });

  test('V6 텍스트 전용 clamp: "더보기" 있고 이미지 박스 없음', async ({ page }) => {
    await openFollowingFeed(page, b);
    const card = cardOf(page, LONG_KEY);
    await expect(card).toBeVisible();
    await expect(card.getByText('더보기')).toBeVisible();
    await expect(card.locator('[class*="postMedia"]')).toHaveCount(0); // 작성자 아바타 img 는 제외 — 사진 칸만 본다
  });
});
