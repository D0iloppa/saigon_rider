/* global process, localStorage, history, document, getComputedStyle, URL, fetch */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '../../../../frontend/node_modules/playwright/index.mjs';

const base = (process.env.BIZ_UI_BASE_URL ?? 'http://127.0.0.1:4181').replace(/\/$/, '');
const executablePath = process.env.PLAYWRIGHT_CHROME || '/usr/bin/google-chrome';
const outputDir = new URL('./screenshots/', import.meta.url);
const PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const USER = {
  id: USER_ID, phone: null, phone_verified: true, nickname: 'UX Fixture Owner', rider_type: null,
  level: 1, exp: 0, xp: 0, gold: 0, skill_pt: 0, avatar_url: null, manner_temp: 36.5,
  language: 'ko', consent_agreed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
};
const PROFILE = {
  id: PROFILE_ID, name: 'Fixture Moto', category: 'repair', address: '12 Nguyen Dinh Chieu',
  latitude: 10.786, longitude: 106.692, phone: '0901234567', intro: null,
  photo_content_id: null, photo_url: null, status: 'APPROVED', reject_reason: null,
  verification_status: 'verified', biz_license_content_id: null, signboard_content_id: null,
  rep_name: 'Fixture Owner', verified_at: '2026-09-01T00:00:00Z', verification_reject_reason: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};
const ads = Array.from({ length: 12 }, (_, index) => ({
  id: `ad-${index}`, profile_id: PROFILE_ID, tier_id: 'tier-1', tier_name: 'Standard', monthly_price_snapshot_vnd: 100000,
  title: `Advertisement ${index + 1}`, body: null, image_url: null,
  review_status: index === 0 ? 'REJECTED' : 'APPROVED', reject_reason: index === 0 ? 'Please revise the headline' : null,
  is_ongoing: true, starts_at: null, ends_at: null, created_at: '2026-09-09T00:00:00Z',
  subscription_status: index === 1 ? 'pending_payment' : 'active',
}));
const category = { code: 'repair', group_code: 'service', group_label_ko: '서비스', group_label_vi: 'Dịch vụ', group_label_en: 'Services', icon: 'wrench', label_ko: '정비', label_vi: 'Sửa xe', label_en: 'Repair', sort_order: 1 };

function fixture(url, method) {
  const path = url.pathname.replace(/^\/api\/bff/, '');
  if (path === '/auth/session/verify' && method === 'POST') return { user: USER };
  if (path === '/app-config') return { dm_poll_interval: 3600, google_client_id: '', is_dev: false, otp_dev_bypass: false, keyword_alert_max_count: 20 };
  if (path === '/app-version/current') return { primary: null, ios: null, android: null };
  if (path === '/dm/conversations' || path === '/market/categories' || path === '/master/districts') return [];
  if (path === '/tracking/screen-events' && method === 'POST') return {};
  if (path === '/users/me/language' && method === 'PUT') return {};
  if (path === '/biz/public/categories') return [category];
  if (path === '/biz/profiles') return [PROFILE];
  if (path === '/biz/ads') return ads;
  if (path.startsWith('/biz/ads/')) return ads.find((ad) => path === `/biz/ads/${ad.id}`) ?? null;
  if (path === `/biz/public/${PROFILE_ID}/news`) return [{ id: 'news-1', title: '긴 소식 제목', body: '긴 설명이 버튼 옆에 눌리지 않고 위에서 자연스럽게 줄바꿈되어야 합니다.', created_at: '2026-09-09T00:00:00Z', photos: [], photo_content_ids: [] }];
  if (path === `/biz/public/${PROFILE_ID}/prices`) return [{ id: 'price-1', name: 'Oil change', price_vnd: 150000, sort_order: 0, created_at: '2026-09-09T00:00:00Z' }];
  if (path === `/biz/public/${PROFILE_ID}`) return { ...PROFILE, ads: [], follower_count: 2, is_following: false, is_owner: true };
  if (path === '/biz/reviews') return { reviews: [], total: 0, unanswered_count: 0, avg_rating: null, has_more: false };
  if (path === `/biz/profiles/${PROFILE_ID}/ad-stats-summary`) return null;
  if (path === `/biz/profiles/${PROFILE_ID}/ad-stats-series`) return null;
  return null;
}

async function openPage(browser, routePath, state, width, language) {
  const context = await browser.newContext({ viewport: { width, height: 860 }, locale: language });
  await context.addCookies([{ name: 'sr_session', value: encodeURIComponent(JSON.stringify({ userId: USER_ID, sessionToken: 'browser-fixture-only' })), url: base }]);
  await context.addInitScript((lang) => localStorage.setItem('sr-lang', lang), language.slice(0, 2));
  const page = await context.newPage();
  const unexpected = [];
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base && url.pathname.startsWith('/api/')) {
      const body = fixture(url, request.method());
      if (body !== null) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.includes('/ad-stats-')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"fixture unavailable"}' });
      unexpected.push(`${request.method()} ${url.pathname}${url.search}`);
      return route.abort('blockedbyclient');
    }
    if (url.origin !== base) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ nextPath, nextState }) => history.replaceState({ usr: nextState, key: 'ux-smoke', idx: 0 }, '', nextPath), { nextPath: routePath, nextState: state });
  await page.reload({ waitUntil: 'domcontentloaded' });
  return { context, page, unexpected, errors };
}

function assertClean(result, label) {
  const scopedUnexpected = result.unexpected.filter((request) => request.includes('/biz/ads') || request.includes(`/biz/public/${PROFILE_ID}/`) || request.includes('/biz/reviews'));
  assert.deepEqual(scopedUnexpected, [], `${label}: unexpected scoped APIs ${scopedUnexpected.join(', ')}`);
  const scopedErrors = result.errors.filter((error) => !error.includes('ERR_BLOCKED_BY_CLIENT'));
  assert.deepEqual(scopedErrors, [], `${label}: browser errors ${scopedErrors.join(' | ')}`);
}

async function assertHero(page, label) {
  const geometry = await page.locator('section').first().evaluate((hero) => {
    const paragraph = hero.querySelector('p');
    const button = hero.querySelector('button');
    if (!paragraph || !button) throw new Error('hero copy or CTA missing');
    const heroRect = hero.getBoundingClientRect();
    const copyRect = paragraph.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return { copyBottom: copyRect.bottom, buttonTop: buttonRect.top, buttonWidth: buttonRect.width, heroWidth: heroRect.width };
  });
  assert.ok(geometry.copyBottom <= geometry.buttonTop, `${label}: CTA must follow copy vertically`);
  assert.ok(geometry.buttonWidth < geometry.heroWidth * 0.8, `${label}: CTA should keep intrinsic width`);
  const viewport = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(viewport.scroll <= viewport.client, `${label}: horizontal overflow ${viewport.scroll} > ${viewport.client}`);
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
try {
  for (const [width, language] of [[390, 'ko-KR'], [430, 'en-US'], [430, 'vi-VN']]) {
    const label = `${language}-${width}`;
    const managed = await openPage(browser, '/biz/manage', null, width, language);
    await managed.page.getByRole('button', { name: /내 광고|My ads|Quảng cáo của tôi/ }).waitFor();
    assert.equal(await managed.page.locator('article').count(), 0, `${label}: main lounge must not render the ad stack`);
    await managed.page.getByRole('button', { name: /내 광고|My ads|Quảng cáo của tôi/ }).click();
    await managed.page.waitForURL('**/biz/ads');
    await managed.page.locator('article').first().waitFor();
    assert.equal(await managed.page.locator('article').count(), 12, `${label}: dedicated page must render loaded ads`);
    await managed.page.locator('article').first().getByRole('button', { name: /광고 상세|Ad details|Chi tiết quảng cáo/ }).click();
    await managed.page.waitForURL('**/biz/ads/ad-0');
    await managed.page.locator('header button').first().click();
    await managed.page.waitForURL('**/biz/ads');
    assertClean(managed, `ads ${label}`);
    if (language === 'ko-KR') await managed.page.screenshot({ path: new URL(`screenshots/ads-${label}.png`, import.meta.url).pathname, fullPage: true });
    await managed.context.close();

    for (const routePath of ['/biz/news', '/biz/prices']) {
      const child = await openPage(browser, routePath, { profileId: PROFILE_ID }, width, language);
      await child.page.locator('section').first().waitFor();
      await assertHero(child.page, `${routePath} ${label}`);
      assertClean(child, `${routePath} ${label}`);
      if (language === 'ko-KR') await child.page.screenshot({ path: new URL(`screenshots/${routePath.slice(5)}-${label}.png`, import.meta.url).pathname, fullPage: true });
      await child.context.close();
    }
  }

  const performance = await openPage(browser, '/biz/manage', null, 390, 'ko-KR');
  await performance.page.getByRole('tab', { name: '성과' }).click();
  const header = performance.page.locator('#biz-dashboard-reviews');
  await header.waitFor();
  const centers = await header.evaluate((node) => {
    const title = node.querySelector('h3');
    const button = node.querySelector('button');
    if (!title || !button) throw new Error('review heading controls missing');
    const titleRect = title.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return { title: titleRect.top + titleRect.height / 2, button: buttonRect.top + buttonRect.height / 2, buttonWidth: buttonRect.width, headerWidth: node.getBoundingClientRect().width, align: getComputedStyle(node).alignItems };
  });
  assert.equal(centers.align, 'center');
  assert.ok(Math.abs(centers.title - centers.button) <= 1, `review center mismatch: ${centers.title} vs ${centers.button}`);
  assert.ok(centers.buttonWidth < centers.headerWidth / 2, 'review filter must keep intrinsic width');
  await performance.page.screenshot({ path: new URL('screenshots/performance-ko-KR-390.png', import.meta.url).pathname, fullPage: true });
  await performance.context.close();
  console.log('PASS: partner lounge IA, list→detail→back, 390/430 ko/en/vi hero geometry, review header alignment');
} finally {
  await browser.close();
}
