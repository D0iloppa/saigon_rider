import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'explorationLocation.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const {
  fallbackExplorationLocation,
  isLocationExecutionAvailable,
  resolveExplorationLocation,
  resolveExplorationMapMount,
} = await import(moduleUrl);

const BEN_THANH = { lat: 10.7716, lng: 106.698 };
const HCMC = { lat: 10.802, lng: 106.714 };
const OUTSIDE = { lat: 37.2, lng: 127.1 };

test('exploration policy uses HCMC GPS and falls back for every failure reason', () => {
  const device = resolveExplorationLocation(HCMC, true, BEN_THANH);
  assert.deepEqual(device, { coords: HCMC, coordsSource: 'device', gateReason: null });
  assert.deepEqual(
    resolveExplorationMapMount(device, false, BEN_THANH),
    { initialGps: HCMC, locateOnMount: true, meDotOnMount: true },
  );

  const outside = resolveExplorationLocation(OUTSIDE, false, BEN_THANH);
  assert.deepEqual(outside, { coords: BEN_THANH, coordsSource: 'fallback', gateReason: 'outside_area' });
  assert.equal(outside.coordsSource, 'fallback');

  for (const reason of ['permission', 'timeout', 'unavailable']) {
    const failed = fallbackExplorationLocation(reason, BEN_THANH);
    assert.deepEqual(failed, { coords: BEN_THANH, coordsSource: 'fallback', gateReason: reason });
    assert.equal(failed.coordsSource, 'fallback');
  }
});

test('pinnedAll disables automatic locate and me-dot mount behavior', () => {
  const device = resolveExplorationLocation(HCMC, true, BEN_THANH);
  assert.deepEqual(
    resolveExplorationMapMount(device, true, BEN_THANH),
    { initialGps: undefined, locateOnMount: false, meDotOnMount: false },
  );
});

test('the dev Gyeonggi execution bypass is not accepted as a map camera coordinate', () => {
  const browse = resolveExplorationLocation(OUTSIDE, false, BEN_THANH);
  assert.deepEqual(resolveExplorationMapMount(browse, false, BEN_THANH).initialGps, BEN_THANH);
  assert.equal(browse.coordsSource, 'fallback');
  assert.equal(isLocationExecutionAvailable('fallback', null, 20, 200), true, 'dev bypass remains executable');
  assert.equal(isLocationExecutionAvailable('fallback', 'outside_area', null, 200), false, 'real outside location remains blocked');
  assert.equal(isLocationExecutionAvailable('fallback', null, 250, 200), false, 'dev bypass still obeys accuracy');
});
