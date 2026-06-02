import { chromium } from 'playwright';

const [,, htmlPath, outPath] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1290, height: 2796 }, deviceScaleFactor: 1 });
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: outPath, clip: { x:0, y:0, width:1290, height:2796 } });
await browser.close();
console.log('rendered ->', outPath);
