import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(ROOT, 'shots');
const OUT = path.join(ROOT, 'out');
const W = 1290, H = 2796;
const RATIO = 2556 / 1179; // 스크린샷 세로/가로 비율

const b64 = (file) => readFileSync(path.join(SHOTS, file)).toString('base64');

// ── 슬롯 구성 ──────────────────────────────────────────────────────
const SINGLES = [
  { shot: 'quest-detail.png', head: '달린 만큼 진짜 보상',          sub: 'EXP · XP · 골드 · 아이템으로 정산', tilt: -16 },
  { shot: 'home.png',         head: '사이공 전역이 퀘스트 맵',      sub: '구역마다 흩어진 퀘스트를 탐험',     tilt:  16 },
  { shot: 'quest-list.png',   head: '매일 새로운 라이딩 퀘스트',    sub: '오늘 · 주간 · 이벤트로 골라 달리기', tilt: -16 },
  { shot: 'info.png',         head: '날씨 · 침수 · 주유<br>한눈에 체크', sub: '라이더를 위한 실시간 동네 정보',  tilt:  16 },
];
const PANORAMA = { shot: 'splash.png', head: '매일의 주행이 모험이 된다', sub: 'Saigon Rider' };

const FONTS = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&display=swap" rel="stylesheet">`;

const bg = (glowXpct) => `
  radial-gradient(120% 75% at ${glowXpct}% 102%, rgba(255,90,31,.58) 0%, rgba(255,90,31,0) 55%),
  radial-gradient(80% 50% at 8% 12%, rgba(0,240,255,.16) 0%, rgba(0,240,255,0) 60%),
  radial-gradient(70% 45% at 96% 26%, rgba(255,45,156,.15) 0%, rgba(255,45,156,0) 60%),
  linear-gradient(165deg,#11131C 0%,#08090F 58%,#1A1D2A 100%)`;

const COMMON = `
 *{margin:0;padding:0;box-sizing:border-box}
 .grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
 .cap{position:absolute;top:140px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:30px;padding:0 80px;z-index:3}
 .head{text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:900;color:#fff;font-size:100px;line-height:1.14;letter-spacing:-2px;text-shadow:0 10px 44px rgba(0,0,0,.55)}
 .sub{text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;color:#FFC04D;font-size:46px;letter-spacing:-.5px}
 .face{position:absolute;left:50%;top:50%;overflow:hidden}
 .front{background:#04050a}
 .screen{width:100%;height:100%;overflow:hidden}
 .screen img{display:block;width:100%;height:100%;object-fit:cover}
 .edge-v{background:linear-gradient(to bottom,#41444f 0%,#0c0d12 22%,#2a2d37 52%,#070810 78%,#1a1c24)}
 .edge-h{background:linear-gradient(to right,#33363f 0%,#0b0c11 28%,#23252e 60%,#060710)}
 .back{background:#0a0b10}`;

// 6면체 폰 — 두께(depth)를 가진 실제 단말 느낌
function phoneBox({ data, bodyW, tilt, depth = 52, radius = 92, pad = 20, glow = '0 0 0 rgba(0,0,0,0)' }) {
  const screenW = bodyW - 2 * pad;
  const screenH = Math.round(screenW * RATIO);
  const bodyH = screenH + 2 * pad;
  const hb = depth / 2;
  const er = 12; // edge radius
  const tiltZ = tilt < 0 ? -2 : 2;
  const f = (w, h, t, cls, inner = '') =>
    `<div class="face ${cls}" style="width:${w}px;height:${h}px;border-radius:${cls.includes('front') ? radius : er}px;transform:translate(-50%,-50%) ${t}">${inner}</div>`;
  const faces = [
    f(bodyW, bodyH, `translateZ(${hb}px)`, 'front',
      `<div class="screen" style="border-radius:${radius - pad}px"><img src="data:image/png;base64,${data}"></div>`),
    f(bodyW, bodyH, `translateZ(${-hb}px) rotateY(180deg)`, 'back'),
    f(depth, bodyH, `rotateY(-90deg) translateZ(${bodyW / 2}px)`, 'edge-v left'),
    f(depth, bodyH, `rotateY(90deg) translateZ(${bodyW / 2}px)`, 'edge-v right'),
    f(bodyW, depth, `rotateX(90deg) translateZ(${bodyH / 2}px)`, 'edge-h top'),
    f(bodyW, depth, `rotateX(-90deg) translateZ(${bodyH / 2}px)`, 'edge-h bottom'),
  ].join('');
  return { bodyW, bodyH, depth,
    html: `<div class="phone" style="width:${bodyW}px;height:${bodyH}px;position:relative;transform-style:preserve-3d;transform:rotateY(${tilt}deg) rotateX(3deg) rotateZ(${tiltZ}deg);filter:drop-shadow(0 80px 90px rgba(0,0,0,.6)) drop-shadow(${glow})">${faces}</div>` };
}

const singleHTML = (s, i, n) => {
  const glow = 30 + (i * 40) / Math.max(1, n - 1);
  const ph = phoneBox({ data: b64(s.shot), bodyW: 860, tilt: s.tilt });
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONTS}<style>${COMMON}
 html,body{width:${W}px;height:${H}px}
 .frame{width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${bg(glow)}}
 .stage{position:absolute;left:50%;bottom:-40px;transform:translateX(-50%);perspective:3000px;z-index:2}
</style></head><body><div class="frame"><div class="grain"></div>
 <div class="cap"><div class="head">${s.head}</div><div class="sub">${s.sub}</div></div>
 <div class="stage">${ph.html}</div>
</div></body></html>`;
};

const panoramaHTML = (p) => {
  const CW = W * 2;
  const ph = phoneBox({ data: b64(p.shot), bodyW: 720, tilt: -20, glow: '0 0 90px rgba(255,120,50,.30)' });
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONTS}<style>${COMMON}
 html,body{width:${CW}px;height:${H}px}
 .frame{width:${CW}px;height:${H}px;position:relative;overflow:hidden;background:${bg(50)}}
 .spot{position:absolute;left:50%;top:54%;width:1700px;height:1700px;transform:translate(-50%,-50%);background:radial-gradient(closest-side, rgba(255,150,80,.28) 0%, rgba(255,90,31,.10) 38%, rgba(255,90,31,0) 70%);z-index:1}
 .stage{position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);perspective:3200px;z-index:2}
</style></head><body><div class="frame"><div class="grain"></div>
 <div class="cap"><div class="head">${p.head}</div><div class="sub">${p.sub}</div></div>
 <div class="spot"></div>
 <div class="stage">${ph.html}</div>
</div></body></html>`;
};

const missing = SINGLES.filter(s => !existsSync(path.join(SHOTS, s.shot)));
if (missing.length) { console.error('누락:', missing.map(m => m.shot).join(', ')); process.exit(1); }
const hasPano = existsSync(path.join(SHOTS, PANORAMA.shot));

const browser = await chromium.launch();
let slot = 1;
const render = async (content, viewW, clips) => {
  const page = await browser.newPage({ viewport: { width: viewW, height: H }, deviceScaleFactor: 1 });
  await page.setContent(content, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  for (const c of clips) { await page.screenshot({ path: c.path, clip: c.clip }); console.log('✓', c.path); }
  await page.close();
};

if (hasPano) {
  await render(panoramaHTML(PANORAMA), W * 2, [
    { path: path.join(OUT, '_panorama_full.png'), clip: { x: 0, y: 0, width: W * 2, height: H } },
    { path: path.join(OUT, '01.png'), clip: { x: 0, y: 0, width: W, height: H } },
    { path: path.join(OUT, '02.png'), clip: { x: W, y: 0, width: W, height: H } },
  ]);
  slot = 3;
} else console.log('⚠ splash.png 없음 — 파노라마 건너뜀');

for (let i = 0; i < SINGLES.length; i++) {
  const out = path.join(OUT, String(slot++).padStart(2, '0') + '.png');
  await render(singleHTML(SINGLES[i], i, SINGLES.length), W, [{ path: out, clip: { x: 0, y: 0, width: W, height: H } }]);
}
await browser.close();
console.log(`완료 — 총 ${slot - 1}장 →`, OUT);
