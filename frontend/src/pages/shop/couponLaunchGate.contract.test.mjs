import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('coupon fulfillment stays hidden from current live user entry points', () => {
  const app = read('../../App.tsx');
  const profile = read('../profile/ProfileMain.tsx');
  const neighborhood = read('../map/NeighborhoodProfile.tsx');

  assert.doesNotMatch(app, /import MyCoupons/);
  assert.doesNotMatch(app, /<Route path="\/coupons\/mine"/);
  assert.doesNotMatch(profile, /navigate\('\/coupons\/mine'\)/);
  assert.doesNotMatch(neighborhood, /navigate\('\/coupons\/mine'\)/);
});

test('garage stays hidden from current live entry points while inventory APIs are launch-gated', () => {
  const app = read('../../App.tsx');
  const gameHub = read('../../components/game/GameHubSheet.tsx');
  const profile = read('../profile/ProfileMain.tsx');

  assert.doesNotMatch(app, /import Garage/);
  assert.doesNotMatch(app, /<Route path="\/garage"/);
  assert.doesNotMatch(gameHub, /path: '\/garage'/);
  assert.doesNotMatch(profile, /navigate\('\/garage'\)/);
  assert.doesNotMatch(profile, /fetchInventory/);
});
