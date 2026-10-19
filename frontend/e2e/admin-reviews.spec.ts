import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { test, expect, request as pwRequest } from '@playwright/test';

/** 관리자 콘솔 후기 조회 — 후기 관리 목록(거래/업체), 유저 상세 후기 탭, 매물 상세 '이 거래의 후기'. */

const BASE_URL = 'http://localhost:18090';

test('admin review views', async ({ page }) => {
  const [username, password] = readFileSync(`${homedir()}/.ssh/saigon_admin_cred`, 'utf8').trim().split('\n');
  const admin = await pwRequest.newContext({ baseURL: BASE_URL });
  expect((await admin.post('/admin/api/auth/login', { data: { username, password } })).status()).toBe(200);

  const market = await (await admin.get('/admin/api/reviews?kind=market&size=100')).json();
  const withListing = market.items.find((r: { listing: unknown }) => r.listing);
  expect(withListing).toBeTruthy();
  const low = await (await admin.get('/admin/api/reviews?kind=market&max_rating=2&size=100')).json();
  expect(low.items.every((r: { rating: number }) => r.rating <= 2)).toBe(true);
  const biz = await (await admin.get('/admin/api/reviews?kind=biz')).json();
  expect(biz.total).toBeGreaterThan(0);

  await page.context().addCookies((await admin.storageState()).cookies);
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/admin/reviews');
  await expect(page.getByRole('heading', { name: '후기 관리' })).toBeVisible();
  await expect(page.locator('.ant-table-tbody tr.ant-table-row').first()).toBeVisible();
  await page.getByRole('tab', { name: '업체 후기' }).click();
  await page.locator('.ant-table-tbody tr.ant-table-row').first().click();
  await expect(page).toHaveURL(/\/admin\/reviews\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: '목록으로' }).click();
  await expect(page).toHaveURL(/\/admin\/reviews\?.*kind=biz/);

  await page.goto(`/admin/users/${withListing.target.id}`);
  await page.getByPlaceholder('예: 고객 문의 대응').fill('e2e 후기 조회 확인');
  await page.getByRole('button', { name: '열람' }).click();
  await expect(page.getByText('받은 거래 후기')).toBeVisible();
  await expect(page.locator('.ant-card').filter({ hasText: '받은 거래 후기' }).locator('tr.ant-table-row').first()).toBeVisible();
  // 다른 유저로 이동하면 열람 사유를 다시 받아야 한다
  await page.locator('.ant-card').filter({ hasText: '받은 거래 후기' }).locator('tr.ant-table-row a').first().click();
  await expect(page.getByPlaceholder('예: 고객 문의 대응')).toBeVisible();

  await page.goto(`/admin/listings/${withListing.listing.id}`);
  const card = page.locator('.ant-card').filter({ hasText: '이 거래의 후기' });
  await expect(card.locator('tr.ant-table-row').first()).toBeVisible();
  expect(errors).toEqual([]);
  await admin.dispose();
});
