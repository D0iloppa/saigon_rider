import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 마켓 지도 POI 참조 레이어 회귀 — 대표 지적 2026-08-05:
 * "동네지도에는 POI(시장·박물관·사원 등)가 뜨는데 마켓지도에는 안 뜬다".
 *
 * 마켓은 매물 핀만 markers 로 넘겨 POI 레이어가 아예 없었다. 동네지도와 같은 공용 훅
 * (usePoiMarkers)으로 배선했고, 두 화면 모두 같은 POI 라벨이 보이는지 확인한다.
 */
const POI_LABEL = 'Chợ Bến Thành'; // 벤타인 시장 — 기본 조망(호치민 중심) bbox 안의 POI

test.describe('지도 POI 레이어 — 마켓/동네지도 동일', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('마켓지도에 POI 라벨이 노출된다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('poi1'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();
    await expect(page.locator('svg text', { hasText: POI_LABEL }).first()).toBeVisible({ timeout: 25_000 });
  });

  test('동네지도에도 같은 POI 라벨이 노출된다(기준 화면 회귀 확인)', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('poi2'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();
    await expect(page.locator('svg text', { hasText: POI_LABEL }).first()).toBeVisible({ timeout: 25_000 });
  });
});
