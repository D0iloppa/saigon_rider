import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 2026-08-07 신설 — 나침반 3-state 상태기계(북향/수동/heading 추종) + 두 손가락 수동 회전 제스처.
 * ai-docs/context/service-rules.md §회전(나침반) 참조. Playwright 표준 API(`page.touchscreen`)는
 * 단일 터치만 지원하므로, CDP `Input.dispatchTouchEvent` 로 두 터치 포인트를 직접 구동해 실제
 * 두 손가락 회전 제스처를 재현한다(Chromium 전용 — playwright.config.ts 가 chromium 프로젝트만 쓴다).
 */

const KEY = '__dev_gps';
const START = { lat: 10.77293, lng: 106.7003 };

test.describe('동네지도 — 두 손가락 수동 회전 제스처', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('두 손가락을 회전시키면 정방향에서 수동 회전으로 전이하고, 나침반 버튼을 누르면 정방향으로 복귀한다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('manrot'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

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
    const compassBtn = app.locator('button[class*="ctrlBtn"]:has(svg.lucide-navigation)');
    await expect(compassBtn).toBeVisible({ timeout: 20_000 });

    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    const box = await svgEl.boundingBox();
    if (!box) throw new Error('no svg box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const radius = Math.min(box.width, box.height) * 0.25;

    const client = await page.context().newCDPSession(page);
    const touchPoint = (angleDeg: number) => {
      const rad = (angleDeg * Math.PI) / 180;
      return [
        { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) },
        { x: cx - radius * Math.cos(rad), y: cy - radius * Math.sin(rad) },
      ];
    };

    // 두 손가락을 수평(0°)으로 내린 뒤, 데드존(6°)을 넉넉히 넘도록 40° 회전시킨다.
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(0) });
    for (const deg of [10, 20, 30, 40]) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(deg) });
      await page.waitForTimeout(30);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // 수동 회전으로 전이했으면 회전 <g> 가 더 이상 rotate(0 ...)이 아니어야 하고, 나침반 버튼도
    // 활성 스타일(ctrlBtnActive)을 얻어야 한다(정방향 vs 수동/추종 구분).
    await expect(rotatedG).not.toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });
    await expect(compassBtn).toHaveClass(/ctrlBtnActive/, { timeout: 10_000 });

    // 나침반 버튼을 누르면 수동 상태에서도 정방향(북향, rotate(0 ...))으로 복귀해야 한다
    // (상태기계: manual → north).
    await compassBtn.click();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });
    await expect(compassBtn).not.toHaveClass(/ctrlBtnActive/, { timeout: 10_000 });
  });
});
