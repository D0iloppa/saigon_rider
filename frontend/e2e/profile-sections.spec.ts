import { test, expect } from '@playwright/test';
import {
  devLogin,
  injectSession,
  uniqueTag,
  saveConsentViaApi,
  cleanupUser,
  type DevSession,
} from './helpers';

/**
 * F-P-02 실기기 피드백 2차(260928): 내 매물은 거래 이력과 분리된 시트 카드 그룹의 독립 행,
 * 거래 이력은 [구매|판매] 2탭(구매 기본)으로 복원됐다.
 *
 * NOTE: devLogin()이 쓰는 공용 dev-login 계정은 이 워크스페이스에서 간헐적으로 500을 낸다 —
 * 재현되면 `POST /api/bff/auth/dev-login-as`를 Host 헤더 `saigon.doil.me`(DEV_HOST)로 호출하는
 * 대안 경로를 쓴다(감독 재빌드 후 통합테스트 실행 시 참고).
 */
test.describe('프로필 — 내 매물 / 거래 이력 섹션', () => {
  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('내 매물 행은 독립 카드로 노출되고, 거래 이력은 [구매|판매] 2탭이다', async ({ page, request }) => {
    const tag = uniqueTag('p');
    session = await devLogin(request, tag);
    await saveConsentViaApi(request, session);

    await injectSession(page, session);
    await page.addInitScript(() => {
      window.localStorage.setItem('sr-lang', 'ko');
    });

    await page.goto('/profile');

    // 내 매물 행 — 카드 그룹 안 독립 행, 탭 시 /market/search?mine=1
    const myListingsRow = page.getByText('내 매물', { exact: false }).first();
    await expect(myListingsRow).toBeVisible();
    await myListingsRow.click();
    await expect(page).toHaveURL(/\/market\/search\?mine=1/);

    await page.goBack();
    await expect(page).toHaveURL(/\/profile/);

    // 거래 이력 — [구매|판매] 정확히 2탭, 구매 기본 활성
    await expect(page.getByText('거래 이력', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '구매', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '판매', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '판매 중', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '판매 완료', exact: true })).toHaveCount(0);

    // 신규 유저는 거래가 없으므로 '전체 보기'는 숨고 빈 상태 문구가 보인다.
    await page.getByRole('button', { name: '판매', exact: true }).click();
    await expect(page.getByText('판매 내역이 없어요')).toBeVisible();
    await expect(page.getByText('전체 보기')).toHaveCount(0);
  });
});
