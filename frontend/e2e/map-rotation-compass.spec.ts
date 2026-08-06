import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 260806_svg_map_v6_rotation_design.md §7 step 9 검증 — /dev/gps 하네스로 heading/speed 를
 * 주입해(readDevGpsOverride 확장, 88bd487) 동네지도의 나침반 회전이 실제로 일어나는지 확인한다.
 *
 * 개정(2026-08-06, 3차) — 사용자 결정 1(추종/나침반 직교 2축)·결정 2(서비스 지역 밖 회전 허용)
 * 반영. 구 3-state(◎ 2번 탭 → 나침반)는 폐기됐다 — ◎ 는 자유↔추종만, 나침반은 별도 버튼이다.
 * 두 버튼은 같은 className(ctrlBtn)을 공유하므로 lucide 아이콘 클래스(svg.lucide-locate-fixed /
 * svg.lucide-navigation, lucide-react 의 createLucideIcon 이 부여하는 kebab-case 클래스)로 구분한다.
 *
 * 하네스 폼(#lat/#lng)은 heading/speed 를 지원하지 않으므로, 부모 문서(harness)에서 직접
 * localStorage.__dev_gps 를 heading/speed 포함 JSON 으로 덮어쓴다 — 같은 출처의 iframe(app) 에는
 * storage 이벤트로 전달돼(dev-gps-harness.spec.ts 의 "실시간 모드"와 동일 메커니즘) 새로고침 없이
 * 반영된다.
 */

const KEY = '__dev_gps';
const START = { lat: 10.77293, lng: 106.7003 }; // Sài Gòn (서비스 지역 안)
const OUTSIDE = { lat: 21.0278, lng: 105.8342 }; // Hà Nội (서비스 지역 밖)

test.describe('동네지도 — 나침반 모드 회전', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('◎ 로 추종 진입 후 나침반 버튼을 켜면 heading 변화에 따라 지형 <g> 가 회전한다', async ({ page, request }) => {
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

    const followBtn = app.locator('button[class*="ctrlBtn"]:has(svg.lucide-locate-fixed)');
    const compassBtn = app.locator('button[class*="ctrlBtn"]:has(svg.lucide-navigation)');
    await expect(followBtn).toBeVisible({ timeout: 20_000 });
    await expect(compassBtn).toBeVisible({ timeout: 20_000 });

    // 회전 <g> 는 enableFollowCompass 가 꺼져 있으면 트리에 없고(D-H 킬스위치), 켜져 있으면
    // 나침반이 꺼진 초기 상태에서도 rotate(0)으로 이미 존재한다(추종/나침반 직교 — 추종 여부와
    // 무관하게 나침반이 꺼져 있으면 항상 rotate(0)).
    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    // 자유 → 추종 (◎ 탭). 나침반이 아직 꺼져 있으므로 bearing=0(북 고정) — 회전 <g> 는 그대로.
    await followBtn.click();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });

    // 나침반 버튼 탭 — 추종과 독립적으로 켜진다.
    await compassBtn.click();

    // 나침반 진입 후 heading 을 90°로 바꾼다 — 초기 compassBearing(0)과의 각차 90°는
    // 데드존(8°) 을 넘으므로 반영돼야 한다.
    await page.evaluate(
      ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 90, speed: 3 })),
      [KEY, START.lat, START.lng] as const,
    );

    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });
  });

  test('서비스 지역 밖으로 이동해도 나침반 회전은 계속된다(추종/내 위치 점만 멈춘다)', async ({ page, request }) => {
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

    const followBtn = app.locator('button[class*="ctrlBtn"]:has(svg.lucide-locate-fixed)');
    const compassBtn = app.locator('button[class*="ctrlBtn"]:has(svg.lucide-navigation)');
    await expect(followBtn).toBeVisible({ timeout: 20_000 });

    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    // 서비스 지역 "안"에서 먼저 나침반을 켠다 — meDotActive(내 위치 점이 한 번 찍힘)가 되어야
    // 워처가 걸리고(D-E), meLatLng 이 지역 안 좌표로 채워진다.
    await compassBtn.click();

    // 지역 안에서 heading 90°로 먼저 정상 회전하는지 확인 (사전조건).
    await page.evaluate(
      ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 90, speed: 3 })),
      [KEY, START.lat, START.lng] as const,
    );
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });

    // 서비스 지역 밖(하노이)으로 이동 + heading 180° — 결정 2: 추종/내 위치 점은 멈추지만
    // 나침반 회전은 heading 변화를 계속 반영해야 한다.
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

    const compassBtn = app.locator('button[class*="ctrlBtn"]:has(svg.lucide-navigation)');
    await expect(compassBtn).toBeVisible({ timeout: 20_000 });
    await compassBtn.click();

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
