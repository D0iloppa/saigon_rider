#!/usr/bin/env node
/**
 * 업체 후기 신규 기능 시각검증 (검증 전용 — 코드 수정 없음)
 *  ① 동네지도 + 메뉴 → 후기쓰기 → 업체 선택 스텝 → 작성 시트(별점 선택 상태)
 *  ② BizPublic 후기 섹션 (시드 데이터 + 요약 별점)
 *  ③ BizPublic에서 후기 등록(수정 모드 upsert) 후 목록 반영
 */
import { chromium } from 'playwright-core';
import { homedir } from 'os';
import { existsSync } from 'fs';

const BASE = 'http://localhost:18090';
const EXE = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`;
if (!existsSync(EXE)) { console.error('no chromium'); process.exit(2); }

const DEEP = { N: 10.8101, S: 10.7981, E: 106.7168, W: 106.7048 };
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
  await context.addCookies([{ name: 'sr_session', value: encodeURIComponent(JSON.stringify(session)), url: BASE }]);
  await context.addInitScript((bbox) => {
    localStorage.setItem('sr-lang', 'ko');
    if (bbox) localStorage.setItem('sgr.map.viewport', JSON.stringify(bbox));
  }, viewportBbox);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${String(e).slice(0, 300)}`));
  return { context, page, consoleErrors };
}

async function clickByText(page, text) {
  return page.evaluate((txt) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent?.trim() === txt || x.textContent?.includes(txt));
    if (!b) return false;
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, text);
}

async function jsClick(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, selector);
}

const results = {};

async function s1_map_flow(browser, session) {
  const name = 'S1_map_picker_and_sheet';
  const { context, page, consoleErrors } = await newPage(browser, session, DEEP);
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const plusClicked = await jsClick(page, 'button[aria-label="글쓰기"]');
    await page.waitForTimeout(400);
    const reviewClicked = await clickByText(page, '후기쓰기');
    await page.waitForTimeout(2000); // async bbox 업체 조회
    const pickerVisible = await page.evaluate(() => !!document.querySelector('[class*="pickerSheet"]'));
    const pickerRows = await page.evaluate(() => document.querySelectorAll('[class*="pickerRow"]').length);
    await page.screenshot({ path: 'tools/qm/shots/bizreview_s1a_picker.png' });
    const pickClicked = await jsClick(page, '[class*="pickerRow"]');
    await page.waitForTimeout(1200);
    const sheetVisible = await page.evaluate(() => !!document.querySelector('textarea[class*="bodyField"]'));
    const starClicked = await jsClick(page, 'button[aria-label="4/5"]');
    await page.waitForTimeout(300);
    const activeStars = await page.evaluate(() => document.querySelectorAll('[class*="starActive"]').length);
    await page.screenshot({ path: 'tools/qm/shots/bizreview_s1b_write_sheet.png' });
    results[name] = {
      pass: plusClicked && reviewClicked && pickerVisible && pickerRows > 0 && pickClicked && sheetVisible && starClicked && activeStars === 4,
      plusClicked, reviewClicked, pickerVisible, pickerRows, pickClicked, sheetVisible, starClicked, activeStars, consoleErrors,
      screenshots: ['tools/qm/shots/bizreview_s1a_picker.png', 'tools/qm/shots/bizreview_s1b_write_sheet.png'],
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function s2_bizpublic_section(browser, session) {
  const name = 'S2_bizpublic_review_section';
  const { context, page, consoleErrors } = await newPage(browser, session, null);
  try {
    await page.goto(`${BASE}/biz/${BIZ_ID}`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const headText = await page.evaluate(() => document.querySelector('[class*="reviewSectionHead"]')?.textContent ?? null);
    const cardCount = await page.evaluate(() => document.querySelectorAll('[class*="reviewCard"]').length);
    const avgVisible = await page.evaluate(() => !!document.querySelector('[class*="reviewAvg"]'));
    await page.evaluate(() => document.querySelector('[class*="reviewSectionHead"]')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tools/qm/shots/bizreview_s2_section.png' });
    results[name] = {
      pass: !!headText && cardCount > 0 && avgVisible,
      headText, cardCount, avgVisible, consoleErrors,
      screenshot: 'tools/qm/shots/bizreview_s2_section.png',
    };
  } catch (e) {
    results[name] = { pass: false, error: String(e) };
  } finally {
    await context.close();
  }
}

async function s3_submit_and_refresh(browser, session) {
  const name = 'S3_submit_updates_list';
  const { context, page, consoleErrors } = await newPage(browser, session, null);
  const BODY = '헤드리스 검증용 후기 — 등록 후 목록 반영 확인';
  try {
    await page.goto(`${BASE}/biz/${BIZ_ID}`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const writeClicked = await jsClick(page, '[class*="reviewWriteBtn"]');
    await page.waitForTimeout(1200); // mine 프리필
    const editMode = await page.evaluate(() => {
      const title = Array.from(document.querySelectorAll('div')).find((d) => d.textContent === '내 후기 수정');
      return !!title;
    });
    await jsClick(page, 'button[aria-label="4/5"]');
    await page.fill('textarea[class*="bodyField"]', BODY);
    await page.waitForTimeout(200);
    const submitted = await clickByText(page, editMode ? '수정' : '등록');
    await page.waitForTimeout(1800);
    const sheetGone = await page.evaluate(() => !document.querySelector('textarea[class*="bodyField"]'));
    const bodyInList = await page.evaluate((b) =>
      Array.from(document.querySelectorAll('[class*="reviewBody"]')).some((el) => el.textContent?.includes(b)), BODY);
    await page.evaluate(() => document.querySelector('[class*="reviewSectionHead"]')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tools/qm/shots/bizreview_s3_after_submit.png' });
    results[name] = {
      pass: writeClicked && submitted && sheetGone && bodyInList,
      writeClicked, editMode, submitted, sheetGone, bodyInList, consoleErrors,
      screenshot: 'tools/qm/shots/bizreview_s3_after_submit.png',
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
  await s1_map_flow(browser, session);
  await s2_bizpublic_section(browser, session);
  await s3_submit_and_refresh(browser, session);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
