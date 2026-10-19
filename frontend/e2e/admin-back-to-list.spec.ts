import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { test, expect, request as pwRequest } from '@playwright/test';

/** 관리자 콘솔 목록 → 상세 → '목록으로' 복귀 (공통 AdminLayout). 관리자 계정은 ~/.ssh/saigon_admin_cred. */

const BASE_URL = 'http://localhost:18090';

test('admin detail page returns to list', async ({ page }) => {
  const [username, password] = readFileSync(`${homedir()}/.ssh/saigon_admin_cred`, 'utf8').trim().split('\n');
  const admin = await pwRequest.newContext({ baseURL: BASE_URL });
  expect((await admin.post('/admin/api/auth/login', { data: { username, password } })).status()).toBe(200);
  await page.context().addCookies((await admin.storageState()).cookies);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('/admin/listings');
  await expect(page.getByRole('button', { name: '목록으로' })).toHaveCount(0);
  await page.locator('.ant-table-tbody tr.ant-table-row').first().click();
  await expect(page).toHaveURL(/\/admin\/listings\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: '목록으로' }).click();
  await expect(page).toHaveURL(/\/admin\/listings$/);
  await admin.dispose();
});
