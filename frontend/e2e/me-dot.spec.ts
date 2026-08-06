import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 내 위치 파란 점(SaigonMapV5 meDot) 회귀 — 대표 지적 2026-08-04:
 * "동네지도엔 내 위치가 찍히는데 마켓지도엔 안 찍힌다".
 *
 * 원인은 점이 runLocate(=locateOnMount) 의 부수효과로만 세팅된 것 — 마켓은 지역이 선택되면 (구)
 * (실사용의 기본 경로) 카메라 덮어쓰기 회귀를 막으려 locateOnMount 를 끄므로 점도 함께 사라졌다.
 * 이제 dot 전용 조용한 측위(meDotOnMount)로 분리돼 항상 점이 찍힌다.
 * (2026-08-06 개정: 지역 선택이 폐기돼 표시 범위는 GPS 가 기본 — 시트 조작 없이 바로 확인한다.)
 */
const L = {
  allAreas: 'Toàn bộ khu vực',
  currentLocation: 'Vị trí hiện tại của tôi',
  apply: 'Áp dụng',
  viewMap: 'Xem bản đồ',
};

test.describe('내 위치 점 — 마켓지도/동네지도 공통', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('마켓지도: 내 위치 점이 찍힌다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('me1'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByText(L.allAreas, { exact: true }).first().click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 10_000 });

    await page.getByRole('button', { name: L.viewMap }).click();
    await expect(page.locator('[class*="meDot"]')).toHaveCount(1, { timeout: 20_000 });
  });

  test('동네지도: 내 위치 점이 찍힌다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('me2'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    await page.getByRole('heading', { level: 1 }).click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sài Gòn', { timeout: 10_000 });

    // 리스트 → 지도 전환 (시트가 지도를 덮은 상태에서는 점도 렌더 대상이 아니다)
    await page.getByRole('button', { name: L.viewMap }).click();
    await expect(page.locator('[class*="meDot"]')).toHaveCount(1, { timeout: 20_000 });
  });
});
