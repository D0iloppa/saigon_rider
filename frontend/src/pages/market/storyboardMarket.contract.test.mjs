import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('F-S0-02 FR-3 asks once before terminal deal-result answers', () => {
  const detail = read('MarketDetail.tsx');

  assert.match(detail, /result === 'SOLD_ELSEWHERE' \|\| result === 'GAVE_UP'/);
  assert.match(detail, /dealPingSoldElsewhereConfirmBody/);
  assert.match(detail, /dealPingGaveUpConfirmBody/);
  assert.match(detail, /onClick=\{\(\) => handleDealPingPick\('SOLD_ELSEWHERE'\)\}/);
  assert.match(detail, /onClick=\{\(\) => handleDealPingPick\('GAVE_UP'\)\}/);
});

test('F-S1-02 FR-1 removes a wishlist item directly from its card', () => {
  const wishlist = read('MarketWishlist.tsx');
  const card = read('ListingCard.tsx');

  assert.match(wishlist, /toggleLike\(listingId, userId\)/);
  assert.match(wishlist, /filter\(\(item\) => item\.id !== listingId\)/);
  assert.match(card, /onToggleLike\?: \(\) => void/);
  assert.match(card, /event\.stopPropagation\(\)/);
});

test('F-S2-01 keeps the server-supported reserved conversation path and confirms new blocks', () => {
  const detail = read('MarketDetail.tsx');

  assert.match(detail, /detail\.status === 'ON_SALE' \|\| detail\.status === 'RESERVED'/);
  assert.match(detail, /market\.blockConfirmBody/);
  assert.match(detail, /onClick=\{handleBlockPick\}/);
});
