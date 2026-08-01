#!/usr/bin/env node
/**
 * QM 스크린샷/스모크 하네스 — 웹앱 화면을 헤드리스 크로미움으로 열어
 * 스크린샷 + 콘솔 에러 + 실패한 네트워크 요청을 JSON으로 보고한다.
 *
 * 사용:
 *   node qm-shot.mjs <route> <out.png> [--phone 01085213251] [--no-login] [--wait 2000]
 *   예) node qm-shot.mjs /market /tmp/market.png
 *
 * 전제: dev 스택(:18090) 기동, APP_ENV=dev (dev-login 사용).
 * 브라우저: ~/.cache/ms-playwright 의 chromium_headless_shell (버전은 EXE 후보에서 자동 탐색).
 */
import { chromium } from 'playwright-core';
import { homedir } from 'os';
import { existsSync } from 'fs';

const BASE = process.env.QM_BASE_URL ?? 'http://localhost:18090';
const EXE_CANDIDATES = [
  'chromium_headless_shell-1229/chrome-headless-shell-linux64/chrome-headless-shell',
  'chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
  'chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',
  'chromium-1229/chrome-linux64/chrome',
].map((p) => `${homedir()}/.cache/ms-playwright/${p}`);

const args = process.argv.slice(2);
const route = args[0] ?? '/';
const outPath = args[1] ?? 'qm-shot.png';
const phone = args.includes('--phone') ? args[args.indexOf('--phone') + 1] : '01085213251';
const noLogin = args.includes('--no-login');
const extraWait = args.includes('--wait') ? parseInt(args[args.indexOf('--wait') + 1], 10) : 1500;

const exe = EXE_CANDIDATES.find(existsSync);
if (!exe) {
  console.error(JSON.stringify({ error: 'no chromium found in ~/.cache/ms-playwright' }));
  process.exit(2);
}

const report = { route, consoleErrors: [], failedRequests: [], title: null, finalUrl: null };

let session = null;
if (!noLogin) {
  const res = await fetch(`${BASE}/api/bff/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    console.error(JSON.stringify({ error: `dev-login failed: ${res.status}` }));
    process.exit(2);
  }
  const body = await res.json();
  session = { userId: body.user.id, sessionToken: body.session_token };
}

const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
if (session) {
  await context.addCookies([{
    name: 'sr_session',
    value: encodeURIComponent(JSON.stringify(session)),
    url: BASE,
  }]);
}
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => report.consoleErrors.push(`[pageerror] ${String(e).slice(0, 300)}`));
page.on('response', (r) => {
  if (r.status() >= 400) report.failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`);
});

try {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 25000 });
} catch (e) {
  report.gotoError = String(e).slice(0, 200); // networkidle 타임아웃이어도 스크린샷은 남긴다
}
await page.waitForTimeout(extraWait);
report.title = await page.title();
report.finalUrl = page.url().replace(BASE, '');
await page.screenshot({ path: outPath, fullPage: false });
await browser.close();

console.log(JSON.stringify(report, null, 2));
