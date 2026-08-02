import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, cleanupUser, type DevSession } from './helpers';

/**
 * F-9 동의 게이트 — 정적 .mjs 계약 테스트(privateRouteConsentGate.contract.test.mjs)는
 * `consentAgreedAt === null` 엄격 비교 코드가 소스에 있는지만 확인한다. 실제로:
 *   ① 브라우저가 그 코드를 실행해 /auth/profile-setup 으로 정말 리다이렉트되는지
 *   ② 동의를 완료한 뒤 /home 진입이 실제로 붙어 있는지(왕복 없음, 렌더 타이밍 문제는 정적으로 못 잡는다)
 * 는 아무도 검증하지 않았다. 이 두 가지가 이 테스트의 값어치다.
 */

test.describe('동의 게이트', () => {
  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('동의 미기록 신규 유저는 profile-setup으로 막히고, 동의 완료 후에는 /home에 그대로 남는다', async ({ page, request }) => {
    const tag = uniqueTag('c');
    session = await devLogin(request, tag);
    await injectSession(page, session);

    await page.goto('/home');

    // ① 차단: consentAgreedAt === null 인 신규 계정은 서비스 화면 대신 온보딩으로 리다이렉트된다.
    await expect(page).toHaveURL(/\/auth\/profile-setup$/, { timeout: 10_000 });

    // 온보딩 폼 완료 — 닉네임 중복확인 debounce(400ms) 통과를 기다린 뒤 제출 버튼이 활성화된다.
    await page.getByPlaceholder('Nhập biệt danh…').fill(`E2E ${tag}`);
    await page.getByRole('checkbox').check();
    const submit = page.getByRole('button', { name: 'Bắt đầu →' });
    await submit.click();

    // ② 통과: 서버가 동의를 기록하면 store 도 즉시 반영돼 /home 에서 되튕기지 않아야 한다.
    await expect(page).toHaveURL(/\/home$/, { timeout: 10_000 });
    // 왕복(bounce) 실증 — 리다이렉트 로직이 지연 실행되더라도 잡히도록 잠시 더 관찰한다.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/home$/);
  });
});
