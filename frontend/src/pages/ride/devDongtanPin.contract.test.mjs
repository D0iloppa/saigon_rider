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
// 이 테스트는 그 제거 전까지 이중 게이트(플래그 단독 무효)가 깨지지 않았는지만 지킨다.
// 실기기 검증 완료 후 이 테스트 파일도 함께 삭제할 것 (2026-08-07).

test('RideNav.tsx: URL devRaw 플래그 단독으로는 서비스지역 폴백이 꺼지지 않는다 (isDev AND devRaw)', () => {
  const source = read('RideNav.tsx');

  assert.match(source, /const devRaw = params\.get\('devRaw'\) === '1';/);
  assert.match(source, /const devBypass = isDev && devRaw;/);
  assert.match(source, /const outOfArea = !devBypass && !inServiceArea\(from\.lat, from\.lng\);/);
});

test('DEV_DONGTAN_PIN grep token exists at every touched location (removal checklist)', () => {
  const repoRoot = join(here, '..', '..', '..', '..');
  const output = execSync(
    "grep -rln DEV_DONGTAN_PIN --include=*.ts --include=*.tsx --include=*.py --include=*.md " +
      '--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist ' +
      'frontend/src backend/app ai-docs',
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const files = output.trim().split('\n').filter(Boolean).map((f) => f.replace(/^\.\//, ''));

  const expected = [
    'frontend/src/pages/info/InfoGasList.tsx',
    'frontend/src/pages/ride/RideNav.tsx',
    'frontend/src/api/info.ts',
    'backend/app/routers/info_route.py',
    'backend/app/tests/test_info_route.py',
    'ai-docs/context/project_todo.md',
  ];
  for (const path of expected) {
    assert.ok(files.includes(path), `expected DEV_DONGTAN_PIN token in ${path}`);
  }
});
