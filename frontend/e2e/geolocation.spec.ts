import { test, expect } from '@playwright/test';
import {
  devLogin,
  injectSession,
  uniqueTag,
  saveConsentViaApi,
  cleanupUser,
  type DevSession,
} from './helpers';

/**
 * 브라우저 GPS 오버라이드 회귀 검증 — 2ddcbd5(resolveWardByCoords 폴리곤 우선화) 이후,
 * 실제로 브라우저에서 위치를 바꾸면 그 동으로 잘 뜨는지를 확인한다.
 *
 * (2026-08-06 개정 전 서술) 마켓은 GPS 를 자동 반영하지 않았다 — 헤더 지역명을 탭해 '표시 범위' 시트에서
 * '내 현재 위치'를 고르고 '적용'을 눌러야 GPS 를 읽는다. 이 플로우를 그대로 재현한다.
 *
 * 좌표 (10.77293, 106.70030)는 Sài Gòn 폴리곤 내부이지만 Bến Thành 중심이 더 가깝다
 * (0.674km vs 0.992km) — 폴리곤-최근접 알고리즘 불일치 버그가 재발하면 Bến Thành 로 뜬다.
 */
async function openGpsSheetAndApply(page: import('@playwright/test').Page) {
  // 초기 상태(locationMode='all') 헤더 문구 — 탭하면 '표시 범위' 시트가 열린다.
  await page.getByText('Toàn bộ khu vực', { exact: true }).click();
  await page.getByText('Vị trí hiện tại của tôi', { exact: true }).click();
  await page.getByRole('button', { name: 'Áp dụng' }).click();
}

test.describe('마켓 GPS 회귀 — Sài Gòn vs Bến Thành', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('실제 위치가 Sài Gòn 동일 때 마켓 헤더도 Sài Gòn 으로 표시된다(Bến Thành 아님)', async ({ page, request }) => {
    const tag = uniqueTag('g1');
    session = await devLogin(request, tag);
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await openGpsSheetAndApply(page);

    const header = page.locator('h1');
    await expect(header).toContainText('Sài Gòn', { timeout: 10_000 });
    await expect(header).not.toContainText('Bến Thành');
  });
});

test.describe('마켓 GPS 오버라이드 — 다른 동(Tân Định) 좌표 추종', () => {
  // Tân Định 폴리곤 centroid — saigon-depth1.json 의 "Tân Định"(slug tan-dinh) gps 필드,
  // 자체 폴리곤(p, VW/VH/bbox 로 px→lat/lng 환산) 내부에 있음을 별도 스크립트로 확인함
  // (frontend/src/components/maps/v2/region.ts 의 ray-casting regionContains 로 재현 검증).
  // wards 테이블의 center_lat/center_lng 도 동일 값(10.79126, 106.69396) — 이름 매칭까지 일치.
  test.use({
    geolocation: { latitude: 10.79126, longitude: 106.69396 },
    permissions: ['geolocation'],
  });

  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('다른 동(Tân Định) 폴리곤 내부 좌표를 주면 그 동 이름이 표시된다', async ({ page, request }) => {
    const tag = uniqueTag('g2');
    session = await devLogin(request, tag);
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await openGpsSheetAndApply(page);

    await expect(page.locator('h1')).toContainText('Tân Định', { timeout: 10_000 });
  });
});

test.describe('화면 간 일관성 — 마켓과 홈 헤더가 같은 GPS 좌표에서 같은 동을 보여준다', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('마켓에서 GPS 적용 후 표시된 동 이름이 홈 헤더의 GPS 표기와 일치한다', async ({ page, request }) => {
    const tag = uniqueTag('g3');
    session = await devLogin(request, tag);
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await openGpsSheetAndApply(page);
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 10_000 });

    // 홈 헤더 위치 행 — HomePage 가 표시 범위 스토어의 GPS 좌표로 동 이름을 라벨링한다.
    // 2026-08-06 개정: 이 라벨은 더 이상 "표시 전용"이 아니다 — 아래 근처 상품 목록도
    // 같은 좌표를 기준으로 조회한다(헤더와 목록이 어긋나던 회귀의 수정점).
    await page.goto('/home');
    const homeLoc = page.getByRole('button', { name: 'Chọn khu vực' });
    await expect(homeLoc).toContainText('Vị trí hiện tại: Sài Gòn', { timeout: 10_000 });
  });
});
