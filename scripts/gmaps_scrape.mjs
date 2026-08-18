/**
 * Google 지도 검색 스크래핑 — 업체 등록 알바 타깃 후보 명단 수집 (일회성 영업 도구)
 *
 * Places API 유료 호출 대신 지도 검색 결과를 직접 긁는다. 서비스 DB 에는 넣지 않고
 * CSV 로만 뽑는다 — 미가입 후보를 gas_station/repair_shop 에 넣으면 동네지도에
 * 가입도 안 한 가게가 노출된다.
 *
 * 출력 CSV 는 backend/scripts/import_business_csv.py 포맷과 동일:
 *   name,category,address,latitude,longitude,phone,intro
 *
 * Usage:
 *   node scripts/gmaps_scrape.mjs --query "phụ tùng xe máy" --category parts \
 *        --lat 10.7707 --lng 106.69456 --zoom 16 --max 120 --out /tmp/out.csv
 */

// playwright 는 frontend 워크스페이스에만 설치돼 있어 절대경로로 로드한다
const { chromium } = await import(
  new URL('../frontend/node_modules/playwright/index.mjs', import.meta.url).href,
).catch(() => import('playwright'));
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const QUERY = args.query;
const CATEGORY = args.category ?? 'etc';
const LAT = Number(args.lat ?? 10.7707);
const LNG = Number(args.lng ?? 106.69456);
const ZOOM = Number(args.zoom ?? 16);
const MAX = Number(args.max ?? 120);
const OUT = args.out ?? '/tmp/gmaps.csv';
const HEADFUL = args.headful === 'true';

if (!QUERY) {
  console.error('--query 필수');
  process.exit(1);
}

const csvCell = (v) => {
  const s = String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim();
  return /[",]/.test(s) ? `"${s}"` : s;
};

const browser = await chromium.launch({ headless: !HEADFUL });
const ctx = await browser.newContext({
  locale: 'vi-VN',
  timezoneId: 'Asia/Ho_Chi_Minh',
  viewport: { width: 1400, height: 1000 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
// 동의(consent) 인터스티셜 우회
await ctx.addCookies([
  { name: 'SOCS', value: 'CAESHAgBEhIaAB', domain: '.google.com', path: '/' },
  { name: 'CONSENT', value: 'YES+cb', domain: '.google.com', path: '/' },
]);
const page = await ctx.newPage();

const url = `https://www.google.com/maps/search/${encodeURIComponent(QUERY)}/@${LAT},${LNG},${ZOOM}z?hl=vi&gl=VN`;
console.error(`[open] ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

// 결과 피드 대기 (단일 장소로 바로 빠지는 경우도 있어 실패를 허용)
const feedSel = 'div[role="feed"]';
try {
  await page.waitForSelector(feedSel, { timeout: 25000 });
} catch {
  console.error('[warn] 결과 피드 없음 — 단일 장소이거나 차단됐을 수 있음');
}

// 피드 하단까지 스크롤 (증가가 멈추면 종료)
let prev = 0;
let stagnant = 0;
for (let i = 0; i < 40; i += 1) {
  const n = await page.locator('a[href*="/maps/place/"]').count();
  if (n >= MAX) break;
  if (n === prev) {
    stagnant += 1;
    if (stagnant >= 3) break;
  } else {
    stagnant = 0;
  }
  prev = n;
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollTop = el.scrollHeight;
  }, feedSel);
  await page.waitForTimeout(1400);
}

const rows = await page.evaluate(() => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('a[href*="/maps/place/"]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const name = a.getAttribute('aria-label') || '';
    if (!name || seen.has(href)) return;
    seen.add(href);
    // href 의 !3d<lat>!4d<lng> 에서 좌표 추출
    const m = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    // 카드 텍스트에서 주소/전화 추정
    const card = a.closest('div[jsaction]')?.parentElement || a.parentElement;
    const text = card ? card.innerText : '';
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const phone = (text.match(/0\d[\d\s.\-]{7,}/) || [''])[0];
    out.push({
      name,
      lat: m ? m[1] : '',
      lng: m ? m[2] : '',
      lines,
      phone,
      href,
    });
  });
  return out;
});

console.error(`[found] ${rows.length}건`);

const header = 'name,category,address,latitude,longitude,phone,intro';
const body = rows.slice(0, MAX).map((r) => {
  // lines: [이름, 평점·리뷰, "업종 · 주소", 영업시간 ...] — 주소는 가운뎃점 뒤쪽을 취함
  const addrLine = r.lines.find((l) => /·/.test(l) && !/^\d[.,]\d/.test(l)) || '';
  const address = addrLine.split('·').slice(1).join('·').trim() || addrLine;
  const bizType = addrLine.split('·')[0].trim();
  return [r.name, CATEGORY, address, r.lat, r.lng, r.phone, bizType].map(csvCell).join(',');
});

// 이어붙이기 지원 — 여러 쿼리/구역을 한 파일에 모은다
const exists = existsSync(OUT) && readFileSync(OUT, 'utf8').startsWith('name,');
writeFileSync(OUT, (exists ? readFileSync(OUT, 'utf8').trimEnd() + '\n' : header + '\n') + body.join('\n') + '\n');
console.error(`[write] ${OUT} (+${body.length}행)`);

await browser.close();
