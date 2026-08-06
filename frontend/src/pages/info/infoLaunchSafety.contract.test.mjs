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
  const home = read('../home/HomePage.tsx');

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

test('weather location comes from the shared store, and the screen never measures GPS itself', () => {
  const source = read('InfoWeather.tsx');

  // 2026-08-06 개정 (대표 지시 "주유소. 강수. 등. 지역이 뭔기준이냐 / 그거 gps로 잡아라"):
  // 종전 계약은 "날씨는 GPS 를 쓰지 않는다"였다 — 그래서 GPS 를 켜도 예전에 고른 지역이
  // 기준이었다. 이제 기준 좌표는 GPS 다. 다만 **측위 주체는 여전히 스토어 하나**여야 한다 —
  // 화면이 직접 native 를 부르면 정보 4화면이 각자 권한창을 띄우는 회귀가 난다.
  assert.match(source, /useServiceLocation\(\)/);
  assert.match(
    source,
    /const \{ origin: coords \} = useServiceLocation\(\)/,
    '기준 좌표는 useServiceLocation 의 origin 하나 — 화면이 좌표를 따로 조립하지 않는다',
  );
  assert.doesNotMatch(source, /getLocation\(/, '화면이 직접 측위하면 안 된다(스토어가 세션당 1회)');
  assert.doesNotMatch(source, /ensureLocationPermission/, '권한 요청도 스토어 책임이다');
  assert.doesNotMatch(source, /locateOnMount/);
});

test('useServiceLocation derives from the location store, not a manually picked region', () => {
  const source = read('../../hooks/useServiceLocation.ts');
  // 주석을 걷어낸 실행 코드 — "폐기됐다"는 설명이 폐기 검사에 걸리지 않게 한다.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  // 회귀 감시: 이 훅이 종전처럼 수동 선택 지역(useSelectedRegion)으로 돌아가면
  // 주유소·정비소·날씨·침수가 다시 GPS 를 무시하게 된다(2026-08-06 대표 지적의 본체).
  assert.doesNotMatch(code, /useSelectedRegion/, '수동 선택 지역 의존은 폐기됐다');
  assert.match(source, /useLocationStore/, '표시 범위 단일 SoT 를 따라야 한다');
  assert.match(
    source,
    /mode === 'gps' && coords \? coords : HCMC_DEFAULT_CENTER/,
    "'gps' 면 내 좌표, '전체'면 도시 기본 중심",
  );
  assert.match(
    source,
    /fetchRadiusKm: mode === 'gps' \? NEARBY_RADIUS_KM : ALL_AREA_RADIUS_KM/,
    "'전체 지역'은 서비스 전역 반경(12km) — 3km 로 두면 '내 현재 위치'와 결과가 같아진다",
  );
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
