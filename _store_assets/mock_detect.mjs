import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const mockB64 = readFileSync('shots/mock.png').toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();

const result = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;

  const transparent = (p) => d[p*4+3] < 40;
  const bgLabel = new Uint8Array(W*H);     // 1 = background (border-connected transparent)
  const stack = [];
  const pushIf = (p) => { if (!bgLabel[p] && transparent(p)) { bgLabel[p]=1; stack.push(p); } };
  for (let x=0;x<W;x++){ pushIf(x); pushIf((H-1)*W+x); }
  for (let y=0;y<H;y++){ pushIf(y*W); pushIf(y*W+W-1); }
  while (stack.length){ const q=stack.pop(); const x=q%W,y=(q/W)|0;
    if(x>0)pushIf(q-1); if(x<W-1)pushIf(q+1); if(y>0)pushIf(q-W); if(y<H-1)pushIf(q+W); }

  // screen = transparent AND not background → largest component bbox + corners
  let tls=1e9,brs=-1e9,trs=-1e9,bls=1e9, tl=[0,0],tr=[0,0],br=[0,0],bl=[0,0];
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1,count=0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const p=y*W+x;
    if (!transparent(p) || bgLabel[p]) continue;
    count++; if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;
    const s=x+y, dd=x-y;
    if(s<tls){tls=s;tl=[x,y];} if(s>brs){brs=s;br=[x,y];}
    if(dd>trs){trs=dd;tr=[x,y];} if(dd<bls){bls=dd;bl=[x,y];}
  }

  // debug overlay
  ctx.drawImage(img,0,0);
  ctx.fillStyle='rgba(0,255,0,.25)';
  ctx.fillRect(minx,miny,maxx-minx,maxy-miny);
  ctx.strokeStyle='lime';ctx.lineWidth=6;ctx.beginPath();
  ctx.moveTo(...tl);ctx.lineTo(...tr);ctx.lineTo(...br);ctx.lineTo(...bl);ctx.closePath();ctx.stroke();
  ctx.fillStyle='red';for(const[x,y]of[tl,tr,br,bl]){ctx.beginPath();ctx.arc(x,y,20,0,7);ctx.fill();}
  return {W,H,count,bbox:{minx,miny,maxx,maxy},quad:{tl,tr,br,bl},debug:cv.toDataURL('image/png')};
}, mockB64);

await browser.close();
console.log('size',result.W,result.H,'screen px',result.count);
console.log('bbox',JSON.stringify(result.bbox));
console.log('quad',JSON.stringify(result.quad));
writeFileSync('out/_mock_debug.png', Buffer.from(result.debug.split(',')[1],'base64'));
console.log('wrote out/_mock_debug.png');
