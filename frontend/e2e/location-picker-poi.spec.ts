import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * 위치 선택 시트(LocationPickerSheet, 매물 등록의 '거래 희망 장소')의 POI 회귀 —
 * 대표 지시 2026-08-05 "지도 컴포넌트 쓰는 곳 전수 점검해 POI 없는 곳에 적용".
 *
 * 이 시트는 좌표를 직접 찍는 화면인데 POI 레이어가 없는 SaigonMapV2 를 쓰고 있었다(업체등록
 * 피커가 2026-08-03 에 같은 이유로 SaigonMapV5 로 분리됐던 것과 동일한 갭). V5 로 교체했고,
 * L3 상세지도 + POI 라벨이 시트 진입 직후 보이는지 확인한다.
 *
 * ⚠️ 이 화면은 휴대폰 인증 게이트 뒤에 있다 — dev 서버는 아무 번호/6자리 코드를 통과시킨다.
 * 번호는 run 마다 유일해야 한다(재사용하면 "다른 계정에 연결됨" 으로 막힌다).
 */
test.describe('위치 선택 시트 POI', () => {
  test.use({
    geolocation: { latitude: 10.77293, longitude: 106.7003 },
    permissions: ['geolocation'],
  });

  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('거래 희망 장소 시트에 L3 상세지도 + POI 라벨이 보인다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('lp1'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    await page.goto('/market/new');

    // 휴대폰 인증 게이트 통과 (dev 서버)
    const phone = `9${Date.now().toString().slice(-8)}`;
    await page.getByPlaceholder('901 234 567').fill(phone);
    await page.getByRole('button', { name: 'Nhận mã xác thực' }).click();
    const boxes = page.locator('input[inputmode="numeric"], input[maxlength="1"]');
    await boxes.first().waitFor({ timeout: 10_000 });
    for (let i = 0; i < 6; i++) await boxes.nth(i).fill(String(i + 1));
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    // 등록 폼 → '거래 희망 장소' 선택 버튼
    const label = page.getByText('Khu vực giao dịch', { exact: true }).first();
    await label.scrollIntoViewIfNeeded({ timeout: 20_000 });
    await label.locator('xpath=following::button[1]').click();

    // POI 라벨(회색 텍스트)이 시트 지도 위에 렌더된다 — 어떤 POI 든 1개 이상
    const poiLabels = page.locator('svg text[fill="#7d8590"]');
    await expect.poll(() => poiLabels.count(), { timeout: 25_000 }).toBeGreaterThan(0);
  });
});
