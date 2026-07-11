#!/usr/bin/env node
/**
 * 동네지도 → BizPublic → 뒤로가기 상태 복원 검증 (sgr.map.bizReturn).
 * S1: 업체탭+칩+찜필터+포스트패널 → 카드탭 /biz → back → 전부 복원 + 스냅샷 소비 + 말풍선 재점화 없음
 * S2: 자동 말풍선 탭 → /biz → back → 말풍선/탭 복원
 * S3: 신규 진입(스냅샷 없음) → 기본 동작 그대로
 * S4: 스냅샷 잔존 + 탭바(PUSH) 진입 → 복원 안 함 + 스냅샷 폐기
 * (검증 전용 — 코드 수정 없음)
 */
import { chromium } from 'playwright-core';
import { homedir } from 'os';
import { existsSync } from 'fs';

const BASE = 'http://localhost:18090';
const EXE = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`;
if (!existsSync(EXE)) { console.error('no chromium'); process.exit(2); }

const DEEP = { N: 10.8101, S: 10.7981, E: 106.7168, W: 106.7048 };
const SNAP_KEY = 'sgr.map.bizReturn';

async function devLogin() {
  const res = await fetch(`${BASE}/api/bff/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '01085213251' }),
  });
  if (!res.ok) throw new Error(`dev-login failed: ${res.status}`);
  const body = await res.json();
  return { userId: body.user.id, sessionToken: body.session_token };
}

async function fetchBizItems(category) {
  const qs = new URLSearchParams({
    min_lat: String(DEEP.S), max_lat: String(DEEP.N), min_lng: String(DEEP.W), max_lng: String(DEEP.E),
  });
  if (category) qs.set('category', category);
  const res = await fetch(`${BASE}/api/bff/biz/public/map?${qs}`);
  return res.ok ? res.json() : [];
}

async function fetchCategories() {
  const res = await fetch(`${BASE}/api/bff/biz/public/categories`);
  return res.ok ? res.json() : [];
}

async function newPage(browser, session, { seedSnapshot } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{
    name: 'sr_session', value: encodeURIComponent(JSON.stringify(session)), url: BASE,
  }]);
  await context.addInitScript(({ bbox, snap }) => {
    localStorage.setItem('sr-lang', 'ko');
    localStorage.setItem('sgr.map.viewport', JSON.stringify(bbox));
    if (snap) sessionStorage.setItem('sgr.map.bizReturn', JSON.stringify(snap));
  }, { bbox: DEEP, snap: seedSnapshot ?? null });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${String(e).slice(0, 300)}`));
  return { context, page, consoleErrors };
}

const click = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}, sel);

const clickByText = (page, sel, text) => page.evaluate(({ s, t }) => {
  const el = Array.from(document.querySelectorAll(s)).find((x) => x.textContent?.includes(t));
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}, { s: sel, t: text });

const mapState = (page) => page.evaluate((key) => ({
  activeTab: document.querySelector('[class*="segActive"]')?.textContent ?? null,
  activeChip: document.querySelector('[class*="catChipActive"]')?.textContent ?? null,
  favPressed: document.querySelector('[class*="mapToolButton"][aria-pressed]')?.getAttribute('aria-pressed') ?? null,
  panelOpen: document.querySelectorAll('[class*="aboveRow"]').length > 0,
  focusedCardName: document.querySelector('[class*="card"] [class*="cardHead"] [class*="bizName"]')?.textContent ?? null,
  // 업체 teardrop 핀 선택 강조 = 링이 아닌 1.3x scale transform (SaigonMapV5 biz 분기)
  selectedPin: document.querySelectorAll('g[data-marker^="biz:"] g[transform*="scale(1.3)"]').length,
  bubbleCount: document.querySelectorAll('[class*="bizNewsBubble"]').length,
  bubbleText: document.querySelector('[class*="bizNewsBubble"]')?.textContent ?? null,
  snapshot: sessionStorage.getItem(key),
  url: location.pathname,
}), SNAP_KEY);

const results = {};

async function s1(browser, session) {
  const name = 'S1_back_restore_full';
  const { context, page, consoleErrors } = await newPage(browser, session);
  try {
    // 대상 선정: DEEP bbox 안에서 카테고리 보유 업체 (소식 보유 우선)
    const all = await fetchBizItems();
    const target = all.find((b) => b.category && b.latest_news) ?? all.find((b) => b.category);
    if (!target) { results[name] = { pass: false, error: 'no categorized biz in DEEP bbox' }; return; }
    const cats = await fetchCategories();
    const catLabel = cats.find((c) => c.code === target.category)?.label_ko;
    if (!catLabel) { results[name] = { pass: false, error: `no label for ${target.category}` }; return; }

    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await clickByText(page, '[class*="segBtn"]', '업체');
    await page.waitForTimeout(2500);
    const chipClicked = await clickByText(page, '[class*="catChip"]', catLabel);
    await page.waitForTimeout(2500); // 칩 → 카테고리 재조회
    const markerClicked = await click(page, `g[data-marker="${`biz:${target.id}`}"]`);
    await page.waitForTimeout(1200); // 포스트 패널
    const favBtnClicked = await click(page, '[class*="card"] [class*="favBtn"]'); // 대상 찜 (서버 반영)
    await page.waitForTimeout(800);
    const favToggleClicked = await click(page, '[class*="mapToolButton"][aria-pressed]'); // ♥ 찜 필터 ON
    await page.waitForTimeout(1500);
    const before = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s1_before_nav.png' });

    const cardTapped = await click(page, '[class*="card"] [class*="cardBody"]'); // 포커스 카드 → /biz/:id
    await page.waitForTimeout(1500);
    const onBiz = await page.evaluate((key) => ({ url: location.pathname, snapshot: sessionStorage.getItem(key) }), SNAP_KEY);
    const snap = onBiz.snapshot ? JSON.parse(onBiz.snapshot) : null;
    await page.screenshot({ path: 'tools/qm/shots/bizret_s1_biz_page.png' });

    await page.goBack();
    await page.waitForTimeout(4000); // remount + bbox 디바운스 + fetch + 복원
    const after = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s1_after_back.png' });
    await page.waitForTimeout(2000); // 조작 없이 대기 — 자동 말풍선 재점화 여부
    const quiet = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s1_after_quiet.png' });

    results[name] = {
      pass: chipClicked && markerClicked && favBtnClicked && favToggleClicked && cardTapped
        && onBiz.url === `/biz/${target.id}`
        && snap?.tab === 'biz' && snap?.bizCategory === target.category && snap?.favOnly === true
        && snap?.ui?.kind === 'postPanel' && snap?.ui?.bizId === target.id
        && after.activeTab?.includes('업체') && !!after.activeChip?.includes(catLabel)
        && after.favPressed === 'true' && after.panelOpen && after.focusedCardName === target.name
        && after.selectedPin > 0 && after.bubbleCount === 0 && after.snapshot === null
        && quiet.panelOpen && quiet.bubbleCount === 0,
      target: { id: target.id, name: target.name, category: target.category, catLabel },
      chipClicked, markerClicked, favBtnClicked, favToggleClicked, cardTapped,
      before, onBiz: { url: onBiz.url, snap }, after, quiet, consoleErrors,
      screenshots: ['tools/qm/shots/bizret_s1_before_nav.png', 'tools/qm/shots/bizret_s1_biz_page.png', 'tools/qm/shots/bizret_s1_after_back.png', 'tools/qm/shots/bizret_s1_after_quiet.png'],
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function s2(browser, session) {
  const name = 'S2_bubble_restore';
  const { context, page, consoleErrors } = await newPage(browser, session);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await clickByText(page, '[class*="segBtn"]', '업체');
    await page.waitForTimeout(2500);
    const before = await mapState(page);
    if (before.bubbleCount !== 1) { results[name] = { pass: false, error: 'auto bubble not shown', before }; return; }
    const bubbleClicked = await click(page, '[class*="bizNewsBubble"]');
    await page.waitForTimeout(1500);
    const onBiz = await page.evaluate((key) => ({ url: location.pathname, snapshot: sessionStorage.getItem(key) }), SNAP_KEY);
    const snap = onBiz.snapshot ? JSON.parse(onBiz.snapshot) : null;
    await page.goBack();
    await page.waitForTimeout(4000);
    const after = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s2_bubble_back.png' });
    results[name] = {
      pass: bubbleClicked && onBiz.url.startsWith('/biz/')
        && snap?.tab === 'biz' && snap?.ui?.kind === 'bubble'
        && after.activeTab?.includes('업체') && after.bubbleCount === 1
        && after.bubbleText === before.bubbleText && after.snapshot === null && !after.panelOpen,
      bubbleClicked, before, onBiz: { url: onBiz.url, snap }, after, consoleErrors,
      screenshot: 'tools/qm/shots/bizret_s2_bubble_back.png',
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function s3(browser, session) {
  const name = 'S3_fresh_entry_default';
  const { context, page, consoleErrors } = await newPage(browser, session);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const st = await mapState(page);
    const chipsOverlay = await page.evaluate(() => document.querySelectorAll('[class*="chipsOverlay"]').length);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s3_fresh.png' });
    results[name] = {
      pass: !!st.activeTab?.includes('매물') && chipsOverlay === 0 && !st.panelOpen && st.snapshot === null,
      st, chipsOverlay, consoleErrors,
      screenshot: 'tools/qm/shots/bizret_s3_fresh.png',
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function s4(browser, session) {
  const name = 'S4_push_entry_discards_snapshot';
  const staleSnap = { tab: 'biz', bizCategory: null, favOnly: false, ui: { kind: 'none' }, savedAt: Date.now() };
  const { context, page, consoleErrors } = await newPage(browser, session, { seedSnapshot: staleSnap });
  try {
    await page.goto(`${BASE}/home`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const tabClicked = await click(page, 'a[href="/map"]'); // 탭바 NavLink → PUSH
    await page.waitForTimeout(3000);
    const st = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s4_push_entry.png' });
    results[name] = {
      pass: tabClicked && st.url === '/map' && !!st.activeTab?.includes('매물') && st.snapshot === null && !st.panelOpen,
      tabClicked, st, consoleErrors,
      screenshot: 'tools/qm/shots/bizret_s4_push_entry.png',
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function main() {
  const session = await devLogin();
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  await s1(browser, session);
  await s2(browser, session);
  await s3(browser, session);
  await s4(browser, session);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
