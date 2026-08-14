import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 실기기(네이티브 앱)에서 주유소/정비소 경로찾기가 GPS 권한 획득 실패로 막히던 회귀 —
// resolveOrigin() 이 커스텀 Gps 플러그인으로 별도 권한 게이트(checkLocationPermission→
// requestLocationPermission→미허용 시 throw)를 두어, 동네지도(SaigonMapV5.runLocate →
// resolveUsableLocation → requestDeviceLocation)에는 없는 관문을 하나 더 세웠다. 그 게이트가
// 'granted' 를 못 돌려주면 native.getLocation() 을 부르기도 전에 throw 됐다(dev 하네스는
// 이 게이트를 완전히 우회하므로 재현되지 않았음). 이 테스트는 그 게이트가 다시 끼워지지
// 않도록, resolveOrigin() 이 동네지도와 동일하게 requestDeviceLocation()(serviceLocation.ts)
// 를 그대로 호출하는 형태로 고정한다.

// 2026-08-13 정책 개정: resolveOrigin() 지역 래퍼는 제거되고 RideNav 가 공용 게이트
// requireServiceLocation() 를 직접 부른다. 위 회귀(권한 게이트 이중 설치)는 그 게이트가
// 내부적으로 requestDeviceLocation() 을 그대로 쓰는 한 재발하지 않으므로, 어서션 대상을
// "RideNav 가 자체 권한 게이트를 두지 않는다" + "게이트가 requestDeviceLocation 에 위임한다"
// 두 축으로 옮긴다.
test('RideNav does not install its own permission gate — it delegates to serviceLocation', () => {
  const source = read('RideNav.tsx');

  assert.match(
    source,
    /requireServiceLocation[\s\S]{0,200}from '@\/lib\/serviceLocation';/,
    'RideNav.tsx must obtain its origin through @/lib/serviceLocation',
  );
  assert.doesNotMatch(source, /resolveOrigin/, 'the local resolveOrigin wrapper was removed — do not reintroduce it');
  // 화면이 커스텀 Gps 권한 API 를 직접 만지면 실기기에서 측위 전에 막히는 회귀가 재발한다
  // (service-rules 원칙 13 / 사고 abb2ded).
  assert.doesNotMatch(source, /checkLocationPermission/, 'RideNav must not gate on checkLocationPermission itself');
  assert.doesNotMatch(source, /requestLocationPermission/, 'RideNav must not gate on requestLocationPermission itself');
  assert.doesNotMatch(source, /location_permission_denied/, 'RideNav must not throw a custom permission error before measuring');
});

test('requireServiceLocation reads position via requestDeviceLocation (no extra permission gate)', () => {
  const source = read('../../lib/serviceLocation.ts');

  const fnStart = source.indexOf('export async function requireServiceLocation()');
  assert.ok(fnStart >= 0, 'requireServiceLocation not found in serviceLocation.ts');
  const fn = source.slice(fnStart);

  // 동네지도(resolveUsableLocation)와 같은 측위 경로를 쓴다 — 관문을 하나 더 세우지 않는다.
  assert.match(fn, /await requestDeviceLocation\(\)/);
  assert.doesNotMatch(fn, /checkLocationPermission/);
  assert.doesNotMatch(fn, /requestLocationPermission/);
  // 실패는 오직 측위 실패 code 로만 판정한다.
  assert.match(fn, /classifyLocationError\(e\)/);
});

test('serviceLocation.ts requestDeviceLocation still requests native permission before reading location (prompt UX preserved)', () => {
  const source = read('../../lib/serviceLocation.ts');
  assert.match(
    source,
    /export function requestDeviceLocation\(\): Promise<GeoPosition> \{\s*return native\.ensureLocationPermission\(\)\.then\(\(\) => native\.getLocation\(\)\);/,
  );
});
