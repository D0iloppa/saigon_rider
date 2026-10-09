import { test, expect } from '@playwright/test';
import en from '../src/locales/en/translation.json';
import vi from '../src/locales/vi/translation.json';

/**
 * 첫 실행(저장된 sr-lang 없음) 언어 — 기기/브라우저 언어가 vi·ko·en 이면 그대로, 그 외는 en.
 * iOS 네이티브 권한 문구 현지화와 UI 언어를 일치시키기 위함 (App Review G4 2026-10-09).
 * 신규 컨텍스트는 localStorage 가 비어 있으므로 sr-lang 은 없다. 스플래시 CTA 문구로 판정한다.
 */
const CASES = [
  { locale: 'en-US', expected: en.splash.startBtn },
  { locale: 'vi-VN', expected: vi.splash.startBtn },
  { locale: 'ja-JP', expected: en.splash.startBtn }, // 미지원 언어 → en
];

for (const { locale, expected } of CASES) {
  test(`첫 실행 언어: ${locale} → "${expected}"`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.goto('/splash');
    await expect(page.getByRole('button', { name: expected })).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem('sr-lang'))).toBeNull();
    await context.close();
  });
}
