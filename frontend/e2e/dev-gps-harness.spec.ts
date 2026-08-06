import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * `/dev/gps` GPS 하네스 회귀 감시.
 *
 * 하네스는 같은 출처의 localStorage(`__dev_gps`)에 좌표를 쓰고, 앱의 `native.getLocation()` /
 * `native.watchLocation()` 이 그 값을 우선 사용한다. 부모가 값을 바꾸면 iframe 문서에 `storage`
 * 이벤트가 날아가므로 **새로고침 없이** 위치가 갱신된다(= 이동 재현).
 *
 * 이 파일이 고정하는 계약:
 *  1) 하네스 페이지가 서빙되고 지도·프리셋이 렌더된다.
 *  2) 좌표 오버라이드가 앱의 기준 위치로 실제 반영된다(헤더 동네명이 그 좌표의 동으로 바뀐다).
 *  3) 오버라이드가 걸려 있으면 위치 프리프롬프트가 뜨지 않는다(권한을 물을 이유가 없다).
 *  4) 오버라이드가 없으면 앱이 이 백도어를 쓰지 않는다.
 */

const HARNESS = '/dev/gps/';
const KEY = '__dev_gps';

// saigon-depth1.json 기준 서로 다른 두 동 — 헤더 라벨이 바뀌는지로 반영을 판정한다.
const SAI_GON = { lat: 10.77293, lng: 106.7003, ward: 'Sài Gòn' };
const TAN_DINH = { lat: 10.79126, lng: 106.69396, ward: 'Tân Định' };

test.describe('/dev/gps 하네스', () => {
  test('하네스 페이지가 지도·프리셋과 함께 렌더된다', async ({ page }) => {
    await page.goto(HARNESS);

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#presets button').first()).toBeVisible();
    // Leaflet 타일이 실제로 그려졌는지 — CDN 차단 시 조용히 비어 있으면 안 된다.
    await expect(page.locator('.leaflet-tile').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#mapFail')).toHaveCount(0);
  });

  test('좌표 입력 → 적용이 localStorage 에 기록되고 앱이 리로드된다', async ({ page }) => {
    await page.goto(HARNESS);
    await page.fill('#lat', String(TAN_DINH.lat));
    await page.fill('#lng', String(TAN_DINH.lng));

    const before = await page.locator('#app').getAttribute('src');
    await page.click('#apply');

    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), KEY))
      .toBe(JSON.stringify({ lat: TAN_DINH.lat, lng: TAN_DINH.lng }));
    // '적용 + 새로고침' 은 실시간 모드가 꺼진 기본 상태에서 iframe 을 다시 로드한다.
    await expect.poll(() => page.locator('#app').getAttribute('src')).not.toBe(before);
  });
});

test.describe('오버라이드가 앱 기준 위치로 반영된다', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('오버라이드 좌표의 동이 마켓 헤더에 표시되고, 프리프롬프트는 뜨지 않는다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('gps1'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);
    // 위치 권한을 주지 않은 상태 — 오버라이드가 있으면 권한을 물을 이유가 없다.
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [KEY, JSON.stringify({ lat: SAI_GON.lat, lng: SAI_GON.lng })] as const,
    );

    await page.goto('/market');

    await expect(page.locator('h1')).toContainText(SAI_GON.ward, { timeout: 20_000 });
    // 위치 프리프롬프트(전역 ConfirmDialog)가 뜨면 backdrop 이 남는다.
    await expect(page.locator('[class*="backdrop"]')).toHaveCount(0);
  });

  test('다른 좌표를 심으면 다른 동이 표시된다 (좌표가 실제로 쓰인다는 확인)', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('gps2'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [KEY, JSON.stringify({ lat: TAN_DINH.lat, lng: TAN_DINH.lng })] as const,
    );

    await page.goto('/market');

    await expect(page.locator('h1')).toContainText(TAN_DINH.ward, { timeout: 20_000 });
  });

  test('오버라이드가 없으면 백도어를 쓰지 않는다 (권한 미결정 → 프리프롬프트)', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('gps3'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');

    // 권한 미결정 + 오버라이드 없음 → 설계도 §5 프리프롬프트가 떠야 한다.
    await expect(page.locator('[class*="backdrop"]')).toHaveCount(1, { timeout: 20_000 });
  });
});

test.describe('실시간 모드 — 새로고침 없이 이동 재현', () => {
  test('실시간 모드: 좌표를 바꾸면 새로고침 없이 앱이 따라온다', async ({ page, request }) => {
    const session: DevSession = await devLogin(request, uniqueTag('rl'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v),
      ['__dev_gps', JSON.stringify({ lat: 10.77293, lng: 106.7003 })] as const);
  
    await page.goto('/dev/gps/');
    await page.check('#live');
    await page.locator('#routes button', { hasText: '마켓' }).click();
    const app = page.frameLocator('#app');
    await expect(app.locator('h1')).toContainText('Sài Gòn', { timeout: 25_000 });
    const src = await page.locator('#app').getAttribute('src');
  
    // 부모가 localStorage 를 쓰면 iframe 문서에 진짜 storage 이벤트가 간다.
    await page.fill('#lat', '10.79126');
    await page.fill('#lng', '106.69396');
    await page.click('#apply');   // 실시간 모드라 리로드 없이 쓰기만 한다
  
    await expect(app.locator('h1')).toContainText('Tân Định', { timeout: 20_000 });
    expect(await page.locator('#app').getAttribute('src')).toBe(src);
    cleanupUser(session.userId);
  });
});
