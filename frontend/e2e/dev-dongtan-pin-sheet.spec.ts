import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

/**
 * DEV_DONGTAN_PIN 회귀 감시 — 대표 지적(2026-08-07): "일반 길찾기 모드에서는 바텀시트가 뜨는데
 * `[DEV] 동탄역` 에서는 안 뜬다"에 대한 고정 테스트. devBypass(buildDevSyntheticRoute()) 로 만든
 * 합성 RouteData 가 실제 백엔드 RouteOut 스키마를 채우지 못해 하단 시트가 비어 보이는 회귀를 잡는다.
 *
 * `/dev/gps` 오버라이드(__dev_gps)로 GPS 권한 프롬프트 없이 좌표를 확정한 뒤, RideNav 에 devRaw=1 +
 * DEV 핀 좌표로 직접 진입해 시트(ETA 행)가 렌더되는지 확인한다.
 *
 * 실기기 검증 완료 후 DEV_DONGTAN_PIN 제거와 함께 이 파일도 삭제할 것 (2026-08-07, 근거는
 * RideNav.tsx/devDongtanPin.contract.test.mjs 의 동일 주석 참조).
 */

const GPS_KEY = '__dev_gps';
const BEN_THANH = { lat: 10.7769, lng: 106.7009 }; // 서비스 지역 안 — outOfArea 폴백을 타지 않게.
const DEV_PIN = { lat: 37.2007, lng: 127.1128 }; // [DEV] 동탄역

test.describe('[DEV] 동탄역 — devBypass 합성 경로에서도 하단 시트가 뜬다', () => {
  let session: DevSession;
  test.afterEach(() => { if (session) cleanupUser(session.userId); });

  test('devRaw=1 + DEV 핀 좌표로 진입하면 ETA 시트(도착 예정/거리)가 렌더된다', async ({ page, request }) => {
    session = await devLogin(request, uniqueTag('devpin'));
    await saveConsentViaApi(request, session);
    await injectSession(page, session);
    // GPS 오버라이드 — 위치 권한 프롬프트 없이 현재 위치를 확정한다(다른 e2e 와 동일 메커니즘).
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [GPS_KEY, JSON.stringify({ lat: BEN_THANH.lat, lng: BEN_THANH.lng })] as const,
    );

    const url = `/ride-nav?type=nav&name=${encodeURIComponent('[DEV] 동탄역')}&lat=${DEV_PIN.lat}&lng=${DEV_PIN.lng}&devRaw=1`;
    await page.goto(url);

    // 시트 헤더(ETA 행) — 정상 경로와 동일하게 도착 예정 시각/거리 라벨이 채워져야 한다.
    await expect(page.locator('[class*="etaRow"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[class*="etaTime"]')).toHaveText(/^\d{2}:\d{2}$/, { timeout: 20_000 });
    await expect(page.locator('[class*="distVal"]').first()).not.toHaveText('—');

    // 안내 시작 플로팅 버튼도 함께 뜬다(합성 route.configured===true 정상 반영).
    await expect(page.locator('button[class*="startFab"]')).toBeVisible({ timeout: 20_000 });

    // 시트 본문의 스텝 목록도 비어 있지 않다(steps.length>=1 이 실제로 렌더됨).
    await expect(page.locator('[class*="stepRow"]').first()).toBeVisible({ timeout: 20_000 });
  });
});
