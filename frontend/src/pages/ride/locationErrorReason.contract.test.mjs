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

// 2026-08-13 정책 개정: 이 분류기는 RideNav 지역 함수에서 serviceLocation.ts 로 승격됐다 —
// 실행형·기록형 화면(경로안내·퀘스트·제보·피드 위치)이 같은 사유 체계를 공유해야 하고,
// 화면마다 재구현하면 문구·행동 지침이 다시 갈린다(정책안 §3-B).
test('serviceLocation.ts implements classifyLocationError with the same mapping', () => {
  const source = read(join('..', '..', 'lib', 'serviceLocation.ts'));

  const fnStart = source.indexOf('export function classifyLocationError(');
  assert.ok(fnStart >= 0, 'classifyLocationError must live in serviceLocation.ts (shared by all gated screens)');
  const fnEnd = source.indexOf('\n}', fnStart);
  const fn = source.slice(fnStart, fnEnd);

  assert.match(fn, /message === 'location_permission_denied'\) return 'permission'/);
  assert.match(fn, /code === 1\) return 'permission'/);
  assert.match(fn, /code === 3\) return 'timeout'/);

  // 화면들은 자체 재구현 없이 이 함수(또는 이를 쓰는 requireServiceLocation)를 경유해야 한다.
  const rideNav = read('RideNav.tsx');
  assert.doesNotMatch(rideNav, /function classifyLocationError/, 'RideNav must not re-implement the classifier');
});

test('RideNav.tsx logs only the blocked reason, never coordinates', () => {
  const source = read('RideNav.tsx');

  const logIdx = source.indexOf("console.warn('[rideNav] location gate blocked:', gate.reason)");
  assert.ok(logIdx >= 0, 'fetchRoute must log the gate reason when blocked');
  // 로그 주변에 좌표 필드가 섞이지 않는다(개인정보).
  const block = source.slice(logIdx - 120, logIdx + 200);
  assert.doesNotMatch(block, /\.lat|\.lng/, 'error log must not include coordinate fields');
});

test('locationGate reasons are localized in ko/en/vi (not placeholder-only), and superseded rideNav keys are removed', () => {
  for (const lang of ['ko', 'en', 'vi']) {
    const json = JSON.parse(read(`../../locales/${lang}/translation.json`));
    for (const reason of ['outside_area', 'permission', 'timeout', 'unavailable', 'inaccurate']) {
      for (const field of ['title', 'desc']) {
        const value = json.locationGate?.[reason]?.[field];
        assert.ok(
          typeof value === 'string' && value.length > 0,
          `${lang}: locationGate.${reason}.${field} must be a real localized string`,
        );
      }
    }
    for (const key of ['retry', 'openSettings']) {
      assert.ok(typeof json.locationGate?.[key] === 'string' && json.locationGate[key].length > 0,
        `${lang}: locationGate.${key} must be a real localized string`);
    }
    // 옛 키들은 게이트 문구로 대체됐다 — 고아 방지(generic 키 locationError 포함).
    for (const key of ['locationError', 'locationErrorPermission', 'locationErrorTimeout', 'locationErrorUnavailable']) {
      assert.equal(json.rideNav?.[key], undefined,
        `${lang}: rideNav.${key} should be removed (superseded by locationGate.*)`);
    }
  }
});
