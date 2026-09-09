#!/usr/bin/env node
/**
 * Partner lounge browser verification against the real React source.
 *
 * This starts the checked-out Vite app with VITE_USE_MOCK=false, then replaces
 * every BFF response in the browser. It never creates a real session or writes
 * to a backend. Unknown API requests are aborted and reported.
 */
import { chromium } from '../../../../frontend/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../../..');
const frontend = join(repo, 'frontend');
const outDir = join(here, 'screenshots', 'product');
const port = Number(process.env.LOUNGE_VERIFY_PORT || 4179);
const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
const base = baseArg ? baseArg.slice('--base='.length).replace(/\/$/, '') : `http://127.0.0.1:${port}`;
const manageServer = !baseArg;
const chrome = process.env.PLAYWRIGHT_CHROME || '/home/doil/.cache/ms-playwright/chromium-1232/chrome-linux64/chrome';
mkdirSync(outDir, { recursive: true });

const USER_ID = '00000000-0000-4000-8000-000000000001';
const SHOPS = [
  {
    id: '10000000-0000-4000-8000-000000000001', name: 'Minh Phat Moto', category: 'repair',
    address: '12 Nguyen Dinh Chieu, District 3', latitude: 10.786, longitude: 106.692,
    phone: '090 123 4567', intro: 'Motorbike maintenance and repair', photo_content_id: null,
    photo_url: null, status: 'APPROVED', reject_reason: null, verification_status: 'verified',
    biz_license_content_id: null, signboard_content_id: null, rep_name: 'Minh',
    verified_at: '2026-08-20T02:00:00Z', verification_reject_reason: null,
    created_at: '2026-08-01T02:00:00Z', updated_at: '2026-09-01T02:00:00Z',
  },
  {
    id: '10000000-0000-4000-8000-000000000002', name: 'Thanh Dat Parts', category: 'parts',
    address: '88 Vo Van Tan, District 3', latitude: 10.779, longitude: 106.686,
    phone: '090 765 4321', intro: 'Parts and riding gear', photo_content_id: null,
    photo_url: null, status: 'APPROVED', reject_reason: null, verification_status: 'verified',
    biz_license_content_id: null, signboard_content_id: null, rep_name: 'Dat',
    verified_at: '2026-08-22T02:00:00Z', verification_reject_reason: null,
    created_at: '2026-08-02T02:00:00Z', updated_at: '2026-09-01T02:00:00Z',
  },
];

const USER = {
  id: USER_ID, phone: null, phone_verified: true, nickname: 'Lounge Owner', rider_type: null,
  level: 1, exp: 0, xp: 0, gold: 0, skill_pt: 0, avatar_url: null,
  manner_temp: 36.5, language: 'ko', consent_agreed_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

const ADS = {
  none: [],
  pending: [{
    id: '20000000-0000-4000-8000-000000000001', profile_id: SHOPS[0].id,
    tier_id: 'basic', tier_name: 'Basic', monthly_price_snapshot_vnd: 500000,
    title: 'September maintenance offer', body: 'Oil change promotion', image_url: null,
    review_status: 'PENDING', reject_reason: null, is_ongoing: true, starts_at: null,
    ends_at: null, created_at: '2026-09-01T00:00:00Z', subscription_status: 'pending_payment',
  }],
  normal: [{
    id: '20000000-0000-4000-8000-000000000002', profile_id: SHOPS[0].id,
    tier_id: 'basic', tier_name: 'Basic', monthly_price_snapshot_vnd: 500000,
    title: 'Safe riding inspection', body: 'Free brake inspection', image_url: null,
    review_status: 'APPROVED', reject_reason: null, is_ongoing: true,
    starts_at: '2026-09-01T00:00:00Z', ends_at: null,
    created_at: '2026-09-01T00:00:00Z', subscription_status: 'active',
  }],
};

const REVIEWS = {
  reviews: [
    { id: 'r1', rating: 5, body: 'Fast and careful service.', created_at: '2026-09-07T03:00:00Z', reviewer_nickname: 'An', owner_reply: null, owner_replied_at: null, hidden: false, hidden_reason_code: null, is_reported_by_me: false },
    { id: 'r2', rating: 4, body: 'Clear price and friendly staff.', created_at: '2026-09-05T03:00:00Z', reviewer_nickname: 'Bao', owner_reply: 'Thank you.', owner_replied_at: '2026-09-05T05:00:00Z', hidden: false, hidden_reason_code: null, is_reported_by_me: false },
  ],
  total: 2, unanswered_count: 1, avg_rating: 4.5, has_more: false,
};

function series(period = '7d') {
  const days = Number(period.slice(0, -1));
  const points = Array.from({ length: days }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    impressions: 120 + i * 9, reach: 90 + i * 7, clicks: 14 + i, cta_primary: 4 + (i % 3), cta_secondary: 2,
  }));
  return {
    period, period_days: days, series: points,
    totals: { impressions: 1050, reach: 790, clicks: 126, cta_call: 18, cta_follow: 10, cta_favorite: 7, cta_review: 4, cta_primary: 39, cta_secondary: 14 },
    previous: { impressions: 880, reach: 650, clicks: 91, cta_primary: 28, cta_secondary: 11 },
    by_ad: [{ ad_id: ADS.normal[0].id, title: ADS.normal[0].title, impressions: 1050, reach: 790, clicks: 126, cta_primary: 39, spend_vnd: 125000, review_status: 'APPROVED', is_ended: false }],
    spend_vnd: 125000, min_sample_for_ratio: 100, ctr: 12, cvr: 31, cpm_vnd: 119048, cpc_vnd: 992, cpa_vnd: 3205,
  };
}

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function fixtureFor(url, method, mode) {
  const path = url.pathname.replace(/^\/api\/bff/, '');
  if (path === '/auth/session/verify' && method === 'POST') return { user: USER };
  if (path === '/app-config') return { dm_poll_interval: 3600, google_client_id: '', is_dev: false, otp_dev_bypass: false, keyword_alert_max_count: 20 };
  if (path === '/app-version/current') return { primary: null, ios: null, android: null };
  if (path === '/dm/conversations') return [];
  if (path === '/tracking/screen-events' && method === 'POST') return {};
  if (path === '/users/me/language' && method === 'PUT') return {};
  if (path === '/biz/public/categories') return [
    { code: 'repair', group_code: 'service', group_label_ko: '서비스', group_label_vi: 'Dich vu', group_label_en: 'Services', icon: 'wrench', label_ko: '정비', label_vi: 'Sua xe', label_en: 'Repair', sort_order: 1 },
    { code: 'parts', group_code: 'shop', group_label_ko: '상점', group_label_vi: 'Cua hang', group_label_en: 'Shops', icon: 'package', label_ko: '부품', label_vi: 'Phu tung', label_en: 'Parts', sort_order: 2 },
  ];
  if (path === '/market/categories') return [];
  if (path === '/master/districts') return [];
  if (path === '/biz/profiles') return SHOPS;
  if (path === '/biz/ads') return ADS[mode.ads] ?? ADS.normal;
  const news = path.match(/^\/biz\/public\/([^/]+)\/news$/);
  if (news) return [{ id: 'n1', title: 'Weekend service hours', body: null, created_at: '2026-09-05T00:00:00Z', photos: [], photo_content_ids: [] }];
  const profile = path.match(/^\/biz\/public\/([^/]+)$/);
  if (profile) {
    const shop = SHOPS.find((item) => item.id === profile[1]) ?? SHOPS[0];
    return { ...shop, ads: ADS.normal, follower_count: 38, is_following: false, is_owner: true };
  }
  if (path === '/biz/reviews') return REVIEWS;
  const summary = path.match(/^\/biz\/profiles\/([^/]+)\/ad-stats-summary$/);
  if (summary) {
    if (mode.statsError) return { __error: 503, detail: 'fixture stats unavailable' };
    return { state: 'normal', period: '7d', period_days: 7, impressions: 1050, reach: 790, clicks: 126, cta_call: 18, cta_follow: 10, cta_favorite: 7, cta_review: 4, primary_cta_total: 39, cta_secondary: 14, min_sample_for_ratio: 100, ctr: 12, cvr: 31, ad_spend_vnd: 125000, cpm_vnd: 119048, cpc_vnd: 992, cpa_vnd: 3205, is_ended: false, ad_started_at: '2026-09-01T00:00:00Z', ad_ends_at: null };
  }
  const stats = path.match(/^\/biz\/profiles\/([^/]+)\/ad-stats-series$/);
  if (stats) {
    if (mode.statsError) return { __error: 503, detail: 'fixture stats unavailable' };
    return series(url.searchParams.get('period') || '7d');
  }
  return null;
}

async function waitForServer(child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Vite exited early (${child.exitCode})`);
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not start at ${base}`);
}

const server = manageServer
  ? spawn(join(frontend, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: frontend,
      env: { ...process.env, VITE_USE_MOCK: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  : null;
let serverLog = '';
server?.stdout.on('data', (chunk) => { serverLog += chunk; });
server?.stderr.on('data', (chunk) => { serverLog += chunk; });

const browser = await (async () => {
  try {
    if (server) await waitForServer(server);
    return await chromium.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox'] });
  } catch (error) {
    server?.kill('SIGTERM');
    throw new Error(`${error}\n${serverLog.slice(-1200)}`);
  }
})();

const report = [];
const failures = [];

async function openCase({ name, lang, width, ads = 'normal', statsError = false, tab = 'operations' }) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  await context.addCookies([{ name: 'sr_session', value: encodeURIComponent(JSON.stringify({ userId: USER_ID, sessionToken: 'browser-fixture-only' })), url: base }]);
  await context.addInitScript((language) => localStorage.setItem('sr-lang', language), lang);
  const page = await context.newPage();
  const unexpectedApi = [];
  const blockedExternal = [];
  const consoleErrors = [];
  const network = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('response', (response) => network.push(`${response.status()} ${response.url()}`));
  page.on('requestfailed', (request) => network.push(`FAILED ${request.url()} ${request.failure()?.errorText ?? ''}`));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base && url.pathname.startsWith('/api/')) {
      const fixture = fixtureFor(url, request.method(), { ads, statsError });
      if (fixture?.__error) return json(route, { detail: fixture.detail }, fixture.__error);
      if (fixture !== null) return json(route, fixture);
      unexpectedApi.push(`${request.method()} ${url.pathname}${url.search}`);
      return route.abort('blockedbyclient');
    }
    if (url.origin !== base) {
      blockedExternal.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  try {
    await page.goto(`${base}/biz/manage`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const nav = page.getByRole('tablist', { name: /파트너 라운지 메뉴|Partner lounge menu|Trình đơn không gian đối tác/i });
    await nav.waitFor({ state: 'visible', timeout: 15000 });
    if (tab === 'performance') await nav.getByRole('tab').nth(1).click();
    // App splash fades after bootstrap; capture only the settled product surface.
    await page.waitForTimeout(1500);
    if (tab === 'performance' && !statsError) {
      await page.getByRole('group', { name: /조회 기간|Date range|Khoảng thời gian/i }).waitFor();
      await page.getByRole('group', { name: /차트 지표|Chart metric|Chỉ số biểu đồ/i }).waitFor();
      if (await page.locator('[role="group"] button[aria-pressed="true"]').count() < 2) throw new Error('period/metric selected state is not exposed');
      await page.getByRole('button', { name: /고객 행동 정의 보기|View the customer actions definition|Xem định nghĩa hành động của khách/i }).waitFor();
      const dashboardPadding = await page.locator('#biz-dashboard-support').evaluate((element) => {
        const style = getComputedStyle(element.parentElement);
        return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
      });
      if (dashboardPadding.left < 15 || dashboardPadding.right < 15) throw new Error(`dashboard gutter is below 16px: ${JSON.stringify(dashboardPadding)}`);
    }
    const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (dimensions.scrollWidth > dimensions.clientWidth) throw new Error(`horizontal overflow ${dimensions.scrollWidth} > ${dimensions.clientWidth}`);
    const text = await page.locator('body').innerText();
    if (/\b(?:biz|common)\.[A-Za-z0-9_.-]+\b/.test(text)) throw new Error('raw i18n key visible');
    if (/\b(?:fixture|demo label|sample data)\b/i.test(text)) throw new Error('fixture/demo label visible');
    const unnamedButtons = await page.locator('button:visible').evaluateAll((buttons) => buttons
      .filter((button) => !((button.getAttribute('aria-label') || button.textContent || button.getAttribute('title') || '').trim()))
      .length);
    if (unnamedButtons) throw new Error(`${unnamedButtons} visible button(s) have no accessible name`);
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
    report.push({ name, lang, width, tab, ads, statsError, dimensions, unexpectedApi, blockedExternal, consoleErrors });
  } catch (error) {
    const diagnostic = await page.content().catch(() => 'BODY_UNAVAILABLE');
    await page.screenshot({ path: join(outDir, `${name}-FAILED.png`), fullPage: true }).catch(() => {});
    failures.push(`${name}: ${error}; url=${page.url()}; html=${diagnostic.slice(0, 800)}; api=${unexpectedApi.join(',')}; console=${consoleErrors.join(' | ')}; network=${network.slice(0, 30).join(' | ')}`);
  }
  return { page, context, unexpectedApi, consoleErrors };
}

try {
  const allCases = ['ko', 'en', 'vi'].flatMap((lang) => [360, 390, 430].map((width) => ({
    name: `${lang}-${width}-operations`, lang, width, ads: 'normal',
  }))).concat([
    { name: 'ko-390-operations-no-ads', lang: 'ko', width: 390, ads: 'none' },
    { name: 'en-430-operations-pending-payment', lang: 'en', width: 430, ads: 'pending' },
    { name: 'vi-360-performance-normal', lang: 'vi', width: 360, tab: 'performance' },
    { name: 'vi-390-performance-normal', lang: 'vi', width: 390, tab: 'performance' },
    { name: 'vi-430-performance-normal', lang: 'vi', width: 430, tab: 'performance' },
    { name: 'ko-360-performance-error', lang: 'ko', width: 360, tab: 'performance', statsError: true },
  ]);
  const smokeOnly = process.argv.includes('--smoke');
  const cases = smokeOnly ? allCases.slice(0, 1) : allCases;
  for (const testCase of cases) {
    const opened = await openCase(testCase);
    await opened.context.close();
  }

  const interaction = smokeOnly
    ? null
    : await openCase({ name: 'ko-360-interactions', lang: 'ko', width: 360, ads: 'normal' });
  if (interaction) {
  try {
    const { page } = interaction;
    const switcher = page.getByRole('button', { name: /관리할 가게 선택|Select shop to manage|Chọn cửa hàng để quản lý/i });
    await switcher.click();
    await page.getByText(SHOPS[1].name, { exact: true }).click();
    await page.getByRole('button', { name: /후기 관리|Manage reviews|Quản lý đánh giá/i }).click();
    await page.locator('#biz-dashboard-reviews').waitFor({ state: 'visible' });
    if (await page.evaluate(() => document.activeElement?.id) !== 'biz-dashboard-reviews') throw new Error('review entry did not focus review section');
    await page.getByRole('tab', { name: /운영|Operations|Vận hành/i }).click();
    await page.getByRole('button', { name: /광고 관련 도움|Ad support|Hỗ trợ quảng cáo/i }).click();
    await page.locator('#biz-dashboard-support').waitFor({ state: 'visible' });
    if (!await page.evaluate(() => Boolean(document.activeElement?.closest('#biz-dashboard-support')))) throw new Error('support entry did not focus support control');
    const ranges = page.getByRole('group', { name: /조회 기간|Date range|Khoảng thời gian/i });
    await page.getByRole('button', { name: /일별 표로 보기|View daily table|Xem bảng theo ngày/i }).click();
    for (const [index, days] of [7, 14, 30].entries()) {
      await ranges.getByRole('button').nth(index).click();
      await page.locator('table tbody tr').nth(days - 1).waitFor({ state: 'visible' });
      if (await page.locator('table tbody tr').count() !== days) throw new Error(`${days}-day table row count mismatch`);
      const pageWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      if (pageWidth.scroll > pageWidth.client) throw new Error(`${days}-day table causes page overflow`);
    }
    await page.getByRole('tab', { name: /운영|Operations|Vận hành/i }).click();
    await page.getByRole('button', { name: /매물 등록|Create listing|Đăng mặt hàng/i }).click();
    await page.waitForURL(/\/biz\/listings\/new/);
    await page.getByText(SHOPS[1].name, { exact: false }).waitFor();
    report.push({ name: 'shop context + review/support focus', status: 'PASS', finalShop: SHOPS[1].name });
  } catch (error) {
    failures.push(`interactions: ${error}`);
  } finally {
    await interaction.context.close();
  }
  }

  for (const item of report) {
    if (item.unexpectedApi?.length) failures.push(`${item.name}: unexpected APIs: ${item.unexpectedApi.join(', ')}`);
    const unexpectedConsole = item.consoleErrors?.filter((message) => !(item.statsError && message.includes('503'))) ?? [];
    if (unexpectedConsole.length) failures.push(`${item.name}: console errors: ${unexpectedConsole.join(' | ')}`);
  }
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}

console.log(JSON.stringify({ base, report, failures }, null, 2));
if (failures.length) process.exitCode = 1;
