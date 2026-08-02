import { test, expect } from '@playwright/test';
import {
  devLogin,
  injectSession,
  uniqueTag,
  verifyPhoneBypass,
  saveConsentViaApi,
  createListing,
  uploadTestImage,
  cleanupUser,
  type DevSession,
} from './helpers';

/**
 * 매물 수정 화면 — 최근 실제로 났던 회귀(수정 중 입력이 서버 값으로 덮어써지는 버그, MarketEdit.tsx
 * 상단 주석 참조)는 "userId 대신 user 객체 전체를 구독하면 무관한 store mutation에도 재조회 effect가
 * 돌아 title/description을 리셋한다"는 런타임 현상이었다 — 소스에 어떤 훅을 쓰는지는 정적으로 보이지만,
 * 타이핑 중 실제로 값이 유지되는지는 브라우저로만 확인된다.
 */

test.describe('매물 수정', () => {
  let session: DevSession;

  test.afterEach(() => {
    if (session) cleanupUser(session.userId);
  });

  test('제목을 수정하는 동안 입력값이 서버 값으로 되돌아가지 않고, 저장하면 상세로 이동한다', async ({ page, request }) => {
    const tag = uniqueTag('e');
    session = await devLogin(request, tag);
    await verifyPhoneBypass(request, session);
    await saveConsentViaApi(request, session);

    // 저장 버튼은 이미지가 1장 이상 있어야 활성화된다(canSave 조건) — 저장까지 검증하려면 실제 이미지가 필요.
    const contentId = await uploadTestImage(request, session);
    const originalTitle = `E2E수정전${tag}`;
    const listing = await createListing(request, session, originalTitle, [contentId]);

    await injectSession(page, session);
    await page.goto(`/market/${listing.id}/edit`);

    const titleInput = page.getByPlaceholder('Tiêu đề');
    await expect(titleInput).toHaveValue(originalTitle, { timeout: 10_000 });

    const editedTitle = `E2E수정후${tag}`;
    await titleInput.fill(editedTitle);

    // 회귀가 재발하면 서버 재조회 effect가 이 값을 원래 제목으로 덮어쓴다 — 잠시 관찰해 고정 sleep이
    // 아니라 "그 사이 값이 안 변한다"를 실제로 표본 확인한다.
    await page.waitForTimeout(1000);
    await expect(titleInput).toHaveValue(editedTitle);

    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(page).toHaveURL(new RegExp(`/market/${listing.id}$`), { timeout: 10_000 });
  });
});
