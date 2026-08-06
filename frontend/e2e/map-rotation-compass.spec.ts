import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 260806_svg_map_v6_rotation_design.md §7 step 9 검증 — /dev/gps 하네스로 heading/speed 를
 * 주입해(readDevGpsOverride 확장, 88bd487) 동네지도의 나침반 회전이 실제로 일어나는지 확인한다.
 *
 * 하네스 폼(#lat/#lng)은 heading/speed 를 지원하지 않으므로, 부모 문서(harness)에서 직접
 * localStorage.__dev_gps 를 heading/speed 포함 JSON 으로 덮어쓴다 — 같은 출처의 iframe(app) 에는
 * storage 이벤트로 전달돼(dev-gps-harness.spec.ts 의 "실시간 모드"와 동일 메커니즘) 새로고침 없이
 * 반영된다.
 */

const KEY = '__dev_gps';
const START = { lat: 10.77293, lng: 106.7003 }; // Sài Gòn (서비스 지역 안)

test.describe('동네지도 — 나침반 모드 회전', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('◎ 를 2번 눌러 나침반 모드로 전환하고 heading 이 바뀌면 지형 <g> 가 회전한다', async ({ page, request }) => {
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

    const locateBtn = app.locator('button[class*="ctrlBtn"]');
    await expect(locateBtn).toBeVisible({ timeout: 20_000 });

    // 회전 <g> 는 enableFollowCompass 가 꺼져 있으면 트리에 없고(D-H 킬스위치), 켜져 있으면
    // free 모드에서도 rotate(0)으로 이미 존재한다 — 우선 자유 모드에서 그 상태를 확인한다.
    const rotatedG = app.locator('svg g[transform^="rotate("]').first();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 20_000 });

    // 자유 → 추종 (◎ 1번째 탭). 추종은 bearing=0(북 고정)이라 회전 <g> 는 그대로 rotate(0)이다.
    await locateBtn.click();
    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-?0 /, { timeout: 10_000 });

    // 추종 → 추종+나침반 (◎ 2번째 탭).
    await locateBtn.click();

    // 나침반 모드 진입 후 heading 을 90°로 바꾼다 — 초기 compassBearing(0)과의 각차 90°는
    // 데드존(8°) 을 넘으므로 반영돼야 한다.
    await page.evaluate(
      ([k, lat, lng]) => localStorage.setItem(k, JSON.stringify({ lat, lng, heading: 90, speed: 3 })),
      [KEY, START.lat, START.lng] as const,
    );

    await expect(rotatedG).toHaveAttribute('transform', /rotate\(-90 /, { timeout: 20_000 });
  });
});
