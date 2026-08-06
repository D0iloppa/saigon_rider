import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// resolveOrigin()/getCurrentPosition 실패가 하나의 generic catch 로 뭉쳐 "위치 권한을
// 확인해 주세요" 한 문구로만 표시되던 문제 — 권한거부/타임아웃/측위불가를 구분해야
// 사용자가 다른 행동(설정 열기 / 실외에서 재시도 / 재시도)을 취할 수 있다.
// GeolocationPositionError.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT.

function classifyLocationError(e) {
  if (e instanceof Error && e.message === 'location_permission_denied') return 'permission';
  const code = e?.code;
  if (code === 1) return 'permission';
  if (code === 3) return 'timeout';
  return 'unavailable';
}

test('classifyLocationError maps resolveOrigin/getCurrentPosition failures to 3 distinct reasons', () => {
  assert.equal(classifyLocationError(new Error('location_permission_denied')), 'permission');
  assert.equal(classifyLocationError({ code: 1, message: 'User denied Geolocation' }), 'permission');
  assert.equal(classifyLocationError({ code: 3, message: 'Timeout expired' }), 'timeout');
  assert.equal(classifyLocationError({ code: 2, message: 'Position unavailable' }), 'unavailable');
  // 알 수 없는/무관한 에러도 unavailable 로 안전하게 귀결(문의/재시도 문구) — 조용히 삼키지 않는다.
  assert.equal(classifyLocationError(new Error('unexpected')), 'unavailable');
  assert.equal(classifyLocationError(null), 'unavailable');
});

test('RideNav.tsx implements classifyLocationError with the same mapping and logs the reason (never coordinates)', () => {
  const source = read('RideNav.tsx');

  const fnStart = source.indexOf('function classifyLocationError(e: unknown): LocationErrorReason {');
  assert.ok(fnStart >= 0, 'classifyLocationError function not found in RideNav.tsx');
  const fnEnd = source.indexOf('\n}', fnStart);
  const fn = source.slice(fnStart, fnEnd);

  assert.match(fn, /message === 'location_permission_denied'\) return 'permission'/);
  assert.match(fn, /code === 1\) return 'permission'/);
  assert.match(fn, /code === 3\) return 'timeout'/);

  // fetchRoute 의 catch 가 classifyLocationError 를 쓰고, 로그에 좌표(lat/lng)를 남기지 않는다.
  const catchStart = source.indexOf('} catch (e) {\n      const reason = classifyLocationError(e);');
  assert.ok(catchStart >= 0, 'fetchRoute catch must classify the error via classifyLocationError');
  const catchBlock = source.slice(catchStart, catchStart + 300);
  assert.match(catchBlock, /console\.warn\('\[rideNav\] resolveOrigin failed:', reason\)/);
  assert.doesNotMatch(catchBlock, /\.lat|\.lng/, 'error log must not include coordinate fields');
});

test('locationErrorPermission/Timeout/Unavailable are localized in ko/en/vi (not placeholder-only), and no orphan generic key remains', () => {
  for (const lang of ['ko', 'en', 'vi']) {
    const json = JSON.parse(read(`../../locales/${lang}/translation.json`));
    for (const key of ['locationErrorPermission', 'locationErrorTimeout', 'locationErrorUnavailable']) {
      assert.ok(
        typeof json.rideNav?.[key] === 'string' && json.rideNav[key].length > 0,
        `${lang}: rideNav.${key} must be a real localized string`,
      );
    }
    // 세 사유별 키로 대체되며 옛 generic 키(rideNav.locationError)는 더 이상 쓰이지 않는다 — 고아 방지.
    assert.equal(json.rideNav?.locationError, undefined, `${lang}: rideNav.locationError should be removed (superseded by reason-specific keys)`);
  }
});
