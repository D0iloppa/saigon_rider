import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 2026-08-07 신설 — 나침반 3-state 상태기계(북향/수동/heading 추종) + 두 손가락 수동 회전 제스처.
 * ai-docs/context/service-rules.md §회전(나침반) 참조. Playwright 표준 API(`page.touchscreen`)는
 * 단일 터치만 지원하므로, CDP `Input.dispatchTouchEvent` 로 두 터치 포인트를 직접 구동해 실제
 * 두 손가락 회전 제스처를 재현한다(Chromium 전용 — playwright.config.ts 가 chromium 프로젝트만 쓴다).
 *
 * 재개정(2026-08-07, 네이버지도 모델, 대표 지적 "회전모드가 어색해") — 나침반 버튼은 이제
 * bearing!==0(회전 중)일 때만 나타난다(평상시엔 없다). 이 파일은 그 조건부 렌더 + 데드존/지배성
 * 판정 강화(핀치줌만 하는 제스처가 회전을 유발하지 않는 것)를 함께 고정한다.
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

    const locateCtrl = app.locator('div[class*="locateCtrl"]');
    // 평상시(bearing=0)엔 나침반 버튼이 없다 — ◎ 하나뿐이다(네이버지도 모델).
    await expect(locateCtrl.locator('button')).toHaveCount(1);

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

    // 두 손가락을 수평(0°)으로 내린 뒤, 데드존(10°)을 넉넉히 넘도록 40° 회전시킨다. 두 손가락
    // 사이 거리(반지름×2)는 이 동안 일정하므로 지배성 판정(회전 아크 vs 줌 이동량)도 자연히 통과한다.
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(0) });
    for (const deg of [10, 20, 30, 40]) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(deg) });
      await page.waitForTimeout(30);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // 수동 회전으로 전이했으면 회전 <g> 가 더 이상 rotate(0 ...)이 아니어야 하고, 그 결과로만
    // 나침반 버튼(북향 복귀 전용)이 나타나야 한다.
    await expect(rotatedG).not.toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });
    await expect(locateCtrl.locator('button')).toHaveCount(2);
    const compassBtn = locateCtrl.locator('button').nth(1);
    await expect(compassBtn).toHaveClass(/ctrlBtnActive/);

    // 나침반 버튼을 누르면 수동 상태에서도 정방향(북향, rotate(0 ...))으로 복귀하고, 버튼 자신도
    // 사라진다(상태기계: manual → north).
    await compassBtn.click();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });
    await expect(locateCtrl.locator('button')).toHaveCount(1);
  });

  test('줌만 하는 핀치(손가락 사이 거리만 변화, 각도 고정)는 회전을 유발하지 않는다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('pinchonly'));
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
    const locateCtrl = app.locator('div[class*="locateCtrl"]');

    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    const box = await svgEl.boundingBox();
    if (!box) throw new Error('no svg box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    // 두 손가락을 수평(각도 고정, 0°)으로 두고 반지름만 벌린다 — 순수 핀치줌. 대표 지적의 핵심
    // 시나리오(손가락이 완벽히 대칭이 아니어서 각도가 약간 누적되는 것)를 재현하려고, 위쪽 손가락만
    // 살짝(2px) 수직으로 어긋나게 시작해 프레임마다 미세한 각도 흔들림이 생기게 한다 — 그래도
    // 지배성 판정(줌 이동량이 압도적으로 큼)에 걸려 회전으로 커밋되면 안 된다.
    const touchPoint = (radius: number, jitterY: number) => [
      { x: cx - radius, y: cy - jitterY },
      { x: cx + radius, y: cy + jitterY },
    ];
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(60, 2) });
    for (const radius of [80, 110, 140, 170, 200]) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(radius, 2) });
      await page.waitForTimeout(30);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // 순수 줌 의도 제스처이므로 회전 <g> 는 여전히 rotate(0 ...)이어야 하고, 나침반 버튼도 나타나면 안 된다.
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });
    await expect(locateCtrl.locator('button')).toHaveCount(1);
  });
});
