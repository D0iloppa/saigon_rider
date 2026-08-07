import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// DEV_DONGTAN_PIN: 한국 실기기 카메라연출(course-up 회전·flyTo·추종) 검증용 임시 테스트 핀 —
// 실기기 검증 완료 후 grep -rn DEV_DONGTAN_PIN 으로 전 지점을 찾아 제거한다.
// 이 테스트는 그 제거 전까지 이중 게이트(플래그 단독 무효)와 devBypass 합성 폴리라인 경로가
// 깨지지 않았는지만 지킨다.
// 실기기 검증 완료 후 이 테스트 파일도 함께 삭제할 것 (2026-08-07).

test('RideNav.tsx: devRaw 단독으로는(is_dev 미확정) fetchRoute 가 서비스지역 폴백을 건너뛰지 않는다', () => {
  const source = read('RideNav.tsx');

  assert.match(source, /const devRaw = params\.get\('devRaw'\) === '1';/);
  // is_dev 확정을 fetchRoute 내부의 devRaw 게이트 뒤로 옮겨 — 경합(mount effect 로 비동기
  // 확정하다 fetchRoute 자동호출이 그보다 먼저 실행되는 문제)을 없앤다.
  assert.match(source, /const devBypass = devRaw && \(await fetchAppConfig\(\)\.then\(\(cfg\) => cfg\.isDev\)\.catch\(\(\) => false\)\);/);
  assert.match(source, /const outOfArea = !devBypass && !inServiceArea\(from\.lat, from\.lng\);/);
});

test('RideNav.tsx: devBypass 가 아니면 routeApi.getRoute() 를 정상 호출한다 (회귀 방지)', () => {
  const source = read('RideNav.tsx');

  assert.match(
    source,
    /const data = devBypass\s*\n\s*\? buildDevSyntheticRoute\(routeOrigin, dest\)\s*\n\s*: await routeApi\.getRoute\(routeOrigin, dest, locale\)\.catch\(\(\) => null\);/,
  );
});

test('RideNav.tsx: devBypass 합성 폴리라인은 3점 이상이다 (course-up 세그먼트 방위가 동작하도록)', () => {
  const source = read('RideNav.tsx');

  const match = source.match(/const DEV_SYNTHETIC_SEGMENTS = (\d+);/);
  assert.ok(match, 'DEV_SYNTHETIC_SEGMENTS constant not found');
  const segments = Number(match[1]);
  // buildDevSyntheticRoute 는 0..segments 를 잇는 segments+1 개 점을 만든다.
  assert.ok(segments + 1 >= 3, `expected >=3 synthetic points, got ${segments + 1}`);
});

test('RideNav.tsx: is_dev 확정 전에 fetchRoute 가 폴백을 실행하지 않는다 (경합 회귀 방지)', () => {
  const source = read('RideNav.tsx');

  // devBypass 를 계산하는 await 가 outOfArea 판정보다 먼저(코드 순서상 앞에) 와야 한다 —
  // 그래야 fetchRoute 진입 직후 곧바로 판정하던 과거의 경합이 재발하지 않는다.
  const devBypassIdx = source.indexOf('const devBypass = devRaw &&');
  const outOfAreaIdx = source.indexOf('const outOfArea = !devBypass');
  assert.ok(devBypassIdx > -1 && outOfAreaIdx > -1, 'expected both devBypass and outOfArea assignments');
  assert.ok(devBypassIdx < outOfAreaIdx, 'devBypass must be resolved before the outOfArea fallback check');
});

/** buildDevSyntheticRoute() 의 `return { ... }` 최상위 키를 추출한다(중괄호 깊이로 경계 판정). */
function extractSyntheticRouteKeys(source) {
  const fnIdx = source.indexOf('function buildDevSyntheticRoute');
  assert.ok(fnIdx > -1, 'buildDevSyntheticRoute not found');
  const body = source.slice(fnIdx);
  const returnIdx = body.indexOf('return {');
  assert.ok(returnIdx > -1, 'buildDevSyntheticRoute return { ... } not found');
  const braceStart = returnIdx + 'return {'.length;
  let depth = 1;
  let i = braceStart;
  for (; i < body.length && depth > 0; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') depth--;
  }
  const inner = body.slice(braceStart, i - 1);
  const keys = [];
  for (const line of inner.split('\n')) {
    const m = line.trim().match(/^([A-Za-z_]\w*)\s*[:,]/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/** backend RouteOut(BaseModel) 필드명을 추출한다(클래스 블록 첫 공백 줄까지). */
function extractRouteOutFields(source) {
  const idx = source.indexOf('class RouteOut(BaseModel):');
  assert.ok(idx > -1, 'RouteOut class not found in info_route.py');
  const body = source.slice(idx);
  const blockEnd = body.indexOf('\n\n');
  const block = body.slice(0, blockEnd === -1 ? undefined : blockEnd);
  const fields = [];
  for (const line of block.split('\n').slice(1)) {
    const m = line.match(/^\s+(\w+)\s*:/);
    if (m) fields.push(m[1]);
  }
  return fields;
}

test('RideNav.tsx: buildDevSyntheticRoute() 는 backend RouteOut 의 필드 집합을 모두 채운다 (누락 0)', () => {
  const rideNavSource = read('RideNav.tsx');
  const backendSource = read(join('..', '..', '..', '..', 'backend', 'app', 'routers', 'info_route.py'));

  const syntheticKeys = new Set(extractSyntheticRouteKeys(rideNavSource));
  const backendFields = extractRouteOutFields(backendSource);
  assert.ok(backendFields.length > 0, 'expected to parse at least one RouteOut field');

  const missing = backendFields.filter((f) => !syntheticKeys.has(f));
  assert.deepEqual(missing, [], `buildDevSyntheticRoute is missing RouteOut fields: ${missing.join(', ')}`);
});

test('RideNav.tsx: DEV 합성 duration_text 는 backend _format_duration 과 동일한 알고리즘을 쓴다', () => {
  const source = read('RideNav.tsx');

  // backend/app/routers/info_route.py::_format_duration 재현(추측 금지, 그대로 옮김):
  //   minutes = max(1, round(duration_s/60))
  //   minutes < 60 → "{minutes} min"
  //   else → hours,remainder = divmod(minutes,60); remainder 있으면 "{h} h {m} min", 없으면 "{h} h"
  const backendFormatDuration = (durationS) => {
    const minutes = Math.max(1, Math.round(durationS / 60));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
  };

  // 코드에 동일 구조(중간 변수명은 자유, 분기 3형태)가 있는지 구조로 확인.
  assert.match(source, /durationMinutes < 60/);
  assert.match(source, /durationRemainderMin/);
  assert.match(source, /`\$\{durationHours\} h \$\{durationRemainderMin\} min`/);
  assert.match(source, /`\$\{durationHours\} h`/);

  // 값 단위로도 고정 — 정각(60min→"1 h"), 나머지 있는 경우(90min→"1 h 30 min"), 1시간 미만.
  assert.equal(backendFormatDuration(59 * 60 + 30), '1 h'); // round(59.5)=60min → 정각
  assert.equal(backendFormatDuration(90 * 60), '1 h 30 min');
  assert.equal(backendFormatDuration(30 * 60), '30 min');
});

test('DEV_DONGTAN_PIN grep token exists at every touched location (removal checklist)', () => {
  const repoRoot = join(here, '..', '..', '..', '..');
  const output = execSync(
    "grep -rln DEV_DONGTAN_PIN --include=*.ts --include=*.tsx --include=*.py --include=*.md " +
      '--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist ' +
      'frontend/src frontend/e2e backend/app ai-docs',
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const files = output.trim().split('\n').filter(Boolean).map((f) => f.replace(/^\.\//, ''));

  const expected = [
    'frontend/src/pages/info/InfoGasList.tsx',
    'frontend/src/pages/ride/RideNav.tsx',
    'frontend/src/lib/polyline.ts',
    'ai-docs/context/project_todo.md',
    'frontend/e2e/dev-dongtan-pin-sheet.spec.ts',
  ];
  for (const path of expected) {
    assert.ok(files.includes(path), `expected DEV_DONGTAN_PIN token in ${path}`);
  }
});
