import { test, expect } from '@playwright/test';
import { devLogin, injectSession, saveConsentViaApi, uniqueTag, cleanupUser, type DevSession } from './helpers';

/**
 * 스플래시 홈 프리페치 (2026-09-28): 스플래시가 뜬 동안 홈 데이터를 미리 조회해두고,
 * 부팅 작업 + (홈 데이터 준비 OR 서버 설정 타임아웃) 중 먼저 끝나는 쪽까지만 스플래시를 유지한다.
 * lib/homePrefetch.ts, App.tsx splash-fade 이펙트, api/appVersion.ts splash_prefetch_timeout_ms.
 *
 * 느린 네트워크(CDP Network.emulateNetworkConditions)에서도:
 *  ① 홈 섹션 타이틀이 결국 렌더된다.
 *  ② 스플래시가 떠 있는 동안 지역-밖 토스트(map.outsideArea)가 보이지 않는다(fix(map) 회귀 방지).
 *  ③ GET /app-config 응답에 splash_prefetch_timeout_ms 가 포함된다.
 */
test.describe('스플래시 홈 프리페치', () => {
  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('느린 네트워크에서도 스플래시 위에 지역-밖 토스트 없이 홈 섹션이 뜬다', async ({ page, request }) => {
    const tag = uniqueTag('sp');
    session = await devLogin(request, tag);
    await saveConsentViaApi(request, session);
    await injectSession(page, session);

    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400, // ms
      downloadThroughput: (1.5 * 1024 * 1024) / 8, // 1.5Mbps
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
    });

    const appConfigResponse = page.waitForResponse((res) => res.url().includes('/api/bff/app-config') && res.ok());

    await page.goto('/');

    const cfg = await appConfigResponse;
    const cfgBody = await cfg.json();
    expect(cfgBody).toHaveProperty('splash_prefetch_timeout_ms');
    expect(typeof cfgBody.splash_prefetch_timeout_ms).toBe('number');

    // 스플래시 오버레이가 떠 있는 동안 지역-밖 토스트가 보이면 안 된다(fix(map) 회귀).
    // 앱 기본 로케일(vi) 문구 — locales/vi/translation.json map.outsideArea.
    const outsideAreaToast = page.getByText('Ngoài khu vực dịch vụ, hiển thị theo khu trung tâm');
    await expect(outsideAreaToast).not.toBeVisible();

    // 결국 홈으로 도착해 섹션 타이틀들이 렌더된다 (locales/vi/translation.json home.v2.*).
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });
    await expect(page.getByText('Sản phẩm nổi bật gần bạn')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Tin tức cửa hàng')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Đăng mới nhất')).toBeVisible({ timeout: 15_000 });

    // 홈 도착 후에도(스플래시가 내려간 뒤) 여전히 뜨지 않은 상태 유지(과도한 재확인 아님 — 이번엔
    // "떠도 되는" 시점이라 별도 assertion 없이 위 not.toBeVisible 구간만으로 충분).
  });
});
