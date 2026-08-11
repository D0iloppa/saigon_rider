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
//
// 2026-08-07: 자체 호스팅 라우팅 엔진으로 전환하고 경기도 타일을 추가해 한국 좌표에서도 실제
// 경로탐색 API 를 호출할 수 있게 됐다. 이에 따라 devBypass 경로에서 합성 폴리라인을 만들던
// buildDevSyntheticRoute()/encodePolyline() 은 제거됐고, devBypass 는 이제 벤탄 폴백(서비스
// 지역 밖 좌표를 벤탄으로 치환하는 것)만 건너뛴다 — DEV 핀도 일반 경로와 동일하게
// routeApi.getRoute() 를 호출한다. 이 테스트는 그 계약(이중 게이트 유지, 벤탄 폴백만 우회,
// 합성 경로 없음)이 깨지지 않았는지 지킨다.

test('RideNav.tsx: devRaw 단독으로는(is_dev 미확정) fetchRoute 가 서비스지역 폴백을 건너뛰지 않는다', () => {
  const source = read('RideNav.tsx');

  assert.match(source, /const devRaw = params\.get\('devRaw'\) === '1';/);
  // is_dev 확정을 fetchRoute 내부의 devRaw 게이트 뒤로 옮겨 — 경합(mount effect 로 비동기
  // 확정하다 fetchRoute 자동호출이 그보다 먼저 실행되는 문제)을 없앤다.
  assert.match(source, /const devBypass = devRaw && \(await fetchAppConfig\(\)\.then\(\(cfg\) => cfg\.isDev\)\.catch\(\(\) => false\)\);/);
  assert.match(source, /const outOfArea = !devBypass && !inServiceArea\(from\.lat, from\.lng\);/);
});

test('RideNav.tsx: devBypass 는 벤탄 폴백만 건너뛴다 — 합성 경로 없이 항상 routeApi.getRoute() 를 호출한다', () => {
  const source = read('RideNav.tsx');

  // routeOrigin 은 outOfArea 여부로만 갈리고(devBypass 는 그 판정에만 관여), 실제 API 호출은
  // devBypass 값과 무관하게 단일 경로다 — buildDevSyntheticRoute 분기가 없어야 한다.
  assert.match(
    source,
    /const data = await routeApi\.getRoute\(routeOrigin, dest, locale\)\.catch\(\(\) => null\);/,
  );
  assert.doesNotMatch(source, /buildDevSyntheticRoute/);
  assert.doesNotMatch(source, /encodePolyline/);
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

test('polyline.ts: encodePolyline() 은 합성 전용이었으므로 제거됐다 (다른 사용처 없음)', () => {
  const source = read(join('..', '..', 'lib', 'polyline.ts'));
  assert.doesNotMatch(source, /export function encodePolyline/);
});

test('DEV_DONGTAN_PIN grep token exists at every remaining touched location (removal checklist)', () => {
  const repoRoot = join(here, '..', '..', '..', '..');
  const output = execSync(
    "grep -rln DEV_DONGTAN_PIN --include=*.ts --include=*.tsx --include=*.py --include=*.md " +
      '--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist ' +
      'frontend/src frontend/e2e backend/app ai-docs',
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const files = output.trim().split('\n').filter(Boolean).map((f) => f.replace(/^\.\//, ''));

  // polyline.ts 는 encodePolyline() 제거로 더 이상 토큰을 갖지 않는다 — 제거된 지점이므로
  // checklist 에서 뺀다(남은 지점만 단정).
  const expected = [
    'frontend/src/pages/info/InfoGasList.tsx',
    'frontend/src/pages/ride/RideNav.tsx',
    'ai-docs/context/project_todo.md',
    'frontend/e2e/dev-dongtan-pin-sheet.spec.ts',
  ];
  for (const path of expected) {
    assert.ok(files.includes(path), `expected DEV_DONGTAN_PIN token in ${path}`);
  }
  assert.ok(!files.includes('frontend/src/lib/polyline.ts'), 'polyline.ts should no longer carry the DEV_DONGTAN_PIN token');
});
