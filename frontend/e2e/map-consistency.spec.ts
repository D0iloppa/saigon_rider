import { test, expect, type Page } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, verifyPhoneBypass, createListing, cleanupUser, type DevSession } from './helpers';

/**
 * 마켓 ↔ 동네지도 통일성 회귀 검증 (대표 지적 2026-08-03).
 *
 * **개정 2026-08-06** — 대표 지시("2개로만해 / gps기본 / 지도 다나오게")로 지역 선택이 폐기되면서
 * P1·P3·P4·P6 의 계약이 뒤집혔다. 설계도: ai-docs/260806_gps_scope_unification_design.md
 *
 * 검증 대상:
 *  P1 표시 범위 시트가 **2옵션**(전체/내 현재 위치)이고 '지역 선택'이 없다.
 *  P2 지도 자동 말풍선이 계속 뜬다(표시 범위 개편 회귀 확인).
 *  P3/P4 어떤 범위에서도 주황 테두리(선택 강조)가 **없고**, 동 경계선은 **남는다**.
 *  P6 지역 chip(AreaPill)이 **없다**.
 *  P7 L2 줌 게이트는 **유지**된다(대표 확인 — 확대 유도 장치라 존치).
 *
 * 스크린샷은 보고서 증적으로 ai-docs/TEST/07_testcase/screenshots-map-consistency/ 에 남긴다.
 */

const SHOT_DIR = 'ai-docs/TEST/07_testcase/screenshots-map-consistency';
const shot = (name: string) => `../${SHOT_DIR}/${name}.png`;

// 기본 로케일은 베트남어(vi) — 기존 geolocation.spec 과 동일 규약.
const L = {
  allAreas: 'Toàn bộ khu vực',
  currentLocation: 'Vị trí hiện tại của tôi',
  selectArea: 'Chọn khu vực',
  apply: 'Áp dụng',
};

/** 선택 동 주황 테두리 폴리곤 개수 — SaigonMapV5 의 테두리 overlay(stroke=#ff5a1f) */
async function orangeBorderCount(page: Page): Promise<number> {
  return page.locator('svg polygon[stroke="#ff5a1f"]').count();
}

/** 동 경계 폴리곤 개수 — SaigonMapV5 Layer 1(항상 렌더). 지역 선택 강조와 무관하게 남아야 한다. */
async function wardPolygonCount(page: Page): Promise<number> {
  return page.locator('svg polygon[class*="ward"]').count();
}

test.describe('P1 — 표시 범위 시트는 2옵션이고 지역 선택이 없다', () => {
  // 개정 2026-08-06 (대표 지시 "2개로만해") — 종전 3옵션(전체/내 현재 위치/지역 선택) 계약 폐기.
  //
  // 위치 권한을 미리 부여해야 한다: 권한이 미결정이면 진입 시 위치 프리프롬프트가 뜨고
  // (설계도 §5) 그 backdrop 이 헤더 클릭을 가로챈다. 권한이 결정된 상태에서는 뜨지 않는다.
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  for (const [label, path, openSheet] of [
    ['동네지도', '/map', (page: Page) => page.getByRole('heading', { level: 1 }).click()],
    ['마켓', '/market', (page: Page) => page.locator('h1').first().click()],
  ] as const) {
    test(`${label} 시트에 2옵션만 있고 '지역 선택'이 없다`, async ({ page, request }) => {
      session = await devLogin(request, uniqueTag('m1'));
      await saveConsentViaApi(request, session);
      await injectSession(page, session);

      await page.goto(path);
      await openSheet(page);

      // 시트 헤더(현재 상태)와 카드에 같은 문구가 함께 나오므로 카드(button)로 특정한다.
      await expect(page.getByRole('button', { name: new RegExp(L.currentLocation) })).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(L.allAreas) })).toBeVisible();
      // 폐기된 3번째 옵션 — 되살아나면 화면별 기준이 다시 갈린다.
      await expect(page.getByText(L.selectArea, { exact: true })).toHaveCount(0);

      await page.screenshot({ path: shot(`p1-${label === '마켓' ? 'market' : 'neighborhood'}-2options`) });
    });
  }
});

test.describe('P3/P4 — 지역 선택 강조가 사라져 지도가 잘리지 않는다', () => {
  // 개정 2026-08-06 (대표 지시 "지도 다나오게") — 종전엔 한 동으로 좁혀지면 주황 테두리 +
  // 나머지 동 감쇠로 지도가 잘려 보였다. 이제 어떤 표시 범위에서도 강조를 켜지 않는다.
  // ※ 동 경계선(Layer 1)·동 이름 라벨은 계속 그려진다 — 그건 polyActive 와 무관한 기본 레이어다.
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('마켓 지도: GPS 범위에서도 주황 테두리가 없고 동 경계선은 남는다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m4'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await expect(page.locator('h1')).not.toContainText(L.allAreas, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Xem bản đồ' }).click();
    await page.waitForTimeout(4000);

    expect(await orangeBorderCount(page)).toBe(0);
    // 동 경계 폴리곤 자체는 살아 있어야 한다(경계선을 지우라는 지시가 아니었다).
    expect(await wardPolygonCount(page)).toBeGreaterThan(0);
    await page.screenshot({ path: shot('p3-market-no-border') });
  });

  test('동네지도: GPS 범위에서도 주황 테두리가 없고 동 경계선은 남는다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m5'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();
    await page.waitForTimeout(6000);

    expect(await orangeBorderCount(page)).toBe(0);
    expect(await wardPolygonCount(page)).toBeGreaterThan(0);
    await page.screenshot({ path: shot('p4-neighborhood-no-border') });
  });
});

test.describe('P2 — 지도 자동 말풍선 (표시 범위 개편 후 회귀 확인)', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('동네지도에서 업체 말풍선이 자동으로 뜬다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m6'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    // 기본값이 GPS 라 별도 시트 조작 없이 바로 지도로 간다(대표 지시 "gps기본").
    await page.goto('/map');
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    // 자동 말풍선: bbox 500ms 디바운스 + fetch + 줌 게이트 통과 후 점화.
    const bubble = page.locator('[class*="bizNewsBubble"]');
    await expect(bubble.first()).toBeVisible({ timeout: 25_000 });

    await page.screenshot({ path: shot('p2-neighborhood-auto-bubble') });
  });

  test('마켓 지도의 매물 말풍선은 계속 정상이다(회귀 확인)', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m7'));
    await saveConsentViaApi(request, session);
    await verifyPhoneBypass(request, session);
    // 자동 말풍선은 "뷰포트 중앙에서 정규화 거리 0.25 이내 매물"이 있어야 점화된다
    // (AUTO_BUBBLE_CENTER_RADIUS). dev DB 의 기존 매물 위치에 의존하면 항상 실패하므로,
    // 테스트 GPS 좌표에 매물을 하나 심어 결정론적으로 만든다.
    await createListing(request, session, `e2e bubble ${Date.now()}`, [], {
      latitude: 10.77293,
      longitude: 106.7003,
    });
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    const bubble = page.locator('[class*="bizNewsBubble"]');
    await expect(bubble.first()).toBeVisible({ timeout: 25_000 });

    await page.screenshot({ path: shot('p2-market-auto-bubble') });
  });
});

test.describe('P6 — 지역 chip(AreaPill) 은 제거됐다', () => {
  // 개정 2026-08-06 — 지역 선택이 없어져 해제할 필터가 없다. 칩이 되살아나면 회귀.
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  for (const [label, path] of [['마켓', '/market'], ['동네지도', '/map']] as const) {
    test(`${label} 지도에 지역 chip 이 없다`, async ({ page, request }) => {
      session = await devLogin(request, uniqueTag('m10'));
      await saveConsentViaApi(request, session);
      await injectSession(page, session);

      await page.goto(path);
      await page.getByRole('button', { name: 'Xem bản đồ' }).click();
      await page.waitForTimeout(4000);

      await expect(page.locator('[class*="areaPill"]')).toHaveCount(0);
    });
  }
});

test.describe('P7 — 마켓 지도 L2 줌 게이트 통일', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('게이트 밖으로 줌아웃하면 매물 핀·말풍선이 사라지고 확대 안내 필이 뜬다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m11'));
    await saveConsentViaApi(request, session);
    await verifyPhoneBypass(request, session);
    // 자동 말풍선 점화를 결정론적으로 — 테스트 GPS 좌표에 매물을 심는다 (P2 마켓 테스트와 동일)
    await createListing(request, session, `e2e gate ${Date.now()}`, [], {
      latitude: 10.77293,
      longitude: 106.7003,
    });
    await injectSession(page, session);

    // '전체 지역' 기본 상태로 지도 진입 — locateOnMount 가 GPS 로 줌인해 게이트 안으로 들어간다.
    await page.goto('/market');
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    // 게이트 안: 매물 핀 + 자동 말풍선 존재
    await expect(page.locator('[class*="bizNewsBubble"]').first()).toBeVisible({ timeout: 25_000 });
    expect(await page.locator('svg g[data-marker]').count()).toBeGreaterThan(0);

    // 휠 줌아웃(이벤트당 ×1.12) — 확대 안내 필이 뜰 때까지 = L2 게이트 이탈 신호
    const hint = page.getByRole('button', { name: 'Phóng to để xem quanh bạn' });
    await page.mouse.move(640, 400);
    for (let i = 0; i < 40 && !(await hint.isVisible()); i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(120);
    }
    await expect(hint).toBeVisible();

    // 게이트 밖: 핀·말풍선 모두 소멸 (직전엔 말풍선/패널이 고아로 남았다 — 대표 지적 2026-08-04)
    await page.waitForTimeout(700); // bbox 디바운스(400ms) + fetch 게이트 정리 여유
    await expect(page.locator('svg g[data-marker]')).toHaveCount(0);
    await expect(page.locator('[class*="bizNewsBubble"]')).toHaveCount(0);
    await page.screenshot({ path: shot('p7-market-zoom-gate') });
  });

  // 지역 선택 상태 게이트 (대표 지적 2026-08-04) — 직전엔 onDepthChange 가 polyActive+selWard
  // 상태에서 항상 false 를 emit 해 정리 게이트가 영구 개방됐고, 줌아웃해도 말풍선만 허공에
  // 남았다(핀은 내부 LOD 로 소멸). SaigonMapV5 신호 분리 후 회귀 방지.
  test("'내 현재 위치' 적용 상태에서도 줌아웃하면 말풍선·핀이 사라진다 (마켓)", async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m12'));
    await saveConsentViaApi(request, session);
    await verifyPhoneBypass(request, session);
    await createListing(request, session, `e2e gate region ${Date.now()}`, [], {
      latitude: 10.77293,
      longitude: 106.7003,
    });
    await injectSession(page, session);

    // 표시 범위 기본값이 GPS 라 시트를 열 필요가 없다(2026-08-06) — 헤더가 동네명으로
    // 바뀌는 것으로 측위 완료를 기다린다.
    await page.goto('/market');
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    // 게이트 안: 자동 말풍선 점화 확인 후 줌아웃
    await expect(page.locator('[class*="bizNewsBubble"]').first()).toBeVisible({ timeout: 25_000 });

    const hint = page.getByRole('button', { name: 'Phóng to để xem quanh bạn' });
    await page.mouse.move(640, 400);
    for (let i = 0; i < 40 && !(await hint.isVisible()); i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(120);
    }
    await expect(hint).toBeVisible();

    await page.waitForTimeout(700); // bbox 디바운스(400ms) + 정리 이펙트 여유
    await expect(page.locator('svg g[data-marker]')).toHaveCount(0);
    await expect(page.locator('[class*="bizNewsBubble"]')).toHaveCount(0);
    await page.screenshot({ path: shot('p7-market-zoom-gate-region') });
  });

  test("'내 현재 위치' 적용 상태에서도 줌아웃하면 말풍선·핀이 사라진다 (동네지도)", async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m13'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sài Gòn', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    // 게이트 안: 업체 자동 말풍선 점화(P2 와 동일 조건) 확인 후 줌아웃
    await expect(page.locator('[class*="bizNewsBubble"]').first()).toBeVisible({ timeout: 25_000 });

    // region 모드에도 확대 안내 필이 뜬다 (2026-08-04 — 직전엔 viewport 모드 전용이었다).
    // 줌아웃은 svg 에 합성 wheel 디스패치 — 실제 마우스 휠은 화면 중앙의 말풍선(HTML 오버레이
    // 버튼)·시트 등이 가로채 svg(휠 리스너 부착 대상)에 닿지 않아 줌이 중간에 멎는다.
    const hint = page.getByRole('button', { name: 'Phóng to để xem quanh bạn' });
    const svg = page.locator('svg[viewBox]').first();
    for (let i = 0; i < 40 && !(await hint.isVisible()); i++) {
      await svg.evaluate((el) => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new WheelEvent('wheel', {
          deltaY: 300, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          bubbles: true, cancelable: true,
        }));
      });
      await page.waitForTimeout(120);
    }
    await expect(hint).toBeVisible();

    await page.waitForTimeout(700); // bbox 디바운스(500ms) + 정리 이펙트 여유
    await expect(page.locator('svg g[data-marker]')).toHaveCount(0);
    await expect(page.locator('[class*="bizNewsBubble"]')).toHaveCount(0);
    await page.screenshot({ path: shot('p7-neighborhood-zoom-gate-region') });
  });
});

test.describe('P8 — 업체 캐러셀: 소식 없는 업체도 전량 포함 + 빈 카드 폴백', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('핀 탭 캐러셀에 소식 없는 업체까지 실리고, 그 카드도 비어 있지 않다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m14'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sài Gòn', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    // 업체 탭 진입 = 자동 말풍선(P2와 동일 조건) 대기 후 클릭 — 말풍선 onClick 은
    // handleBizMarkerClick(핀 직접 탭과 동일 경로)라 포스트 패널 캐러셀이 열린다.
    // (중앙 핀은 말풍선 오버레이가 덮고 있어 핀 자체 클릭은 interception 으로 flaky.)
    const bubble = page.locator('[class*="bizNewsBubble"]');
    await expect(bubble.first()).toBeVisible({ timeout: 25_000 });
    await bubble.first().click();

    // 캐러셀 카드 = PostPanel scroller 직계 자식 (scroller 클래스는 PostPanel 전용).
    const cards = page.locator('[class*="scroller"] > div');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    // 카드 수 단정은 "≥ 3" — 지도 핀 수(g[data-marker])와의 등치는 POI 참조 레이어·
    // SaigonMapV5 내부 LOD 가 섞여 불안정하다. dev DB 기준 테스트 영역 업체 5곳 중
    // 소식 보유는 1곳뿐이므로, 과거 포함 필터(`&& latestNews`) 시절 상한(2장)을
    // 확실히 넘는 3장 이상이면 "소식 없는 업체도 포함"이 증명된다.
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // 폴백 검증 — 모든 카드 본문(copy)에 텍스트가 렌더된다(소식 없는 업체는
    // 카테고리+주소 또는 '아직 등록된 소식이 없어요' 폴백). 빈 카드 회귀 방지.
    for (let i = 0; i < count; i++) {
      const copy = cards.nth(i).locator('[class*="copy"]').first();
      await expect(copy).not.toHaveText(/^\s*$/);
    }
    await page.screenshot({ path: shot('p8-biz-carousel-all') });
  });
});

test.describe('P5 — 날씨: 강수확률 창 표기와 레이더', () => {
  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('날씨 화면에 강수 레이더 섹션이 노출되고 단정 문구가 사라졌다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m8'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/info/weather');

    // 레이더 섹션 — 제목과 관측시각 메타
    await expect(page.getByText('Radar mưa', { exact: true })).toBeVisible({ timeout: 20_000 });
    // 예보 단정 문구("Thời tiết lý tưởng để chạy")가 더 이상 쓰이지 않는다
    await expect(page.getByText('Thời tiết lý tưởng để chạy')).toHaveCount(0);

    await page.screenshot({ path: shot('p5-weather-radar'), fullPage: true });
  });

  test('강수확률 창(window)이 응답 필드와 함께 내려온다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m9'));
    await saveConsentViaApi(request, session);

    const res = await request.get(
      'http://localhost:18090/api/bff/info/weather?lat=10.7769&lng=106.7009',
      { headers: { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken } },
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // 1 = open-meteo 시간단위(정상), 3 = OpenWeather 3시간 버킷 폴백. 둘 중 하나여야 한다.
    expect([1, 3]).toContain(body.current.rain_prob_window_h);
    // 라이딩 판단이 강수확률과 모순되지 않는다
    if (body.current.rain_prob_1h >= 80) expect(body.recommendation_code).toBe('RAIN_HIGH');
  });
});
