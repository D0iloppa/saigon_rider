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

test('resolveOrigin delegates to requestDeviceLocation (serviceLocation.ts) — same call shape as SaigonMapV5.runLocate', () => {
  const source = read('RideNav.tsx');

  // serviceLocation.ts 의 requestDeviceLocation 을 import — 동네지도(resolveUsableLocation)가
  // 쓰는 것과 동일한 함수.
  assert.match(
    source,
    /import \{ requestDeviceLocation \} from '@\/lib\/serviceLocation';/,
    'RideNav.tsx must import requestDeviceLocation from @/lib/serviceLocation',
  );

  const fnStart = source.indexOf('async function resolveOrigin(): Promise<Coords> {');
  assert.ok(fnStart >= 0, 'resolveOrigin function not found in RideNav.tsx');
  const fnEnd = source.indexOf('\n}', fnStart);
  const fn = source.slice(fnStart, fnEnd);

  // 본문은 requestDeviceLocation() 호출 하나뿐 — 커스텀 Gps 권한 게이트(checkLocationPermission/
  // requestLocationPermission 을 resolveOrigin 안에서 직접 호출하고 미허용 시 throw)가 없어야 한다.
  assert.match(fn, /return requestDeviceLocation\(\);/);
  assert.doesNotMatch(fn, /checkLocationPermission/, 'resolveOrigin must not gate on checkLocationPermission itself');
  assert.doesNotMatch(fn, /requestLocationPermission/, 'resolveOrigin must not gate on requestLocationPermission itself');
  assert.doesNotMatch(fn, /location_permission_denied/, 'resolveOrigin must not throw a custom permission error before calling getLocation');
});

test('serviceLocation.ts requestDeviceLocation still requests native permission before reading location (prompt UX preserved)', () => {
  const source = read('../../lib/serviceLocation.ts');
  assert.match(
    source,
    /export function requestDeviceLocation\(\): Promise<GeoPosition> \{\s*return native\.ensureLocationPermission\(\)\.then\(\(\) => native\.getLocation\(\)\);/,
  );
});
