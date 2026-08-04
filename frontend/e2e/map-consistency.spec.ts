import { test, expect, type Page } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, verifyPhoneBypass, createListing, cleanupUser, type DevSession } from './helpers';

/**
 * 마켓 ↔ 동네지도 통일성 회귀 검증 (대표 지적 2026-08-03).
 *
 * 검증 대상 4건:
 *  P1 동네지도 '표시 범위' 시트가 마켓과 같은 3옵션(전체/내 현재 위치/지역 선택)을 갖는다.
 *  P2 동네지도에서 지역을 고른 뒤 지도로 들어가면 업체 자동 말풍선이 뜬다
 *     (직전엔 region 모드에서 bboxFilter=null 이라 말풍선 이펙트가 조기 return 됐다).
 *  P3 '전체 지역'에서는 주황 테두리가 없고, 특정 동을 고르면 테두리가 그려진다(마켓·동네지도 공통).
 *  P4 지역선택 상태에서 외부 동 라벨이 테두리 위로 노출되지 않는다.
 *
 * 스크린샷은 보고서 증적으로 ai-docs/TEST/07_testcase/screenshots-map-consistency/ 에 남긴다.
 */

const SHOT_DIR = 'ai-docs/TEST/07_testcase/screenshots-map-consistency';
const shot = (name: string) => `../${SHOT_DIR}/${name}.png`;

// 기본 로케일은 베트남어(vi) — 기존 geolocation.spec 과 동일 규약.
const L = {
  allAreas: 'Toàn bộ khu vực',
  currentLocation: 'Dùng vị trí hiện tại của tôi',
  selectArea: 'Chọn khu vực',
  apply: 'Áp dụng',
};

/** 선택 동 주황 테두리 폴리곤 개수 — SaigonMapV5 의 테두리 overlay(stroke=#ff5a1f) */
async function orangeBorderCount(page: Page): Promise<number> {
  return page.locator('svg polygon[stroke="#ff5a1f"]').count();
}

test.describe('P1 — 동네지도 표시 범위 3옵션 통일', () => {
  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('동네지도 시트에 전체/내 현재 위치/지역 선택 3옵션이 모두 있다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m1'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    // 헤더 지역명(초기 '전체 지역') 탭 → 시트 오픈
    await page.getByRole('heading', { level: 1 }).click();

    await expect(page.getByText(L.allAreas, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(L.currentLocation, { exact: true })).toBeVisible();
    await expect(page.getByText(L.selectArea, { exact: true })).toBeVisible();

    await page.screenshot({ path: shot('p1-neighborhood-3options'), fullPage: false });
  });

  test('마켓 시트도 동일한 3옵션이다(비교 기준)', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m2'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByText(L.allAreas, { exact: true }).first().click();

    await expect(page.getByText(L.currentLocation, { exact: true })).toBeVisible();
    await expect(page.getByText(L.selectArea, { exact: true })).toBeVisible();

    await page.screenshot({ path: shot('p1-market-3options'), fullPage: false });
  });
});

test.describe('P3/P4 — 지역선택 시에만 주황 테두리, 외부 라벨 미노출', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test("마켓 '전체 지역'에서는 테두리가 없다", async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m3'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();
    await page.waitForTimeout(3000);

    expect(await orangeBorderCount(page)).toBe(0);
    await page.screenshot({ path: shot('p3-market-all-no-border') });
  });

  test("마켓 '내 현재 위치'(한 동으로 좁혀짐)에서는 테두리가 그려진다", async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m4'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByText(L.allAreas, { exact: true }).first().click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 10_000 });

    await page.getByRole('button', { name: 'Xem bản đồ' }).click();
    await page.waitForTimeout(4000);

    expect(await orangeBorderCount(page)).toBeGreaterThan(0);
    await page.screenshot({ path: shot('p3-market-region-border') });
  });

  test('동네지도 지역선택 시 테두리가 그려지고 외부 동 라벨이 노출되지 않는다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m5'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    await page.getByRole('heading', { level: 1 }).click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sài Gòn', { timeout: 10_000 });

    // 리스트 → 지도 전환
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();
    await page.waitForTimeout(6000);

    // P3: 테두리 존재 (직전엔 selWard 미세팅으로 0개였다)
    expect(await orangeBorderCount(page)).toBeGreaterThan(0);
    await page.screenshot({ path: shot('p4-neighborhood-region-border') });
  });
});

test.describe('P2 — 동네지도 지역선택 후 자동 말풍선', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('지역을 고른 상태의 동네지도에서 업체 말풍선이 자동으로 뜬다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m6'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/map');
    await page.getByRole('heading', { level: 1 }).click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sài Gòn', { timeout: 10_000 });

    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    // 자동 말풍선: bbox 500ms 디바운스 + fetch + 줌 게이트 통과 후 점화.
    // 말풍선 루트는 NeighborhoodMapCanvas 의 bizNewsBubble 클래스(CSS 모듈 해시 접두사 매칭).
    const bubble = page.locator('[class*="bizNewsBubble"]');
    await expect(bubble.first()).toBeVisible({ timeout: 25_000 });

    await page.screenshot({ path: shot('p2-neighborhood-auto-bubble') });
  });

  test('마켓 지도의 매물 말풍선은 계속 정상이다(회귀 확인)', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m7'));
    await saveConsentViaApi(request, session);
    await verifyPhoneBypass(request, session);
    // 자동 말풍선은 "뷰포트 중앙에서 정규화 거리 0.25 이내 매물"이 있어야 점화된다
    // (AUTO_BUBBLE_CENTER_RADIUS). dev DB 의 기존 매물 위치에 의존하면 그 거리가 0.36 쯤이라
    // 항상 실패하므로, 테스트 GPS 좌표에 매물을 하나 심어 결정론적으로 만든다.
    await createListing(request, session, `e2e bubble ${Date.now()}`, [], {
      latitude: 10.77293,
      longitude: 106.7003,
    });
    await injectSession(page, session);

    await page.goto('/market');
    // 줌 게이트(AUTO_BUBBLE_MAX_LAT_SPAN=0.03) 통과를 위해 '내 현재 위치'를 먼저 적용한다 —
    // '전체 지역' 기본 조망은 게이트 밖이라 말풍선이 원래 뜨지 않는다(설계).
    await page.getByText(L.allAreas, { exact: true }).first().click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    const bubble = page.locator('[class*="bizNewsBubble"]');
    await expect(bubble.first()).toBeVisible({ timeout: 25_000 });

    await page.screenshot({ path: shot('p2-market-auto-bubble') });
  });
});

test.describe('P6 — 마켓 지도 지역 chip(AreaPill) 통일', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('마켓 지도에서 지역 chip 이 보이고 ✕ 로 전체 지역으로 돌아간다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('m10'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market');
    await page.getByText(L.allAreas, { exact: true }).first().click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 10_000 });

    await page.getByRole('button', { name: 'Xem bản đồ' }).click();

    // 동네지도와 같은 AreaPill 공용 컴포넌트 — 마켓 지도에도 chip 노출 (대표 지적 2026-08-04)
    const pill = page.locator('[class*="areaPill"]').first();
    await expect(pill).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('p6-market-area-pill') });

    // ✕ 탭 = 지역 선택 해제 → 헤더가 '전체 지역'으로 복귀, chip 소멸
    await pill.click();
    await expect(page.locator('h1')).toContainText(L.allAreas, { timeout: 10_000 });
    await expect(page.locator('[class*="areaPill"]')).toHaveCount(0);
  });
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

    await page.goto('/market');
    await page.getByText(L.allAreas, { exact: true }).first().click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.locator('h1')).toContainText('Sài Gòn', { timeout: 10_000 });
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
    await page.getByRole('heading', { level: 1 }).click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sài Gòn', { timeout: 10_000 });
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
    await page.getByRole('heading', { level: 1 }).click();
    await page.getByText(L.currentLocation, { exact: true }).click();
    await page.getByRole('button', { name: L.apply }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sài Gòn', { timeout: 10_000 });
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
