#!/usr/bin/env node
/**
 * 동네지도 → 상세 3종 전체화면 오버레이 회귀 검증 (2026-07-12 오버레이 전환).
 * 스냅샷 복원 장치(sgr.map.bizReturn)는 비활성 — 상세 진입이 backgroundLocation
 * 라우트-모달 오버레이가 되어 지도가 언마운트되지 않으므로, "오버레이 열림(지도 DOM 잔존)
 * → back → 오버레이 닫힘 + 지도 상태 그대로 + 스냅샷 미저장"을 본다.
 * S1: 업체탭+칩+찜필터+포스트패널 → 카드탭 /biz/:id 오버레이 → back → 상태 유지 + 스냅샷 없음
 * S2: 자동 말풍선 탭 → /biz 오버레이 → back → 말풍선 그대로
 * S3: 신규 진입 기본값 (업체 탭 + '전체' 칩, 스냅샷 없음)
 * S4: 잔존 스냅샷 키 + 탭바(PUSH) 진입 → 키 정리 이펙트가 제거 + 기본 상태
 * (검증 전용 — 코드 수정 없음)
 */
import { chromium } from 'playwright-core';
import { homedir } from 'os';
import { existsSync } from 'fs';

const BASE = 'http://localhost:18090';
const EXE = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`;
if (!existsSync(EXE)) { console.error('no chromium'); process.exit(2); }

const DEEP = { N: 10.80885, S: 10.79935, E: 106.71555, W: 106.70605 };
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
  // 업체 teardrop 핀 선택 강조 = 링이 아닌 1.5x scale transform (SaigonMapV5 biz 분기)
  selectedPin: document.querySelectorAll('g[data-marker^="biz:"] g[transform*="scale(1.5)"]').length,
  bubbleCount: document.querySelectorAll('[class*="bizNewsBubble"]').length,
  bubbleText: document.querySelector('[class*="bizNewsBubble"]')?.textContent ?? null,
  // 오버레이 레이어(App.module.css detailOverlay) + 배경 지도 DOM 잔존 여부
  overlayOpen: !!document.querySelector('[class*="detailOverlay"]'),
  mapAlive: !!document.querySelector('[class*="segBtn"]'),
  snapshot: sessionStorage.getItem(key),
  url: location.pathname,
}), SNAP_KEY);

const results = {};

async function s1(browser, session) {
  const name = 'S1_overlay_card_tap_back';
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
    // 대상 찜 (서버 반영) — 찜 상태는 서버에 실행 간 지속되므로 이미 찜(aria-pressed=true)이면
    // 클릭하지 않는다. 무조건 클릭하면 매 실행 토글되어 격회차마다 핀이 찜 필터에 걸러져
    // selectedPin=0 으로 실패하는 비멱등 플레이크가 있었음 (2026-07-12 관찰: F/T 정확히 교대).
    const favBtnClicked = await page.evaluate(() => {
      const el = document.querySelector('[class*="card"] [class*="favBtn"]');
      if (!el) return false;
      if (el.getAttribute('aria-pressed') !== 'true') {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
      return true;
    });
    await page.waitForTimeout(800);
    const favToggleClicked = await click(page, '[class*="mapToolButton"][aria-pressed]'); // ♥ 찜 필터 ON
    await page.waitForTimeout(1500);
    const before = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s1_before_nav.png' });

    const cardTapped = await click(page, '[class*="card"] [class*="cardBody"]'); // 포커스 카드 → /biz/:id 오버레이
    await page.waitForTimeout(1500);
    const onBiz = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s1_biz_overlay.png' });

    await page.goBack();
    await page.waitForTimeout(1500); // 오버레이 닫힘 — 지도 remount 없음, 복원 대기 불필요
    const after = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s1_after_back.png' });
    await page.waitForTimeout(2000); // 조작 없이 대기 — 자동 말풍선 재점화 여부
    const quiet = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s1_after_quiet.png' });

    results[name] = {
      pass: chipClicked && markerClicked && favBtnClicked && favToggleClicked && cardTapped
        // 오버레이 열림: URL 은 상세, 지도 DOM 잔존, 스냅샷 미저장
        && onBiz.url === `/biz/${target.id}` && onBiz.overlayOpen && onBiz.mapAlive && onBiz.snapshot === null
        // back: 오버레이만 닫히고 탭/칩/찜/패널/선택핀 상태 그대로
        && !after.overlayOpen && after.url === '/map'
        && after.activeTab?.includes('업체') && !!after.activeChip?.includes(catLabel)
        && after.favPressed === 'true' && after.panelOpen && after.focusedCardName === target.name
        && after.selectedPin > 0 && after.bubbleCount === 0 && after.snapshot === null
        && quiet.panelOpen && quiet.bubbleCount === 0,
      target: { id: target.id, name: target.name, category: target.category, catLabel },
      chipClicked, markerClicked, favBtnClicked, favToggleClicked, cardTapped,
      before, onBiz, after, quiet, consoleErrors,
      screenshots: ['tools/qm/shots/bizret_s1_before_nav.png', 'tools/qm/shots/bizret_s1_biz_overlay.png', 'tools/qm/shots/bizret_s1_after_back.png', 'tools/qm/shots/bizret_s1_after_quiet.png'],
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function s2(browser, session) {
  const name = 'S2_overlay_bubble_tap_back';
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
    const onBiz = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s2_biz_overlay.png' });
    await page.goBack();
    await page.waitForTimeout(1500);
    const after = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s2_bubble_back.png' });
    results[name] = {
      pass: bubbleClicked
        && onBiz.url.startsWith('/biz/') && onBiz.overlayOpen && onBiz.mapAlive && onBiz.snapshot === null
        && !after.overlayOpen && after.url === '/map'
        && after.activeTab?.includes('업체') && after.bubbleCount === 1
        && after.bubbleText === before.bubbleText && after.snapshot === null && !after.panelOpen,
      bubbleClicked, before, onBiz, after, consoleErrors,
      screenshots: ['tools/qm/shots/bizret_s2_biz_overlay.png', 'tools/qm/shots/bizret_s2_bubble_back.png'],
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
      // 기본 탭이 업체로 변경 (2026-07-12) — 칩 행은 노출되되 '전체'가 기본 선택
      pass: !!st.activeTab?.includes('업체') && chipsOverlay === 1 && !!st.activeChip?.includes('전체') && !st.panelOpen && st.snapshot === null && !st.overlayOpen,
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
  const name = 'S4_stale_snapshot_key_cleanup';
  // 스냅샷 복원 장치 비활성 (2026-07-12) — 과거 세션의 잔존 키가 있어도 진입 시 정리
  // 이펙트가 제거하고 기본 상태로 시작하는지 본다 (복원 미동작 확인 겸용).
  const staleSnap = { tab: 'listings', bizCategory: null, favOnly: false, ui: { kind: 'none' }, savedAt: Date.now() };
  const { context, page, consoleErrors } = await newPage(browser, session, { seedSnapshot: staleSnap });
  try {
    await page.goto(`${BASE}/home`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const tabClicked = await click(page, 'a[href="/map"]'); // 탭바 NavLink → PUSH
    await page.waitForTimeout(3000);
    const st = await mapState(page);
    await page.screenshot({ path: 'tools/qm/shots/bizret_s4_push_entry.png' });
    results[name] = {
      pass: tabClicked && st.url === '/map' && !!st.activeTab?.includes('업체') && st.snapshot === null && !st.panelOpen,
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
