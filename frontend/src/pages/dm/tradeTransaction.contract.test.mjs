import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('./TradeTransaction.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('./DmDetail.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../api/dm.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('transaction detail keeps manual payment acknowledgements separate', () => {
  assert.match(api, /transaction\/payment-reported/);
  assert.match(api, /transaction\/payment-confirmed/);
  assert.match(page, /tradeBoundaryNotice/);
  assert.doesNotMatch(page, /completeAppointment\(/);
});

test('seller QR uses private Content and the authenticated delivery route', () => {
  assert.match(api, /form\.append\('is_private', 'true'\)/);
  assert.match(api, /realFetchForm<\{ id: string \}>\('\/contents\/upload'/);
  assert.doesNotMatch(api, /content\.imgproxy_url/);
  assert.match(api, /\/payment-qr/);
  assert.match(api, /realFetchBlob\(`\/dm\/conversations\/\$\{conversationId\}\/payment-qr/);
  assert.match(page, /fetchMarketplacePaymentQr\(conversationId, messageId\)/);
});

test('chat cards and route lead to the transaction detail', () => {
  assert.match(detail, /messageType === 'payment_qr'/);
  assert.match(detail, /\/trade\/\$\{m\.meta!\.appointmentId\}/);
  assert.match(detail, /\/trade\/\$\{appt\.id\}/);
  assert.match(app, /\/dm\/:conversationId\/trade\/:appointmentId/);
});
