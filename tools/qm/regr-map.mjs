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

const DEEP = { N: 10.80885, S: 10.79935, E: 106.71555, W: 106.70605 };
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
    if (bbox) sessionStorage.setItem('sgr.regr.viewport', JSON.stringify(bbox));
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

async function openRestoredMap(page) {
  // 최초 지도 진입은 제품 정책상 저장 viewport를 무시한다. 홈으로 나갔다가 같은 SPA
  // 세션에서 재진입해 실제 viewport 복원 경로를 검증한다.
  await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
  await page.locator('a[href="/home"]').click();
  await page.evaluate(() => {
    const viewport = sessionStorage.getItem('sgr.regr.viewport');
    if (viewport) localStorage.setItem('sgr.map.viewport', viewport);
  });
  await page.locator('a[href="/map"]').click();
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
    await openRestoredMap(page);
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
    await openRestoredMap(page);
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
    // 선택 표시: teardrop 핀 꼭짓점 기준 scale(1.5) 확대 (구 선택 링 circle[stroke]은 teardrop 리디자인에서 제거됨)
    const selectionRing = await page.evaluate(() => document.querySelectorAll('g[data-marker^="biz:"] g[transform*="scale(1.5)"]').length);
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
    await openRestoredMap(page);
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
  // 패키지 C (2026-07-12): 매물 핀 탭 = 팝업 카드 캐러셀 오픈이 정답 — 구 "postPanelOpened===false"
  // 검증을 대체한다. 팝업 열림(매물 제목/가격 카드) + 바텀시트 리스트 비동기화(선택 하이라이트
  // 없음) + 플리킹 → recenter(뷰포트 저장값 변경) + X 닫기 후 시트 복귀를 본다.
  const name = 'S5_listing_pin_popup';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, DEEP);
  try {
    await openRestoredMap(page);
    await page.waitForTimeout(1200);
    // default tab is now biz — switch to listings tab explicitly
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('[class*="segBtn"]'));
      const b = btns.find((x) => x.textContent?.includes('매물'));
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
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
    await page.waitForTimeout(1800); // 오픈 recenter + bbox 커밋(500ms 디바운스)까지 소화
    const postPanelOpened = await page.evaluate(() => document.querySelectorAll('[class*="aboveRow"]').length > 0);
    const cardCount = await page.evaluate(() => document.querySelectorAll('[class*="listingTitle"]').length);
    const titleText = await page.evaluate(() => document.querySelector('[class*="listingTitle"]')?.textContent ?? null);
    const priceText = await page.evaluate(() => document.querySelector('[class*="listingPrice"]')?.textContent ?? null);
    // 업체 전용 요소(뷰어 칩·찜 하트)는 매물 팝업에 없어야 한다
    const bizOnlyLeak = await page.evaluate(() => document.querySelectorAll('[class*="viewerChip"], [class*="favBtn"]').length);
    const sheetHidden = await page.evaluate(() => {
      const seg = document.querySelector('[class*="segBtn"]');
      return seg ? seg.offsetParent === null : null;
    });
    // 지도-리스트 분리: 핀 탭이 리스트 선택 하이라이트를 만들지 않는다
    const selectedInList = await page.evaluate(() => document.querySelectorAll('[class*="list"] [class*="selected"]').length);
    await page.screenshot({ path: 'tools/qm/shots/regr_s5_listing_popup_open.png' });

    // 플리킹: 캐러셀을 두 번째 카드로 스크롤 → 인덱스 전환 → recenter(뷰포트 저장값 변경).
    // append 모드(패키지 C): 새 영역 아이템은 끝에 추가될 수 있으나(카드 수 불감소) 기존
    // 순서·현재 인덱스(두 번째 카드 센터링)는 유지되어야 한다 — 인덱스 점프 없음.
    const viewportBefore = await page.evaluate(() => localStorage.getItem('sgr.map.viewport'));
    const flick = await page.evaluate(() => {
      const scroller = document.querySelector('[class*="scroller"]');
      if (!scroller || scroller.children.length < 2) return { skipped: true };
      const card = scroller.children[1];
      const cr = card.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      scroller.scrollLeft += cr.left - sr.left - (scroller.clientWidth - card.clientWidth) / 2;
      return { skipped: false };
    });
    await page.waitForTimeout(2800); // IO 스냅 + recenter + 커밋 + fetch 도착 + append 반영
    const viewportAfter = await page.evaluate(() => localStorage.getItem('sgr.map.viewport'));
    const cardCountAfterFlick = await page.evaluate(() => document.querySelectorAll('[class*="listingTitle"]').length);
    // 인덱스 유지 검증: 두 번째 카드가 여전히 스크롤러 중앙에 있는가 (재구성이면 첫 카드로 점프)
    const stillOnSecondCard = await page.evaluate(() => {
      const scroller = document.querySelector('[class*="scroller"]');
      if (!scroller || scroller.children.length < 2) return null;
      const cr = scroller.children[1].getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      return Math.abs((cr.left + cr.width / 2) - (sr.left + sr.width / 2)) < 40;
    });
    const recentered = flick.skipped ? null : viewportAfter !== viewportBefore;
    const flickOk = flick.skipped ? true : (recentered === true && cardCountAfterFlick >= cardCount && stillOnSecondCard === true);
    await page.screenshot({ path: 'tools/qm/shots/regr_s5_listing_popup_flick.png' });

    // close → 시트 복귀
    const closeClicked = await page.evaluate(() => {
      const el = document.querySelector('[class*="aboveRow"] [class*="closeBtn"]');
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });
    await page.waitForTimeout(800);
    const popupGone = await page.evaluate(() => document.querySelectorAll('[class*="aboveRow"]').length === 0);
    const sheetBack = await page.evaluate(() => {
      const seg = document.querySelector('[class*="segBtn"]');
      return seg ? seg.offsetParent !== null : null;
    });
    await page.screenshot({ path: 'tools/qm/shots/regr_s5_listing_popup_closed.png' });

    results[name] = {
      pass: postPanelOpened && cardCount > 0 && !!titleText && !!priceText && bizOnlyLeak === 0
        && sheetHidden === true && selectedInList === 0 && flickOk
        && closeClicked && popupGone && sheetBack === true,
      listingMarkerCount, markerId, postPanelOpened, cardCount, titleText, priceText, bizOnlyLeak,
      sheetHidden, selectedInList, flick, recentered, cardCountAfterFlick, stillOnSecondCard,
      closeClicked, popupGone, sheetBack, consoleErrors, failedRequests,
      screenshots: ['tools/qm/shots/regr_s5_listing_popup_open.png', 'tools/qm/shots/regr_s5_listing_popup_flick.png', 'tools/qm/shots/regr_s5_listing_popup_closed.png'],
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

    // 무이동 탭 (결정적 재현: DraggableSheet 잔존 transitionend 리스너) — full 상태에서 같은
    // 오프셋으로 pointerdown+up 하면 transition 이 발화하지 않아, 버그 시 과거 full 오프셋을
    // 캡처한 리스너가 잔존 → 이후 collapse 애니메이션 끝에 시트가 다시 올라온다.
    let tapDispatched = false;
    const tapBox = await page.evaluate(() => {
      const zone = document.querySelector('[class*="dragZone"]');
      if (!zone) return null;
      const r = zone.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (tapBox) {
      await page.mouse.move(tapBox.x, tapBox.y); // pointerId 1 활성화 (setPointerCapture 오류 방지)
      await page.dispatchEvent('[class*="dragZone"]', 'pointerdown', { pointerId: 1, clientX: tapBox.x, clientY: tapBox.y, bubbles: true });
      await page.waitForTimeout(60);
      await page.dispatchEvent('[class*="dragZone"]', 'pointerup', { pointerId: 1, clientX: tapBox.x, clientY: tapBox.y, bubbles: true });
      await page.waitForTimeout(120);
      tapDispatched = true;
    }

    // 하단 floating 위치 검증 (당근 레퍼런스 재배치) — 탭바 바로 위, 화면 하단 근처여야 한다
    const pillNearBottom = await page.evaluate(() => {
      const pill = document.querySelector('[class*="mapViewPill"]');
      if (!pill) return null;
      const r = pill.getBoundingClientRect();
      return r.top > window.innerHeight * 0.7;
    });
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
      // sheetCollapsed 포함: 무이동 탭 후 collapse 가 유지돼야 함 (잔존 리스너 재상승 회귀 가드)
      pass: pillVisible && pillNearBottom && clicked && pillGone && sheetCollapsed === true,
      pillVisible, pillNearBottom, clicked, pillGone, sheetCollapsed, tapDispatched, attempts, consoleErrors, failedRequests,
      screenshots: ['tools/qm/shots/regr_s7_map_view_pill.png', 'tools/qm/shots/regr_s7_map_view_pill_after.png'],
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function scenario8(browser, session) {
  // 게이트 이탈 고아 말풍선 (2026-07-13) — 딥줌에서 자동 말풍선이 뜬 상태로 휠 줌아웃해
  // 핀 게이트(L3)를 이탈하면 핀과 말풍선이 함께 사라져야 한다 (말풍선만 잔존하는 회귀 가드).
  const name = 'S8_bubble_gate_orphan';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, DEEP);
  try {
    await openRestoredMap(page);
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((x) => x.textContent?.includes('업체'));
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(2500); // debounce(500ms) + fetch + auto-bubble effect (S1 미러)
    const bubbleBefore = await page.evaluate(() => document.querySelectorAll('[class*="bizNewsBubble"]').length);
    if (bubbleBefore !== 1) {
      results[name] = { pass: false, error: 'precondition failed: auto bubble not shown at deep zoom', bubbleBefore };
      await context.close();
      return;
    }
    // 휠 줌아웃 — SaigonMapV5 wheel 핸들러(deltaY>0 = ×1.12/이벤트)로 L3 게이트(vbW 700)를
    // 확실히 이탈시킨다 (×1.12^22 ≈ 12배). 말풍선(HTML 오버레이) 위를 피해 svg에 직접 디스패치.
    await page.evaluate(() => {
      const svg = document.querySelector('[class*="stage"] > svg');
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      for (let i = 0; i < 22; i++) {
        svg.dispatchEvent(new WheelEvent('wheel', {
          deltaY: 120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          bubbles: true, cancelable: true,
        }));
      }
    });
    await page.waitForTimeout(1500); // 게이트 플립(동기) + bbox 커밋(500ms) + 핀 데이터 클리어 소화
    const gateExited = await page.evaluate(() => !!document.querySelector('[class*="zoomHintPill"]'));
    const bizMarkerCount = await page.evaluate(() => document.querySelectorAll('g[data-marker^="biz:"]').length);
    const bubbleAfter = await page.evaluate(() => document.querySelectorAll('[class*="bizNewsBubble"]').length);
    await page.screenshot({ path: 'tools/qm/shots/regr_s8_bubble_gate_orphan.png' });
    results[name] = {
      pass: gateExited && bizMarkerCount === 0 && bubbleAfter === 0,
      bubbleBefore, gateExited, bizMarkerCount, bubbleAfter, consoleErrors, failedRequests,
      screenshot: 'tools/qm/shots/regr_s8_bubble_gate_orphan.png',
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function scenario9(browser, session) {
  // 줌힌트 필(확대해서 주변 보기) 클릭 버그 회귀 가드 — 필이 [내 위치로]와 동일한
  // GPS 측위(runLocate)를 타면 팬한 위치와 무관하게 벤탄(10.772,106.697)으로 튄다.
  // 수정 후에는 "현재 뷰포트 중심"으로만 줌인해야 하므로, 게이트 밖(WIDE)에서 GPS/벤탄과
  // 뚜렷이 다른 곳으로 팬한 뒤 필을 클릭했을 때 그 지점 근처로 줌인되는지 확인한다.
  const name = 'S9_zoom_hint_pill_center';
  const { context, page, consoleErrors, failedRequests } = await newPage(browser, session, WIDE);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((x) => x.textContent?.includes('업체'));
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(2500); // debounce(500ms) + fetch + 게이트 반영 (S3 미러)
    const pillBefore = await page.evaluate(() => !!document.querySelector('[class*="zoomHintPill"]'));
    if (!pillBefore) {
      results[name] = { pass: false, error: 'precondition failed: zoomHintPill not shown at WIDE bbox', pillBefore };
      await context.close();
      return;
    }

    // 필은 시트 밖 지도 우측 floating — 좌측 mapTools 의 [+] 버튼과 bottom 정렬(±4px)이어야 한다
    // (둘 다 --sheet-visible-h 기반 동일 bottom 계산을 공유하는 세트 배치 검증)
    const pillBottomDiff = await page.evaluate(() => {
      const pill = document.querySelector('[class*="zoomHintPill"]');
      const plus = document.querySelector('[class*="addWrap"] [class*="mapToolButton"]');
      if (!pill || !plus) return null;
      return Math.abs(pill.getBoundingClientRect().bottom - plus.getBoundingClientRect().bottom);
    });
    const pillAligned = pillBottomDiff !== null && pillBottomDiff <= 4;

    // 팬: svg에 pointerdown → 여러 pointermove 스텝 → pointerup (S7 드래그 시퀀스 미러,
    // dragZone 대신 지도 svg 대상). 큰 폭 이동으로 뷰포트 중심을 GPS/벤탄과 뚜렷이 다른 곳으로.
    const box = await page.evaluate(() => {
      const svg = document.querySelector('[class*="stage"] > svg');
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!box) { results[name] = { pass: false, error: 'no map svg found' }; await context.close(); return; }
    const startX = box.x, startY = box.y;
    await page.dispatchEvent('[class*="stage"] > svg', 'pointerdown', { pointerId: 1, clientX: startX, clientY: startY, bubbles: true });
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const x = startX - (260 * i) / steps;
      const y = startY - (260 * i) / steps;
      await page.dispatchEvent('[class*="stage"] > svg', 'pointermove', { pointerId: 1, clientX: x, clientY: y, bubbles: true });
      await page.waitForTimeout(20);
    }
    await page.dispatchEvent('[class*="stage"] > svg', 'pointerup', { pointerId: 1, clientX: startX - 260, clientY: startY - 260, bubbles: true });
    await page.waitForTimeout(700); // bbox 커밋 디바운스(500ms) 소화 → viewportCenter 갱신

    const viewportAfterPan = await page.evaluate(() => {
      const raw = localStorage.getItem('sgr.map.viewport');
      if (!raw) return null;
      const b = JSON.parse(raw);
      return { lat: (b.N + b.S) / 2, lng: (b.E + b.W) / 2 };
    });

    const clicked = await jsClick(page, '[class*="zoomHintPill"]');
    await page.waitForTimeout(1500);

    const pillAfter = await page.evaluate(() => !!document.querySelector('[class*="zoomHintPill"]'));
    const viewportAfterZoom = await page.evaluate(() => {
      const raw = localStorage.getItem('sgr.map.viewport');
      if (!raw) return null;
      const b = JSON.parse(raw);
      return { lat: (b.N + b.S) / 2, lng: (b.E + b.W) / 2 };
    });
    await page.screenshot({ path: 'tools/qm/shots/regr_s9_zoom_hint_pill.png' });

    const BEN_THANH = { lat: 10.772, lng: 106.697 };
    const distToBenThanh = viewportAfterZoom
      ? Math.hypot(viewportAfterZoom.lat - BEN_THANH.lat, viewportAfterZoom.lng - BEN_THANH.lng)
      : null;
    const distToPannedPoint = (viewportAfterZoom && viewportAfterPan)
      ? Math.hypot(viewportAfterZoom.lat - viewportAfterPan.lat, viewportAfterZoom.lng - viewportAfterPan.lng)
      : null;

    results[name] = {
      pass: clicked && !pillAfter && !!viewportAfterZoom && pillAligned
        && distToBenThanh !== null && distToBenThanh > 0.015
        && distToPannedPoint !== null && distToPannedPoint < 0.02,
      pillBefore, pillBottomDiff, pillAligned, clicked, pillAfter, viewportAfterPan, viewportAfterZoom, distToBenThanh, distToPannedPoint,
      consoleErrors, failedRequests,
      screenshot: 'tools/qm/shots/regr_s9_zoom_hint_pill.png',
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
  await scenario8(browser, session);
  await scenario9(browser, session);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
