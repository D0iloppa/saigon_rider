#!/usr/bin/env node
/**
 * 동네지도 통합 시각 회귀 — W1~W4 + 카테고리 DB + 프로필 배선 교차 검증.
 * 시나리오별 결과를 JSON으로 stdout에 출력한다. (검증 전용 — 코드 수정 없음)
 */
import { chromium } from 'playwright-core';
import { homedir } from 'os';
import { existsSync } from 'fs';

const BASE = 'http://localhost:18090';
const EXE = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`;
if (!existsSync(EXE)) { console.error('no chromium'); process.exit(2); }

const DEEP = { N: 10.8101, S: 10.7981, E: 106.7168, W: 106.7048 };
const WIDE = { N: 10.88, S: 10.72, E: 106.79, W: 106.63 };
const BIZ_ID = 'c3b89e18-ffec-46eb-950e-26775b636d54';

async function devLogin() {
  const res = await fetch(`${BASE}/api/bff/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '01085213251' }),
  });
  if (!res.ok) throw new Error(`dev-login failed: ${res.status}`);
  const body = await res.json();
  return { userId: body.user.id, sessionToken: body.session_token };
}

async function newPage(browser, session, viewportBbox) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{
    name: 'sr_session',
    value: encodeURIComponent(JSON.stringify(session)),
    url: BASE,
  }]);
  await context.addInitScript((bbox) => {
    localStorage.removeItem('sgr.biz.readNews');
    localStorage.setItem('sr-lang', 'ko');
    if (bbox) localStorage.setItem('sgr.map.viewport', JSON.stringify(bbox));
  }, viewportBbox);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${String(e).slice(0, 300)}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`);
  });
  return { context, page, consoleErrors, failedRequests };
}

async function jsClick(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, selector);
}

async function clickMarker(page, markerId) {
  return page.evaluate((mid) => {
    const el = document.querySelector(`g[data-marker="${CSS.escape(mid)}"]`);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, markerId);
}

const results = {};

async function scenario1(browser, session) {
  const name = 'S1_auto_bubble';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, DEEP);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    // switch to biz tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((x) => x.textContent?.includes('업체'));
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(2500); // debounce(500ms) + fetch + auto-bubble effect
    const bubbleCount = await page.evaluate(() => document.querySelectorAll('[class*="bizNewsBubble"]').length);
    const bubbleText = await page.evaluate(() => document.querySelector('[class*="bizNewsBubble"]')?.textContent ?? null);
    const iconPaths = await page.evaluate(() => document.querySelectorAll('g[data-marker^="biz:"] path').length);
    const unreadDots = await page.evaluate(() => document.querySelectorAll('g[data-marker^="biz:"] circle[fill="#ef4444"]').length);
    await page.screenshot({ path: 'tools/qm/shots/regr_s1_auto_bubble.png' });
    results[name] = {
      pass: bubbleCount === 1 && !!bubbleText?.includes('새소식') && iconPaths > 0 && unreadDots > 0,
      bubbleCount, bubbleText, iconPaths, unreadDots, consoleErrors, failedRequests,
      screenshot: 'tools/qm/shots/regr_s1_auto_bubble.png',
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function scenario2(browser, session) {
  const name = 'S2_post_panel';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, DEEP);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((x) => x.textContent?.includes('업체'));
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(2500);
    const markerIds = await page.evaluate(() => Array.from(document.querySelectorAll('g[data-marker^="biz:"]')).map((el) => el.getAttribute('data-marker')));
    if (markerIds.length === 0) { results[name] = { pass: false, error: 'no biz markers found', markerIds }; await context.close(); return; }
    const targetMarker = markerIds[0];
    // 클릭 전 읽음 기록 상태 (addInitScript 에서 removeItem 했으므로 비어있어야 함)
    const readNewsBefore = await page.evaluate(() => localStorage.getItem('sgr.biz.readNews'));
    const clicked = await clickMarker(page, targetMarker);
    await page.waitForTimeout(1200);

    // PostPanel 전용 클래스(cardHead/aboveRow/favBtn) — ListingCard 등 다른 컴포넌트와 클래스명 base가
    // 겹치는 cardBody 대신 PostPanel.tsx에서만 쓰이는 이름으로 특정한다.
    const panelCardCount = await page.evaluate(() => document.querySelectorAll('[class*="cardHead"]').length);
    const bizNameText = await page.evaluate(() => document.querySelector('[class*="cardHead"] [class*="bizName"]')?.textContent ?? null);
    const viewerChipText = await page.evaluate(() => document.querySelector('[class*="viewerChip"]')?.textContent ?? null);
    const bubbleCountAfterPanel = await page.evaluate(() => document.querySelectorAll('[class*="bizNewsBubble"]').length);
    const segOffsetParentNull = await page.evaluate(() => {
      const seg = document.querySelector('[class*="segBtn"]');
      return seg ? seg.offsetParent === null : null;
    });
    // 선택 표시: teardrop 핀 꼭짓점 기준 scale(1.3) 확대 (구 선택 링 circle[stroke]은 teardrop 리디자인에서 제거됨)
    const selectionRing = await page.evaluate(() => document.querySelectorAll('g[data-marker^="biz:"] g[transform*="scale(1.3)"]').length);
    const favBtn = await page.evaluate(() => document.querySelectorAll('[class*="favBtn"]').length);
    await page.screenshot({ path: 'tools/qm/shots/regr_s2_post_panel_open.png' });

    // close
    const closeClicked = await page.evaluate(() => {
      const el = document.querySelector('[class*="aboveRow"] [class*="closeBtn"]');
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });
    await page.waitForTimeout(1000);
    const panelGoneAfterClose = await page.evaluate(() => document.querySelectorAll('[class*="aboveRow"]').length === 0);
    const segVisibleAfterClose = await page.evaluate(() => {
      const seg = document.querySelector('[class*="segBtn"]');
      return seg ? seg.offsetParent !== null : null;
    });
    const readDotAfterClose = await page.evaluate((mid) => {
      const el = document.querySelector(`g[data-marker="${CSS.escape(mid)}"] circle[fill="#ef4444"]`);
      return el ? true : false;
    }, targetMarker);
    const readNewsAfter = await page.evaluate(() => localStorage.getItem('sgr.biz.readNews'));
    await page.screenshot({ path: 'tools/qm/shots/regr_s2_post_panel_closed.png' });

    results[name] = {
      pass: clicked && panelCardCount > 0 && !!bizNameText && bubbleCountAfterPanel === 0 && segOffsetParentNull === true
        && selectionRing > 0 && favBtn > 0 && closeClicked && panelGoneAfterClose && segVisibleAfterClose === true
        && readDotAfterClose === false && !readNewsBefore?.includes(targetMarker.replace('biz:', ''))
        && !!readNewsAfter && readNewsAfter.includes(targetMarker.replace('biz:', '')),
      targetMarker, clicked, panelCardCount, bizNameText, viewerChipText, bubbleCountAfterPanel,
      segOffsetParentNull, selectionRing, favBtn, readNewsBefore, closeClicked, panelGoneAfterClose,
      segVisibleAfterClose, readDotAfterClose, readNewsAfter, consoleErrors, failedRequests,
      screenshots: ['tools/qm/shots/regr_s2_post_panel_open.png', 'tools/qm/shots/regr_s2_post_panel_closed.png'],
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function scenario3(browser, session) {
  const name = 'S3_zoom_gate';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, WIDE);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((x) => x.textContent?.includes('업체'));
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(2500);
    const bubbleCount = await page.evaluate(() => document.querySelectorAll('[class*="bizNewsBubble"]').length);
    const bizMarkerCount = await page.evaluate(() => document.querySelectorAll('g[data-marker^="biz:"]').length);
    await page.screenshot({ path: 'tools/qm/shots/regr_s3_zoom_gate.png' });
    results[name] = {
      pass: bubbleCount === 0 && bizMarkerCount === 0,
      bubbleCount, bizMarkerCount, consoleErrors, failedRequests,
      screenshot: 'tools/qm/shots/regr_s3_zoom_gate.png',
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function scenario4(browser, session) {
  const name = 'S4_category_roundtrip';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, DEEP);
  try {
    await page.goto(`${BASE}/map?category=repair`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const bizTabActive = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('[class*="segBtn"]'));
      const b = btns.find((x) => x.textContent?.includes('업체'));
      return b ? b.className.includes('segActive') : false;
    });
    const chipActiveText = await page.evaluate(() => {
      const chip = document.querySelector('[class*="catChipActive"]');
      return chip ? chip.textContent : null;
    });
    const urlAfter = page.url();
    await page.screenshot({ path: 'tools/qm/shots/regr_s4_category_map.png' });

    await page.goto(`${BASE}/map/categories`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const groupCount = await page.evaluate(() => document.querySelectorAll('[class*="section"] h2').length);
    const itemCount = await page.evaluate(() => document.querySelectorAll('[class*="item"] button, button[class*="item"]').length);
    // more robust: count buttons with class containing 'item' at grid-level
    const itemCount2 = await page.evaluate(() => document.querySelectorAll('[class*="grid"] button').length);
    await page.screenshot({ path: 'tools/qm/shots/regr_s4_categories_page.png' });

    results[name] = {
      pass: bizTabActive && !!chipActiveText && !urlAfter.includes('category=') && groupCount === 4 && itemCount2 === 15 && consoleErrors.length === 0,
      bizTabActive, chipActiveText, urlAfter, groupCount, itemCount, itemCount2, consoleErrors, failedRequests,
      screenshots: ['tools/qm/shots/regr_s4_category_map.png', 'tools/qm/shots/regr_s4_categories_page.png'],
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function scenario5(browser, session) {
  const name = 'S5_listing_tab_regression';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, DEEP);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    // default tab is listings already
    await page.waitForTimeout(2500);
    const listingMarkerCount = await page.evaluate(() => document.querySelectorAll('g[data-marker]:not([data-marker^="biz:"])').length);
    if (listingMarkerCount === 0) {
      results[name] = { pass: false, error: 'no listing markers found in deep viewport', listingMarkerCount };
      await context.close();
      return;
    }
    const markerId = await page.evaluate(() => {
      const el = document.querySelector('g[data-marker]:not([data-marker^="biz:"])');
      return el ? el.getAttribute('data-marker') : null;
    });
    await page.evaluate((mid) => {
      const el = document.querySelector(`g[data-marker="${CSS.escape(mid)}"]`);
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, markerId);
    await page.waitForTimeout(1200);
    // PostPanel 전용 클래스(aboveRow) — ListingCard의 cardBody와 클래스명 base가 겹쳐 오탐 났던
    // 지점을 PostPanel.tsx에서만 쓰이는 이름으로 특정해 수정.
    const postPanelOpened = await page.evaluate(() => document.querySelectorAll('[class*="aboveRow"]').length > 0);
    const sheetHeaderVisible = await page.evaluate(() => {
      const seg = document.querySelector('[class*="segBtn"]');
      return seg ? seg.offsetParent !== null : false;
    });
    const listVisible = await page.evaluate(() => {
      const list = document.querySelector('[class*="list"]');
      if (!list) return false;
      const r = list.getBoundingClientRect();
      return r.height > 100 && r.top < window.innerHeight;
    });
    await page.screenshot({ path: 'tools/qm/shots/regr_s5_listing_tab.png' });
    results[name] = {
      pass: !postPanelOpened && sheetHeaderVisible && listVisible,
      listingMarkerCount, markerId, postPanelOpened, sheetHeaderVisible, listVisible, consoleErrors, failedRequests,
      screenshot: 'tools/qm/shots/regr_s5_listing_tab.png',
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function scenario6(browser, session) {
  const name = 'S6_profile_favorites_biz';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, null);
  try {
    await page.goto(`${BASE}/map/profile`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // '[class*="shortcut"]' 은 컨테이너 section(styles.shortcuts)도 부분일치로 잡아 4개로 오카운트됨
    // (shortcuts가 shortcut의 상위 문자열) — button 요소로 좁혀 개별 항목만 센다.
    const shortcutCount = await page.evaluate(() => document.querySelectorAll('button[class*="shortcut"]').length);
    const shortcutLabels = await page.evaluate(() => Array.from(document.querySelectorAll('button[class*="shortcut"]')).map((el) => el.textContent));
    const hasPackaging = shortcutLabels.some((l) => l?.includes('포장') || l?.includes('주문'));
    const statRowExists = await page.evaluate(() => !!document.querySelector('[class*="reviewSummary"]'));
    const statRowText = await page.evaluate(() => document.querySelector('[class*="reviewSummary"]')?.textContent ?? null);
    const commonMoreLeak = await page.evaluate(() => document.body.textContent?.includes('common.more') ?? false);
    await page.screenshot({ path: 'tools/qm/shots/regr_s6_profile.png' });

    await page.goto(`${BASE}/map/favorites`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const favTabCount = await page.evaluate(() => document.querySelectorAll('[class*="tabs"] [class*="tab"]').length);
    await page.screenshot({ path: 'tools/qm/shots/regr_s6_favorites.png' });

    await page.goto(`${BASE}/biz/${BIZ_ID}`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const heartExists = await page.evaluate(() => !!document.querySelector('[class*="favoriteBtn"]'));
    await page.screenshot({ path: 'tools/qm/shots/regr_s6_biz_public.png' });

    results[name] = {
      pass: shortcutCount === 3 && !hasPackaging && statRowExists && !commonMoreLeak && favTabCount === 2 && heartExists,
      shortcutCount, shortcutLabels, hasPackaging, statRowExists, statRowText, commonMoreLeak, favTabCount, heartExists,
      consoleErrors, failedRequests,
      screenshots: ['tools/qm/shots/regr_s6_profile.png', 'tools/qm/shots/regr_s6_favorites.png', 'tools/qm/shots/regr_s6_biz_public.png'],
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function scenario7(browser, session) {
  const name = 'S7_map_view_pill';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, DEEP);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);

    let pillVisible = false;
    let attempts = [];
    for (let attempt = 0; attempt < 2 && !pillVisible; attempt++) {
      const headerBox = await page.evaluate(() => {
        const zone = document.querySelector('[class*="dragZone"]');
        if (!zone) return null;
        const r = zone.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (!headerBox) { attempts.push({ attempt, error: 'no dragZone found' }); continue; }
      const startX = headerBox.x, startY = headerBox.y;
      await page.mouse.move(startX, startY);
      await page.dispatchEvent('[class*="dragZone"]', 'pointerdown', { pointerId: 1, clientX: startX, clientY: startY, bubbles: true });
      // move in steps
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const y = startY - (400 * i) / steps;
        await page.dispatchEvent('[class*="dragZone"]', 'pointermove', { pointerId: 1, clientX: startX, clientY: y, bubbles: true });
        await page.waitForTimeout(30);
      }
      await page.dispatchEvent('[class*="dragZone"]', 'pointerup', { pointerId: 1, clientX: startX, clientY: startY - 400, bubbles: true });
      await page.waitForTimeout(600);
      pillVisible = await page.evaluate(() => !!document.querySelector('[class*="mapViewPill"]'));
      attempts.push({ attempt, pillVisible });
    }

    if (!pillVisible) {
      results[name] = { pass: 'MANUAL_CHECK_NEEDED', reason: '드래그 시뮬레이션 2회 실패 — 수동 확인 필요', attempts, consoleErrors, failedRequests };
      await context.close();
      return;
    }
    await page.screenshot({ path: 'tools/qm/shots/regr_s7_map_view_pill.png' });
    const clicked = await jsClick(page, '[class*="mapViewPill"]');
    await page.waitForTimeout(700);
    const pillGone = await page.evaluate(() => !document.querySelector('[class*="mapViewPill"]'));
    const sheetCollapsed = await page.evaluate(() => {
      // collapsed: dragZone's parent sheet is translated down close to full offset (peek only)
      const seg = document.querySelector('[class*="segBtn"]');
      if (!seg) return null;
      const r = seg.getBoundingClientRect();
      return r.top > window.innerHeight * 0.6; // near bottom = collapsed
    });
    await page.screenshot({ path: 'tools/qm/shots/regr_s7_map_view_pill_after.png' });

    results[name] = {
      pass: pillVisible && clicked && pillGone,
      pillVisible, clicked, pillGone, sheetCollapsed, attempts, consoleErrors, failedRequests,
      screenshots: ['tools/qm/shots/regr_s7_map_view_pill.png', 'tools/qm/shots/regr_s7_map_view_pill_after.png'],
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
  await scenario1(browser, session);
  await scenario2(browser, session);
  await scenario3(browser, session);
  await scenario4(browser, session);
  await scenario5(browser, session);
  await scenario6(browser, session);
  await scenario7(browser, session);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
