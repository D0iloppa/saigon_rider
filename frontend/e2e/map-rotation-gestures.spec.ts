import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 회전(나침반) 상태에서 실제 제스처 방향 + L3/POI 표시 검증 — 대표 지적 2026-08-06:
 * "회전되었다고 L3/POI 가 안 보이는 건 안 됨" + "드래그가 손가락 방향이 아니라 회전축을 따라 변함".
 *
 * 08cd1e3(제스처 역회전 4곳)이 실측 없이 4곳 전부에 +bearing 보정을 넣었다 — 이 스펙은 실제
 * page.mouse 포인터 이벤트로 각 제스처를 구동해 정적 계약 테스트로는 못 잡은 방향 결함을 고정한다.
 * 실측 결과(SaigonMapV5.tsx 주석 참조): 휠·핀치중심·팬 3곳은 보정이 오히려 틀렸고(제거),
 * 탭 1곳만 map-space 히트테스트를 위해 +bearing 보정이 실제로 필요하다.
 */

const KEY = '__dev_gps';
const START = { lat: 10.77293, lng: 106.7003 };

async function enterCompassMode(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext, tag: string) {
  const session = await devLogin(request, uniqueTag(tag));
  await saveConsentViaApi(request, session);
  await injectSession(page, session);

  await page.goto('/dev/gps/');
  await page.check('#live');
  await page.evaluate(
    ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 0, speed: 3 })),
    [KEY, START.lat, START.lng] as const,
  );
  await page.locator('#routes button', { hasText: '동네지도' }).click();

  const app = page.frameLocator('#app');
  await app.locator('button[class*="mapPill"]').click({ timeout: 20_000 });

  const compassBtn = app.locator('button[class*="ctrlBtn"]:has(svg.lucide-navigation)');
  await expect(compassBtn).toBeVisible({ timeout: 20_000 });
  await compassBtn.click();
  await page.evaluate(
    ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 90, speed: 3 })),
    [KEY, START.lat, START.lng] as const,
  );
  const rotatedG = app.locator('svg g[transform^="rotate("]').first();
  await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });
  return { session, app };
}

function parseVb(vb: string | null): { x: number; y: number; w: number; h: number } {
  if (!vb) throw new Error('viewBox missing');
  const [x, y, w, h] = vb.split(/\s+/).map(Number);
  return { x, y, w, h };
}

test.describe('회전(bearing=90) 상태에서 실제 제스처 방향', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('실제 마우스 드래그(오른쪽) 시 viewBox 는 수평(x)으로만 이동한다 — 회전축(수직)으로 새지 않는다', async ({ page, request }) => {
    const r = await enterCompassMode(page, request, 'gestpan');
    session = r.session;
    const app = r.app;
    const svgEl = app.locator('svg.svg, svg[class*="svg"]').first();

    const vbBefore = parseVb(await svgEl.getAttribute('viewBox'));
    const box = await svgEl.boundingBox();
    if (!box) throw new Error('no svg box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const vbAfter = parseVb(await svgEl.getAttribute('viewBox'));
    const dx = Math.abs(vbAfter.x - vbBefore.x);
    const dy = Math.abs(vbAfter.y - vbBefore.y);
    expect(dx).toBeGreaterThan(50); // 수평 드래그는 반드시 x 이동을 유발해야 한다
    expect(dy).toBeLessThan(5); // 수직(y)으로는 거의 새지 않아야 한다 (구 08cd1e3 결함: dy만 변함)
  });

  test('실제 마우스 휠 줌은 커서 아래 지점을 중심으로 유지한다', async ({ page, request }) => {
    const r = await enterCompassMode(page, request, 'gestwheel');
    session = r.session;
    const app = r.app;
    const svgEl = app.locator('svg.svg, svg[class*="svg"]').first();

    const vbBefore = parseVb(await svgEl.getAttribute('viewBox'));
    const box = await svgEl.boundingBox();
    if (!box) throw new Error('no svg box');
    // 커서를 화면 1/4 지점(중심이 아닌 곳)에 둬 회전 보정 오류가 있으면 중심이 크게 벗어나게 한다.
    const px = box.x + box.width * 0.25;
    const py = box.y + box.height * 0.25;
    const rawCxBefore = vbBefore.x + ((px - box.x) / box.width) * vbBefore.w;
    const rawCyBefore = vbBefore.y + ((py - box.y) / box.height) * vbBefore.h;

    await page.mouse.move(px, py);
    await page.mouse.wheel(0, -200); // zoom in
    await page.waitForTimeout(200);

    const vbAfter = parseVb(await svgEl.getAttribute('viewBox'));
    expect(vbAfter.w).toBeLessThan(vbBefore.w); // 줌인 확인
    // 커서 아래 userSpace 점이 줌 후에도 같은 화면비 위치에 있어야 한다.
    const rawCxAfter = vbAfter.x + ((px - box.x) / box.width) * vbAfter.w;
    const rawCyAfter = vbAfter.y + ((py - box.y) / box.height) * vbAfter.h;
    expect(Math.abs(rawCxAfter - rawCxBefore)).toBeLessThan(vbBefore.w * 0.05);
    expect(Math.abs(rawCyAfter - rawCyBefore)).toBeLessThan(vbBefore.h * 0.05);
  });
});

test.describe('회전(bearing=90) 상태에서도 L3(건물)·POI 가 표시된다', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('bearing=90 에서도 건물(polygon.bldg) 요소가 렌더된다 — D-C 폐기 확인', async ({ page, request }) => {
    const r = await enterCompassMode(page, request, 'l3rot');
    session = r.session;
    const app = r.app;
    await page.waitForTimeout(500);
    const bldgCount = await app.locator('polygon[class*="bldg"]').count();
    expect(bldgCount).toBeGreaterThan(0);
  });
});

test.describe('bearing===0 회귀 — 기존 동작과 동일', () => {
  test('나침반이 꺼진 상태(bearing=0)에서는 수평 드래그가 여전히 수평으로만 이동한다', async ({ page, request }) => {
    const session = await devLogin(request, uniqueTag('gestreg'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);
    try {
      await page.goto('/dev/gps/');
      await page.check('#live');
      await page.evaluate(
        ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng })),
        [KEY, START.lat, START.lng] as const,
      );
      await page.locator('#routes button', { hasText: '동네지도' }).click();
      const app = page.frameLocator('#app');
      await app.locator('button[class*="mapPill"]').click({ timeout: 20_000 });
      const svgEl = app.locator('svg.svg, svg[class*="svg"]').first();
      await expect(svgEl).toBeVisible({ timeout: 20_000 });

      const vbBefore = parseVb(await svgEl.getAttribute('viewBox'));
      const box = await svgEl.boundingBox();
      if (!box) throw new Error('no svg box');
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 100, cy, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      const vbAfter = parseVb(await svgEl.getAttribute('viewBox'));
      expect(Math.abs(vbAfter.x - vbBefore.x)).toBeGreaterThan(50);
      expect(Math.abs(vbAfter.y - vbBefore.y)).toBeLessThan(5);
    } finally {
      cleanupUser(session.userId);
    }
  });
});
