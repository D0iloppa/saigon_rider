import { test, expect } from '@playwright/test';
import { devLogin, injectSession, saveConsentViaApi, cleanupUser, uniqueTag, type DevSession } from './helpers';

/**
 * 채팅 목록 헤더 [사람 찾기][그룹 채팅 만들기] + 사람 찾기 결과 행
 * (팔로우 버튼은 작은 버튼, 닉네임 한 줄, 행 탭 → 공개 프로필).
 */

const users: DevSession[] = [];

test.afterAll(() => {
  for (const u of users) cleanupUser(u.userId);
});

test('dm header people search → compact result row → profile; group create button', async ({ page, request }) => {
  const me = await devLogin(request, uniqueTag('ps-me'));
  users.push(me);
  await saveConsentViaApi(request, me);

  const otherRes = await request.post('http://localhost:18090/api/bff/auth/dev-login', { data: { phone: uniqueTag('ps-ot') } });
  const otherBody = await otherRes.json();
  const other: DevSession = { userId: otherBody.user.id, sessionToken: otherBody.session_token, phone: '' };
  users.push(other);
  await saveConsentViaApi(request, other);
  const nickname: string = otherBody.user.nickname;

  await injectSession(page, me);
  await page.addInitScript(() => window.localStorage.setItem('sr-lang', 'ko'));
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/dm');
  await page.getByRole('button', { name: '그룹 채팅 만들기' }).click();
  await expect(page).toHaveURL(/\/dm\/group\/new/);

  await page.goto('/dm');
  await page.getByRole('button', { name: '사람 찾기' }).click();
  await expect(page).toHaveURL(/\/friends\/add/);

  await page.getByPlaceholder('닉네임 또는 번호 검색').fill(nickname);
  const followBtn = page.getByRole('button', { name: '팔로우', exact: true }).first();
  await expect(followBtn).toBeVisible();
  const btnBox = await followBtn.boundingBox();
  expect(btnBox!.width).toBeLessThan(120);

  const nameEl = page.getByText(nickname, { exact: true }).first();
  const nameBox = await nameEl.boundingBox();
  expect(nameBox!.height).toBeLessThan(30); // 한 줄

  await page.screenshot({ path: 'test-results/dm-people-search.png' });
  await nameEl.click();
  await expect(page).toHaveURL(new RegExp(`/profile/${other.userId}`));
});
