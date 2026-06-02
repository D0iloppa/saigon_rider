import { chromium } from 'playwright';

const W = 1290, H = 2796, CW = W * 2;   // 2580 × 2796 (파노라마 = 2슬롯 분할 전 원본)

const bg = `
  radial-gradient(120% 75% at 50% 102%, rgba(255,90,31,.58) 0%, rgba(255,90,31,0) 55%),
  radial-gradient(80% 50% at 8% 12%, rgba(0,240,255,.16) 0%, rgba(0,240,255,0) 60%),
  radial-gradient(70% 45% at 96% 26%, rgba(255,45,156,.15) 0%, rgba(255,45,156,0) 60%),
  linear-gradient(165deg,#11131C 0%,#08090F 58%,#1A1D2A 100%)`;
const grain = `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *{margin:0;padding:0;box-sizing:border-box}html,body{width:${CW}px;height:${H}px}
 .frame{width:${CW}px;height:${H}px;position:relative;overflow:hidden;background:${bg}}
 .grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay;${grain}}
 /* 중앙 히어로용 따뜻한 스포트라이트 (필요 없으면 이 블록 삭제) */
 .spot{position:absolute;left:50%;top:54%;width:1700px;height:1700px;transform:translate(-50%,-50%);background:radial-gradient(closest-side, rgba(255,150,80,.26) 0%, rgba(255,90,31,.10) 38%, rgba(255,90,31,0) 70%)}
</style></head><body><div class="frame"><div class="grain"></div><div class="spot"></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:CW,height:H}, deviceScaleFactor:1 });
await page.setContent(html, { waitUntil:'networkidle' });
await page.waitForTimeout(150);
await page.screenshot({ path:'out/pano_background.png', clip:{x:0,y:0,width:CW,height:H} });
await browser.close();
console.log('wrote out/pano_background.png  ('+CW+'×'+H+')');
