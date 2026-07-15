#!/usr/bin/env node
/**
 * 프로필 메인 드래거블 시트 — 스크롤 격리 검증.
 * ① 시트를 올린 뒤 내부 콘텐츠를 크게 스크롤해도 그랩 핸들이 시트 상단에 그대로 보이는지
 * ② 시트 상단(라운드 경계) y좌표가 스크롤 전후 불변인지
 * 결과 JSON을 stdout에 출력한다. (검증 전용 — 코드 수정 없음)
 */
import { chromium } from 'playwright-core';
import { homedir } from 'os';
import { existsSync } from 'fs';

const BASE = 'http://localhost:18090';
const EXE = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`;
if (!existsSync(EXE)) { console.error('no chromium'); process.exit(2); }

async function devLogin() {
  const res = await fetch(`${BASE}/api/bff/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '01085213251' }),
  });
  if (!res.ok) throw new Error(`dev-login failed: ${res.status}`);
  const body = await res.json();
  return { userId: body.user.id, sessionToken: body.session_token };
}

const session = await devLogin();
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await context.addCookies([{
  name: 'sr_session',
  value: encodeURIComponent(JSON.stringify(session)),
  url: BASE,
}]);
await context.addInitScript(() => { localStorage.setItem('sr-lang', 'ko'); });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${String(e).slice(0, 300)}`));

const result = { pass: false };
try {
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // ── 시트 올리기: 핸들에서 위로 터치 드래그 (실제 제스처 경로) ──
  const raised = await page.evaluate(async () => {
    const grabber = document.querySelector('[class*="sheetGrabber"]');
    if (!grabber) return { ok: false, why: 'no grabber' };
    const sheet = grabber.parentElement?.parentElement; // grabber < handle < sheet
    if (!sheet) return { ok: false, why: 'no sheet' };
    const r = grabber.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const mk = (y) => new Touch({ identifier: 1, target: grabber, clientX: x, clientY: y });
    const fire = (type, y, ended = false) => grabber.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: ended ? [] : [mk(y)], targetTouches: ended ? [] : [mk(y)], changedTouches: [mk(y)],
    }));
    fire('touchstart', y0);
    for (let i = 1; i <= 12; i++) {
      fire('touchmove', y0 - (600 / 12) * i);
      await new Promise((res) => setTimeout(res, 16));
    }
    fire('touchend', y0 - 600, true);
    await new Promise((res) => setTimeout(res, 600)); // top transition .3s + scrollable timer 100ms
    return { ok: true, sheetTopAfterRaise: sheet.getBoundingClientRect().top };
  });
  result.raised = raised;

  // ── 스크롤 전 측정 + 스크린샷 ──
  const before = await page.evaluate(() => {
    const grabber = document.querySelector('[class*="sheetGrabber"]');
    const body = document.querySelector('[class*="sheetBody"]');
    const sheet = grabber?.parentElement?.parentElement;
    if (!grabber || !body || !sheet) return null;
    const g = grabber.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    return { grabberTop: g.top, grabberVisible: g.height > 0 && g.top >= s.top, sheetTop: s.top, scrollTop: body.scrollTop, overflowY: getComputedStyle(body).overflowY };
  });
  result.before = before;
  await page.screenshot({ path: 'tools/qm/shots/profile_sheet_before_scroll.png' });

  // ── 내부 콘텐츠 크게 스크롤 ──
  const after = await page.evaluate(async () => {
    const body = document.querySelector('[class*="sheetBody"]');
    if (!body) return null;
    body.scrollTop = 800;
    await new Promise((res) => setTimeout(res, 300));
    const grabber = document.querySelector('[class*="sheetGrabber"]');
    const sheet = grabber?.parentElement?.parentElement;
    const g = grabber.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    return { grabberTop: g.top, grabberVisible: g.height > 0 && g.top >= s.top, sheetTop: s.top, scrollTop: body.scrollTop };
  });
  result.after = after;
  await page.screenshot({ path: 'tools/qm/shots/profile_sheet_after_scroll.png' });

  result.pass = !!(before && after
    && after.scrollTop > 100                               // 내부 스크롤이 실제로 일어남
    && after.grabberVisible                                 // 핸들이 여전히 보임
    && Math.abs(after.grabberTop - before.grabberTop) < 1   // 핸들 y 불변
    && Math.abs(after.sheetTop - before.sheetTop) < 1);     // 시트 상단 라운드 경계 y 불변
  result.consoleErrors = consoleErrors;
} catch (e) {
  result.error = String(e);
} finally {
  await browser.close();
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
