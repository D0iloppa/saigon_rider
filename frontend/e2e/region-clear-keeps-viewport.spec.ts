import { test, expect, type Page } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 지역칩 ✕ 해제는 "현재 화면 위치 그대로, 필터 조건만" 푼다 (대표 지적 2026-08-04).
 *
 * 직전 버그: locateOnMount 가 반응형 조건(동네지도 mode==='viewport' / 마켓 locationMode==='all')에
 * 묶여 있어, 지역선택 상태로 진입하면 false(=자동 locate 미발화, didAutoLocate 가드도 미소진)였다가
 * ✕ 로 조건이 참이 되는 순간 SaigonMapV5 의 자동 locate 이펙트가 처음 발화 → GPS 재측정 +
 * focusLatLng 카메라 딥줌 + bbox 재emit 으로 재렌더까지 이어졌다.
 * 수정: SaigonMapV5 가 마운트 시점 값을 ref 로 고정(prop 이름대로 마운트 1회).
 *
 * 검증축 2개 — ✕ 이후 (1) GPS 재측정 호출 0건, (2) 지도 카메라(viewBox) 불변.
 */

const L = {
  allAreas: 'Toàn bộ khu vực',
  currentLocation: 'Dùng vị trí hiện tại của tôi',
  apply: 'Áp dụng',
  viewMap: 'Xem bản đồ',
};

/** navigator.geolocation.getCurrentPosition 호출 횟수 카운터 주입 (Capacitor 웹 구현이 이 API 를 쓴다) */
async function countGeoCalls(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __geoCalls: number }).__geoCalls = 0;
    const orig = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = ((...args: Parameters<typeof orig>) => {
      (window as unknown as { __geoCalls: number }).__geoCalls += 1;
      return orig(...args);
    }) as typeof orig;
  });
}

const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);
/** 지도 카메라 상태 = SaigonMapV5 루트 svg 의 viewBox */
const viewBox = (page: Page) => page.locator('svg[viewBox]').first().getAttribute('viewBox');

test.describe('지역칩 ✕ — 카메라 유지 · GPS 재측정 없음', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('동네지도: ✕ 로 필터만 풀리고 위치·카메라는 그대로다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('rc1'));
    await saveConsentViaApi(request, session);
    await countGeoCalls(page);
    await injectSession(page, session);

    await page.goto('/map');
    await page.getByRole('heading', { level: 1 }).click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sài Gòn', { timeout: 10_000 });

    await page.getByRole('button', { name: L.viewMap }).click();
    const pill = page.locator('[class*="areaPill"]').first();
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000); // 진입 직후 bbox 디바운스·fetch 안정화

    const geoBefore = await geoCalls(page);
    const vbBefore = await viewBox(page);
    expect(vbBefore).toBeTruthy();

    await pill.click();

    // 필터는 실제로 풀린다
    await expect(page.locator('[class*="areaPill"]')).toHaveCount(0, { timeout: 10_000 });
    // 자동 locate 가 비동기로 끼어들 여유를 준 뒤 두 축을 확인한다
    await page.waitForTimeout(3000);
    expect(await geoCalls(page)).toBe(geoBefore);
    expect(await viewBox(page)).toBe(vbBefore);
  });

  test('마켓 지도: ✕ 로 필터만 풀리고 위치·카메라는 그대로다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('rc2'));
    await saveConsentViaApi(request, session);
    await countGeoCalls(page);
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByText(L.allAreas, { exact: true }).first().click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 10_000 });

    await page.getByRole('button', { name: L.viewMap }).click();
    const pill = page.locator('[class*="areaPill"]').first();
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);

    const geoBefore = await geoCalls(page);
    const vbBefore = await viewBox(page);
    expect(vbBefore).toBeTruthy();

    await pill.click();

    await expect(page.locator('h1')).toContainText(L.allAreas, { timeout: 10_000 });
    await expect(page.locator('[class*="areaPill"]')).toHaveCount(0);
    await page.waitForTimeout(3000);
    expect(await geoCalls(page)).toBe(geoBefore);
    expect(await viewBox(page)).toBe(vbBefore);
  });
});
