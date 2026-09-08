import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('guest map personal entry points reuse the OAuth guard instead of entering PrivateRoute', () => {
  const list = read('NeighborhoodMap.tsx');
  const canvas = read('NeighborhoodMapCanvas.tsx');

  for (const route of ['/map/search', '/map/favorites', '/map/profile']) {
    const at = list.indexOf(`navigate('${route}')`);
    assert.notEqual(at, -1, `${route} entry point is missing`);
    assert.match(list.slice(Math.max(0, at - 70), at + 45), /if \(requireAuth\(\)\)/, `${route} must enter OAuth through requireAuth`);
  }

  assert.match(canvas, /onClick=\{\(\) => \{ if \(requireAuth\(\)\) setSearchPanelOpen\(true\); \}\}/);
  assert.match(canvas, /onClick=\{\(\) => \{ if \(requireAuth\(\)\) navigate\('\/map\/profile'\); \}\}/);
  assert.match(canvas, /const toggleFavOnly = \(\) => \{\s*if \(!requireAuth\(\)\) return;/);
  assert.match(canvas, /onClick=\{\(\) => \{ if \(requireAuth\(\)\) setAddMenuOpen/);
});

test('expired sessions keep the public map visible for guest browsing', () => {
  const app = read('../../App.tsx');

  assert.match(app, /const PUBLIC_BROWSE_PREFIXES = \['\/market', '\/biz', '\/map'\]/);
});

test('guest map has a deterministic Bến Thành camera fallback when no location coordinate exists', () => {
  const canvas = read('NeighborhoodMapCanvas.tsx');

  assert.match(canvas, /import \{ BEN_THANH_FALLBACK \} from '@\/lib\/mapDefaults'/);
  assert.match(canvas, /initialGps=\{coords \?\? BEN_THANH_FALLBACK\}/);
});

test('walkie bubble additionally requires authenticated state, not a stale persisted user alone', () => {
  const bubble = read('../../components/dm/WalkieTalkieFloatingButton.tsx');

  assert.match(bubble, /const isAuthenticated = useUserStore\(\(s\) => s\.isAuthenticated\);/);
  const active = bubble.match(/const bubbleActive =[\s\S]*?\n\s*!closed;/);
  assert.ok(active, 'walkie visibility condition is missing');
  assert.match(active[0], /isAuthenticated &&/, 'logout must hide the bubble even if persisted user hydration is stale');
  assert.match(active[0], /!!user &&/, 'a user object remains required for normal authenticated use');
});
