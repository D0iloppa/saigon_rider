import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * '내 위치' 점의 실시간 추종 회귀 — 대표 지적 2026-08-05:
 * "gps 로 표시는 해주는데 실시간 위치 반영을 안 한다".
 *
 * 점은 마운트 1회 측위로만 세팅됐고 이후 이동해도 그대로였다. SaigonMapV5 가 점이 찍힌 뒤
 * `native.watchLocation` 으로 좌표를 계속 갱신한다(카메라는 따라가지 않음 — 표시 전용).
 */
test.describe('내 위치 점 실시간 추종', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('위치가 바뀌면 점도 따라 움직인다 (동네지도)', async ({ page, context, request }) => {
    session = await devLogin(request, uniqueTag('mdl'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    const dot = page.locator('[class*="meDot"]').first();
    await expect(dot).toHaveCount(1, { timeout: 20_000 });
    const before = await dot.getAttribute('cx');

    // 같은 서비스 지역 안에서 약 1.5km 이동
    await context.setGeolocation({ latitude: 10.7845, longitude: 106.6905 });

    await expect.poll(async () => dot.getAttribute('cx'), { timeout: 20_000 }).not.toBe(before);
  });
});
