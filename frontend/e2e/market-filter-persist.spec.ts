import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 마켓 표시 범위 선택의 영속성 회귀 — 대표 지적 2026-08-05:
 * "설정을 바꿔서 다시 들어가면 초기화됨".
 *
 * 마켓 필터는 sessionStorage 에만 저장돼 웹뷰 세션이 끝나면(앱 재시작) '전체 지역'으로
 * 되돌아갔다. 동네지도·정보 화면은 useLocationStore(persist=localStorage)라 유지되는
 * 비대칭이었다. 저장소를 localStorage 로 올려 앱 재시작 후에도 선택이 남는지 확인한다.
 *
 * **콜드 스타트 모사**: 새 BrowserContext = 새 sessionStorage(앱 재실행), localStorage 는
 * 그 사이 옮겨 심는다 — 실제 웹뷰 재시작과 같은 조건.
 */
const L = { allAreas: 'Toàn bộ khu vực', currentLocation: 'Dùng vị trí hiện tại của tôi', apply: 'Áp dụng' };

test.describe('마켓 표시 범위 영속성', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('표시 범위를 고른 뒤 앱을 재시작해도 유지된다', async ({ page, request, browser }) => {
    session = await devLogin(request, uniqueTag('mfp'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByText(L.allAreas, { exact: true }).first().click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 10_000 });

    // 앱 재시작 모사 — localStorage 만 넘기고 새 컨텍스트(=새 sessionStorage)로 재진입
    const saved = await page.evaluate(() => JSON.stringify(window.localStorage));
    const fresh = await browser.newContext({
      geolocation: { latitude: 10.77293, longitude: 106.7003 },
      permissions: ['geolocation'],
      baseURL: 'http://localhost:18090',
    });
    const page2 = await fresh.newPage();
    await injectSession(page2, session);
    await page2.addInitScript((dump: string) => {
      const data = JSON.parse(dump) as Record<string, string>;
      for (const [k, v] of Object.entries(data)) window.localStorage.setItem(k, v);
    }, saved);
    await page2.goto('/market');

    // 헤더가 '전체 지역'으로 초기화되지 않고 고른 지역을 유지한다
    await expect(page2.locator('h1')).toContainText('Sài Gòn', { timeout: 15_000 });
    // 콜드 스타트에서는 리스트 뷰로 시작한다(viewMode 는 세션 범위 — 지도로 열리면 안 된다)
    await expect(page2.getByRole('button', { name: 'Xem bản đồ' })).toBeVisible({ timeout: 15_000 });
    await fresh.close();
  });
});
