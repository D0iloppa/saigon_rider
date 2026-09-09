import { chromium } from '../../../../frontend/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME || '/home/doil/.cache/ms-playwright/chromium-1232/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});

const captures = [
  { name: 'partner-lounge-ops-390.png', width: 390, state: 'no_ads', tab: 'ops' },
  { name: 'partner-lounge-performance-390.png', width: 390, state: 'live', tab: 'perf' },
  { name: 'partner-lounge-pending-payment-390.png', width: 390, state: 'pending', tab: 'ops' },
  { name: 'partner-lounge-metrics-error-360.png', width: 360, state: 'error', tab: 'perf' },
  { name: 'partner-lounge-ops-430.png', width: 430, state: 'no_ads', tab: 'ops' },
];
const results = [];

for (const shot of captures) {
  const page = await browser.newPage({ viewport: { width: shot.width, height: 844 } });
  const outbound = [];
  page.on('request', request => {
    if (!request.url().startsWith('file:')) outbound.push(request.url());
  });
  await page.goto(pathToFileURL(join(here, 'prototype.html')).href);
  await page.selectOption('#stateSelect', shot.state);
  if (shot.tab === 'perf') await page.click('#tabPerf');
  const size = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (size.clientWidth !== size.scrollWidth) throw new Error(`horizontal overflow at ${shot.width}px`);
  await page.screenshot({ path: join(here, 'screenshots', shot.name), fullPage: true });
  results.push({ ...shot, ...size, outboundRequests: outbound.length });
  await page.close();
}

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(pathToFileURL(join(here, 'prototype.html')).href);
await page.selectOption('#stateSelect', 'verify');
if (await page.locator('#verifiedBadge').isVisible()) throw new Error('verified badge visible in verification-needed state');
await page.selectOption('#stateSelect', 'live');
await page.click('[data-panel="stores"]');
await page.click('[data-store="parts"]');
await page.click('#tabPerf');
if ((await page.locator('#storeName').textContent()) !== '탄닷 부품점') throw new Error('shop name context lost');
if ((await page.locator('#storeMeta').textContent()) !== '오토바이 부품 · 3군') throw new Error('shop meta context lost');
await page.click('[data-period="30"]');
await page.click('[data-table]');
if ((await page.locator('.data-table tbody tr').count()) !== 30) throw new Error('30-day table does not have 30 rows');
results.push({ interaction: 'shop context + verified state + 30-day table', status: 'PASS' });
await page.close();

await browser.close();
console.log(JSON.stringify(results, null, 2));
