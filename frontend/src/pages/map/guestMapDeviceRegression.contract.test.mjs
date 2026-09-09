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
  const map = read('../../components/maps/SaigonMapV5.tsx');

  assert.match(canvas, /import \{ BEN_THANH_FALLBACK \} from '@\/lib\/mapDefaults'/);
  assert.match(canvas, /resolveExplorationMapMount\(coords \? \{ coords \} : null, pinnedAll, BEN_THANH_FALLBACK\)/);
  assert.match(canvas, /initialGps=\{mapMount\.initialGps\}/);
  assert.match(map, /catch \(error\)[\s\S]*?classifyLocationError\(error\)[\s\S]*?focusLatLng\(BEN_THANH_FALLBACK, \{ selectRegion: selectRegionOnLocate, noMeDot: true \}\)/);
});

test('map mount shares the exploration store result for card distance and the me-dot', () => {
  const canvas = read('NeighborhoodMapCanvas.tsx');
  const map = read('../../components/maps/SaigonMapV5.tsx');

  assert.doesNotMatch(canvas, /requestDeviceLocation/, 'the canvas must not start a second raw GPS request');
  assert.match(canvas, /distanceM=\{coords \? haversineM\(coords\.lat, coords\.lng, b\.lat, b\.lng\) : null\}/);
  const meDotEffect = map.slice(map.indexOf('// 내 위치 점만 찍는 조용한 측위'), map.indexOf('// 내 위치 점의 실시간 추종'));
  assert.match(meDotEffect, /useLocationStore\.getState\(\)\.ensureLocation\(\)/);
  assert.doesNotMatch(meDotEffect, /resolveUsableLocation\(\)/, 'me-dot mount must not bypass the store preflight');
  assert.match(meDotEffect, /coords && coordsSource === 'device'/, 'fallback coordinates must not render a fake me-dot');
});

test('manual locate updates the shared exploration store before moving camera and me-dot', () => {
  const store = read('../../store/useLocationStore.ts');
  const map = read('../../components/maps/SaigonMapV5.tsx');
  const runLocate = map.slice(map.indexOf('const runLocate = useCallback'), map.indexOf('// ◎ 버튼:'));

  assert.match(runLocate, /useLocationStore\.getState\(\)\.locateFromUserAction\(\)/);
  assert.doesNotMatch(runLocate, /resolveUsableLocation\(\)/, 'manual locate must not bypass the shared store');
  assert.match(store, /locateFromUserAction: async \(\) => \{[\s\S]*?requestDeviceLocation\(\)[\s\S]*?coords: \{ \.\.\.resolved\.coords \}/);
  assert.match(store, /catch \(error\)[\s\S]*?fallbackExplorationLocation\(reason, BEN_THANH_FALLBACK\)[\s\S]*?gateReason: resolved\.gateReason/);
  assert.match(store, /locateFromUserAction: async \(\) => \{[\s\S]*?pinnedAll: false/, 'an explicit locate request must leave pinned-all mode');
});

test('walkie bubble additionally requires authenticated state, not a stale persisted user alone', () => {
  const bubble = read('../../components/dm/WalkieTalkieFloatingButton.tsx');

  assert.match(bubble, /const isAuthenticated = useUserStore\(\(s\) => s\.isAuthenticated\);/);
  const active = bubble.match(/const bubbleActive =[\s\S]*?\n\s*!closed;/);
  assert.ok(active, 'walkie visibility condition is missing');
  assert.match(active[0], /isAuthenticated &&/, 'logout must hide the bubble even if persisted user hydration is stale');
  assert.match(active[0], /!!user &&/, 'a user object remains required for normal authenticated use');
});
