/* global process, localStorage, history, document, getComputedStyle, requestAnimationFrame, console, URL, fetch, setTimeout */
/* eslint-disable no-console */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '../../..');
const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
const port = Number(process.env.BIZ_UI_PORT || 4180);
const base = (baseArg?.slice('--base='.length) ?? process.env.BIZ_UI_BASE_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');
const manageServer = !baseArg && !process.env.BIZ_UI_BASE_URL;
const executablePath = process.env.PLAYWRIGHT_CHROME || '/usr/bin/google-chrome';

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

async function waitForServer() {
  if (!server) return;
  for (let i = 0; i < 80; i += 1) {
    if (server.exitCode !== null) throw new Error(`Vite exited early (${server.exitCode})\n${serverLog.slice(-1200)}`);
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not start at ${base}\n${serverLog.slice(-1200)}`);
}

await waitForServer();
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const USER = {
  id: USER_ID, phone: null, phone_verified: true, nickname: 'UI Fixture Owner', rider_type: null,
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
const CATEGORY = {
  code: 'repair', group_code: 'service', group_label_ko: '서비스', group_label_vi: 'Dịch vụ',
  group_label_en: 'Services', icon: 'wrench', label_ko: '정비', label_vi: 'Sửa xe',
  label_en: 'Repair', sort_order: 1,
};

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function commonFixture(url, method) {
  const path = url.pathname.replace(/^\/api\/bff/, '');
  if (path === '/auth/session/verify' && method === 'POST') return { user: USER };
  if (path === '/app-config') return { dm_poll_interval: 3600, google_client_id: '', is_dev: false, otp_dev_bypass: false, keyword_alert_max_count: 20 };
  if (path === '/app-version/current') return { primary: null, ios: null, android: null };
  if (path === '/dm/conversations') return [];
  if (path === '/tracking/screen-events' && method === 'POST') return {};
  if (path === '/users/me/language' && method === 'PUT') return {};
  if (path === '/biz/public/categories') return [CATEGORY];
  if (path === '/market/categories' || path === '/master/districts') return [];
  if (path === '/biz/profiles') return [PROFILE];
  if (path === '/biz/ads') return [];
  return null;
}

async function openManagedPage(path, profileState, width, language, pageFixture) {
  const context = await browser.newContext({ viewport: { width, height: 820 }, locale: language });
  await context.addCookies([{
    name: 'sr_session',
    value: encodeURIComponent(JSON.stringify({ userId: USER_ID, sessionToken: 'browser-fixture-only' })),
    url: base,
  }]);
  await context.addInitScript((lang) => localStorage.setItem('sr-lang', lang), language.slice(0, 2));
  const page = await context.newPage();
  const unexpectedApi = [];
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base && url.pathname.startsWith('/api/')) {
      const fixture = pageFixture(url, request.method()) ?? commonFixture(url, request.method());
      if (fixture !== null) return json(route, fixture);
      unexpectedApi.push(`${request.method()} ${url.pathname}${url.search}`);
      return route.abort('blockedbyclient');
    }
    if (url.origin !== base) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ nextPath, state }) => {
    history.replaceState({ usr: state, key: 'biz-ui-test', idx: 0 }, '', nextPath);
  }, { nextPath: path, state: profileState });
  await page.reload({ waitUntil: 'domcontentloaded' });
  return { context, page, unexpectedApi, consoleErrors };
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.width, `${label}: horizontal overflow ${dimensions.scrollWidth} > ${dimensions.width}`);
}

try {
  for (const [width, language] of [[360, 'ko-KR'], [390, 'en-US'], [430, 'vi-VN']]) {
    let deleteCalls = 0;
    const opened = await openManagedPage('/biz/prices', { profileId: PROFILE_ID }, width, language, (url, method) => {
      const path = url.pathname.replace(/^\/api\/bff/, '');
      if (path === `/biz/public/${PROFILE_ID}/prices` && method === 'GET') return [
        { id: 'price-1', name: 'Oil change', price_vnd: 150000, sort_order: 0, created_at: '2026-09-09T00:00:00Z' },
      ];
      if (path === '/biz/prices/price-1' && method === 'DELETE') { deleteCalls += 1; return {}; }
      return null;
    });
    const { context, page, unexpectedApi, consoleErrors } = opened;
    await page.locator('h1').filter({ hasText: /가격표 관리|Manage price list|Quản lý bảng giá/ }).waitFor();
    await assertNoOverflow(page, `price ${language} ${width}`);
    await page.getByRole('button', { name: /가격표 삭제|Delete price|Xóa mục giá/ }).last().click();
    await page.getByRole('button', { name: /가격표 삭제|Delete price|Xóa mục giá/ }).last().click();
    await page.getByText('Oil change').waitFor({ state: 'detached' });
    assert.equal(deleteCalls, 1, 'price delete must issue exactly one request');
    assert.deepEqual(unexpectedApi, [], `price unexpected APIs: ${unexpectedApi.join(', ')}`);
    assert.deepEqual(consoleErrors, [], `price console errors: ${consoleErrors.join(' | ')}`);
    await context.close();
  }

  for (const [width, language] of [[360, 'ko-KR'], [390, 'en-US'], [430, 'vi-VN']]) {
    let deleteCalls = 0;
    const opened = await openManagedPage('/biz/news', { profileId: PROFILE_ID }, width, language, (url, method) => {
      const path = url.pathname.replace(/^\/api\/bff/, '');
      if (path === `/biz/public/${PROFILE_ID}/news` && method === 'GET') return [
        { id: 'news-1', title: 'Weekend hours', body: 'Open until 8 PM', created_at: '2026-09-09T00:00:00Z', photos: [], photo_content_ids: [] },
      ];
      if (path === '/biz/news/news-1' && method === 'DELETE') { deleteCalls += 1; return {}; }
      return null;
    });
    const { context, page, unexpectedApi, consoleErrors } = opened;
    await page.getByText('Weekend hours').waitFor();
    await assertNoOverflow(page, `news ${language} ${width}`);
    await page.getByRole('button', { name: /소식 삭제|Delete news|Xóa tin tức/ }).click();
    await page.getByRole('button', { name: /소식 삭제|Delete news|Xóa tin tức/ }).last().click();
    await page.getByText('Weekend hours').waitFor({ state: 'detached' });
    assert.equal(deleteCalls, 1, 'news delete must issue exactly one request');
    assert.deepEqual(unexpectedApi, [], `news unexpected APIs: ${unexpectedApi.join(', ')}`);
    assert.deepEqual(consoleErrors, [], `news console errors: ${consoleErrors.join(' | ')}`);
    await context.close();
  }

  const opened = await openManagedPage('/biz/manage', null, 390, 'ko-KR', () => null);
  const { context, page, unexpectedApi, consoleErrors } = opened;
  const tabs = page.getByRole('tablist', { name: /파트너 라운지 메뉴|Partner lounge menu|Trình đơn không gian đối tác/ });
  await tabs.waitFor();
  const before = await tabs.evaluate((node) => {
    const body = node.parentElement;
    const identity = node.previousElementSibling;
    if (!body || !identity) throw new Error('sticky DOM ownership missing');
    return {
      bodyTop: body.getBoundingClientRect().top,
      tabsTop: node.getBoundingClientRect().top,
      identityTop: identity.getBoundingClientRect().top,
      position: getComputedStyle(node).position,
      overflowY: getComputedStyle(body).overflowY,
      scrollable: body.scrollHeight > body.clientHeight,
    };
  });
  assert.equal(before.position, 'sticky');
  assert.match(before.overflowY, /auto|scroll/);
  assert.equal(before.scrollable, true, 'BizManage body must be the actual scroll ancestor');
  await tabs.evaluate((node) => { node.parentElement.scrollTop = 260; });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await tabs.evaluate((node) => ({
    bodyTop: node.parentElement.getBoundingClientRect().top,
    tabsTop: node.getBoundingClientRect().top,
    identityTop: node.previousElementSibling.getBoundingClientRect().top,
  }));
  assert.ok(Math.abs(after.tabsTop - after.bodyTop) <= 1, `sticky tabs top ${after.tabsTop} != scroll body top ${after.bodyTop}`);
  assert.ok(after.identityTop < before.identityTop, 'store identity must scroll away');
  assert.deepEqual(unexpectedApi, [], `manage unexpected APIs: ${unexpectedApi.join(', ')}`);
  assert.deepEqual(consoleErrors, [], `manage console errors: ${consoleErrors.join(' | ')}`);
  await context.close();

  console.log('PASS: price/news delete + 360/390/430 ko/en/vi overflow + BizManage sticky geometry');
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}
