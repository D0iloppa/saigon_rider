import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('market and business read routes stay public in normal and background-location routing', () => {
  const app = read('../../App.tsx');

  for (const route of [
    '<Route path="/market" element={<MarketMain />} />',
    '<Route path="/market/search" element={<MarketSearch />} />',
    '<Route path="/market/:id" element={<MarketDetail />} />',
    '<Route path="/biz/:id" element={<BizPublic />} />',
  ]) {
    assert.match(app, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(app, /path="\/(?:market|market\/search|market\/:id|biz\/:id)" element=\{<PrivateRoute>/);
});

test('guest state changes save the full current route and enter the existing OAuth flow', () => {
  const guard = read('../../hooks/useRequireAuth.ts');

  assert.match(guard, /saveReturnTo\(location\.pathname \+ location\.search \+ location\.hash\)/);
  assert.match(guard, /navigate\(isAuthenticated \? '\/auth\/profile-setup' : '\/auth\/oauth'\)/);

  const detail = read('MarketDetail.tsx');
  for (const handler of ['handleToggleLike', 'handleChat', 'handleSendOffer', 'handleToggleFollow', 'handleReport', 'handleToggleBlock']) {
    const start = detail.indexOf(`const ${handler}`);
    assert.notEqual(start, -1, `${handler} is missing`);
    assert.match(detail.slice(start, start + 180), /if \(!requireAuth\(\)\) return;/, `${handler} is not auth-gated`);
  }

  const biz = read('../biz/BizPublic.tsx');
  for (const handler of ['handleToggleFavorite', 'handleToggleFollow', 'handleWriteReview']) {
    const start = biz.indexOf(`const ${handler}`);
    assert.notEqual(start, -1, `${handler} is missing`);
    assert.match(biz.slice(start, start + 180), /if \(!requireAuth\(\)\) return;/, `${handler} is not auth-gated`);
  }

  const main = read('MarketMain.tsx');
  for (const handler of ['openAlerts', 'handleAddKw', 'handleRemoveKw']) {
    const start = main.indexOf(`const ${handler}`);
    assert.notEqual(start, -1, `${handler} is missing`);
    assert.match(main.slice(start, start + 180), /if \(!requireAuth\(\)\) return;/, `${handler} is not auth-gated`);
  }

  const search = read('MarketSearch.tsx');
  assert.match(search, /const isMine = isMineRequested && !!userId/);
  assert.match(search, /if \(isMineRequested\) requireAuth\(\)/);
});

test('guest detail pages do not call personalized endpoints while rendering public data', () => {
  const detail = read('MarketDetail.tsx');
  assert.match(detail, /if \(!sid \|\| !myId\)/);

  const biz = read('../biz/BizPublic.tsx');
  assert.match(biz, /if \(!id \|\| !userId\) return;/);
});
