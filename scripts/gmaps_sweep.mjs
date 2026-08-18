/**
 * Google 지도 스윕 — 카테고리 × 구역 전수 검색으로 타깃 후보 명단을 만든다.
 * 브라우저 1개를 재사용하며 (카테고리 × 동) 조합을 순회하고, 좌표 기준으로 중복을 제거한다.
 *
 * 서비스 DB 에는 넣지 않는다 — CSV 만 뽑는다(미가입 후보가 동네지도에 노출되는 것을 막기 위함).
 * 출력 포맷은 backend/scripts/import_business_csv.py 와 동일.
 *
 * Usage:
 *   node scripts/gmaps_sweep.mjs --out /tmp/targets.csv --max 60 --zoom 15
 */

const { chromium } = await import(
  new URL('../frontend/node_modules/playwright/index.mjs', import.meta.url).href,
).catch(() => import('playwright'));
import { writeFileSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const OUT = args.out ?? '/tmp/targets.csv';
const MAX = Number(args.max ?? 60);
const ZOOM = Number(args.zoom ?? 15);

// business_category.code → 베트남어 검색어 (119_business_category.sql 기준)
// fuel·repair 는 이미 gas_station/repair_shop 도메인이 따로 있어 제외, etc 는 검색어 성립 안 함
const CATEGORIES = [
  // [business_category.code, 베트남어 검색어, 서브타입, 매물 가능 여부]
  ['parts', 'phụ tùng xe máy', '', 'Y'],
  ['parts', 'phụ tùng xe máy cũ', 'used_parts', 'Y'],
  ['gear', 'mũ bảo hiểm', '', 'Y'],
  ['accessory', 'phụ kiện độ xe máy', '', 'Y'],
  ['accessory', 'đồ chơi xe máy', '', 'Y'],
  // 중고 오토바이 판매점 — business_category 에 '판매점' 코드가 없어 etc 로 담는다(D-17)
  ['etc', 'xe máy cũ', 'used_moto', 'Y'],
  ['etc', 'mua bán xe máy', 'used_moto', 'Y'],
  ['wash', 'rửa xe máy', '', 'N'],
  ['tire', 'lốp xe máy', '', 'N'],
  ['cafe', 'quán cà phê', '', 'N'],
  ['food', 'quán ăn', '', 'N'],
  ['convenience', 'cửa hàng tiện lợi', '', 'N'],
  ['parking', 'bãi giữ xe', '', 'N'],
  ['laundry', 'giặt ủi', '', 'N'],
  ['phone_repair', 'sửa điện thoại', '', 'N'],
  ['towing', 'cứu hộ xe máy', '', 'N'],
];

// 런칭 존 후보 5개 동 — 도심 인접 고밀도 (실제 존이 확정되면 교체)
const ZONE_WARDS = [
  ['Ben Thanh', 10.7707, 106.69456],
  ['Sai Gon', 10.781, 106.70418],
  ['Tan Dinh', 10.79126, 106.69396],
  ['Ban Co', 10.77087, 106.68203],
  ['Cau Ong Lanh', 10.7619, 106.68931],
];

// --wards all 이면 37개 동 전체 — 시드 SQL(SoT)에서 중심좌표를 그대로 읽는다
function allWards() {
  const sql = readFileSync(
    new URL('../database/init/159_wards_seed.sql', import.meta.url),
    'utf8',
  );
  const out = [];
  const re = /\('HCMC_[A-Z_]+',\s*'HCMC',\s*'[^']*',\s*'([^']*)',\s*([\d.]+),\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(sql)) !== null) out.push([m[1], Number(m[2]), Number(m[3])]);
  return out;
}

const WARDS = args.wards === 'all' ? allWards() : ZONE_WARDS;
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const LISTING_ONLY = args.listingOnly === 'true';

const csvCell = (v) => {
  const s = String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim();
  return /[",]/.test(s) ? `"${s}"` : s;
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'vi-VN',
  timezoneId: 'Asia/Ho_Chi_Minh',
  viewport: { width: 1400, height: 1000 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
await ctx.addCookies([
  { name: 'SOCS', value: 'CAESHAgBEhIaAB', domain: '.google.com', path: '/' },
  { name: 'CONSENT', value: 'YES+cb', domain: '.google.com', path: '/' },
]);
const page = await ctx.newPage();

const all = new Map(); // key: lat,lng 반올림 → 행
const stats = [];

for (const [code, query, subtype, listing] of CATEGORIES) {
  if (LISTING_ONLY && listing !== 'Y') continue;
  if (ONLY && !ONLY.has(code) && !ONLY.has(query)) continue;
  let catNew = 0;
  for (const [wardName, lat, lng] of WARDS) {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},${ZOOM}z?hl=vi&gl=VN`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      try {
        await page.waitForSelector('div[role="feed"]', { timeout: 20000 });
      } catch {
        /* 단일 장소로 빠졌거나 결과 없음 — 그대로 진행 */
      }
      let prev = 0;
      let stagnant = 0;
      for (let i = 0; i < 25; i += 1) {
        const n = await page.locator('a[href*="/maps/place/"]').count();
        if (n >= MAX) break;
        if (n === prev) {
          stagnant += 1;
          if (stagnant >= 3) break;
        } else stagnant = 0;
        prev = n;
        await page.evaluate(() => {
          const el = document.querySelector('div[role="feed"]');
          if (el) el.scrollTop = el.scrollHeight;
        });
        await page.waitForTimeout(1300);
      }
      const rows = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        document.querySelectorAll('a[href*="/maps/place/"]').forEach((a) => {
          const href = a.getAttribute('href') || '';
          const name = a.getAttribute('aria-label') || '';
          if (!name || seen.has(href)) return;
          seen.add(href);
          const m = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
          const card = a.closest('div[jsaction]')?.parentElement || a.parentElement;
          const text = card ? card.innerText : '';
          const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
          out.push({ name, lat: m ? m[1] : '', lng: m ? m[2] : '', lines, raw: lines.join(' | ') });
        });
        return out;
      });
      for (const r of rows) {
        if (!r.lat) continue;
        const key = `${Number(r.lat).toFixed(5)},${Number(r.lng).toFixed(5)}`;
        if (all.has(key)) continue;
        const addrLine = r.lines.find((l) => /·/.test(l) && !/^\d[.,]\d/.test(l)) || '';
        const address = addrLine.split('·').slice(1).join('·').trim() || addrLine;
        const bizType = addrLine.split('·')[0].trim();
        // 카드 원문 파싱 — 'Đã đóng cửa · Mở cửa lúc 9:00' 은 영업시간 밖일 뿐 폐업이 아니다.
        // 폐업은 'Đóng cửa vĩnh viễn'(영구) / 'Tạm thời đóng cửa'(임시휴업) 두 가지뿐.
        const line = r.lines.find((l) => /^\d[.,]\d$/.test(l.trim()));
        const withCnt = r.raw.match(/(\d[.,]\d)\s*\((\d[\d.,]*)\)/);
        const rating = line ? line.trim().replace(',', '.') : (withCnt ? withCnt[1].replace(',', '.') : '');
        const reviews = withCnt ? withCnt[2].replace(/[.,]/g, '') : '';
        const noReview = /Chưa có bài đánh giá/i.test(r.raw) ? 'Y' : '';
        const status = /vĩnh viễn/i.test(r.raw) ? 'PERM_CLOSED'
          : /Tạm thời đóng cửa/i.test(r.raw) ? 'TEMP_CLOSED' : '';
        const ph = r.raw.match(/\+84[\d\s]{8,15}/);
        const phone = ph ? ph[0].replace(/\s+/g, ' ').trim() : '';
        all.set(key, { name: r.name, code, subtype, listing, address, lat: r.lat, lng: r.lng,
                       bizType, ward: wardName, rating, reviews, noReview, status, phone, raw: r.raw });
        catNew += 1;
      }
      console.error(`  ${code} @ ${wardName}: ${rows.length}건 스캔, 누계 ${all.size}`);
    } catch (e) {
      console.error(`  ${code} @ ${wardName}: 실패 — ${e.message.split('\n')[0]}`);
    }
  }
  stats.push([code, catNew]);
  console.error(`[${code}] 신규 ${catNew}건`);
}

const header = 'name,category,subtype,listing_capable,address,latitude,longitude,phone,'
  + 'rating,reviews,no_review,status,biz_type,ward,raw';
const body = [...all.values()].map((r) =>
  [r.name, r.code, r.subtype, r.listing, r.address, r.lat, r.lng, r.phone,
   r.rating, r.reviews, r.noReview, r.status, r.bizType, r.ward, r.raw].map(csvCell).join(','),
);
writeFileSync(OUT, `${header}\n${body.join('\n')}\n`);

console.error('\n=== 카테고리별 신규 확보 ===');
stats.forEach(([c, n]) => console.error(`${c.padEnd(14)} ${n}`));
console.error(`총 ${all.size}곳 → ${OUT}`);

await browser.close();
