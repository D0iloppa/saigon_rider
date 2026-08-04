import { test, expect } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, saveConsentViaApi, cleanupUser, type DevSession } from './helpers';

test.use({ geolocation: { latitude: 10.7707, longitude: 106.69456 }, permissions: ['geolocation'] });
let session: DevSession;
test.afterEach(() => { if (session) cleanupUser(session.userId); });

test('구분선이 도로보다 위에 렌더된다 (DOM 순서)', async ({ page, request }) => {
  session = await devLogin(request, uniqueTag('ord'));
  await saveConsentViaApi(request, session);
  await injectSession(page, session);
  await page.goto('/map');
  await page.getByRole('heading', { level: 1 }).click();
  await page.getByText('Dùng vị trí hiện tại của tôi', { exact: true }).click();
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bến Thành', { timeout: 10000 });
  await page.getByRole('button', { name: 'Xem bản đồ' }).click();
  await page.waitForTimeout(9000);

  const r = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('svg *'));
    const border = all.findIndex((el) => el.tagName === 'polygon' && (el as SVGElement).getAttribute('stroke') === '#ff5a1f');
    // 도로: class 에 road 가 들어간 path/polyline 중 마지막
    let lastRoad = -1;
    all.forEach((el, i) => {
      const c = (el as SVGElement).getAttribute('class') ?? '';
      if (c.includes('road') || c.includes('blk') || c.includes('bldg')) lastRoad = i;
    });
    // 아래로 깔린 굵은 stroke 잔재 확인
    const boundaryStroke = (() => {
      const el = document.querySelector('svg polygon[class*="wardBoundary"]');
      return el ? getComputedStyle(el).stroke : 'ABSENT';
    })();
    return { borderIdx: border, lastRoadIdx: lastRoad, total: all.length, boundaryStroke };
  });
  console.log('ORDER', JSON.stringify(r));
  expect(r.borderIdx).toBeGreaterThan(r.lastRoadIdx);   // 구분선이 도로보다 뒤 = 위에 그려짐
  expect(r.boundaryStroke).toBe('none');                 // 밑에 깔린 굵은 띠 제거 확인
});
