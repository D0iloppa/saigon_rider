import { test } from '@playwright/test';
import { devLogin, injectSession, uniqueTag, verifyPhoneBypass, saveConsentViaApi, createListing, uploadTestImage, cleanupUser, type DevSession } from './helpers';
let session: DevSession;
test.afterEach(() => { if (session) cleanupUser(session.userId); });
test('dbg edit', async ({ page, request }) => {
  const tag = uniqueTag('dbge');
  session = await devLogin(request, tag);
  await verifyPhoneBypass(request, session);
  await saveConsentViaApi(request, session);
  const contentId = await uploadTestImage(request, session);
  const listing = await createListing(request, session, `DBG${tag}`, [contentId]);
  await injectSession(page, session);
  page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 250)); });
  page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url().slice(0, 110)); });
  await page.goto(`/market/${listing.id}/edit`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/claude-1000/-mnt-c-DEV-saigon-rider/f993fbf3-044c-4a01-a6d9-6ab6798bb95f/scratchpad/edit.png' });
});
