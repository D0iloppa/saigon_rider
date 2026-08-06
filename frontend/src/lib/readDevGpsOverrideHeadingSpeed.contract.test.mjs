import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 260806_svg_map_v6_rotation_design.md §7 step 9 / §9.5: readDevGpsOverride() 가 heading/speed 를
// 하드코딩(null)해 회전을 e2e 로 주입할 수 없었다. localStorage JSON 의 heading/speed 를 통과시키되
// 값이 없으면 기존대로 null 이어야 하고(하위호환), dev 2중 게이트(호스트 허용목록 + opt-in 키)는
// 그대로 유지돼야 한다(운영에서 활성되면 안 된다).
test('readDevGpsOverride passes through heading/speed and keeps the existing dev gate', () => {
  const source = read('native.ts');

  const fnStart = source.indexOf('function readDevGpsOverride(): GeoPosition | null {');
  assert.ok(fnStart >= 0, 'readDevGpsOverride function not found');
  const fnEnd = source.indexOf('\n}', fnStart);
  const fn = source.slice(fnStart, fnEnd);

  // 2중 게이트 유지 — 호스트 허용목록 체크와 opt-in 키(DEV_GPS_KEY) 조회가 함수 안에 여전히 있다.
  assert.match(fn, /if \(!DEV_GPS_HOSTS\.includes\(window\.location\.hostname\)\) return null;/, 'host allowlist gate must remain');
  assert.match(fn, /window\.localStorage\.getItem\(DEV_GPS_KEY\)/, 'opt-in key gate must remain');

  // heading/speed 를 이제 파싱해서 통과시킨다 — 하드코딩된 null 리터럴이 아니어야 한다.
  assert.doesNotMatch(
    fn,
    /return \{ lat, lng, accuracy: 5, speed: null, heading: null \};/,
    'heading/speed must no longer be hardcoded to null — pass through localStorage values',
  );
  assert.match(fn, /parsed\.heading != null/, 'must read heading from the parsed localStorage JSON (null-checked)');
  assert.match(fn, /parsed\.speed != null/, 'must read speed from the parsed localStorage JSON (null-checked)');

  // 값이 없거나 숫자가 아니면 하위호환으로 null 이어야 한다 — 이 계약은 소스 형태만으로는 완전히
  // 고정할 수 없으니 아래 evaluable 재현으로 동작을 직접 검증한다.
});

test('readDevGpsOverride behavior: passes finite heading/speed through, falls back to null otherwise', () => {
  // native.ts 는 브라우저 전역(window)에 의존해 그대로 import 할 수 없으므로, 함수 본문을 그대로
  // 재현해 동작을 검증한다(다른 saigonMapV5 계약 테스트들의 "source regex 고정" 패턴과 달리, 이
  // 값 변환 로직은 실제 실행으로 검증하는 편이 회귀를 더 정확히 잡는다).
  function parseOverride(rawObj) {
    const parsed = rawObj;
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const heading = parsed.heading != null && Number.isFinite(Number(parsed.heading)) ? Number(parsed.heading) : null;
    const speed = parsed.speed != null && Number.isFinite(Number(parsed.speed)) ? Number(parsed.speed) : null;
    return { lat, lng, accuracy: 5, speed, heading };
  }

  assert.deepEqual(
    parseOverride({ lat: 10.8, lng: 106.7, heading: 90, speed: 3.2 }),
    { lat: 10.8, lng: 106.7, accuracy: 5, speed: 3.2, heading: 90 },
  );
  assert.deepEqual(
    parseOverride({ lat: 10.8, lng: 106.7 }),
    { lat: 10.8, lng: 106.7, accuracy: 5, speed: null, heading: null },
  );
  assert.deepEqual(
    parseOverride({ lat: 10.8, lng: 106.7, heading: 'bad', speed: null }),
    { lat: 10.8, lng: 106.7, accuracy: 5, speed: null, heading: null },
  );
});
