import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const W = 1290, H = 2796;
const MOCK = readFileSync('shots/mock.png').toString('base64');

// 검출된 화면 사각형 (2000×2000 mock 좌표)
let MQUAD = { tl:[903,446], tr:[1426,448], br:[1444,1640], bl:[896,1641] };
// 흰 화면이 베젤 밑으로 살짝 들어가도록 바깥으로 1.5% 확장 (가장자리 투명 seam 방지)
const cx = (MQUAD.tl[0]+MQUAD.tr[0]+MQUAD.br[0]+MQUAD.bl[0])/4;
const cy = (MQUAD.tl[1]+MQUAD.tr[1]+MQUAD.br[1]+MQUAD.bl[1])/4;
const inflate = (p,f)=>[cx+(p[0]-cx)*f, cy+(p[1]-cy)*f];
const QF = 1.018;
const QUAD = { tl:inflate(MQUAD.tl,QF), tr:inflate(MQUAD.tr,QF), br:inflate(MQUAD.br,QF), bl:inflate(MQUAD.bl,QF) };

const SRC_W = 1179, SRC_H = 2556;
// mock 배치: 화면 중심을 프레임 (FX,FY)에 두고 scale MS. 손이 하단으로 빠지도록 FY를 내림.
const MS = 1.30, FX = 645, FY = 1605;
const SC = [cx, cy];
const TX = FX - SC[0]*MS, TY = FY - SC[1]*MS;

// 4점→4점 사영변환
const adj = m => [m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4],
                  m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5],
                  m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3]];
const mmm = (a,b)=>{const c=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=a[3*i+k]*b[3*k+j];c[3*i+j]=s;}return c;};
const mmv = (m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
const basis=(x1,y1,x2,y2,x3,y3,x4,y4)=>{const m=[x1,x2,x3,y1,y2,y3,1,1,1];const v=mmv(adj(m),[x4,y4,1]);return mmm(m,[v[0],0,0,0,v[1],0,0,0,v[2]]);};
function warpMatrix(sw,sh,q){
  const s=basis(0,0, sw,0, 0,sh, sw,sh);
  const d=basis(q.tl[0],q.tl[1], q.tr[0],q.tr[1], q.bl[0],q.bl[1], q.br[0],q.br[1]);
  const t=mmm(d, adj(s)); for(let i=0;i<9;i++)t[i]/=t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]}, ${t[1]},${t[4]},0,${t[7]}, 0,0,1,0, ${t[2]},${t[5]},0,${t[8]})`;
}
const SCREEN_M = warpMatrix(SRC_W, SRC_H, QUAD);

const bg = `
  radial-gradient(120% 75% at 50% 102%, rgba(255,90,31,.58) 0%, rgba(255,90,31,0) 55%),
  radial-gradient(80% 50% at 8% 12%, rgba(0,240,255,.16) 0%, rgba(0,240,255,0) 60%),
  radial-gradient(70% 45% at 96% 26%, rgba(255,45,156,.15) 0%, rgba(255,45,156,0) 60%),
  linear-gradient(165deg,#11131C 0%,#08090F 58%,#1A1D2A 100%)`;
const grain = `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px}
 .frame{width:${W}px;height:${H}px;position:relative;overflow:hidden;background:${bg}}
 .grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay;${grain}}
 .mockwrap{position:absolute;left:0;top:0;width:2000px;height:2000px;transform:translate(${TX}px,${TY}px) scale(${MS});transform-origin:0 0}
 .screenfill{position:absolute;left:0;top:0;width:${SRC_W}px;height:${SRC_H}px;transform-origin:0 0;transform:${SCREEN_M};background:#ffffff}
 .mockimg{position:absolute;left:0;top:0;width:2000px;height:2000px}
</style></head><body><div class="frame"><div class="grain"></div>
 <div class="mockwrap">
   <img class="mockimg" src="data:image/png;base64,${MOCK}">
 </div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
await page.setContent(html, { waitUntil:'networkidle' });
await page.waitForTimeout(250);
await page.screenshot({ path:'out/mock_base.png', clip:{x:0,y:0,width:W,height:H} });
await browser.close();
console.log('wrote out/mock_base.png  (MS='+MS+' FY='+FY+')');
