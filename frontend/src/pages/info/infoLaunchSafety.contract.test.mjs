import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('flood report only requests native location from the explicit locate action', () => {
  const source = read('InfoFloodReport.tsx');
  const locateAction = source.slice(
    source.indexOf('async function handleLocate()'),
    source.indexOf('async function handleSubmit()'),
  );

  assert.doesNotMatch(source, /useEffect/);
  assert.match(source, /parseCoordsFromQuery\(search\)/);
  assert.match(source, /onClick=\{handleLocate\}/);
  assert.match(locateAction, /ensureLocationPermission\(\)[\s\S]*getLocation\(\)/);
});

test('flood failures have an unavailable state before any safe or empty copy', () => {
  const hub = read('InfoHub.tsx');
  const home = read('../home/WorldMapV2.tsx');

  assert.match(hub, /if \(!r\) throw new Error\('flood_unavailable'\)/);
  assert.match(hub, /setFloodUnavailable\(true\)/);
  assert.match(hub, /floodUnavailable[\s\S]*info\.flood\.unavailableShort/);
  assert.match(hub, /floodUnavailable[\s\S]*info\.flood\.unavailable[\s\S]*activeFloods\.length/);

  assert.match(home, /useState<'loading' \| 'ready' \| 'unavailable'>\('loading'\)/);
  assert.match(home, /setFloodStatus\('loading'\)[\s\S]*floodApi\.getActive/);
  assert.match(home, /if \(!r\) throw new Error\('flood_unavailable'\)/);
  assert.match(home, /setFloodStatus\('ready'\)/);
  assert.match(home, /setFloodStatus\('unavailable'\)/);
  assert.match(home, /floodStatus === 'loading' \? t\('common\.loading'\)[\s\S]*floodStatus === 'unavailable'[\s\S]*home\.v2\.floodSafe/);
});

test('default weather coordinates are reference data, not GPS', () => {
  const source = read('InfoWeather.tsx');

  assert.match(source, /source: 'default'/);
  assert.match(source, /location\.source === 'gps'[\s\S]*info\.distFromGps/);
  assert.match(source, /initialGps=\{location\.source === 'query' \? location : undefined\}/);
  assert.doesNotMatch(source, /initialGps=\{coords/);
});

test('stale weather responses cannot overwrite the latest selected location', () => {
  const source = read('InfoWeather.tsx');

  assert.match(source, /let cancelled = false;[\s\S]*weatherApi\.get/);
  assert.match(source, /\.then\(\(weather\) => \{[\s\S]*if \(cancelled\) return;/);
  assert.match(source, /\.catch\(\(\) => \{[\s\S]*if \(cancelled\) return;/);
  assert.match(source, /return \(\) => \{\s*cancelled = true;\s*\}/);
});

test('all locales include launch-safety copy', () => {
  for (const locale of ['ko', 'en', 'vi']) {
    const translations = JSON.parse(read(`../../locales/${locale}/translation.json`));
    const flood = translations.info.flood;
    for (const key of [
      'unavailable',
      'unavailableShort',
      'locationSelected',
      'locationRequired',
      'locationRequiredDesc',
      'locationLocating',
      'useCurrentLocation',
      'locationError',
    ]) {
      assert.equal(typeof flood[key], 'string', `${locale}: missing info.flood.${key}`);
      assert.ok(flood[key].length > 0, `${locale}: empty info.flood.${key}`);
    }
  }
});
