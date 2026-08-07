import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 260806_svg_map_v6_rotation_design.md §7 step 9 검증 — /dev/gps 하네스로 heading/speed 를
 * 주입해(readDevGpsOverride 확장, 88bd487) 동네지도의 나침반 회전이 실제로 일어나는지 확인한다.
 *
 * 개정(2026-08-07, 네이버지도 모델, 대표 지시) — heading 추종을 나침반 버튼에서 ◎ 버튼으로
 * 옮겼다: ◎(.locateCtrl 의 첫 번째 button, 항상 표시)를 두 번 누르면 자유→카메라추종→heading추종
 * 순으로 진입한다. 나침반 버튼은 이제 bearing!==0(회전 중)일 때만 나타나는 두 번째 button이고,
 * 누르면 북향 복귀 + heading 추종 해제만 한다 — 이 스펙은 "평상시엔 나침반 버튼이 없다가 회전
 * 후에만 나타난다"를 핵심으로 고정한다.
 */

const KEY = '__dev_gps';
const START = { lat: 10.77293, lng: 106.7003 }; // Sài Gòn (서비스 지역 안)
const OUTSIDE = { lat: 21.0278, lng: 105.8342 }; // Hà Nội (서비스 지역 밖)

test.describe('동네지도 — heading 추종 진입(◎ 3단) + 나침반(북향 복귀 전용) 버튼', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('◎ 를 두 번 눌러 heading추종에 진입하면 지형 <g> 가 회전하고, 그때만 나침반 버튼이 나타난다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('rot'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/dev/gps/');
    await page.check('#live');
    // 초기 heading=0, speed=3(추종 임계 1.5 이상) — 폼을 거치지 않고 직접 심는다.
    await page.evaluate(
      ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 0, speed: 3 })),
      [KEY, START.lat, START.lng] as const,
    );
    await page.locator('#routes button', { hasText: '동네지도' }).click();

    const app = page.frameLocator('#app');
    // 동네지도는 당근 스타일 리스트-퍼스트 화면이다 — 지도 캔버스는 "지도 보기" 필을 눌러야 뜬다.
    await app.locator('button[class*="mapPill"]').click({ timeout: 20_000 });

    const locateCtrl = app.locator('div[class*="locateCtrl"]');
    const followBtn = locateCtrl.locator('button').first();
    await expect(followBtn).toBeVisible({ timeout: 20_000 });

    // 평상시(자유 단계, bearing=0)엔 나침반 버튼이 아예 없다 — .locateCtrl 안에 button 이 1개뿐.
    await expect(locateCtrl.locator('button')).toHaveCount(1);

    // 회전 <g> 는 enableFollowCompass 가 꺼져 있으면 트리에 없고(D-H 킬스위치), 켜져 있으면
    // 자유 단계에서도 rotate(0)으로 이미 존재한다.
    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    // 1번째 탭: 자유 → 카메라추종. 아직 회전은 없으므로(compassMode 는 north) 나침반 버튼도 없다.
    await followBtn.click();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });
    await expect(locateCtrl.locator('button')).toHaveCount(1);

    // 2번째 탭: 카메라추종 → heading추종. compassMode 가 'follow' 로 바뀐다.
    await followBtn.click();

    // heading 을 90°로 바꾼다 — 초기 compassBearing(0)과의 각차 90°는 데드존(8°)을 넘으므로 반영된다.
    await page.evaluate(
      ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 90, speed: 3 })),
      [KEY, START.lat, START.lng] as const,
    );
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });

    // bearing!==0 이 된 지금에서야 나침반 버튼이 나타난다(네이버지도 모델의 핵심).
    await expect(locateCtrl.locator('button')).toHaveCount(2);
    const compassBtn = locateCtrl.locator('button').nth(1);
    await expect(compassBtn).toBeVisible();

    // 나침반 버튼을 누르면 북향 복귀 + heading 추종 해제 — 그 결과 버튼 자신이 사라진다.
    await compassBtn.click();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });
    await expect(locateCtrl.locator('button')).toHaveCount(1);
  });

  test('서비스 지역 밖으로 이동해도 heading추종 회전은 계속된다(추종/내 위치 점만 멈춘다)', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('rotout'));
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

    const followBtn = app.locator('div[class*="locateCtrl"] button').first();
    await expect(followBtn).toBeVisible({ timeout: 20_000 });

    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    // 서비스 지역 "안"에서 heading추종에 진입한다(◎ 2탭) — meDotActive 가 되어야 워처가 걸리고
    // (D-E), meLatLng 이 지역 안 좌표로 채워진다.
    await followBtn.click(); // 자유 → 카메라추종
    await followBtn.click(); // 카메라추종 → heading추종

    // 지역 안에서 heading 90°로 먼저 정상 회전하는지 확인 (사전조건).
    await page.evaluate(
      ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 90, speed: 3 })),
      [KEY, START.lat, START.lng] as const,
    );
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });

    // 서비스 지역 밖(하노이)으로 이동 + heading 180° — 결정 2: 추종/내 위치 점은 멈추지만
    // heading 회전은 heading 변화를 계속 반영해야 한다.
    await page.evaluate(
      ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 180, speed: 3 })),
      [KEY, OUTSIDE.lat, OUTSIDE.lng] as const,
    );
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-180 /, { timeout: 20_000 });
  });
});

test.describe('/dev/gps 방위(heading) 다이얼 — 수동 회전 테스트 UI', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('다이얼을 드래그하면 heading+speed 가 주입되고 지도가 회전하며, 정지 상태에서는 회전이 멈춘다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('dial'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/dev/gps/');
    await page.check('#live');
    await page.locator('#routes button', { hasText: '동네지도' }).click();

    const app = page.frameLocator('#app');
    await app.locator('button[class*="mapPill"]').click({ timeout: 20_000 });

    const followBtn = app.locator('div[class*="locateCtrl"] button').first();
    await expect(followBtn).toBeVisible({ timeout: 20_000 });
    await followBtn.click(); // 자유 → 카메라추종
    await followBtn.click(); // 카메라추종 → heading추종

    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    const dial = page.locator('#dial');
    await dial.scrollIntoViewIfNeeded();
    const box = await dial.boundingBox();
    if (!box) throw new Error('dial 을 찾지 못했습니다');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const r = box.width / 2 - 10;

    // 90°(다이얼 중심에서 정동쪽) 클릭 — heading=90 주입, speed 는 기본값(5m/s)이 자동으로 동반된다.
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    await page.mouse.up();

    await expect(page.locator('#headingValue')).toHaveText('90°');
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('__dev_gps') || '{}').speed))
      .toBe(5);
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });

    // 정지 상태 체크(speed=0) 후 180°로 드래그해도, speed<1.5 라 마지막 유효 방위(90°)가 유지돼야 한다.
    await page.check('#stopped');
    await page.mouse.move(cx, cy + r);
    await page.mouse.down();
    await page.mouse.up();

    await expect(page.locator('#headingValue')).toHaveText('180°');
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('__dev_gps') || '{}').speed))
      .toBe(0);
    await page.waitForTimeout(500);
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /);
  });
});

test.describe('/dev/gps 다이얼-좌표 상호작용 — 방위/좌표 보존', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('다이얼로 방위를 맞춘 뒤 좌표를 적용해도(마커 이동과 동일 경로) 방위가 유지된다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('dialpreserve'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/dev/gps/');
    await page.check('#live');
    await page.locator('#routes button', { hasText: '동네지도' }).click();

    const app = page.frameLocator('#app');
    await app.locator('button[class*="mapPill"]').click({ timeout: 20_000 });
    const followBtn = app.locator('div[class*="locateCtrl"] button').first();
    await expect(followBtn).toBeVisible({ timeout: 20_000 });
    await followBtn.click(); // 자유 → 카메라추종
    await followBtn.click(); // 카메라추종 → heading추종

    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    const dial = page.locator('#dial');
    await dial.scrollIntoViewIfNeeded();
    const box = await dial.boundingBox();
    if (!box) throw new Error('dial 을 찾지 못했습니다');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const r = box.width / 2 - 10;

    // 90°로 방위를 맞춘다.
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    await page.mouse.up();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });

    // 좌표만 다른 서비스 지역 안 좌표로 적용(apply 버튼, live 모드라 리로드 없음) —
    // 방위(heading/speed)는 지워지지 않고 그대로 유지돼야 한다.
    await page.fill('#lat', '10.79126');
    await page.fill('#lng', '106.69396');
    await page.click('#apply');

    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('__dev_gps') || '{}')))
      .toMatchObject({ lat: 10.79126, lng: 106.69396, heading: 90, speed: 5 });
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });
  });

  test('heading/speed 를 한 번도 설정하지 않았으면 좌표 적용은 {lat,lng} 만 기록한다(null 폴백 유지)', async ({ page }) => {
    await page.goto('/dev/gps/');
    await page.check('#live');
    await page.fill('#lat', '10.79126');
    await page.fill('#lng', '106.69396');
    await page.click('#apply');

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('__dev_gps') || '{}'));
    expect(stored).toEqual({ lat: 10.79126, lng: 106.69396 });
    expect(stored.heading).toBeUndefined();
    expect(stored.speed).toBeUndefined();
  });
});
