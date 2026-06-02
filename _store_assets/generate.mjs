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
// 로고(브랜드 스탬프) — 분할 파노라마에는 좌측 반(슬롯 01)에만 노출됨
const hasLogo = existsSync(path.join(SHOTS, 'logo.png'));
const logoData = hasLogo ? b64('logo.png') : '';
const logoCorner = hasLogo ? `<div class="logo"><img src="data:image/png;base64,${logoData}"></div>` : '';   // 파노라마: 좌측 반 코너
const logoCap = hasLogo ? `<div class="caplogo"><img src="data:image/png;base64,${logoData}"></div>` : '';     // 단일: 헤드라인 위 중앙

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
 .screen{position:relative;width:100%;height:100%;overflow:hidden}
 .screen img{display:block;width:100%;height:100%;object-fit:cover;position:relative;z-index:1}
 .island{position:absolute;left:50%;transform:translateX(-50%);background:#000;border-radius:999px;z-index:3;box-shadow:0 0 0 1px rgba(255,255,255,.04)}
 .glare{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(122deg,rgba(255,255,255,.20) 0%,rgba(255,255,255,.05) 9%,rgba(255,255,255,0) 24%,rgba(255,255,255,0) 70%,rgba(255,255,255,.05) 88%,rgba(255,255,255,.13) 100%)}
 /* 금속 레일: 폭(depth)을 가로지르는 명암 → 둥근 알루미늄 느낌 + 스펙큘러 하이라이트 */
 .edge-v{background:linear-gradient(to right,#777b86 0%,#3a3d47 16%,#0a0b10 46%,#23262e 72%,#070810 100%)}
 .edge-h{background:linear-gradient(to bottom,#777b86 0%,#3a3d47 16%,#0a0b10 46%,#23262e 72%,#070810 100%)}
 .back{background:#0a0b10}
 .logo{position:absolute;top:62px;left:70px;width:168px;height:168px;border-radius:36px;overflow:hidden;z-index:4;box-shadow:0 14px 34px rgba(0,0,0,.5);outline:1.5px solid rgba(255,255,255,.16);outline-offset:-1.5px}
 .logo img{width:100%;height:100%;object-fit:cover;display:block}
 .caplogo{width:150px;height:150px;border-radius:34px;overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,.5);outline:1.5px solid rgba(255,255,255,.16);outline-offset:-1.5px;margin-bottom:8px}
 .caplogo img{width:100%;height:100%;object-fit:cover;display:block}`;

// 6면체 폰 — 두께(depth)를 가진 실제 단말 느낌
function phoneBox({ data, bodyW, tilt, depth = 34, radius = 92, pad = 18, shadow = '0 55px 80px rgba(0,0,0,.55)' }) {
  const screenW = bodyW - 2 * pad;
  const screenH = Math.round(screenW * RATIO);
  const bodyH = screenH + 2 * pad;
  const hb = depth / 2;
  const er = 12; // edge radius
  const tiltZ = tilt < 0 ? -2 : 2;
  const f = (w, h, t, cls, inner = '', extra = '') =>
    `<div class="face ${cls}" style="width:${w}px;height:${h}px;border-radius:${cls.includes('front') ? radius : er}px;transform:translate(-50%,-50%) ${t};${extra}">${inner}</div>`;
  const faces = [
    f(bodyW, bodyH, `translateZ(${hb}px)`, 'front',
      `<div class="screen" style="border-radius:${radius - pad}px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.08)">`
        + `<img src="data:image/png;base64,${data}">`
        + `<div class="island" style="width:${Math.round(screenW * 0.305)}px;height:${Math.round(screenW * 0.305 * 0.30)}px;top:${Math.round(screenH * 0.0135)}px"></div>`
        + `<div class="glare"></div>`
      + `</div>`,
      `box-shadow:${shadow}, inset 0 0 0 1px rgba(255,255,255,.07)`),
    f(bodyW, bodyH, `translateZ(${-hb}px) rotateY(180deg)`, 'back'),
    f(depth, bodyH, `rotateY(-90deg) translateZ(${bodyW / 2}px)`, 'edge-v left'),
    f(depth, bodyH, `rotateY(90deg) translateZ(${bodyW / 2}px)`, 'edge-v right'),
    f(bodyW, depth, `rotateX(90deg) translateZ(${bodyH / 2}px)`, 'edge-h top'),
    f(bodyW, depth, `rotateX(-90deg) translateZ(${bodyH / 2}px)`, 'edge-h bottom'),
  ].join('');
  return { bodyW, bodyH, depth,
    html: `<div class="phone" style="width:${bodyW}px;height:${bodyH}px;position:relative;transform-style:preserve-3d;transform:rotateY(${tilt}deg) rotateX(2deg)">${faces}</div>` };
}

// ── 실사 mock(손에 든 폰) 합성 — 화면 사각형에 스크린샷을 호모그래피 워프 ──────
const MOCK = b64('mock.png');
const SRC_W = 1179, SRC_H = 2556;                 // 스크린샷 원본 해상도
const MQUAD = { tl:[903,446], tr:[1426,448], br:[1444,1640], bl:[896,1641] }; // 2000×2000 mock 좌표
const MSCREEN_C = [(903+1426+1444+896)/4, (446+448+1640+1641)/4];             // 화면 중심
// mock 배치: 화면 중심을 프레임(FX,FY)에 두고 scale MS
const MS = 1.26, FX = 645, FY = 1505;
const TX = FX - MSCREEN_C[0]*MS, TY = FY - MSCREEN_C[1]*MS;

// 4점 → 4점 사영변환 (general 2D projection)
const adj = m => [m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4],
                  m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5],
                  m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3]];
const mmm = (a,b)=>{const c=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=a[3*i+k]*b[3*k+j];c[3*i+j]=s;}return c;};
const mmv = (m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
const basis = (x1,y1,x2,y2,x3,y3,x4,y4)=>{const m=[x1,x2,x3,y1,y2,y3,1,1,1];const v=mmv(adj(m),[x4,y4,1]);return mmm(m,[v[0],0,0,0,v[1],0,0,0,v[2]]);};
const proj = (s,d)=>mmm(d, adj(s));
function warpMatrix(sw, sh, q) {
  const s = basis(0,0, sw,0, 0,sh, sw,sh);
  const d = basis(q.tl[0],q.tl[1], q.tr[0],q.tr[1], q.bl[0],q.bl[1], q.br[0],q.br[1]);
  const t = proj(s, d);
  for (let i=0;i<9;i++) t[i] /= t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]}, ${t[1]},${t[4]},0,${t[7]}, 0,0,1,0, ${t[2]},${t[5]},0,${t[8]})`;
}
const SCREEN_M = warpMatrix(SRC_W, SRC_H, MQUAD); // mock 2000-space 기준 (모든 슬롯 공통)

const mockSlotHTML = (s, i, n) => {
  const glow = 30 + (i * 40) / Math.max(1, n - 1);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONTS}<style>${COMMON}
 html,body{width:${W}px;height:${H}px}
 .frame{width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${bg(glow)}}
 .mockwrap{position:absolute;left:0;top:0;width:2000px;height:2000px;transform:translate(${TX}px,${TY}px) scale(${MS});transform-origin:0 0;z-index:2}
 .shot{position:absolute;left:0;top:0;width:${SRC_W}px;height:${SRC_H}px;transform-origin:0 0;transform:${SCREEN_M}}
 .mockimg{position:absolute;left:0;top:0;width:2000px;height:2000px}
</style></head><body><div class="frame"><div class="grain"></div>
 <div class="cap">${logoCap}<div class="head">${s.head}</div><div class="sub">${s.sub}</div></div>
 <div class="mockwrap">
   <img class="shot" src="data:image/png;base64,${b64(s.shot)}">
   <img class="mockimg" src="data:image/png;base64,${MOCK}">
 </div>
</div></body></html>`;
};

const singleHTML = (s, i, n) => {
  const glow = 30 + (i * 40) / Math.max(1, n - 1);
  const ph = phoneBox({ data: b64(s.shot), bodyW: 860, tilt: s.tilt });
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONTS}<style>${COMMON}
 html,body{width:${W}px;height:${H}px}
 .frame{width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${bg(glow)}}
 .stage{position:absolute;left:50%;bottom:-40px;transform:translateX(-50%);perspective:1400px;z-index:2}
</style></head><body><div class="frame"><div class="grain"></div>
 <div class="cap">${logoCap}<div class="head">${s.head}</div><div class="sub">${s.sub}</div></div>
 <div class="stage">${ph.html}</div>
</div></body></html>`;
};

const panoramaHTML = (p) => {
  const CW = W * 2;
  const ph = phoneBox({ data: b64(p.shot), bodyW: 720, tilt: -20, shadow: '0 60px 90px rgba(0,0,0,.6), 0 0 80px rgba(255,120,50,.30)' });
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONTS}<style>${COMMON}
 html,body{width:${CW}px;height:${H}px}
 .frame{width:${CW}px;height:${H}px;position:relative;overflow:hidden;background:${bg(50)}}
 .spot{position:absolute;left:50%;top:54%;width:1700px;height:1700px;transform:translate(-50%,-50%);background:radial-gradient(closest-side, rgba(255,150,80,.28) 0%, rgba(255,90,31,.10) 38%, rgba(255,90,31,0) 70%);z-index:1}
 .stage{position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);perspective:1700px;z-index:2}
</style></head><body><div class="frame"><div class="grain"></div>
 ${logoCorner}
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
  await render(mockSlotHTML(SINGLES[i], i, SINGLES.length), W, [{ path: out, clip: { x: 0, y: 0, width: W, height: H } }]);
}
await browser.close();
console.log(`완료 — 총 ${slot - 1}장 →`, OUT);
