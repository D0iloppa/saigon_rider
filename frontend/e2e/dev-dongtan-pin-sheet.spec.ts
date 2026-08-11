import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * DEV_DONGTAN_PIN 회귀 감시 — 대표 지적(2026-08-07): "일반 길찾기 모드에서는 바텀시트가 뜨는데
 * `[DEV] 동탄역` 에서는 안 뜬다"에 대한 고정 테스트.
 *
 * 갱신(2026-08-07): 자체 호스팅 라우팅 엔진 전환 + 경기도 타일 추가로 devBypass 도 이제 합성
 * 폴리라인 없이 실제 routeApi.getRoute() 를 호출한다(검증 목적상 실제 경로탐색을 타는 것이
 * 맞다는 판단) — 이 테스트는 그 실제 응답으로도 하단 시트(ETA 행)가 정상 렌더되는지 지킨다.
 *
 * `/dev/gps` 오버라이드(__dev_gps)로 GPS 권한 프롬프트 없이 좌표를 확정한 뒤, RideNav 에 devRaw=1 +
 * DEV 핀 좌표로 직접 진입해 시트(ETA 행)가 렌더되는지 확인한다.
 *
 * 실기기 검증 완료 후 DEV_DONGTAN_PIN 제거와 함께 이 파일도 삭제할 것 (2026-08-07, 근거는
 * RideNav.tsx/devDongtanPin.contract.test.mjs 의 동일 주석 참조).
 */

const GPS_KEY = '__dev_gps';
// 실제 라우팅 엔진(Valhalla)은 지리적으로 연결된 도로망만 경로를 낼 수 있다 — 베트남↔한국처럼
// 대륙이 다른 두 점 사이는 계산이 불가능하다(합성 폴리라인 시절에는 임의의 두 점이어도 직선을
// 그렸을 뿐이라 문제가 없었다). 그래서 GPS 오버라이드도 DEV 핀과 같은 경기도 타일 안의 실좌표로
// 옮겨야 한다 — outOfArea/벤탄 폴백은 devBypass 가 건너뛰므로 원래 서비스 지역(호치민)일 필요가
// 없다.
const ORIGIN_NEAR_PIN = { lat: 37.1980, lng: 127.1100 }; // 동탄역 인근(경기도 타일 안)
const DEV_PIN = { lat: 37.2007, lng: 127.1128 }; // [DEV] 동탄역

test.describe('[DEV] 동탄역 — 실제 라우팅 엔진 경로에서도 하단 시트가 뜬다', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('devRaw=1 + DEV 핀 좌표로 진입하면 ETA 시트(도착 예정/거리)가 렌더된다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('devpin'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);
    // GPS 오버라이드 — 위치 권한 프롬프트 없이 현재 위치를 확정한다(다른 e2e 와 동일 메커니즘).
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [GPS_KEY, JSON.stringify({ lat: ORIGIN_NEAR_PIN.lat, lng: ORIGIN_NEAR_PIN.lng })] as const,
    );

    const url = `/ride-nav?type=nav&name=${encodeURIComponent('[DEV] 동탄역')}&lat=${DEV_PIN.lat}&lng=${DEV_PIN.lng}&devRaw=1`;
    await page.goto(url);

    // 시트 헤더(ETA 행) — 정상 경로와 동일하게 도착 예정 시각/거리 라벨이 채워져야 한다.
    await expect(page.locator('[class*="etaRow"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[class*="etaTime"]')).toHaveText(/^\d{2}:\d{2}$/, { timeout: 20_000 });
    await expect(page.locator('[class*="distVal"]').first()).not.toHaveText('—');

    // 안내 시작 플로팅 버튼도 함께 뜬다(실제 route.configured===true 정상 반영).
    await expect(page.locator('button[class*="startFab"]')).toBeVisible({ timeout: 20_000 });

    // 시트 본문의 스텝 목록도 비어 있지 않다(steps.length>=1 이 실제로 렌더됨).
    await expect(page.locator('[class*="stepRow"]').first()).toBeVisible({ timeout: 20_000 });
  });
});
